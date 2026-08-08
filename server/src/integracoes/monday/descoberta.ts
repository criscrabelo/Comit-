/**
 * Levantamento da FORMA de um quadro do Monday, sem gravar nada.
 *
 * Homologar um quadro comeca por conhecer as colunas dele. O levantamento de
 * `rotulos.ts` sai de `registros_brutos`, ou seja, exige que a carga JA tenha
 * acontecido — e carga exige tabela de destino, mapa de colunas e decisao de
 * onde cada campo aterra. Para um quadro novo nada disso existe ainda.
 *
 * Este modulo quebra esse circulo: le o quadro, apura em memoria e devolve a
 * forma. Nenhuma escrita em banco, nenhum destino necessario. E o que permite
 * escrever a definicao do quadro a partir do que ele TEM, em vez de a partir do
 * que se imagina que ele tenha — que foi exatamente o erro que a homologacao de
 * processos encontrou em `'MEU TRABALHO'`.
 *
 * Valor de coluna de texto livre nao e listado: ver `sigilo.ts`.
 */
import type { ColunaMonday, ItemMonday } from './cliente.js';
import { chaveDeColuna } from './quadros.js';
import { ehTextoLivre, varrerTextoLivre } from './sigilo.js';

export interface ValorApurado {
  valor: string;
  ocorrencias: number;
}

export interface ColunaApurada {
  id: string;
  titulo: string;
  tipo: string;
  /** Titulo em forma canonica — e por ele que a definicao vai casar. */
  chave: string;
  preenchidos: number;
  vazios: number;
  distintos: number;
  /** Vazio quando `valoresOmitidos`. Ordenado por ocorrencias. */
  valores: ValorApurado[];
  /** true quando os valores nao podem ir para relatorio (texto livre). */
  valoresOmitidos: boolean;
  /**
   * true quando a coluna tem quase um valor por item.
   *
   * Coluna assim identifica o item, e nao classifica nada: nao serve de rotulo,
   * e listar seus valores e despejar a base. Numero de processo, valor e data
   * caem aqui.
   */
  pareceIdentificadora: boolean;
}

export interface FormaDoQuadro {
  quadroId: string;
  nome: string;
  itens: number;
  /** true quando a leitura parou pelo teto de paginas: a forma esta parcial. */
  truncado: boolean;
  grupos: ValorApurado[];
  colunas: ColunaApurada[];
}

/** Acima disso a coluna e tratada como identificadora, nao como rotulo. */
const PROPORCAO_IDENTIFICADORA = 0.5;

function acumular(mapa: Map<string, number>, valor: string): void {
  mapa.set(valor, (mapa.get(valor) ?? 0) + 1);
}

function ordenar(mapa: Map<string, number>): ValorApurado[] {
  return [...mapa.entries()]
    .map(([valor, ocorrencias]) => ({ valor, ocorrencias }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias || a.valor.localeCompare(b.valor));
}

/**
 * Le o valor visivel de uma coluna do item.
 *
 * Espelho e formula vem com `text` vazio; o valor visivel esta em
 * `display_value`. Sem isso a conclusao seria "a equipe nao preenche essa
 * coluna" — regra ja aprendida em `transformacao.lerColuna`, repetida aqui
 * porque a descoberta trabalha sobre o item bruto, sem mapa resolvido.
 */
function valorVisivel(item: ItemMonday, idColuna: string): string {
  const coluna = item.column_values?.find((c) => c.id === idColuna);
  if (!coluna) return '';
  return (coluna.text || coluna.display_value || '').trim();
}

/**
 * Apura a forma do quadro a partir dos itens lidos.
 *
 * Funcao pura: recebe o que foi lido e devolve o levantamento. Nao consulta a
 * API e nao toca o banco — e por isso pode ser testada sem nenhum dos dois.
 */
export function apurarForma(entrada: {
  quadroId: string;
  nome: string;
  colunas: ColunaMonday[];
  itens: ItemMonday[];
  truncado?: boolean;
}): FormaDoQuadro {
  const { quadroId, nome, colunas, itens } = entrada;

  const grupos = new Map<string, number>();
  for (const item of itens) {
    const titulo = item.group?.title?.trim();
    if (titulo) acumular(grupos, titulo);
  }

  const apuradas: ColunaApurada[] = colunas
    .filter((c) => c.id !== 'name')
    .map((coluna) => {
      const contagem = new Map<string, number>();
      let preenchidos = 0;

      for (const item of itens) {
        const valor = valorVisivel(item, coluna.id);
        if (!valor) continue;
        preenchidos++;
        // O documento sai antes de qualquer contagem: assim ele nao existe nem
        // na estrutura em memoria que o relatorio serializa.
        acumular(contagem, varrerTextoLivre(valor) ?? valor);
      }

      const distintos = contagem.size;
      const omitidos = ehTextoLivre(coluna.type);
      const identificadora =
        preenchidos > 0 && distintos / preenchidos > PROPORCAO_IDENTIFICADORA && distintos > 20;

      return {
        id: coluna.id,
        titulo: coluna.title,
        tipo: coluna.type,
        chave: chaveDeColuna(coluna.title),
        preenchidos,
        vazios: itens.length - preenchidos,
        distintos,
        valores: omitidos ? [] : ordenar(contagem),
        valoresOmitidos: omitidos,
        pareceIdentificadora: identificadora,
      };
    })
    .sort((a, b) => a.titulo.localeCompare(b.titulo));

  return {
    quadroId,
    nome,
    itens: itens.length,
    truncado: entrada.truncado ?? false,
    grupos: ordenar(grupos),
    colunas: apuradas,
  };
}

export interface CampoSugerido {
  campo: string;
  tituloEncontrado: string | null;
  idColuna: string | null;
}

/**
 * Confere uma definicao de quadro contra a forma real, sem alterar nada.
 *
 * Devolve o que casou e o que nao existe no quadro. Serve para o que a
 * homologacao de processos provou ser necessario: a definicao herdada do codigo
 * legado pode citar coluna que o quadro nao tem — e o sintoma e campo nulo em
 * silencio, nao erro.
 *
 * Nao propoe titulo novo. Sugerir de onde um campo "deveria" vir seria inferir
 * mapeamento a partir de semelhanca de nome, que e o tipo de palpite que muda
 * indicador sem ninguem perceber.
 */
export function conferirDefinicao(
  colunasDaDefinicao: Record<string, string[]>,
  forma: FormaDoQuadro,
): { encontrados: CampoSugerido[]; ausentes: string[] } {
  const porChave = new Map(forma.colunas.map((c) => [c.chave, c]));

  const encontrados: CampoSugerido[] = [];
  const ausentes: string[] = [];

  for (const [campo, titulos] of Object.entries(colunasDaDefinicao)) {
    const achado = titulos.map((t) => porChave.get(chaveDeColuna(t))).find(Boolean);

    if (achado) {
      encontrados.push({ campo, tituloEncontrado: achado.titulo, idColuna: achado.id });
    } else {
      ausentes.push(campo);
    }
  }

  return { encontrados, ausentes };
}
