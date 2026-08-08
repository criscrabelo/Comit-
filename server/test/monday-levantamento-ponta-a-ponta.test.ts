/**
 * Levantamento de quadro pela rede, contra um dublê da API do Monday.
 *
 * Por que existe: os testes de `monday-descoberta` provam a apuração sobre
 * itens já lidos. Estes provam o caminho que passa pelo cliente — listagem
 * paginada, leitura de metadados e leitura de itens — que é onde uma consulta
 * GraphQL errada só apareceria na execução real. A homologação de processos
 * ficou bloqueada por credencial; sem este ensaio, um erro de consulta só
 * seria descoberto depois de o token voltar.
 *
 * Também prova a recusa de token malformado: o ambiente de uma sessão real
 * trouxe `MONDAY_TOKEN` envolto em `<`...`>` e o sintoma foi um 401 igual ao de
 * credencial revogada.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const BOARD = '5959705266';

const COLUNAS = [
  { id: 'name', title: 'Name', type: 'name' },
  { id: 'status5', title: "'MEU TRABALHO'", type: 'status' },
  { id: 'texto', title: 'NOME DA PARTE / REFERÊNCIA', type: 'text' },
  { id: 'status44', title: 'COMARCA', type: 'status' },
];

const ITENS = [
  {
    id: '1',
    name: 'processo 1',
    created_at: null,
    updated_at: null,
    group: { id: 'g1', title: 'SAN MARINO' },
    column_values: [
      { id: 'status5', text: 'ACOMPANHANDO', value: null, type: 'status' },
      { id: 'texto', text: 'PARTE COM CPF 123.456.789-00', value: null, type: 'text' },
      { id: 'status44', text: 'TAUBATÉ', value: null, type: 'status' },
    ],
  },
  {
    id: '2',
    name: 'processo 2',
    created_at: null,
    updated_at: null,
    group: { id: 'g1', title: 'SAN MARINO' },
    column_values: [
      { id: 'status5', text: 'ACORDO', value: null, type: 'status' },
      { id: 'texto', text: 'OUTRA PARTE', value: null, type: 'text' },
      { id: 'status44', text: 'JACAREÍ', value: null, type: 'status' },
    ],
  },
];

let servidor: Server;
let porta: number;
/** Toda consulta que chegou ao transporte, para conferir que nenhuma escreve. */
const consultasRecebidas: string[] = [];

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let corpo = '';
    req.on('data', (p) => (corpo += p));
    req.on('end', () => {
      const { query, variables } = JSON.parse(corpo || '{}') as {
        query?: string;
        variables?: Record<string, unknown>;
      };
      consultasRecebidas.push(query ?? '');
      res.setHeader('Content-Type', 'application/json');

      if (/\bmutation\b|\bsubscription\b/i.test(query ?? '')) {
        res.statusCode = 500;
        res.end(JSON.stringify({ errors: [{ message: 'ESCRITA CHEGOU AO TRANSPORTE' }] }));
        return;
      }

      // Listagem: pagina 1 devolve os quadros, pagina 2 devolve vazio (fim).
      if (/boards\(limit: \$limite, page: \$pagina\)/.test(query ?? '')) {
        const pagina = Number(variables?.pagina ?? 1);
        res.end(
          JSON.stringify({
            data: {
              boards:
                pagina === 1
                  ? [
                      {
                        id: BOARD,
                        name: '(JUR) PROCESSOS JUDICIAIS',
                        state: 'active',
                        items_count: 2,
                        workspace: { id: 'w1', name: 'Jurídico' },
                      },
                      {
                        id: '999',
                        name: 'QUADRO ARQUIVADO',
                        state: 'archived',
                        items_count: 0,
                        workspace: null,
                      },
                    ]
                  : [],
            },
          }),
        );
        return;
      }

      // O dublê só conhece o quadro autorizado — id errado erra de verdade.
      if (variables?.quadro !== undefined && String(variables.quadro) !== BOARD) {
        res.end(
          JSON.stringify({
            errors: [{ message: `Board ${String(variables.quadro)} nao encontrado.` }],
          }),
        );
        return;
      }

      if (/items_page/.test(query ?? '')) {
        res.end(
          JSON.stringify({
            data: { boards: [{ items_page: { cursor: null, items: ITENS } }] },
          }),
        );
      } else if (/groups/.test(query ?? '')) {
        res.end(
          JSON.stringify({
            data: {
              boards: [
                {
                  id: BOARD,
                  name: '(JUR) PROCESSOS JUDICIAIS',
                  items_count: 2,
                  groups: [{ id: 'g1', title: 'SAN MARINO' }],
                  columns: COLUNAS,
                },
              ],
            },
          }),
        );
      } else if (/columns/.test(query ?? '')) {
        res.end(JSON.stringify({ data: { boards: [{ columns: COLUNAS }] } }));
      } else {
        res.end(
          JSON.stringify({ data: { me: { name: 'Dublê (simulado)', email: 'duble@local' } } }),
        );
      }
    });
  });

  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  porta = (servidor.address() as { port: number }).port;
});

