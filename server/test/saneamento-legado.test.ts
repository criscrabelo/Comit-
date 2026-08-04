/**
 * Testes de saneamento do fluxo legado do Monday.
 *
 * Estes testes existem para IMPEDIR A REINTRODUCAO do problema. Eles leem os
 * arquivos do frontend e falham se alguem voltar a guardar credencial no
 * navegador ou a chamar api.monday.com direto — inclusive por copiar e colar de
 * uma versao antiga.
 *
 * Nao testam comportamento em tempo de execucao; testam o codigo-fonte. E de
 * proposito: a regressao aqui e textual, e um teste de comportamento so a
 * pegaria se alguem lembrasse de exercitar o caminho.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = new URL('../../', import.meta.url).pathname;

/**
 * Arquivos efetivamente servidos ao NAVEGADOR.
 *
 * Escopo deliberadamente preciso: `index.html`, `js/` e `css/`. O `server.js` da
 * raiz e servidor, nao navegador — ele usa `Authorization` legitimamente para
 * falar com a API do GitHub, e incluí-lo aqui geraria falso positivo. O legado
 * dele e tratado em teste proprio, mais abaixo, para que a pendencia fique
 * visivel em vez de escondida por uma exclusao silenciosa.
 */
function arquivosDoFrontend(): string[] {
  const encontrados: string[] = [];

  const percorrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      if (['node_modules', '.git', 'dist'].includes(nome)) continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        percorrer(caminho);
        continue;
      }
      if (/\.(js|html|jsx|css)$/.test(nome)) encontrados.push(caminho);
    }
  };

  encontrados.push(join(RAIZ, 'index.html'));
  percorrer(join(RAIZ, 'js'));
  percorrer(join(RAIZ, 'css'));

  return encontrados;
}

const ARQUIVOS = arquivosDoFrontend();

