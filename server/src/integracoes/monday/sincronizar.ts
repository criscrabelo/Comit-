/**
 * Ingestao de um quadro do Monday.
 *
 * Ordem: ler paginado → gravar bruto → transformar → upsert idempotente →
 * marcar ausentes → contabilizar. Nada e apagado em nenhuma etapa.
 *
 * Diferenca central em relacao ao codigo atual: nao existe passo de limpeza.
 * A base atual faz `DB.forComite(...).forEach(remove)` antes de inserir, e uma
 * falha no meio deixa o comite parcialmente vazio.
 */
import { logger } from '../../logging.js';
import { db } from '../../db/pool.js';
import { avaliarDocumento } from '../../dominio/documento.js';
import { registrar } from '../../inconsistencias/servico.js';
import { gravarBruto, iniciarExecucao, type ResumoExecucao } from '../execucoes.js';
import { marcarAusentes, persistirLote, type RegistroParaUpsert, type TabelaIntegravel } from '../upsert.js';
import {
  avaliar,
  consolidar,
  gravarApuracoes,
  politicasVigentes,
  ENTIDADE_PROCESSOS,
  type Apuracao,
  type Consolidacao,
  type Politica,
} from '../../juridico/judicializacao.js';
import { lerColunas, lerTodosOsItens, type ItemMonday } from './cliente.js';
import { QUADROS, resolverMapa, type ChaveQuadro, type TituloAmbiguo } from './quadros.js';
import {
  classificarCategoriaDistrato,
  competenciaDoGrupo,
  estagioEncerra,
  extrairLocalizacao,
  interpretarAtuacao,
  lerCampo,
  normalizarContrato,
  normalizarEstagio,
  normalizarNome,
  paraData,
  paraInteiro,
  paraNumero,
} from './transformacao.js';

const VERSAO_REGRA = '1.0.0';

export interface OpcoesSincronizacao {
  quadro: ChaveQuadro;
  competenciaRef: string | null;
  comiteId: string | null;
  usuarioId: string | null;
  /** Le e transforma sem gravar, para conferir antes de aplicar. */
  simular?: boolean;
  /**
   * Recebe o mapa de colunas resolvido no quadro.
   *
   * A homologacao precisa dele para levantar os rotulos reais coluna a coluna,
   * e resolve-lo de novo custaria uma segunda consulta ao Monday — que e
   * exatamente o que nao se quer numa carga controlada.
   */
  aoResolverColunas?: (dados: {
    porCampo: Map<string, string>;
    titulosPorId: Map<string, { titulo: string; tipo: string }>;
    ausentes: string[];
    ambiguos: TituloAmbiguo[];
  }) => void;
}

const ROTULO_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Garante que as competencias referenciadas pela carga existam.
 *
 * `competencia_ref` e chave estrangeira para `competencias(ref)` em TODAS as
 * tabelas de negocio, e nada no fluxo de ingestao criava a linha. Em processos
 * o defeito nunca apareceu: os grupos daquele quadro (`CJ (REGRESSO)`,
 * `TETUS LOCACAO`, …) nao derivam competencia nenhuma, e o campo ficava nulo —
 * nulo nao viola chave estrangeira. Em notificacoes os grupos sao meses
 * (`AGOSTO/ 2026`, `JULHO/ 2025`), a competencia e derivada de cada um, e a
 * carga inteira era recusada pelo banco. Descoberto na homologacao do board
 * 5630368737 (B17.1).
 *
 * A competencia e criada com a janela do mes e rotulo legivel. Nao e fechada:
 * fechar competencia e ato de gestao, e uma carga automatica nao pode praticar
 * esse ato. `ON CONFLICT DO NOTHING` preserva o que ja existir — inclusive o
 * `fechada_em` de uma competencia encerrada.
 */
