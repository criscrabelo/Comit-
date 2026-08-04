/**
 * Autorizacao em quatro dimensoes combinadas.
 *
 * Escopo da Fase 1: "autorizacao por modulo, area, empreendimento e tipo de
 * informacao". O efeito e a INTERSECAO das quatro — nao a uniao. Cada dimensao
 * pode negar independentemente.
 *
 * Regra de ouro: verificacao SEMPRE no servidor. A base atual decide visibilidade
 * no navegador (js/views.js), o que qualquer pessoa contorna pelo console.
 */
import { db } from '../db/pool.js';
import { naoAutorizado } from '../errors.js';
import type {
  AcaoPermissao,
  AreaOrganizacional,
  ModuloPlataforma,
  PerfilUsuario,
  TipoInformacao,
} from '../db/schema.js';

export interface ContextoAutorizacao {
  usuarioId: string;
  perfil: PerfilUsuario;
  area: AreaOrganizacional | null;
  /** Modulos e acoes permitidos, resolvidos do perfil e das excecoes. */
  permissoes: Set<string>;
  areas: Set<AreaOrganizacional>;
  /** true = todos os empreendimentos. */
  todosEmpreendimentos: boolean;
  empreendimentos: Set<string>;
  /** Tipos de informacao que o usuario ve por completo (sem mascara). */
  tiposCompletos: Set<TipoInformacao>;
}

const chave = (modulo: ModuloPlataforma, acao: AcaoPermissao) => `${modulo}:${acao}`;

/**
 * Carrega o contexto completo de autorizacao do usuario.
 *
 * Excecao por usuario vence o padrao do perfil, nas duas direcoes: pode conceder
 * o que o perfil nao da, e pode negar o que o perfil daria.
 */
export async function carregarContexto(
  usuarioId: string,
  perfil: PerfilUsuario,
  area: AreaOrganizacional | null,
): Promise<ContextoAutorizacao> {
  const [doPerfil, doUsuario, areas, empreendimentos, tipos] = await Promise.all([
    db
      .selectFrom('permissoes_perfil')
      .select(['modulo', 'acao'])
      .where('perfil', '=', perfil)
      .execute(),
    db
      .selectFrom('permissoes_usuario')
      .select(['modulo', 'acao', 'concedida'])
      .where('usuario_id', '=', usuarioId)
      .execute(),
    db.selectFrom('escopos_area').select('area').where('usuario_id', '=', usuarioId).execute(),
    db
      .selectFrom('escopos_empreendimento')
      .select(['empreendimento_id', 'todos'])
      .where('usuario_id', '=', usuarioId)
      .execute(),
    db
      .selectFrom('escopos_tipo_informacao')
      .select(['tipo', 'completo'])
      .where('usuario_id', '=', usuarioId)
      .execute(),
  ]);

  const permissoes = new Set(doPerfil.map((p) => chave(p.modulo, p.acao)));
  // Excecoes por usuario aplicadas depois, para poder negar o padrao do perfil.
  for (const p of doUsuario) {
    if (p.concedida) permissoes.add(chave(p.modulo, p.acao));
    else permissoes.delete(chave(p.modulo, p.acao));
  }

  const conjuntoAreas = new Set(areas.map((a) => a.area));
  // A propria area do usuario esta sempre no escopo, sem precisar de linha.
  if (area) conjuntoAreas.add(area);

  return {
    usuarioId,
    perfil,
    area,
    permissoes,
    areas: conjuntoAreas,
    todosEmpreendimentos: empreendimentos.some((e) => e.todos),
    empreendimentos: new Set(
      empreendimentos.map((e) => e.empreendimento_id).filter((id): id is string => Boolean(id)),
    ),
    tiposCompletos: new Set(tipos.filter((t) => t.completo).map((t) => t.tipo)),
  };
}

// ── Dimensao 1: modulo e acao ───────────────────────────────────────────────

export function podeNoModulo(
  ctx: ContextoAutorizacao,
  modulo: ModuloPlataforma,
  acao: AcaoPermissao,
): boolean {
  return ctx.permissoes.has(chave(modulo, acao));
}

export function exigirModulo(
  ctx: ContextoAutorizacao,
  modulo: ModuloPlataforma,
  acao: AcaoPermissao,
): void {
  if (!podeNoModulo(ctx, modulo, acao)) {
    throw naoAutorizado(`Seu perfil nao permite ${acao} em ${modulo.replace('_', ' ')}.`, {
      modulo,
      acao,
      perfil: ctx.perfil,
    });
  }
}

