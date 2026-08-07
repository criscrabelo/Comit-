/**
 * Operacoes de negocio da interface, com o PostgreSQL como fonte da verdade.
 *
 * O que muda em relacao ao `POST /api/db` que existia:
 *
 *   ANTES  a SPA mandava o dump inteiro; quem gravasse por ultimo vencia, e
 *          ninguem ficava sabendo.
 *   AGORA  cada registro tem `versao`. Editar sobre dado desatualizado devolve
 *          409 com o registro atual do servidor, para a pessoa comparar.
 *
 *   ANTES  excluir apagava a linha.
 *   AGORA  excluir marca `ausente_desde`. "Falha de uma fonte nao pode apagar o
 *          ultimo dado valido" passa a valer tambem para a interface.
 *
 * Autorizacao e sempre daqui, nunca da tela: a listagem ja sai recortada pelo
 * escopo de empreendimentos da sessao.
 */
import { sql } from 'kysely';
import { db } from '../db/pool.js';
import { auditar, auditarExportacao } from '../audit/registrar.js';
import { conflito, entradaInvalida, naoEncontrado } from '../errors.js';
import {
  exigirEmpreendimento,
  exigirModulo,
  filtroEmpreendimentos,
  type ContextoAutorizacao,
} from '../rbac/autorizacao.js';
import { normalizarNome } from '../integracoes/monday/transformacao.js';
import {
  ENTIDADES,
  NOMES_ENTIDADES,
  inverso,
  type DefinicaoEntidade,
  type NomeEntidade,
} from './entidades.js';
import type { AcaoPermissao } from '../db/schema.js';

const FONTE = 'manual' as const;
const VERSAO_REGRA = 'interface-1.0.0';

/** Teto de pagina. Pedir 100 mil registros nao e caso de uso, e acidente. */
const TAMANHO_MAXIMO = 500;
const TAMANHO_PADRAO = 200;

export interface ContextoDados {
  usuarioId: string;
  usuarioNome: string;
  perfil: ContextoAutorizacao['perfil'];
  sessaoId: string | null;
  enderecoIp: string | null;
  autorizacao: ContextoAutorizacao;
}

export interface Filtros {
  comiteId?: string | null;
  competencia?: string | null;
  empreendimentoId?: string | null;
  responsavel?: string | null;
  pagina?: number;
  tamanho?: number;
  ordenar?: string | null;
  direcao?: 'asc' | 'desc';
  /** Registros excluidos logicamente. Padrao: nao. */
  incluirAusentes?: boolean;
}

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  tamanho: number;
  paginas: number;
}

/** Registro no vocabulario da interface. */
export type RegistroSaida = Record<string, unknown> & { id: string; versao: number };

// ═══════════════════════════════════════════════════════════════════════════
// Traducao entre o vocabulario da tela e o do banco
// ═══════════════════════════════════════════════════════════════════════════

function definicao(entidade: NomeEntidade): DefinicaoEntidade {
  return ENTIDADES[entidade];
}

function exigirAcao(ctx: ContextoDados, entidade: NomeEntidade, acao: AcaoPermissao): void {
  const def = definicao(entidade);
  if (!def.acoes.includes(acao)) {
    throw entradaInvalida(`A entidade "${entidade}" nao aceita a operacao ${acao}.`, {
      entidade,
      acao,
      aceitas: def.acoes,
    });
  }
  exigirModulo(ctx.autorizacao, def.modulo, acao);
}

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const data = (v: unknown): string | null => {
  const s = texto(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) {
    throw entradaInvalida(`Data invalida: "${s}". Use AAAA-MM-DD.`);
  }
  return s.slice(0, 10);
};

const inteiro = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw entradaInvalida(`Numero invalido: "${String(v)}".`);
  return Math.trunc(n);
};

const booleano = (v: unknown): boolean | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  throw entradaInvalida(`Valor booleano invalido: "${String(v)}".`);
};

/**
 * Traduz o corpo enviado pela tela em colunas.
 *
 * O corpo original inteiro vai para `valor_original` — inclusive os campos sem
 * coluna. Nenhum dado enviado e descartado; o que a modelagem ainda nao previu
 * fica recuperavel.
 */