afterAll(() => servidor?.close());

/**
 * Importa cliente e descoberta com o ambiente apontado para o dublê.
 *
 * `config` lê o ambiente ao ser carregado, e o cliente guarda `config` no
 * módulo: por isso o ambiente é ajustado ANTES do import, e os módulos são
 * recarregados a cada caso.
 */
async function comAmbiente(token: string) {
  process.env.MONDAY_TOKEN = token;
  process.env.MONDAY_ENDPOINT = `http://127.0.0.1:${porta}/`;
  process.env.LOG_LEVEL = 'silent';

  vi.resetModules();
  return {
    cliente: await import('../src/integracoes/monday/cliente.js'),
    descoberta: await import('../src/integracoes/monday/descoberta.js'),
  };
}

describe('levantamento de quadro pela rede', () => {
  it('lista os quadros da conta, paginando até a página vazia', async () => {
    const { cliente } = await comAmbiente('token-de-ensaio');

    const quadros = await cliente.listarQuadros();

    expect(quadros.map((q: { name: string }) => q.name)).toEqual([
      '(JUR) PROCESSOS JUDICIAIS',
      'QUADRO ARQUIVADO',
    ]);
    expect(quadros[0]!.id).toBe(BOARD);
  });

  it('lê metadados e itens e apura a forma do quadro', async () => {
    const { cliente, descoberta } = await comAmbiente('token-de-ensaio');

    const meta = await cliente.lerQuadro(BOARD);
    const leitura = await cliente.lerTodosOsItens(BOARD);
    const forma = descoberta.apurarForma({
      quadroId: BOARD,
      nome: meta.name,
      colunas: meta.columns,
      itens: leitura.itens,
    });

    expect(forma.itens).toBe(2);
    expect(forma.grupos).toEqual([{ valor: 'SAN MARINO', ocorrencias: 2 }]);

    const situacao = forma.colunas.find((c: { chave: string }) => c.chave === 'MEU TRABALHO');
    expect(situacao?.valores).toEqual([
      { valor: 'ACOMPANHANDO', ocorrencias: 1 },
      { valor: 'ACORDO', ocorrencias: 1 },
    ]);

    // Texto livre não é listado, e o CPF do dublê não aparece em lugar nenhum.
    const livre = forma.colunas.find((c: { tipo: string }) => c.tipo === 'text');
    expect(livre?.valoresOmitidos).toBe(true);
    expect(JSON.stringify(forma)).not.toContain('123.456.789-00');
  });

  it('quadro inexistente falha em vez de devolver forma vazia', async () => {
    const { cliente } = await comAmbiente('token-de-ensaio');

    await expect(cliente.lerQuadro('1')).rejects.toThrow(/nao encontrado/i);
  });

  it('nenhuma consulta do levantamento contém escrita', () => {
    expect(consultasRecebidas.length).toBeGreaterThan(0);
    for (const consulta of consultasRecebidas) {
      expect(consulta).not.toMatch(/\bmutation\b|\bsubscription\b/i);
    }
  });

  it('token com delimitadores é recusado antes de qualquer requisição', async () => {
    const { cliente } = await comAmbiente('<eyJhbGciOiJIUzI1NiJ9.abc.def>');

    await expect(cliente.testarConexao()).resolves.toMatchObject({ ok: false });
    await expect(cliente.listarQuadros()).rejects.toThrow(/delimitadores/i);
  });

  it('token com espaço ou quebra de linha é recusado com outra mensagem', async () => {
    const { cliente } = await comAmbiente('eyJhbGciOiJIUzI1NiJ9 abc.def');

    await expect(cliente.listarQuadros()).rejects.toThrow(/caracteres que nao existem/i);
  });
});