async function garantirCompetencias(refs: Array<string | null>): Promise<string[]> {
  const distintas = [...new Set(refs.filter((r): r is string => Boolean(r)))].sort();
  if (!distintas.length) return [];

  const existentes = await db
    .selectFrom('competencias')
    .select('ref')
    .where('ref', 'in', distintas)
    .execute();
  const jaExistem = new Set(existentes.map((e) => e.ref));

  const criar = distintas.filter((r) => !jaExistem.has(r));
  if (!criar.length) return [];

  await db
    .insertInto('competencias')
    .values(
      criar.map((ref) => {
        const [ano, mes] = ref.split('-') as [string, string];
        const numeroMes = Number(mes);
        // Dia 0 do mes seguinte e o ultimo dia deste mes, sem tabela de dias.
        const fim = new Date(Date.UTC(Number(ano), numeroMes, 0));
        return {
          ref,
          rotulo: `${ROTULO_MES[numeroMes - 1]} ${ano}`,
          inicio: `${ref}-01`,
          fim: fim.toISOString().slice(0, 10),
        };
      }),
    )
    .onConflict((oc) => oc.column('ref').doNothing())
    .execute();

  logger.info({ criadas: criar }, 'Competencias derivadas dos grupos foram criadas pela carga');
  return criar;
}

/** Resolve o empreendimento por identificador de origem, nunca por texto solto. */
async function resolverEmpreendimento(nome: string): Promise<string | null> {
  if (!nome) return null;
  const normalizado = normalizarNome(nome);
  if (!normalizado) return null;

  const existente = await db
    .selectFrom('empreendimentos')
    .select('id')
    .where('nome_normalizado', '=', normalizado)
    .executeTakeFirst();

  if (existente) return existente.id;

  // Cria com proveniencia de origem Monday e registra a correspondencia, para
  // que o historico do ativo nao dependa do texto do quadro.
  const criado = await db
    .insertInto('empreendimentos')
    .values({
      nome: nome.trim(),
      nome_normalizado: normalizado,
      fonte: 'monday',
      id_origem: `monday:empr:${normalizado}`,
      versao_regra: VERSAO_REGRA,
    })
    .onConflict((oc) => oc.column('nome_normalizado').doUpdateSet({ nome: nome.trim() }))
    .returning('id')
    .executeTakeFirstOrThrow();

  await db
    .insertInto('empreendimentos_fontes')
    .values({
      empreendimento_id: criado.id,
      fonte: 'monday',
      id_externo: normalizado,
      rotulo_externo: nome.trim(),
    })
    .onConflict((oc) => oc.doNothing())
    .execute();

  return criado.id;
}

/** Data de hoje em ISO, sem hora. Isolada para os testes poderem congelar. */
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Grava a conclusao de cada fonte e abre inconsistencia quando elas divergem.
 *
 * O casamento e por `id_origem`, e nao pela ordem do lote: o upsert reordena, e
 * confiar na ordem associaria a apuracao de um processo ao registro de outro.
 */
async function persistirApuracoes(
  destino: TabelaIntegravel,
  judicializacoes: Map<string, Consolidacao>,
  execucaoId: string,
): Promise<void> {
  const idsOrigem = [...judicializacoes.keys()];

  const linhas = await db
    .selectFrom(destino)
    .select(['id', 'id_origem'])
    .where('fonte', '=', 'monday')
    .where('id_origem', 'in', idsOrigem)
    .execute();

  for (const linha of linhas) {
    const consolidacao = judicializacoes.get(linha.id_origem ?? '');
    if (!consolidacao || consolidacao.apuracoes.length === 0) continue;

    await gravarApuracoes(ENTIDADE_PROCESSOS, linha.id, consolidacao.apuracoes, execucaoId);

    if (!consolidacao.divergente) continue;

    // Divergencia entre fontes: os dois lados vao para `valoresEmConflito`, e
    // nenhum e descartado. A precedencia aplicada fica declarada.
    await registrar({
      tipo: 'divergencia_judicializacao',
      fonte: 'monday',
      descricao:
        `Fontes divergem sobre a judicializacao do processo ${linha.id_origem}. ` +
        consolidacao.motivo,
      impacto: 'situacao_juridica',
      valoresEmConflito: consolidacao.apuracoes.map((a) => ({
        fonte: a.fonte,
        id_origem: linha.id_origem,
        campo: 'judicializado',
        // O valor como a fonte concluiu, e o rotulo cru que a levou ate ele.
        valor: a.judicializado,
        valor_normalizado: a.valorObservado,
      })),
      precedenciaAplicada: consolidacao.fonte,
      valorAplicado: consolidacao.judicializado,
      execucaoId,
      chaveExtra: ['judicializacao', destino, linha.id_origem ?? linha.id],
    });
  }
}

