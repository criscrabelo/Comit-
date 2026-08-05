/**
 * Ensaio do runner de homologacao, com transporte simulado.
 *
 * NAO e a homologacao. E a prova de que o runner produz o relatorio inteiro —
 * pre-confirmacao, metricas, rotulos, propostas, provas e amostra — sem quebrar
 * no meio. Quando o MONDAY_TOKEN existir, o mesmo caminho roda contra o board
 * real e os numeros passam a ser reais.
 *
 * O relatorio gerado aqui traz um aviso em toda pagina dizendo que os dados sao
 * simulados. Um relatorio de ensaio sem esse aviso viraria, em duas semanas,
 * "o relatorio da homologacao".
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/ensaiar-homologacao.ts
 */
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';

/** Quadro simulado: rotulos escolhidos para exercitar os tres casos de cobertura. */
const BOARD = '5959705266';

const COLUNAS = [
  { id: 'status5', title: 'MEU TRABALHO', type: 'status' },
  { id: 'status84__1', title: 'STATUS (PARA COMITÊ)', type: 'status' },
  { id: 'status8', title: 'TIPO DE AÇÃO', type: 'status' },
  { id: 'status3', title: 'ATUAÇÃO', type: 'status' },
  { id: 'pessoa1', title: 'RESPONSÁVEL', type: 'people' },
  { id: 'texto_motivo', title: 'MOTIVO', type: 'text' },
  { id: 'status_pos', title: 'POSIÇÃO', type: 'status' },
  { id: 'data_cit', title: 'CITAÇÃO/PROTOCOLO', type: 'date' },
  { id: 'num_valor', title: 'VALOR DA CAUSA', type: 'numbers' },
  { id: 'empr', title: 'EMPREENDIMENTO', type: 'mirror' },
];

const ITENS = [
  {
    id: '8001', grupo: 'PROCESSOS ATIVOS', nome: '1234567-89.2024.8.26.0100',
    v: {
      status5: 'ACAO AJUIZADA', status84__1: 'ACOMPANHANDO', status8: 'Cível',
      status3: 'EXTERNO Dra. Ana Beatriz Moreira', pessoa1: 'Ana Souza',
      texto_motivo: 'Rescisão contratual', status_pos: 'Réu',
      data_cit: '2024-03-10', num_valor: '45000', empr: 'ALENCAR MAZZEO',
    },
  },
  {
    id: '8002', grupo: 'PROCESSOS ATIVOS', nome: '7654321-98.2025.8.26.0100',
    v: {
      status5: 'COBRANCA EXTRAJUDICIAL', status84__1: 'EM ACORDO', status8: 'Consumidor',
      status3: 'INTERNO', pessoa1: 'Carlos Lima',
      // Documento em campo livre: a varredura da amostra tem de pegar.
      texto_motivo: 'Cobrança referente ao CPF 123.456.789-00',
      status_pos: 'Réu', data_cit: '2025-06-20', num_valor: '18000', empr: 'JARDIM PAULISTA',
    },
  },
  {
    id: '8003', grupo: 'PROCESSOS ATIVOS', nome: '5555555-55.2025.8.26.0100',
    v: {
      status5: 'AUDIENCIA MARCADA', status84__1: 'ACOMPANHANDO', status8: 'Trabalhista',
      status3: 'EXTERNO Dr. João', pessoa1: 'Ana Souza',
      texto_motivo: 'Reclamatória', status_pos: 'Réu',
      data_cit: '2025-09-01', num_valor: '30000', empr: 'ALENCAR MAZZEO',
    },
  },
  {
    id: '8004', grupo: 'PROCESSOS ATIVOS', nome: '6666666-66.2025.8.26.0100',
    v: {
      status5: 'XPTO-42', status84__1: 'ACOMPANHANDO', status8: 'Cível',
      status3: 'INTERNO', pessoa1: 'Carlos Lima', texto_motivo: '',
      status_pos: 'Autor', data_cit: '', num_valor: '', empr: 'JS',
    },
  },
  {
    id: '8005', grupo: 'CREDENTE', nome: '7777777-77.2023.8.26.0100',
    v: { status5: 'ACAO AJUIZADA', status3: 'INTERNO', empr: 'ALENCAR MAZZEO' },
  },
];

