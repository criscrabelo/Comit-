/**
 * Trilha de auditoria.
 *
 * "Toda alteracao relevante deve ser auditavel." Inclui leitura de dado pessoal
 * e exportacao, exigidas por references/patrono-seguranca.md para atender a LGPD.
 *
 * A tabela recusa UPDATE e DELETE por gatilho, portanto a trilha nao pode ser
 * reescrita nem por quem tem acesso ao banco.
 */
import { db } from '../db/pool.js';
import { logger } from '../logging.js';
import type { ModuloPlataforma, PerfilUsuario } from '../db/schema.js';

export type AcaoAuditada =
  | 'login'
  | 'login_negado'
  | 'logout'
  | 'sessao_revogada'
  | 'senha_alterada'
  | 'senha_recuperada'
  | 'usuario_criado'
  | 'usuario_alterado'
  | 'permissao_alterada'
  | 'consulta_dado_pessoal'
  | 'exportacao'
  | 'importacao_iniciada'
  | 'importacao_concluida'
  | 'integracao_configurada'
  | 'integracao_verificada'
  | 'registro_criado'
  | 'registro_alterado'
  | 'registro_removido'
  | 'inconsistencia_tratada'
  | 'reprocessamento'
  | 'backup_criado'
  | 'backup_baixado'
  | 'backup_protegido'
  | 'backup_expurgado'
  | 'restauracao_solicitada'
  | 'restauracao_recusada'
  | 'backup_restaurado';

export interface EntradaAuditoria {
  acao: AcaoAuditada;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  perfil?: PerfilUsuario | null;
  sessaoId?: string | null;
  recurso?: string | null;
  recursoId?: string | null;
  modulo?: ModuloPlataforma | null;
  enderecoIp?: string | null;
  agenteUsuario?: string | null;
  valorAntes?: unknown;
  valorDepois?: unknown;
  detalhe?: Record<string, unknown>;
  resultado?: 'sucesso' | 'negado' | 'erro';
}

/**
 * Campos que nunca entram na trilha em claro. A trilha registra QUE o dado foi
 * acessado, nao o dado em si — do contrario ela viraria uma segunda copia da
 * base pessoal, sem controle de acesso proprio.
 */
const CAMPOS_SENSIVEIS = new Set([
  'senha',
  'senha_atual',
  'senha_nova',
  'password',
  'hash_senha',
  'token',
  'hash_token',
  'cpf_cnpj',
  'cpf',
  'cnpj',
  'documento',
]);

function redigir(valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) return valor.map(redigir);
  if (typeof valor !== 'object') return valor;

  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    saida[k] = CAMPOS_SENSIVEIS.has(k.toLowerCase()) ? '[redigido]' : redigir(v);
  }
  return saida;
}

/**
 * Grava uma entrada na trilha.
 *
 * Falha ao auditar nao derruba a operacao do usuario, mas e registrada como erro
 * no log da aplicacao — perder a trilha em silencio seria pior do que o erro.
 */
export async function auditar(entrada: EntradaAuditoria): Promise<void> {
  try {
    await db
      .insertInto('logs_auditoria')
      .values({
        acao: entrada.acao,
        usuario_id: entrada.usuarioId ?? null,
        usuario_nome: entrada.usuarioNome ?? null,
        perfil: entrada.perfil ?? null,
        sessao_id: entrada.sessaoId ?? null,
        recurso: entrada.recurso ?? null,
        recurso_id: entrada.recursoId ?? null,
        modulo: entrada.modulo ?? null,
        endereco_ip: entrada.enderecoIp ?? null,
        agente_usuario: entrada.agenteUsuario?.slice(0, 500) ?? null,
        valor_antes: entrada.valorAntes === undefined ? null : redigir(entrada.valorAntes),
        valor_depois: entrada.valorDepois === undefined ? null : redigir(entrada.valorDepois),
        detalhe: redigir(entrada.detalhe ?? {}),
        resultado: entrada.resultado ?? 'sucesso',
      })
      .execute();
  } catch (erro) {
    logger.error(
      { erro: erro instanceof Error ? erro.message : String(erro), acao: entrada.acao },
      'Falha ao gravar trilha de auditoria',
    );
  }
}

/**
 * Registra acesso a dado pessoal.
 *
 * Chamado quando uma resposta inclui CPF/CNPJ completo. Grava a quantidade e os
 * identificadores dos registros, nunca os documentos.
 */
export async function auditarAcessoDadoPessoal(
  contexto: Pick<EntradaAuditoria, 'usuarioId' | 'usuarioNome' | 'perfil' | 'sessaoId' | 'enderecoIp'>,
  recurso: string,
  identificadores: string[],
): Promise<void> {
  await auditar({
    ...contexto,
    acao: 'consulta_dado_pessoal',
    recurso,
    detalhe: {
      quantidade: identificadores.length,
      // Amostra limitada: identifica o que foi visto sem transformar a trilha
      // num indice completo da base pessoal.
      identificadores: identificadores.slice(0, 100),
      truncado: identificadores.length > 100,
    },
  });
}

/** Registra exportacao, com os filtros aplicados (exigido em formato-saida.md). */
export async function auditarExportacao(
  contexto: Pick<EntradaAuditoria, 'usuarioId' | 'usuarioNome' | 'perfil' | 'sessaoId' | 'enderecoIp'>,
  detalhe: {
    relatorio: string;
    formato: string;
    periodo?: string;
    filtros?: Record<string, unknown>;
    empreendimentos?: string[];
    quantidadeRegistros?: number;
    versaoRegra?: string;
    documentosMascarados: boolean;
  },
): Promise<void> {
  await auditar({ ...contexto, acao: 'exportacao', recurso: detalhe.relatorio, detalhe });
}
