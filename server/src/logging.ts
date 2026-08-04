/**
 * Logging estruturado com redacao obrigatoria de dados sensiveis.
 *
 * Nada de token, senha, CPF ou CNPJ chega ao log. A redacao acontece aqui, na
 * saida, e nao depende de disciplina de quem escreve a chamada de log.
 */
import pino from 'pino';
import { config } from './config.js';

/**
 * Caminhos redigidos automaticamente. Cobrem cabecalhos, corpos de requisicao e
 * os nomes de campo usados pelo dominio (pt-BR e en, porque as fontes externas
 * usam nomes em ingles).
 */
const CAMINHOS_REDIGIDOS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  '*.senha',
  '*.senha_atual',
  '*.senha_nova',
  '*.password',
  '*.token',
  '*.access_token',
  '*.refresh_token',
  '*.hash_senha',
  '*.hash_token',
  '*.cpf',
  '*.cnpj',
  '*.cpf_cnpj',
  '*.documento',
  'senha',
  'password',
  'token',
  'cpf_cnpj',
];

export const logger = pino({
  level: config.nivelLog,
  redact: { paths: CAMINHOS_REDIGIDOS, censor: '[redigido]' },
  base: { servico: 'patrono-backend', ambiente: config.ambiente },
  formatters: {
    level: (rotulo) => ({ nivel: rotulo }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.ambiente === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,servico' },
        },
      }
    : {}),
});

/**
 * Mascara CPF/CNPJ para exibicao a perfil sem permissao de documento completo.
 * Preserva a forma para que o usuario reconheca o tipo, sem revelar o numero.
 */
export function mascararDocumento(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digitos = valor.replace(/\D/g, '');
  if (digitos.length === 11) return '***.***.***-' + digitos.slice(9);
  if (digitos.length === 14) return '**.***.***/****-' + digitos.slice(12);
  return '[documento mascarado]';
}
