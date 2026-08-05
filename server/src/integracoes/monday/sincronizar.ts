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
import { lerColunas, lerTodosOsItens, type ItemMonday } from './cliente.js';
import { QUADROS, resolverMapa, type ChaveQuadro } from './quadros.js';
import {
  classificarCategoriaDistrato,
  classificarJudicializacao,
  competenciaDoGrupo,
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
  }) => void;
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

interface Transformado {
  registro: RegistroParaUpsert;
  /** Documento avaliado, para gerar inconsistencia quando invalido. */
  documento?: ReturnType<typeof avaliarDocumento>;
  cliente?: string;
  empreendimentoNome?: string;
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
  contexto: { competenciaRef: string | null; comiteId: string | null },
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
            // Data de solucao so para item resolvido: evita calcular tempo de
            // caso ainda aberto.
            data_solucao: estagio === 'Resolvida' ? paraData(lerCampo(item, mapa, 'data_solucao')) : null,
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
    const { judicializado, revisaoNecessaria } = classificarJudicializacao(situacao);
    const { atuacao, interno } = interpretarAtuacao(lerCampo(item, mapa, 'atuacao'));

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
            judicializado,
            revisao_necessaria: revisaoNecessaria,
            honorarios_efetivados: paraNumero(lerCampo(item, mapa, 'honorarios_efetivados')),
          },
          valorOriginal: item,
          dataReferencia: paraData(lerCampo(item, mapa, 'data_citacao')),
          dataFato: paraData(lerCampo(item, mapa, 'data_citacao')),
        },
        documento,
        cliente: clienteNome,
        empreendimentoNome: local.empreendimento,
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
      });
    }

    if (mapa.ausentes.length > 0) {
      logger.warn(
        { quadro: def.nome, ausentes: mapa.ausentes },
        'Campos nao encontrados no quadro: serao gravados como nulos, nunca presumidos',
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
    const paraGravar: RegistroParaUpsert[] = [];
    const documentosInvalidos: Array<{ item: string; motivo: string; cliente: string }> = [];

    for (const item of leitura.itens) {
      try {
        const r = await transformarItem(opcoes.quadro, item, mapa.porCampo, {
          competenciaRef: opcoes.competenciaRef,
          comiteId: opcoes.comiteId,
        });

        if ('ignorar' in r) {
          execucao.registrarIgnorado(r.ignorar, item.id);
          continue;
        }

        paraGravar.push(r.transformado.registro);

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
