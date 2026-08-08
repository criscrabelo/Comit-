/**
 * Remocao e conferencia de dado pessoal no que sai do Monday para relatorio.
 *
 * Este modulo existe para haver UMA implementacao da regra. As funcoes nasceram
 * dentro de `scripts/homologar-monday.ts`; quando o levantamento de quadros
 * novos passou a precisar da mesma protecao, copiar seria criar uma segunda
 * regra que pode divergir da primeira — e a divergencia passaria despercebida
 * justamente onde importa, num relatorio versionado.
 *
 * A regra do projeto: relatorio de homologacao e evidencia versionada, e nao
 * carrega CPF, CNPJ nem nome completo. Vale para o relatorio inteiro, nao so
 * para a secao da amostra.
 */

/** CPF e CNPJ com ou sem pontuacao. Usados para remover e para conferir. */
const PADROES_DOCUMENTO = [
  ['CPF', /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g],
  ['CNPJ', /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g],
] as const;

/**
 * Remove documento de campo de texto livre.
 *
 * A varredura e sobre o VALOR, nao sobre o nome do campo: `MOTIVO` e digitado a
 * mao, e alguem pode ter escrito "cobranca do CPF 123.456.789-00" sem que
 * nenhum mapeamento previsse isso.
 */
export function varrerTextoLivre(texto: string | null): string | null {
  if (!texto) return texto;

  let saida = texto;
  for (const [, padrao] of PADROES_DOCUMENTO) {
    saida = saida.replace(padrao, '[documento removido]');
  }
  return saida;
}

/**
 * Procura sequencias com cara de CPF ou CNPJ num texto serializado.
 *
 * Devolve descricao do que achou — nunca o documento em si, que iria justamente
 * para o relatorio que se quer manter limpo.
 */
export function varrerDocumentos(texto: string): string[] {
  const achados: string[] = [];

  for (const [rotulo, padrao] of PADROES_DOCUMENTO) {
    const encontrados = texto.match(padrao);
    if (encontrados) achados.push(`${encontrados.length} ${rotulo}`);
  }
  return achados;
}

/** `monday:9356236533` → `***6533`. Localiza sem identificar. */
export function mascararId(id: string): string {
  const so = id.replace(/^monday:/, '');
  return so.length > 4 ? `***${so.slice(-4)}` : '***';
}

/**
 * "EXTERNO Dra. Fulana de Tal" → "EXTERNO Dra. F."
 *
 * A coluna LOCAL do quadro de processos traz o escritorio que atua, que e nome
 * de pessoa em quase todos os casos.
 */
export function mascararAtuacao(valor: string | null): string | null {
  if (!valor) return valor;
  const externo = /^(EXTERNO)\s+(.+)$/i.exec(valor.trim());
  if (!externo) return valor;

  const termos = externo[2]!.split(/\s+/);
  const tratamento = /^(dr|dra|sr|sra)\.?$/i.test(termos[0] ?? '') ? termos.shift() : null;
  const inicial = termos[0] ? `${termos[0][0]}.` : '';
  return [externo[1], tratamento, inicial].filter(Boolean).join(' ');
}

/**
 * Tipos de coluna cujo conteudo e digitado livremente.
 *
 * Valor de coluna assim NAO vai para relatorio, nem em lista de rotulos: a
 * coluna `NOME DA PARTE / REFERENCIA` do quadro de processos e exatamente isso,
 * e listar seus valores distintos publicaria a carteira de partes.
 */
const TIPOS_DE_TEXTO_LIVRE = new Set(['text', 'long-text', 'long_text', 'email', 'phone', 'link']);

/** true quando os valores da coluna nao podem ser listados em relatorio. */
export function ehTextoLivre(tipo: string | null | undefined): boolean {
  return TIPOS_DE_TEXTO_LIVRE.has((tipo ?? '').toLowerCase());
}
