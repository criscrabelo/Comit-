/**
 * Levantamento de quadro do Monday — passo zero de qualquer homologacao nova.
 *
 * Responde duas perguntas que nao se responde por suposicao:
 *   1. qual e o ID do quadro que tem tal nome;
 *   2. quais colunas ele tem, de que tipo, e quais valores a equipe usa.
 *
 * NAO grava nada. Nem no Monday — a trava de escrita continua valendo — nem no
 * banco: nao ha tabela de destino nem migracao envolvida. Isso e deliberado. Um
 * quadro ainda nao homologado nao tem destino definido, e exigir destino para
 * poder OLHAR o quadro inverte a ordem: seria preciso decidir onde os dados
 * aterram antes de saber quais dados existem.
 *
 * Uso:
 *   MONDAY_TOKEN=... npx tsx scripts/descobrir-quadro.ts --listar
 *   MONDAY_TOKEN=... npx tsx scripts/descobrir-quadro.ts --nome 'PROJETOS DE TI'
 *   MONDAY_TOKEN=... npx tsx scripts/descobrir-quadro.ts --quadro 123456 --saida forma.md
 *   ... --conferir honorarios   confere a definicao existente contra o quadro
 *
 * O token vem SO de variavel de ambiente, e nunca e exibido.
 */
import { promises as fs } from 'node:fs';
import { config } from '../src/config.js';
import {
  ErroMonday,
  lerQuadro,
  lerTodosOsItens,
  listarQuadros,
  recusarEscrita,
  testarConexao,
} from '../src/integracoes/monday/cliente.js';
import { apurarForma, conferirDefinicao } from '../src/integracoes/monday/descoberta.js';
import { QUADROS, type ChaveQuadro } from '../src/integracoes/monday/quadros.js';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

const linhas: string[] = [];
const escrever = (texto = '') => {
  linhas.push(texto);
  console.log(texto);
};

/** Quantos valores distintos listar por coluna. Acima disso, so a contagem. */
const VALORES_LISTADOS = 40;

/**
 * As mesmas quatro consultas do levantamento, submetidas a propria trava.
 *
 * Nao e a pre-confirmacao da homologacao — este script nao grava e nao emite
 * prova. E a garantia de que o passo de OLHAR o quadro tambem e somente
 * leitura: um levantamento que pudesse escrever seria pior que nao existir,
 * porque roda em quadro que ninguem homologou ainda.
 */
function confirmarSomenteLeitura(): void {
  const consultas = [
    'query { boards(limit: 100, page: 1) { id name } }',
    'query { boards(ids: [1]) { columns { id title type } } }',
    'query { boards(ids: [1]) { items_page(limit: 200) { items { id } } } }',
    'query { me { name email } }',
  ];

  for (const consulta of consultas) {
    recusarEscrita(consulta);
  }
}

function tabela(cabecalho: string[], corpo: string[][]): void {
  escrever(`| ${cabecalho.join(' | ')} |`);
  escrever(`| ${cabecalho.map(() => '---').join(' | ')} |`);
  for (const linha of corpo) escrever(`| ${linha.join(' | ')} |`);
  escrever();
}

async function listar(filtroNome?: string): Promise<void> {
  const quadros = await listarQuadros();
  const ativos = quadros.filter((q) => q.state === 'active');

  const alvo = filtroNome
    ? ativos.filter((q) => q.name.toUpperCase().includes(filtroNome.toUpperCase()))
    : ativos;

  escrever(`## Quadros alcancados pela credencial`);
  escrever();
  escrever(
    `${quadros.length} quadro(s) no total, ${ativos.length} ativo(s)` +
      (filtroNome ? `; ${alvo.length} casando com "${filtroNome}"` : '') +
      '.',
  );
  escrever();

  if (!alvo.length) {
    escrever(
      filtroNome
        ? `> Nenhum quadro ativo com "${filtroNome}" no nome. Confira a grafia: o nome ` +
            'e o que a equipe ve no Monday, e pode ter prefixo como `(JUR)`.'
        : '> A credencial nao alcanca nenhum quadro ativo.',
    );
    escrever();
    return;
  }

  tabela(
    ['Nome', 'ID', 'Itens', 'Workspace', 'Já no mapa?'],
    alvo
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((q) => {
        const definido = Object.values(QUADROS).find((d) => String(d.idPadrao) === String(q.id));
        return [
          q.name,
          `\`${q.id}\``,
          String(q.items_count ?? '?'),
          q.workspace?.name ?? '—',
          definido ? `sim — \`${definido.chave}\`` : '**não**',
        ];
      }),
  );
}