/**
 * Migrar o proprio navegador.
 *
 * Exigir perfil de administracao aqui foi um erro de escopo: quem tem dado de
 * versao anterior no navegador e quem usava a plataforma — a gestora, o lider —
 * e nao o administrador. Com a regra antiga, o dado ficaria preso no navegador
 * de quem nao pode migra-lo.
 *
 * A permissao correta e a de CRIAR no modulo para onde o dado vai. Colaborador
 * e convidado continuam recusados, porque nao criam registro juridico — e
 * migracao grava em tabela compartilhada, nao numa area privada da pessoa.
 *
 * A propriedade do dump continua garantida no servico, que filtra por usuario.
 */
export function exigirPodeMigrar(ctx: ContextoAutorizacao, acao: 'ler' | 'executar'): void {
  if (podeNoModulo(ctx, 'administracao', acao)) return;
  if (podeNoModulo(ctx, 'juridico', acao === 'ler' ? 'ler' : 'criar')) return;

  throw naoAutorizado(
    'Seu perfil nao permite migrar dados de versoes anteriores. ' +
      'Fale com a administracao da plataforma.',
    { perfil: ctx.perfil },
  );
}

// ── Dimensao 2: area ────────────────────────────────────────────────────────

export function podeNaArea(ctx: ContextoAutorizacao, area: AreaOrganizacional): boolean {
  // Perfis transversais atuam sobre todas as areas.
  if (ctx.perfil === 'administrador' || ctx.perfil === 'gestora' || ctx.perfil === 'diretoria') {
    return true;
  }
  return ctx.areas.has(area);
}

export function exigirArea(ctx: ContextoAutorizacao, area: AreaOrganizacional): void {
  if (!podeNaArea(ctx, area)) {
    throw naoAutorizado(`Voce nao tem acesso a area ${area}.`, { area });
  }
}

// ── Dimensao 3: empreendimento ──────────────────────────────────────────────

export function podeNoEmpreendimento(
  ctx: ContextoAutorizacao,
  empreendimentoId: string | null,
): boolean {
  if (ctx.todosEmpreendimentos) return true;
  // Registro sem empreendimento (consolidado) segue a permissao de modulo.
  if (!empreendimentoId) return true;
  return ctx.empreendimentos.has(empreendimentoId);
}

export function exigirEmpreendimento(
  ctx: ContextoAutorizacao,
  empreendimentoId: string | null,
): void {
  if (!podeNoEmpreendimento(ctx, empreendimentoId)) {
    throw naoAutorizado('Voce nao tem acesso a este empreendimento.', {
      empreendimento_id: empreendimentoId,
    });
  }
}

/**
 * Lista de empreendimentos para filtrar consultas.
 * `null` significa sem restricao — quem chama nao deve aplicar filtro.
 *
 * Devolver lista vazia e diferente de devolver null: vazia significa que o
 * usuario nao tem nenhum empreendimento no escopo, e a consulta deve resultar
 * em nada.
 */
export function filtroEmpreendimentos(ctx: ContextoAutorizacao): string[] | null {
  if (ctx.todosEmpreendimentos) return null;
  return [...ctx.empreendimentos];
}

// ── Dimensao 4: tipo de informacao ──────────────────────────────────────────

export function veCompleto(ctx: ContextoAutorizacao, tipo: TipoInformacao): boolean {
  if (ctx.tiposCompletos.has(tipo)) return true;
  // Gestora e a unica que enxerga documento completo por padrao de perfil
  // (1c do Diagnostico e Wireframes). Administrador depende de concessao
  // explicita: administrar a base nao implica ver dado pessoal.
  if (ctx.perfil === 'gestora' && (tipo === 'dado_pessoal' || tipo === 'documento')) return true;
  return false;
}

/**
 * Mascara CPF/CNPJ conforme o escopo do usuario.
 * Preserva a forma para que a pessoa reconheca o tipo, sem revelar o numero.
 */
export function aplicarMascaraDocumento(
  ctx: ContextoAutorizacao,
  documento: string | null | undefined,
): string | null {
  if (!documento) return null;
  if (veCompleto(ctx, 'dado_pessoal')) return documento;

  const digitos = documento.replace(/\D/g, '');
  if (digitos.length === 11) return `***.***.***-${digitos.slice(9)}`;
  if (digitos.length === 14) return `**.***.***/****-${digitos.slice(12)}`;
  return '[documento mascarado]';
}

export function podeExportar(ctx: ContextoAutorizacao, modulo: ModuloPlataforma): boolean {
  return podeNoModulo(ctx, modulo, 'exportar');
}