function montarItem(i: (typeof ITENS)[number]) {
  return {
    id: i.id,
    name: i.nome,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-15T10:00:00Z',
    group: { id: 'g1', title: i.grupo },
    column_values: COLUNAS.map((c) => ({
      id: c.id,
      text: c.type === 'mirror' ? '' : ((i.v as Record<string, string>)[c.id] ?? ''),
      display_value: c.type === 'mirror' ? ((i.v as Record<string, string>)[c.id] ?? '') : undefined,
      value: null,
      type: c.type,
    })),
  };
}

/**
 * Servidor local que responde como a API do Monday.
 *
 * O runner nao sabe que e ensaio: aponta para este endereco por variavel de
 * ambiente, e o codigo exercitado e exatamente o mesmo.
 */
async function subirDuble(porta: number): Promise<() => void> {
  const { createServer } = await import('node:http');

  const servidor = createServer((req, res) => {
    let corpo = '';
    req.on('data', (p) => (corpo += p));
    req.on('end', () => {
      const { query, variables } = JSON.parse(corpo || '{}') as {
        query?: string;
        variables?: Record<string, unknown>;
      };
      res.setHeader('Content-Type', 'application/json');

      // O duble so conhece o quadro autorizado. Isso torna o ensaio fiel em
      // dois pontos: prova que a sincronizacao aponta para o board certo, e
      // permite exercitar de verdade a prova 6, que simula falha da origem
      // apontando para um quadro inexistente.
      const quadro = variables?.quadro;
      if (quadro !== undefined && String(quadro) !== BOARD) {
        res.end(
          JSON.stringify({
            errors: [{ message: `Board ${String(quadro)} nao encontrado ou sem acesso.` }],
          }),
        );
        return;
      }

      if (/\bmutation\b|\bsubscription\b/i.test(query ?? '')) {
        // Nunca deveria chegar aqui: a trava e anterior a rede. Se chegar, o
        // ensaio precisa gritar.
        res.statusCode = 500;
        res.end(JSON.stringify({ errors: [{ message: 'ESCRITA CHEGOU AO TRANSPORTE' }] }));
        return;
      }

      if (/columns/.test(query ?? '')) {
        res.end(JSON.stringify({ data: { boards: [{ columns: COLUNAS }] } }));
      } else if (/items_page/.test(query ?? '')) {
        res.end(
          JSON.stringify({
            data: { boards: [{ items_page: { cursor: null, items: ITENS.map(montarItem) } }] },
          }),
        );
      } else {
        res.end(JSON.stringify({ data: { me: { name: 'Ensaio (simulado)', email: 'ensaio@local' } } }));
      }
    });
  });

  await new Promise<void>((r) => servidor.listen(porta, '127.0.0.1', r));
  return () => servidor.close();
}

async function principal(): Promise<void> {
  const porta = 3399;
  const parar = await subirDuble(porta);
  const saida = '/tmp/ensaio-homologacao.md';

  try {
    const processo = spawn(
      'npx',
      ['tsx', 'scripts/homologar-monday.ts', '--saida', saida],
      {
        env: {
          ...process.env,
          MONDAY_TOKEN: 'token-de-ensaio-nao-e-real',
          MONDAY_ENDPOINT: `http://127.0.0.1:${porta}/`,
          LOG_LEVEL: 'silent',
        },
        stdio: 'inherit',
      },
    );

    const codigo = await new Promise<number>((r) => processo.on('close', (c) => r(c ?? 1)));

    const relatorio = await fs.readFile(saida, 'utf8');
    const aviso =
      '> ⚠️ **ENSAIO COM DADOS SIMULADOS.** Este relatório NÃO é a homologação.\n' +
      '> Os números vieram de um quadro falso, servido localmente. A homologação\n' +
      '> real exige `MONDAY_TOKEN` e o board 5959705266.\n\n';

    await fs.writeFile(saida, aviso + relatorio.replace(/^# /m, '# [ENSAIO] '));

    console.log(`\n→ ensaio gravado em ${saida} (código ${codigo})`);
    process.exit(codigo);
  } finally {
    parar();
  }
}

void principal();