function paraColunas(
  def: DefinicaoEntidade,
  corpo: Record<string, unknown>,
  parcial: boolean,
): Record<string, unknown> {
  const colunas: Record<string, unknown> = {};

  for (const [campo, coluna] of Object.entries(def.campos)) {
    // Campo ausente do corpo nao vira coluna, nem na criacao. Escrever null
    // explicito anularia o DEFAULT do banco — e colunas como `status` ou
    // `checklist` sao NOT NULL DEFAULT. Ausencia significa "use o padrao";
    // presenca com null significa "limpe o valor". Os dois casos existem.
    if (!(campo in corpo)) continue;
    const bruto = corpo[campo];

    if (def.datas.includes(coluna)) colunas[coluna] = data(bruto);
    else if (def.inteiros.includes(coluna)) colunas[coluna] = inteiro(bruto);
    else if (def.booleanos.includes(coluna)) colunas[coluna] = booleano(bruto);
    else if (def.estruturas.includes(coluna)) {
      colunas[coluna] =
        bruto === undefined || bruto === null ? null : JSON.stringify(bruto);
    } else colunas[coluna] = texto(bruto);
  }

  // Recorte fixo da entidade (categoria de distrato/retomada) nao e negociavel
  // pelo cliente: sobrescreve o que vier no corpo.
  if (def.recorte) Object.assign(colunas, def.recorte);

  return colunas;
}

/** Traduz a linha do banco de volta ao vocabulario da tela. */
function paraSaida(def: DefinicaoEntidade, linha: Record<string, unknown>): RegistroSaida {
  const mapa = inverso(def);
  const saida: Record<string, unknown> = {
    id: linha.id,
    versao: linha.versao,
  };

  for (const [coluna, valor] of Object.entries(linha)) {
    const campo = mapa[coluna];
    if (!campo) continue;
    saida[campo] = valor instanceof Date ? valor.toISOString() : valor;
  }

  // Metadados que a interface usa para mostrar procedencia sem inventar nada.
  if (def.temProveniencia) {
    saida._fonte = linha.fonte;
    saida._demonstrativo = linha.demonstrativo === true;
    saida._ausente_desde = linha.ausente_desde ?? null;
  }
  saida._atualizado_em = linha.atualizado_em ?? null;

  return saida as RegistroSaida;
}

// ═══════════════════════════════════════════════════════════════════════════
// Consulta
// ═══════════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

function aplicarRecorte(consulta: any, def: DefinicaoEntidade, ctx: ContextoDados, f: Filtros) {
  let q = consulta;

  if (def.recorte) {
    for (const [coluna, valor] of Object.entries(def.recorte)) {
      q = q.where(coluna as any, '=', valor);
    }
  }

  // Exclusao logica: por padrao o que foi excluido nao aparece, mas continua
  // no banco. `incluirAusentes` existe para conferencia, nao para a tela.
  if (def.temProveniencia && !f.incluirAusentes) {
    q = q.where('ausente_desde', 'is', null);
  }

  if (def.temComite && f.comiteId) q = q.where('comite_id', '=', f.comiteId);
  if (def.temComite && f.competencia) q = q.where('competencia_ref', '=', f.competencia);
  if (def.temEmpreendimento && f.empreendimentoId) {
    q = q.where('empreendimento_id', '=', f.empreendimentoId);
  }

  // Escopo de empreendimento da sessao. Lista vazia significa "nenhum
  // empreendimento no escopo" e tem de resultar em nada — diferente de null,
  // que significa "sem restricao".
  const permitidos = filtroEmpreendimentos(ctx.autorizacao);
  if (permitidos !== null && def.temEmpreendimento) {
    q = permitidos.length
      ? q.where((eb: any) =>
          eb.or([
            eb('empreendimento_id', 'in', permitidos),
            // Registro consolidado, sem empreendimento, segue a permissao de
            // modulo — e o mesmo criterio de rbac/autorizacao.ts.
            eb('empreendimento_id', 'is', null),
          ]),
        )
      : q.where('empreendimento_id', 'is', null);
  }

  return q;
}

/**
 * Filtro por responsavel.
 *
 * Nenhuma das tabelas da Fase 1 tem coluna de responsavel: no modelo atual, a
 * responsabilidade vive no Monday e chega em `valor_original`. Filtrar por ela
 * inventando uma coluna daria resultado vazio silencioso, que e pior do que
 * recusar. Entao a busca e feita sobre o dado bruto preservado.
 */