interface Transformado {
  registro: RegistroParaUpsert;
  /** Documento avaliado, para gerar inconsistencia quando invalido. */
  documento?: ReturnType<typeof avaliarDocumento>;
  cliente?: string;
  empreendimentoNome?: string;
  /**
   * Conclusao de cada fonte sobre a judicializacao, quando o quadro a produz.
   *
   * Guardada aqui e persistida depois do upsert, quando os ids do banco ja
   * existem — a apuracao referencia o registro gravado, nao o id de origem.
   */
  judicializacao?: Consolidacao;
}

/**
 * Transforma um item conforme o quadro de origem.
 *
 * Devolve `null` quando o item deve ser ignorado — sempre com motivo, que vai
 * para os contadores da execucao.
 */
async function transformarItem(
  quadro: ChaveQuadro,
  item: ItemMonday,
  mapa: Map<string, string>,
  contexto: {
    competenciaRef: string | null;
    comiteId: string | null;
    /**
     * Politicas de judicializacao APROVADAS que alcancam este quadro hoje.
     *
     * Carregadas uma vez por sincronizacao e passadas para ca: consultar o
     * banco por item transformaria uma carga de 273 registros em 273 consultas
     * para obter sempre a mesma resposta.
     */
    politicas: Politica[];
  },
): Promise<{ transformado: Transformado } | { ignorar: string }> {
  const def = QUADROS[quadro];

  // Grupo excluido por decisao do juridico. Contado como ignorado, com motivo —
  // a base atual descarta em silencio.
  const tituloGrupo = item.group?.title ?? '';
  if (def.gruposExcluidos?.some((g) => g.toUpperCase() === tituloGrupo.toUpperCase().trim())) {
    return { ignorar: `grupo excluido do comite: ${tituloGrupo}` };
  }

  const emprBruto = lerCampo(item, mapa, 'empreendimento');
  const local = extrairLocalizacao(emprBruto, item.name);
  const empreendimentoId = await resolverEmpreendimento(local.empreendimento);

  const clienteNome = lerCampo(item, mapa, 'cliente') || item.name;
  const documento = avaliarDocumento(lerCampo(item, mapa, 'cpf_cnpj'));
  const contrato = normalizarContrato(lerCampo(item, mapa, 'contrato'));

  // Competencia: do titulo do grupo, nao de coluna de data.
  const competenciaItem = competenciaDoGrupo(tituloGrupo) ?? contexto.competenciaRef;

  if (def.recorte === 'competencia' && contexto.competenciaRef) {
    if (competenciaItem !== contexto.competenciaRef) {
      return { ignorar: `fora da competencia ${contexto.competenciaRef} (item em ${competenciaItem ?? 'sem competencia'})` };
    }
  }

  const comum = {
    empreendimento_id: empreendimentoId,
    competencia_ref: competenciaItem,
    comite_id: contexto.comiteId,
  };

  if (quadro === 'notificacoes') {
    const estagioBruto = lerCampo(item, mapa, 'estagio');
    const estagio = normalizarEstagio(estagioBruto);

    return {
      transformado: {
        registro: {
          idOrigem: item.id,
          campos: {
            ...comum,
            cliente_nome: clienteNome,
            torre: local.torre,
            unidade: local.unidade,
            grupo: tituloGrupo,
            modelo: lerCampo(item, mapa, 'modelo') || null,
            estagio,
            // Rotulo bruto preservado: o wireframe exige fidelidade a origem.
            estagio_detalhe: estagioBruto || null,
            situacao: lerCampo(item, mapa, 'situacao') || null,
            data_notificacao: paraData(lerCampo(item, mapa, 'data_notificacao')),
            // Data de solucao so para caso ENCERRADO — resolvido ou nao.
            // Antes so `Resolvida` valia, e as notificacoes distratadas perdiam
            // a data: ficavam eternamente abertas no tempo medio de solucao.
            data_solucao: estagioEncerra(estagio)
              ? paraData(lerCampo(item, mapa, 'data_solucao'))
              : null,
            total_dias: paraInteiro(lerCampo(item, mapa, 'total_dias')),
          },
          valorOriginal: item,
          dataReferencia: paraData(lerCampo(item, mapa, 'data_notificacao')),
          dataFato: paraData(lerCampo(item, mapa, 'data_notificacao')),
        },
        documento,
        cliente: clienteNome,
        empreendimentoNome: local.empreendimento,
      },
    };
  }

  if (quadro === 'processos') {
    // Situacao vem de MEU TRABALHO, nao de STATUS (para comite).
    const situacao = lerCampo(item, mapa, 'situacao');
    const { atuacao, interno } = interpretarAtuacao(lerCampo(item, mapa, 'atuacao'));

    // A judicializacao sai da POLITICA vigente, nao de listas no codigo.
    // Sem politica aprovada, `consolidar` devolve revisao necessaria — que e o
    // estado correto para "ninguem decidiu ainda", e nao `false`.
    const apuracoes: Apuracao[] = contexto.politicas
      .filter((p) => p.fonte === 'monday')
      .map((p) => avaliar(p, { situacao, grupo: tituloGrupo }));
    const judicializacao = consolidar(apuracoes);

    return {
      transformado: {
        registro: {
          idOrigem: item.id,
          campos: {
            ...comum,
            numero: lerCampo(item, mapa, 'numero') || item.name,
            tipo: lerCampo(item, mapa, 'tipo') || null,
            motivo: lerCampo(item, mapa, 'motivo') || null,
            posicao: lerCampo(item, mapa, 'posicao') || null,
            situacao: situacao || null,
            situacao_comite: lerCampo(item, mapa, 'situacao_comite') || null,
            atuacao,
            interno,
            comarca: lerCampo(item, mapa, 'comarca') || null,
            valor_causa: paraNumero(lerCampo(item, mapa, 'valor_causa')),
            data_citacao: paraData(lerCampo(item, mapa, 'data_citacao')),
            data_finalizacao: paraData(lerCampo(item, mapa, 'data_finalizacao')),
            judicializado: judicializacao.judicializado,
            revisao_necessaria: judicializacao.revisaoNecessaria,
            judicializacao_fonte: judicializacao.fonte,
            judicializacao_politica: judicializacao.politicaId,
            judicializacao_divergente: judicializacao.divergente,
            honorarios_efetivados: paraNumero(lerCampo(item, mapa, 'honorarios_efetivados')),
          },
          valorOriginal: item,
          dataReferencia: paraData(lerCampo(item, mapa, 'data_citacao')),
          dataFato: paraData(lerCampo(item, mapa, 'data_citacao')),
        },
        documento,
        cliente: clienteNome,
        empreendimentoNome: local.empreendimento,
        judicializacao,
      },
    };
  }

  if (quadro === 'distratos' || quadro === 'retomadas') {
    const categoria = classificarCategoriaDistrato(tituloGrupo, quadro);

    return {
      transformado: {
        registro: {
          idOrigem: item.id,
          campos: {
            ...comum,
            unidade: local.unidade,
            categoria,
            motivo: lerCampo(item, mapa, 'motivo') || null,
            equipe: lerCampo(item, mapa, 'equipe') || null,
            data_solicitacao: paraData(lerCampo(item, mapa, 'data_solicitacao')),
            data_venda: paraData(lerCampo(item, mapa, 'data_venda')),
            data_conclusao: paraData(lerCampo(item, mapa, 'data_conclusao')),
            tempo_dias: paraInteiro(lerCampo(item, mapa, 'tempo_dias')),
          },
          valorOriginal: item,
          dataReferencia: paraData(lerCampo(item, mapa, 'data_conclusao')),
          dataFato: paraData(lerCampo(item, mapa, 'data_conclusao')),
        },
        documento,
        cliente: clienteNome,
        empreendimentoNome: local.empreendimento,
      },
    };
  }

  return { ignorar: `quadro ${quadro} ainda nao tem transformacao implementada` };
}

