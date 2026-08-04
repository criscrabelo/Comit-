/**
 * Sessao por cookie httpOnly.
 *
 * Regra do produto: "nenhuma credencial no navegador ou codigo-fonte". Guardar
 * o token de sessao em localStorage ou sessionStorage colocaria uma credencial
 * ao alcance de qualquer script da pagina — inclusive de um script injetado.
 *
 * Com httpOnly, o navegador envia o token e o JavaScript nao consegue le-lo.
 * O `Authorization: Bearer` continua valendo para integracoes e para os testes;
 * o cookie existe para a interface.
 *
 * CSRF: `SameSite=Strict` mais a exigencia de um cabecalho proprio nas
 * operacoes de escrita (ver plugins/autenticacao.ts). Um formulario de outro
 * site nao consegue definir cabecalho.
 *
 * Sem dependencia nova: montar e ler um cookie sao dez linhas, e cada
 * dependencia a mais e superficie a mais.
 */
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';

export const NOME_COOKIE = 'patrono_sessao';
/** Cabecalho exigido nas escritas autenticadas por cookie. */
export const CABECALHO_APP = 'x-patrono-app';

export function montarCookie(token: string, expiraEm: Date): string {
  const partes = [
    `${NOME_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Expires=${expiraEm.toUTCString()}`,
  ];
  // Em desenvolvimento o acesso costuma ser por http://localhost; marcar Secure
  // ali faria o navegador descartar o cookie e o login parecer quebrado.
  if (config.ehProducao) partes.push('Secure');
  return partes.join('; ');
}

export function cookieDeRemocao(): string {
  const partes = [
    `${NOME_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (config.ehProducao) partes.push('Secure');
  return partes.join('; ');
}

export function lerCookie(req: FastifyRequest): string | null {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return null;

  for (const par of cabecalho.split(';')) {
    const igual = par.indexOf('=');
    if (igual < 0) continue;
    if (par.slice(0, igual).trim() !== NOME_COOKIE) continue;
    const valor = par.slice(igual + 1).trim();
    return valor || null;
  }
  return null;
}