function aplicarResponsavel(consulta: any, def: DefinicaoEntidade, responsavel: string) {
  if (!def.temProveniencia) {
    throw entradaInvalida(
      `A entidade nao guarda responsavel; o filtro nao pode ser aplicado sem devolver resultado enganoso.`,
    );
  }
  const alvo = responsavel.toLowerCase();
  return consulta.where(
    sql<boolean>`lower(valor_original::text) LIKE ${'%' + alvo + '%'}`,
  );
}

export async function listar(
  entidade: NomeEntidade,
  filtros: Filtros,
  ctx: ContextoDados,
): Promise<Pagina<RegistroSaida>> {
  exigirAcao(ctx, entidade, 'ler');
  const def = definicao(entidade);

  const tamanho = Math.min(Math.max(filtros.tamanho ?? TAMANHO_PADRAO, 1), TAMANHO_MAXIMO);
  const pagina = Math.max(filtros.pagina ?? 1, 1);

  const ordenar = filtros.ordenar ?? def.ordemPadrao.coluna;
  if (!def.ordenaveis.includes(ordenar)) {
    throw entradaInvalida(`Nao e possivel ordenar por "${ordenar}".`, {
      aceitas: def.ordenaveis,
    });
  }
  const direcao = filtros.direcao ?? def.ordemPadrao.direcao;

  let base = db.selectFrom(def.tabela as any);
  base = aplicarRecorte(base, def, ctx, filtros);
  if (filtros.responsavel) base = aplicarResponsavel(base, def, filtros.responsavel);

  const contagem = await base
    .select(({ fn }: any) => [fn.countAll().as('total')])
    .executeTakeFirst();
  const total = Number((contagem as { total?: string } | undefined)?.total ?? 0);

  const linhas = await base
    .selectAll()
    // Desempate por id: sem ele, duas linhas com a mesma data podem trocar de
    // lugar entre paginas e um registro some da paginacao.
    .orderBy(ordenar as any, direcao)
    .orderBy('id' as any, 'asc')
    .limit(tamanho)
    .offset((pagina - 1) * tamanho)
    .execute();

  return {
    itens: (linhas as Record<string, unknown>[]).map((l) => paraSaida(def, l)),
    total,
    pagina,
    tamanho,
    paginas: Math.max(Math.ceil(total / tamanho), 1),
  };
}

export async function obter(
  entidade: NomeEntidade,
  id: string,
  ctx: ContextoDados,
): Promise<RegistroSaida> {
  exigirAcao(ctx, entidade, 'ler');
  const def = definicao(entidade);

  let q = db.selectFrom(def.tabela as any).selectAll().where('id', '=', id);
  if (def.recorte) {
    for (const [coluna, valor] of Object.entries(def.recorte)) {
      q = q.where(coluna as any, '=', valor);
    }
  }

  const linha = (await q.executeTakeFirst()) as Record<string, unknown> | undefined;
  if (!linha) throw naoEncontrado(`Registro nao encontrado em ${entidade}.`);

  if (def.temEmpreendimento) {
    exigirEmpreendimento(ctx.autorizacao, (linha.empreendimento_id as string) ?? null);
  }

  return paraSaida(def, linha);
}

// ═══════════════════════════════════════════════════════════════════════════
// Escrita
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Traduz violacoes de restricao do banco em mensagem util.
 *
 * As regras vivem no banco de proposito — assim valem para qualquer caminho de
 * escrita, nao so para a API. O que falta e a explicacao, e e o que isto faz.
 */
/**
 * Recusa id provisorio do navegador antes de ele virar erro de tipo do banco.
 *
 * O adaptador da tela cria `tmp-<uuid>` para exibir o registro antes da
 * resposta do servidor, e troca pelo uuid real quando ela chega. Se um filho
 * for enviado antes dessa troca, o PostgreSQL responde "sintaxe de entrada
 * invalida para tipo uuid" — mensagem que nao diz nada a quem clicou em
 * sincronizar, e que derrubou a primeira sincronizacao real na maquina da
 * Coevo.
 *
 * A correcao de fato esta no adaptador, que agora fecha o lote antes de
 * enviar um vinculo nao resolvido. Isto aqui e a rede: se escapar de novo, a
 * mensagem diz o que aconteceu.
 */