const DESTINO: Record<ChaveQuadro, TabelaIntegravel | null> = {
  notificacoes: 'notificacoes',
  processos: 'processos_judiciais',
  distratos: 'distratos',
  retomadas: 'distratos',
  honorarios: null,
  entregas: null,
};

/**
 * Sincroniza um quadro.
 *
 * Uma falha de leitura NAO apaga nada: a execucao termina como parcial, o dado
 * anterior permanece, e `ultima_carga_valida_em` nao avanca.
 */
export async function sincronizarQuadro(opcoes: OpcoesSincronizacao): Promise<ResumoExecucao> {
  const def = QUADROS[opcoes.quadro];
  const destino = DESTINO[opcoes.quadro];

  // A competencia pedida tambem e chave estrangeira — em `execucoes_importacao`.
  // Garantida ANTES de abrir a execucao, senao `--competencia 2026-07` falharia
  // ao registrar a propria execucao, e sem execucao aberta nao ha onde
  // contabilizar a falha.
  await garantirCompetencias([opcoes.competenciaRef]);

  const execucao = await iniciarExecucao({
    fonte: 'monday',
    escopo: opcoes.quadro,
    destino: destino ?? undefined,
    competencia: opcoes.competenciaRef,
    comiteId: opcoes.comiteId,
    usuarioId: opcoes.usuarioId,
    versaoRegra: VERSAO_REGRA,
    idOrigemEscopo: String(def.idPadrao),
  });

  if (!destino) {
    return execucao.finalizar({
      status: 'erro',
      mensagem: `Ingestao do quadro ${def.nome} ainda nao implementada nesta fase.`,
    });
  }

  try {
    // 1. Colunas, resolvidas por titulo.
    const colunas = await lerColunas(def.idPadrao);
    const mapa = resolverMapa(def, colunas);

    if (opcoes.aoResolverColunas) {
      opcoes.aoResolverColunas({
        porCampo: mapa.porCampo,
        titulosPorId: new Map(colunas.map((c) => [c.id, { titulo: c.title, tipo: c.type }])),
        ausentes: mapa.ausentes,
        ambiguos: mapa.ambiguos,
      });
    }

    if (mapa.ausentes.length > 0) {
      logger.warn(
        { quadro: def.nome, ausentes: mapa.ausentes },
        'Campos nao encontrados no quadro: serao gravados como nulos, nunca presumidos',
      );
    }

    // Titulo repetido nao interrompe a carga: a coluna escolhida pode ser a
    // certa. Mas a escolha deixa de ser silenciosa — e o que separa "resolvido
    // por titulo" de "resolvido por acaso de ordenacao".
    if (mapa.ambiguos.length > 0) {
      logger.warn(
        {
          quadro: def.nome,
          ambiguos: mapa.ambiguos.map((a) => ({
            titulo: a.titulo,
            colunas: a.colunas.map((c) => `${c.id}:${c.tipo}`),
            vencedora: a.vencedora,
          })),
        },
        'Titulos repetidos no quadro: a resolucao por titulo escolheu uma coluna; confira o mapa',
      );
    }

    // 2. Leitura paginada, ate o fim.
    const leitura = await lerTodosOsItens(def.idPadrao);
    execucao.registrarLidos(leitura.itens.length);
    execucao.registrarLeitura({ paginas: leitura.paginas, ultimoCursor: leitura.ultimoCursor });

    if (leitura.truncado) {
      // Leitura incompleta nunca e apresentada como completa.
      execucao.marcarParcial();
      execucao.registrarErro(
        'Leitura truncada pelo teto de paginas: o conjunto NAO esta completo.',
      );
    }

    // 3. Area bruta, antes de qualquer interpretacao.
    await gravarBruto(
      execucao.id,
      'monday',
      opcoes.quadro,
      leitura.itens.map((i) => ({ idOrigem: i.id, payload: i })),
    );

    // 4. Transformacao.
    //
    // As politicas de judicializacao sao lidas UMA vez, antes do laco. A data
    // usada e a de hoje: uma carga corrente aplica o criterio corrente. Reapurar
    // competencia fechada e outro caminho, e passa a data daquele mes.
    const politicas = await politicasVigentes(opcoes.quadro, hojeISO());

    const paraGravar: RegistroParaUpsert[] = [];
    const documentosInvalidos: Array<{ item: string; motivo: string; cliente: string }> = [];
    /** idOrigem -> conclusao de cada fonte, para gravar depois do upsert. */
    const judicializacoes = new Map<string, Consolidacao>();

    for (const item of leitura.itens) {
      try {
        const r = await transformarItem(opcoes.quadro, item, mapa.porCampo, {
          competenciaRef: opcoes.competenciaRef,
          comiteId: opcoes.comiteId,
          politicas,
        });

        if ('ignorar' in r) {
          execucao.registrarIgnorado(r.ignorar, item.id);
          continue;
        }

        paraGravar.push(r.transformado.registro);

        if (r.transformado.judicializacao) {
          judicializacoes.set(r.transformado.registro.idOrigem, r.transformado.judicializacao);
        }

        // Documento com digito invalido nao vincula: vira inconsistencia.
        const doc = r.transformado.documento;
        if (doc && doc.original && !doc.valido) {
          documentosInvalidos.push({
            item: item.id,
            motivo: doc.motivo ?? 'documento invalido',
            cliente: r.transformado.cliente ?? '',
          });
        }
      } catch (erro) {
        execucao.registrarErro(erro instanceof Error ? erro.message : String(erro), item.id);
      }
    }

    execucao.registrarNormalizados(paraGravar.length);

    // 4b. Competencias referenciadas pelos registros.
    //
    // Antes do upsert, e nao durante a transformacao: aqui o conjunto e
    // conhecido inteiro, e as ~38 competencias de um quadro de tres anos custam
    // uma consulta e uma insercao — nao 1072 idas ao banco para obter sempre a
    // mesma resposta.
    await garantirCompetencias(paraGravar.map((r) => r.campos.competencia_ref as string | null));

    // Data de referencia do CONJUNTO: a mais recente entre os registros lidos.
    // E o que responde "ate quando este dado esta atualizado", que nao e a
    // mesma pergunta que "quando foi extraido".
    const datas = paraGravar
      .map((r) => r.dataReferencia)
      .filter((d): d is string => Boolean(d))
      .sort();
    execucao.registrarDataReferencia(datas.length ? datas[datas.length - 1]! : null);

    if (opcoes.simular) {
      return execucao.finalizar({
        status: 'sucesso',
        mensagem: `Simulacao: ${paraGravar.length} registros seriam gravados. Nada foi alterado.`,
      });
    }

    // 5. Upsert idempotente.
    await persistirLote(destino, 'monday', paraGravar, execucao, { versaoRegra: VERSAO_REGRA });

    // 5b. Apuracao de judicializacao por fonte.
    //
    // Depois do upsert porque a apuracao referencia o id do registro gravado.
    // Nao vive dentro do registro: durante a transicao Monday -> Sienge, cada
    // fonte tem a sua conclusao, e as duas precisam sobreviver lado a lado.
    if (judicializacoes.size > 0) {
      await persistirApuracoes(destino, judicializacoes, execucao.id);
    }

    // 6. Marcar ausentes — NUNCA apagar.
    if (!leitura.truncado) {
      const presentes = paraGravar.map((r) => r.idOrigem);
      const marcados = await marcarAusentes(destino, 'monday', presentes, {
        comiteId: opcoes.comiteId,
        competenciaRef: def.recorte === 'competencia' ? opcoes.competenciaRef : null,
      });
      if (marcados > 0) {
        logger.info({ destino, marcados }, 'Registros ausentes na carga foram marcados, nao removidos');
      }
    }

    // 7. Inconsistencias de documento.
    for (const d of documentosInvalidos) {
      await registrar(
        {
          tipo: 'cpf_cnpj_invalido',
          fonte: 'monday',
          descricao: `${d.cliente || 'Cliente'}: ${d.motivo}. O documento nao serve como chave de vinculo.`,
          cliente: d.cliente || null,
          competenciaRef: opcoes.competenciaRef,
          execucaoId: execucao.id,
          chaveExtra: [d.item],
        },
        { usuarioId: opcoes.usuarioId, usuarioNome: null },
      );
    }

    return execucao.finalizar({
      mensagem: mapa.ausentes.length
        ? `Campos ausentes no quadro (gravados como nulos): ${mapa.ausentes.join(', ')}`
        : undefined,
    });
  } catch (erro) {
    // Falha de fonte: marca parcial e preserva o que existia. Nenhum DELETE foi
    // executado em nenhum ponto deste fluxo.
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    execucao.marcarFalhaDeFonte('monday', mensagem);
    logger.error({ quadro: opcoes.quadro, erro: mensagem }, 'Sincronizacao do Monday falhou');

    await registrar(
      {
        tipo: 'falha_importacao',
        fonte: 'monday',
        descricao: `Falha ao sincronizar ${def.nome}: ${mensagem}. O ultimo dado valido foi preservado.`,
        competenciaRef: opcoes.competenciaRef,
        execucaoId: execucao.id,
        chaveExtra: [opcoes.quadro],
      },
      { usuarioId: opcoes.usuarioId, usuarioNome: null },
    );

    return execucao.finalizar({ status: 'erro', mensagem });
  }
}
