/**
 * Erros de dominio e formato uniforme de resposta.
 *
 * Formato definido em references/patrono-api.md:
 *   { "erro": { "codigo": "...", "mensagem": "...", "detalhe": {} } }
 */

export type CodigoErro =
  | 'nao_autenticado'
  | 'nao_autorizado'
  | 'credenciais_invalidas'
  | 'excesso_de_tentativas'
  | 'entrada_invalida'
  | 'nao_encontrado'
  | 'conflito'
  | 'integracao_desligada'
  | 'integracao_nao_verificada'
  | 'fonte_indisponivel'
  | 'atualizacao_parcial'
  | 'erro_interno';

const STATUS_POR_CODIGO: Record<CodigoErro, number> = {
  nao_autenticado: 401,
  nao_autorizado: 403,
  credenciais_invalidas: 401,
  excesso_de_tentativas: 429,
  entrada_invalida: 400,
  nao_encontrado: 404,
  conflito: 409,
  integracao_desligada: 409,
  integracao_nao_verificada: 409,
  fonte_indisponivel: 502,
  atualizacao_parcial: 207,
  erro_interno: 500,
};

export class ErroApi extends Error {
  readonly codigo: CodigoErro;
  readonly status: number;
  readonly detalhe: Record<string, unknown>;

  constructor(codigo: CodigoErro, mensagem: string, detalhe: Record<string, unknown> = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    this.codigo = codigo;
    this.status = STATUS_POR_CODIGO[codigo];
    this.detalhe = detalhe;
  }

  paraResposta() {
    return {
      erro: {
        codigo: this.codigo,
        mensagem: this.message,
        detalhe: this.detalhe,
      },
    };
  }
}

export const naoAutenticado = (mensagem = 'Sessao necessaria.') =>
  new ErroApi('nao_autenticado', mensagem);

export const naoAutorizado = (mensagem: string, detalhe?: Record<string, unknown>) =>
  new ErroApi('nao_autorizado', mensagem, detalhe);

export const entradaInvalida = (mensagem: string, detalhe?: Record<string, unknown>) =>
  new ErroApi('entrada_invalida', mensagem, detalhe);

export const naoEncontrado = (mensagem: string) => new ErroApi('nao_encontrado', mensagem);

export const conflito = (mensagem: string, detalhe?: Record<string, unknown>) =>
  new ErroApi('conflito', mensagem, detalhe);