function recusarIdProvisorio(colunas: Record<string, unknown>, entidade: NomeEntidade): void {
  for (const [coluna, valor] of Object.entries(colunas)) {
    if (typeof valor === 'string' && valor.startsWith('tmp-')) {
      throw entradaInvalida(
        `O campo "${coluna}" de ${entidade} aponta para um registro que ainda nao foi gravado. `
          + 'Aguarde a sincronizacao terminar e tente de novo.',
        { campo: coluna },
      );
    }
  }
}

function traduzirErroDoBanco(erro: unknown, entidade: NomeEntidade): never {
  const mensagem = erro instanceof Error ? erro.message : String(erro);

  if (/invalid input syntax for type uuid|sintaxe de entrada .* uuid/i.test(mensagem)) {
    throw entradaInvalida(
      `Vinculo invalido em ${entidade}: o registro referenciado ainda nao existe no banco.`,
    );
  }

  if (/notificacao_solucao_coerente/.test(mensagem)) {
    throw entradaInvalida(
      'Data de solucao so pode ser informada quando o caso estiver encerrado — '
        + 'estagio "Resolvida" ou "Encerrada".',
      { campo: 'data_solucao' },
    );
  }
  if (/ux_unidades_local/.test(mensagem)) {
    throw conflito('Ja existe unidade com este numero neste empreendimento.', {
      campo: 'numero',
    });
  }
  if (/ux_empreendimentos_normalizado/.test(mensagem)) {
    throw conflito('Ja existe empreendimento com este nome.', { campo: 'nome' });
  }
  if (/ux_comites_competencia/.test(mensagem)) {
    throw conflito('Ja existe comite para esta competencia.', { campo: 'ref' });
  }
  if (/violates foreign key/.test(mensagem)) {
    throw entradaInvalida('Referencia inexistente: verifique empreendimento e comite.');
  }
  if (/violates not-null/.test(mensagem)) {
    const campo = /column "([^"]+)"/.exec(mensagem)?.[1] ?? 'obrigatorio';
    throw entradaInvalida(`Campo obrigatorio ausente: ${campo}.`, { campo });
  }
  if (/violates check constraint/.test(mensagem)) {
    const restricao = /constraint "([^"]+)"/.exec(mensagem)?.[1] ?? '';
    throw entradaInvalida(`Valor recusado pela regra ${restricao} em ${entidade}.`, {
      restricao,
    });
  }
  throw erro;
}

/** Comite exige competencia; a tela so informa `ref`. */
async function garantirCompetencia(ref: string, rotulo: string): Promise<void> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ref)) {
    throw entradaInvalida(`Competencia invalida: "${ref}". Use AAAA-MM.`, { campo: 'ref' });
  }
  const [ano, mes] = ref.split('-').map(Number);
  await db
    .insertInto('competencias')
    .values({
      ref,
      rotulo,
      inicio: `${ref}-01`,
      fim: new Date(Date.UTC(ano!, mes!, 0)).toISOString().slice(0, 10),
    })
    .onConflict((oc) => oc.column('ref').doNothing())
    .execute();
}

export async function criar(
  entidade: NomeEntidade,
  corpo: Record<string, unknown>,
  ctx: ContextoDados,
): Promise<RegistroSaida> {
  exigirAcao(ctx, entidade, 'criar');
  const def = definicao(entidade);

  const colunas = paraColunas(def, corpo, false);
  recusarIdProvisorio(colunas, entidade);

  if (def.temEmpreendimento) {
    exigirEmpreendimento(ctx.autorizacao, (colunas.empreendimento_id as string) ?? null);
  }

  if (entidade === 'comites') {
    const ref = texto(corpo.ref);
    if (!ref) throw entradaInvalida('Informe a competencia (ref) no formato AAAA-MM.');
    await garantirCompetencia(ref, texto(corpo.label) ?? ref);
    colunas.rotulo = texto(corpo.label) ?? ref;
  }

  if (entidade === 'empreendimentos') {
    const nome = texto(corpo.nome);
    if (!nome) throw entradaInvalida('Informe o nome do empreendimento.', { campo: 'nome' });
    colunas.nome_normalizado = normalizarNome(nome);
  }

  if (def.temProveniencia) {
    colunas.fonte = FONTE;
    // Cadastro pela interface nao tem id de origem externa. Deixar nulo e
    // correto: NULL e distinto de NULL no indice unico, entao varios cadastros
    // manuais convivem sem colidir.
    colunas.id_origem = null;
    colunas.valor_original = JSON.stringify(corpo);
    colunas.versao_regra = VERSAO_REGRA;
    // Dado digitado por pessoa identificada nunca e demonstrativo.
    colunas.demonstrativo = false;
  }

  let linha: Record<string, unknown>;
  try {
    linha = (await db
      .insertInto(def.tabela as any)
      .values(colunas as never)
      .returningAll()
      .executeTakeFirstOrThrow()) as Record<string, unknown>;
  } catch (erro) {
    traduzirErroDoBanco(erro, entidade);
  }

  await auditar({
    usuarioId: ctx.usuarioId,
    usuarioNome: ctx.usuarioNome,
    perfil: ctx.perfil,
    sessaoId: ctx.sessaoId,
    enderecoIp: ctx.enderecoIp,
    acao: 'registro_criado',
    recurso: entidade,
    recursoId: String(linha.id),
    modulo: def.modulo,
    valorDepois: corpo,
  });

  return paraSaida(def, linha);
}