/** Le o arquivo removendo comentarios de linha e de bloco. */
function codigoSemComentarios(caminho: string): string {
  return readFileSync(caminho, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

describe('o frontend nao guarda credencial do Monday', () => {
  it('encontrou arquivos para inspecionar', () => {
    // Guarda contra o teste passar por nao ter olhado nada.
    expect(ARQUIVOS.length).toBeGreaterThan(5);
    expect(ARQUIVOS.some((a) => a.endsWith('monday-sync.js'))).toBe(true);
  });

  it('nao ha leitura nem gravacao de token em localStorage ou sessionStorage', () => {
    const infratores: string[] = [];

    for (const arquivo of ARQUIVOS) {
      const codigo = codigoSemComentarios(arquivo);

      // Procura acesso a storage cuja chave mencione token/credencial/senha.
      // A remocao (removeItem) e permitida: e a limpeza do legado.
      const padrao =
        /(localStorage|sessionStorage)\s*\.\s*(getItem|setItem)\s*\(\s*[^)]*?(token|credencial|senha|password|apikey|api_key)/gi;

      for (const achado of codigo.matchAll(padrao)) {
        // `getItem` dentro da funcao de limpeza serve para detectar e remover.
        const contexto = codigo.slice(Math.max(0, achado.index - 400), achado.index + 200);
        if (/limparCredenciaisLegadas|CHAVES_LEGADAS/.test(contexto)) continue;
        infratores.push(`${relative(RAIZ, arquivo)}: ${achado[0]}`);
      }
    }

    expect(infratores, `Credencial em storage do navegador:\n${infratores.join('\n')}`).toEqual([]);
  });

  it('a chave legada jur_monday_token nao e usada para armazenar nada', () => {
    const infratores: string[] = [];

    for (const arquivo of ARQUIVOS) {
      const codigo = codigoSemComentarios(arquivo);
      if (!codigo.includes('jur_monday_token')) continue;

      // A unica mencao aceitavel e na lista de chaves a REMOVER.
      const linhas = codigo.split('\n');
      linhas.forEach((linha, i) => {
        if (!linha.includes('jur_monday_token')) return;
        if (/CHAVES_LEGADAS/.test(linha)) return;
        infratores.push(`${relative(RAIZ, arquivo)}:${i + 1}: ${linha.trim()}`);
      });
    }

    expect(infratores, `Uso da chave legada:\n${infratores.join('\n')}`).toEqual([]);
  });

  it('nao existe campo de formulario para digitar token', () => {
    const infratores: string[] = [];

    for (const arquivo of ARQUIVOS) {
      const codigo = codigoSemComentarios(arquivo);

      // Campo de senha ou texto cujo id/name mencione token.
      const padrao = /<input[^>]*(?:id|name)\s*=\s*["'][^"']*token[^"']*["'][^>]*>/gi;
      for (const achado of codigo.matchAll(padrao)) {
        infratores.push(`${relative(RAIZ, arquivo)}: ${achado[0].slice(0, 120)}`);
      }

      // Funcao que salva token.
      if (/function\s+saveToken|saveToken\s*\(\s*\)\s*\{/.test(codigo)) {
        infratores.push(`${relative(RAIZ, arquivo)}: funcao saveToken`);
      }
      if (/openTokenSettings/.test(codigo)) {
        infratores.push(`${relative(RAIZ, arquivo)}: openTokenSettings`);
      }
    }

    expect(infratores, `Interface de entrada de token:\n${infratores.join('\n')}`).toEqual([]);
  });
});

describe('o frontend nao fala direto com o Monday', () => {
  it('nao ha chamada para api.monday.com', () => {
    const infratores: string[] = [];

    for (const arquivo of ARQUIVOS) {
      const codigo = codigoSemComentarios(arquivo);
      const padrao = /['"`]https?:\/\/api\.monday\.com[^'"`]*['"`]/gi;
      for (const achado of codigo.matchAll(padrao)) {
        infratores.push(`${relative(RAIZ, arquivo)}: ${achado[0]}`);
      }
    }

    expect(infratores, `Chamada direta ao Monday:\n${infratores.join('\n')}`).toEqual([]);
  });

  it('nao ha cabecalho Authorization montado no navegador', () => {
    const infratores: string[] = [];

    for (const arquivo of ARQUIVOS) {
      const codigo = codigoSemComentarios(arquivo);
      // 'Authorization': algo — no frontend, so poderia ser credencial.
      const padrao = /['"]Authorization['"]\s*:/gi;
      for (const achado of codigo.matchAll(padrao)) {
        infratores.push(`${relative(RAIZ, arquivo)}: ${achado[0]}`);
      }
    }

    expect(infratores, `Cabecalho de autorizacao no navegador:\n${infratores.join('\n')}`).toEqual([]);
  });

  it('as consultas ao Monday passam pelo proxy do backend', () => {
    const sync = readFileSync(join(RAIZ, 'js/monday-sync.js'), 'utf8');

    // A constante de destino aponta para a nossa API, nao para o Monday.
    expect(sync).toMatch(/const API_URL\s*=\s*['"]\/api\/monday\//);
    // E existe a limpeza do token legado.
    expect(sync).toContain('limparCredenciaisLegadas');
  });
});

describe('o repositorio nao contem credencial', () => {
  it('nenhum padrao de segredo nos arquivos versionados', () => {
    const padroes: Array<[string, RegExp]> = [
      ['token do GitHub', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
      ['chave da OpenAI', /\bsk-[A-Za-z0-9]{20,}\b/],
      ['chave da AWS', /\bAKIA[0-9A-Z]{16}\b/],
      ['token do Monday (JWT)', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./],
    ];

    const infratores: string[] = [];

    for (const arquivo of ARQUIVOS) {
      const conteudo = readFileSync(arquivo, 'utf8');
      for (const [nome, padrao] of padroes) {
        const achado = conteudo.match(padrao);
        if (achado) {
          // Nao imprime o valor encontrado.
          infratores.push(`${relative(RAIZ, arquivo)}: possivel ${nome}`);
        }
      }
    }

    expect(infratores, `Segredo no repositorio:\n${infratores.join('\n')}`).toEqual([]);
  });

  it('o .env real nao esta versionado', () => {
    const gitignore = readFileSync(join(RAIZ, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.env$/m);
  });
});

describe('legado do servidor antigo — pendencia rastreada (B8)', () => {
  /**
   * O `server.js` da raiz e o servidor legado que usa um Gist do GitHub como
   * banco. Ele le a credencial de variavel de ambiente, o que e correto para
   * codigo de servidor, mas o arquivo inteiro sai com a migracao (item B8).
   *
   * Este teste NAO falha por ele existir — falha se ele piorar: se passar a ter
   * credencial embutida em vez de lida do ambiente.
   */
  it('o servidor legado le a credencial do ambiente, nunca embutida', () => {
    const legado = readFileSync(join(RAIZ, 'server.js'), 'utf8');

    // Usa Authorization? Sim — e legitimo em servidor.
    // Mas o valor tem de vir de process.env.
    const usaAutorizacao = /['"]Authorization['"]\s*:/.test(legado);
    if (usaAutorizacao) {
      expect(legado).toMatch(/process\.env\.GITHUB_TOKEN/);
      // Nenhum literal parecido com token no arquivo.
      expect(legado).not.toMatch(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/);
    }
  });

  it('o servidor legado nao serve credencial ao navegador', () => {
    const legado = readFileSync(join(RAIZ, 'server.js'), 'utf8');
    // Nenhuma rota devolve o token na resposta.
    expect(legado).not.toMatch(/res\.end\([^)]*GH_TOKEN/);
    expect(legado).not.toMatch(/res\.end\([^)]*GITHUB_TOKEN/);
  });
});

describe('o proxy do backend recusa operacao de escrita', () => {
  it('o codigo do proxy tem a trava de somente leitura', async () => {
    const rotas = readFileSync(join(RAIZ, 'server/src/integracoes/monday/rotas.ts'), 'utf8');
    // A trava existe e e chamada na rota de consulta.
    expect(rotas).toContain('function recusarEscrita');
    expect(rotas).toMatch(/recusarEscrita\(corpo\.data\.query\)/);
  });
});