async function descrever(quadroId: string, chaveConferir?: string): Promise<void> {
  const meta = await lerQuadro(quadroId);
  const leitura = await lerTodosOsItens(quadroId);

  const forma = apurarForma({
    quadroId,
    nome: meta.name,
    colunas: meta.columns,
    itens: leitura.itens,
    truncado: leitura.truncado,
  });

  escrever(`## ${forma.nome}`);
  escrever();
  escrever(`**ID:** \`${forma.quadroId}\` · **itens lidos:** ${forma.itens} · `);
  escrever(`**páginas:** ${leitura.paginas} · **colunas:** ${forma.colunas.length}`);
  escrever();

  if (forma.truncado) {
    escrever(
      '> ⚠️ **Leitura truncada pelo teto de páginas.** A forma abaixo descreve ' +
        'apenas o que foi lido, e pode não conter todos os valores usados.',
    );
    escrever();
  }

  escrever('### Grupos');
  escrever();
  tabela(
    ['Grupo', 'Itens'],
    forma.grupos.map((g) => [g.valor, String(g.ocorrencias)]),
  );

  escrever('### Colunas');
  escrever();
  tabela(
    ['Título', 'ID', 'Tipo', 'Preenchidos', 'Distintos'],
    forma.colunas.map((c) => [
      c.titulo,
      `\`${c.id}\``,
      c.tipo,
      `${c.preenchidos}/${forma.itens}`,
      String(c.distintos),
    ]),
  );

  escrever('### Valores por coluna');
  escrever();
  for (const c of forma.colunas) {
    escrever(`#### ${c.titulo}`);
    escrever();
    escrever(`\`${c.id}\` · tipo \`${c.tipo}\` · ${c.preenchidos} preenchido(s), ${c.vazios} vazio(s)`);
    escrever();

    if (c.valoresOmitidos) {
      escrever(
        '_Texto livre: valores não listados. Pode conter nome ou documento ' +
          'digitado à mão, e este relatório é evidência versionada._',
      );
      escrever();
      continue;
    }
    if (!c.preenchidos) {
      escrever('_Coluna vazia em todos os itens lidos._');
      escrever();
      continue;
    }
    if (c.pareceIdentificadora) {
      escrever(
        `_${c.distintos} valores distintos em ${c.preenchidos} itens: a coluna ` +
          'identifica o item em vez de classificá-lo. Valores não listados._',
      );
      escrever();
      continue;
    }

    tabela(
      ['Valor', 'Ocorrências'],
      c.valores.slice(0, VALORES_LISTADOS).map((v) => [v.valor, String(v.ocorrencias)]),
    );
    if (c.valores.length > VALORES_LISTADOS) {
      escrever(`_… mais ${c.valores.length - VALORES_LISTADOS} valor(es)._`);
      escrever();
    }
  }

  if (!chaveConferir) return;

  const definicao = QUADROS[chaveConferir as ChaveQuadro];
  if (!definicao) {
    escrever(
      `> Não existe definição com a chave \`${chaveConferir}\`. ` +
        `Chaves conhecidas: ${Object.keys(QUADROS).join(', ')}.`,
    );
    escrever();
    return;
  }

  const { encontrados, ausentes } = conferirDefinicao(definicao.colunas, forma);

  escrever(`### Conferência da definição \`${definicao.chave}\``);
  escrever();
  escrever(
    `Definição aponta para o board \`${definicao.idPadrao}\`; esta leitura é do ` +
      `\`${forma.quadroId}\`.` +
      (String(definicao.idPadrao) === String(forma.quadroId) ? ' Coincidem.' : ' **DIVERGEM.**'),
  );
  escrever();

  tabela(
    ['Campo', 'Coluna encontrada', 'ID'],
    encontrados.map((e) => [`\`${e.campo}\``, e.tituloEncontrado ?? '—', `\`${e.idColuna}\``]),
  );

  if (ausentes.length) {
    escrever(
      `> **Campos sem coluna no quadro:** ${ausentes.map((a) => `\`${a}\``).join(', ')}. ` +
        'Seriam gravados como nulos. Nenhum título novo é sugerido aqui: ' +
        'inferir de onde um campo "deveria" vir é palpite que muda indicador ' +
        'sem ninguém perceber.',
    );
  } else {
    escrever('_Todos os campos da definição têm coluna correspondente no quadro._');
  }
  escrever();
}

async function principal(): Promise<void> {
  if (!config.monday.habilitado) {
    throw new Error(
      'MONDAY_TOKEN ausente do ambiente. O levantamento le o Monday e nao tem ' +
        'como funcionar sem credencial. O token vem SO de variavel de ambiente.',
    );
  }

  confirmarSomenteLeitura();

  const conexao = await testarConexao();
  if (!conexao.ok) {
    throw new Error(
      `O token nao autenticou no Monday: ${conexao.erro}. ` +
        'A rede pode estar liberada e a credencial, ainda assim, invalida — ' +
        'sao dois diagnosticos diferentes.',
    );
  }

  escrever('# Levantamento de quadro do Monday');
  escrever();
  escrever(`**Conta:** ${conexao.conta}  `);
  escrever(`**Versão da API:** ${config.monday.versaoApi}`);
  escrever();
  escrever(
    '> Levantamento somente leitura. Nada foi alterado no Monday e **nada foi ' +
      'gravado no banco** — nenhuma tabela de destino é necessária para olhar ' +
      'um quadro.',
  );
  escrever();

  const nome = argumento('nome');
  const quadro = argumento('quadro');

  if (quadro) {
    await descrever(quadro, argumento('conferir'));
  } else if (nome) {
    // Com nome, lista o que casa. Descrever direto exigiria escolher um quadro
    // por semelhanca de nome, e quadro errado produz levantamento plausivel.
    await listar(nome);
  } else if (temFlag('listar')) {
    await listar();
  } else {
    throw new Error(
      'Informe --listar, --nome <texto> ou --quadro <id>. ' +
        'Sem isso nao ha o que levantar.',
    );
  }

  const saida = argumento('saida');
  if (saida) {
    await fs.writeFile(saida, `${linhas.join('\n')}\n`, 'utf8');
    console.log(`\n→ levantamento gravado em ${saida}`);
  }
}

principal().catch((erro) => {
  const detalhe = erro instanceof ErroMonday ? JSON.stringify(erro.detalhe) : '';
  console.error(`\n✗ ${erro instanceof Error ? erro.message : String(erro)} ${detalhe}`);
  process.exitCode = 1;
});