/**
 * Criacao em lote.
 *
 * A sincronizacao do Monday insere centenas de registros de uma vez. Um POST
 * por registro transformaria uma sincronizacao em centenas de requisicoes —
 * lento e, pior, interrompivel no meio, deixando metade gravada.
 *
 * Tudo numa transacao: ou entra o lote inteiro, ou nao entra nada.
 */
export async function criarLote(
  entidade: NomeEntidade,
  registros: Record<string, unknown>[],
  ctx: ContextoDados,
): Promise<RegistroSaida[]> {
  exigirAcao(ctx, entidade, 'criar');
  if (registros.length === 0) return [];

  const def = definicao(entidade);

  return db.transaction().execute(async (trx) => {
    const saidas: RegistroSaida[] = [];

    for (const corpo of registros) {
      const colunas = paraColunas(def, corpo, false);
      recusarIdProvisorio(colunas, entidade);

      if (def.temEmpreendimento) {
        exigirEmpreendimento(ctx.autorizacao, (colunas.empreendimento_id as string) ?? null);
      }
      if (entidade === 'empreendimentos') {
        const nome = texto(corpo.nome);
        if (!nome) throw entradaInvalida('Informe o nome do empreendimento.', { campo: 'nome' });
        colunas.nome_normalizado = normalizarNome(nome);
      }
      if (entidade === 'comites') {
        throw entradaInvalida('Comites sao criados um a um.');
      }
      if (def.temProveniencia) {
        colunas.fonte = FONTE;
        colunas.id_origem = null;
        colunas.valor_original = JSON.stringify(corpo);
        colunas.versao_regra = VERSAO_REGRA;
        colunas.demonstrativo = false;
      }

      try {
        const linha = (await trx
          .insertInto(def.tabela as any)
          .values(colunas as never)
          .returningAll()
          .executeTakeFirstOrThrow()) as Record<string, unknown>;
        saidas.push(paraSaida(def, linha));
      } catch (erro) {
        traduzirErroDoBanco(erro, entidade);
      }
    }

    await auditar({
      usuarioId: ctx.usuarioId,
      usuarioNome: ctx.usuarioNome,
      perfil: ctx.perfil,
      sessaoId: ctx.sessaoId,
      enderecoIp: ctx.enderecoIp,
      acao: 'registro_criado',
      recurso: entidade,
      recursoId: null,
      modulo: def.modulo,
      detalhe: { lote: true, quantidade: saidas.length },
    });

    return saidas;
  });
}

export async function atualizar(
  entidade: NomeEntidade,
  id: string,
  corpo: Record<string, unknown>,
  versaoInformada: number | null,
  ctx: ContextoDados,
): Promise<RegistroSaida> {
  exigirAcao(ctx, entidade, 'editar');
  const def = definicao(entidade);

  const atual = (await db
    .selectFrom(def.tabela as any)
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()) as Record<string, unknown> | undefined;

  if (!atual) throw naoEncontrado(`Registro nao encontrado em ${entidade}.`);

  if (def.temEmpreendimento) {
    exigirEmpreendimento(ctx.autorizacao, (atual.empreendimento_id as string) ?? null);
  }

  // Controle otimista. Sem versao informada, a edicao e recusada: gravar sem
  // saber sobre o que se esta gravando e exatamente o que se quer eliminar.
  if (versaoInformada === null || versaoInformada === undefined) {
    throw conflito(
      'Informe a versao do registro que voce esta editando.',
      { versao_atual: atual.versao, registro: paraSaida(def, atual) },
    );
  }
  if (Number(versaoInformada) !== Number(atual.versao)) {
    throw conflito(
      'Este registro foi alterado por outra pessoa enquanto voce editava. ' +
        'Recarregue e compare antes de gravar.',
      {
        versao_informada: Number(versaoInformada),
        versao_atual: Number(atual.versao),
        registro: paraSaida(def, atual),
      },
    );
  }

  const colunas = paraColunas(def, corpo, true);
  recusarIdProvisorio(colunas, entidade);
  // Recorte da entidade nao muda por edicao: uma retomada nao vira distrato
  // por PATCH.
  if (def.recorte) Object.assign(colunas, def.recorte);

  if (def.temEmpreendimento && 'empreendimento_id' in colunas) {
    exigirEmpreendimento(ctx.autorizacao, (colunas.empreendimento_id as string) ?? null);
  }

  if (entidade === 'empreendimentos' && 'nome' in colunas && colunas.nome) {
    colunas.nome_normalizado = normalizarNome(String(colunas.nome));
  }

  if (entidade === 'comites' && 'competencia_ref' in colunas && colunas.competencia_ref) {
    await garantirCompetencia(
      String(colunas.competencia_ref),
      String(colunas.rotulo ?? colunas.competencia_ref),
    );
  }

  if (Object.keys(colunas).length === 0) {
    return paraSaida(def, atual);
  }

  // `valor_original` guarda o que a origem mandou. Numa edicao manual, a
  // origem e a tela — entao acumula, sem apagar o que veio antes.
  if (def.temProveniencia) {
    const anterior =
      typeof atual.valor_original === 'object' && atual.valor_original !== null
        ? (atual.valor_original as Record<string, unknown>)
        : {};
    colunas.valor_original = JSON.stringify({ ...anterior, ...corpo });
  }

  let linha: Record<string, unknown>;
  try {
    linha = (await db
      .updateTable(def.tabela as any)
      .set(colunas as never)
      .where('id', '=', id)
      // Segunda barreira: se outra transacao alterou entre a leitura e aqui,
      // esta clausula nao encontra a linha e o UPDATE nao acontece.
      .where('versao', '=', Number(versaoInformada))
      .returningAll()
      .executeTakeFirst()) as Record<string, unknown>;
  } catch (erro) {
    traduzirErroDoBanco(erro, entidade);
  }

  if (!linha) {
    const recarregado = (await db
      .selectFrom(def.tabela as any)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
    throw conflito('Este registro foi alterado por outra pessoa. Recarregue e compare.', {
      registro: recarregado ? paraSaida(def, recarregado) : null,
    });
  }

  await auditar({
    usuarioId: ctx.usuarioId,
    usuarioNome: ctx.usuarioNome,
    perfil: ctx.perfil,
    sessaoId: ctx.sessaoId,
    enderecoIp: ctx.enderecoIp,
    acao: 'registro_alterado',
    recurso: entidade,
    recursoId: id,
    modulo: def.modulo,
    valorAntes: paraSaida(def, atual),
    valorDepois: corpo,
  });

  return paraSaida(def, linha);
}

/**
 * Exclusao logica.
 *
 * O registro sai das listagens e permanece no banco, com trilha. Nao existe
 * exclusao fisica pela API: uma tela nao deve conseguir destruir historico.
 */
export async function excluir(
  entidade: NomeEntidade,
  ids: string[],
  ctx: ContextoDados,
): Promise<{ excluidos: number; nao_encontrados: string[] }> {
  exigirAcao(ctx, entidade, 'remover');
  const def = definicao(entidade);

  if (!def.temProveniencia) {
    throw entradaInvalida(
      `Registros de ${entidade} nao sao excluidos pela interface: sao recorte de calendario.`,
    );
  }
  if (ids.length === 0) return { excluidos: 0, nao_encontrados: [] };

  // `empreendimentos` e `regulatorios` nao tem coluna de empreendimento —
  // selecionar sem verificar quebraria a exclusao nessas duas entidades.
  const colunas = def.temEmpreendimento ? ['id', 'empreendimento_id'] : ['id'];

  const alvos = (await db
    .selectFrom(def.tabela as any)
    .select(colunas as any)
    .where('id', 'in', ids)
    .where('ausente_desde', 'is', null)
    .execute()) as Array<{ id: string; empreendimento_id?: string | null }>;

  for (const alvo of alvos) {
    if (def.temEmpreendimento) {
      exigirEmpreendimento(ctx.autorizacao, alvo.empreendimento_id ?? null);
    }
  }

  const encontrados = alvos.map((a) => a.id);
  if (encontrados.length === 0) {
    return { excluidos: 0, nao_encontrados: ids };
  }

  await db
    .updateTable(def.tabela as any)
    .set({ ausente_desde: new Date() } as never)
    .where('id', 'in', encontrados)
    .execute();

  await auditar({
    usuarioId: ctx.usuarioId,
    usuarioNome: ctx.usuarioNome,
    perfil: ctx.perfil,
    sessaoId: ctx.sessaoId,
    enderecoIp: ctx.enderecoIp,
    acao: 'registro_removido',
    recurso: entidade,
    recursoId: encontrados.length === 1 ? encontrados[0]! : null,
    modulo: def.modulo,
    detalhe: { ids: encontrados, exclusao: 'logica' },
  });

  return {
    excluidos: encontrados.length,
    nao_encontrados: ids.filter((i) => !encontrados.includes(i)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Carga inicial e exportacao
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tudo que a interface precisa para abrir, numa chamada.
 *
 * A alternativa seria a SPA disparar onze requisicoes na carga; o custo cai
 * sobre a pessoa esperando a tela.
 */
export async function cargaInicial(
  comiteId: string | null,
  ctx: ContextoDados,
): Promise<{
  comite_id: string | null;
  entidades: Record<string, RegistroSaida[]>;
  truncadas: string[];
  gerado_em: string;
}> {
  const dados: Record<string, RegistroSaida[]> = {};
  const truncadas: string[] = [];

  for (const entidade of NOMES_ENTIDADES) {
    const def = definicao(entidade);

    // Sem permissao de leitura no modulo, a entidade simplesmente nao vem —
    // e a tela nao recebe dado que a pessoa nao pode ver.
    if (!ctx.autorizacao.permissoes.has(`${def.modulo}:ler`)) {
      dados[entidade] = [];
      continue;
    }

    const filtros: Filtros = { tamanho: TAMANHO_MAXIMO, pagina: 1 };
    // Cadastro de base vem inteiro; movimento do mes vem do comite aberto.
    if (def.temComite && comiteId) filtros.comiteId = comiteId;

    const pagina = await listar(entidade, filtros, ctx);
    dados[entidade] = pagina.itens;
    // Silenciar truncamento faria a tela mostrar parte do mes como se fosse o
    // mes inteiro. A interface precisa saber para avisar.
    if (pagina.total > pagina.itens.length) truncadas.push(entidade);
  }

  return {
    comite_id: comiteId,
    entidades: dados,
    truncadas,
    gerado_em: new Date().toISOString(),
  };
}

/** Exportacao completa, auditada. */
export async function exportar(ctx: ContextoDados): Promise<Record<string, unknown>> {
  const saida: Record<string, unknown> = {};
  let quantidade = 0;

  for (const entidade of NOMES_ENTIDADES) {
    const def = definicao(entidade);
    if (!ctx.autorizacao.permissoes.has(`${def.modulo}:exportar`)) {
      saida[entidade] = [];
      continue;
    }
    const itens: RegistroSaida[] = [];
    let pagina = 1;
    // Paginado ate o fim: exportar so a primeira pagina e entregar backup
    // incompleto com cara de completo.
    for (;;) {
      const p = await listar(entidade, { pagina, tamanho: TAMANHO_MAXIMO }, ctx);
      itens.push(...p.itens);
      if (pagina >= p.paginas) break;
      pagina++;
    }
    saida[entidade] = itens;
    quantidade += itens.length;
  }

  await auditarExportacao(ctx, {
    relatorio: 'dados_interface',
    formato: 'json',
    quantidadeRegistros: quantidade,
    versaoRegra: VERSAO_REGRA,
    // A exportacao usa o mapa de campos, que nao inclui CPF/CNPJ em nenhuma
    // entidade da interface.
    documentosMascarados: true,
  });

  saida._exportado_em = new Date().toISOString();
  saida._origem = 'postgresql';
  return saida;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
