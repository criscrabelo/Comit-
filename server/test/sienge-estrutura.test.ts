/**
 * Estrutura do conector Sienge.
 *
 * O que estes testes provam: a estrutura existe, está completa, e está
 * TRAVADA. Nenhum endpoint foi inventado; nenhuma chamada sai antes da
 * homologação; ausência de dado nunca vira zero.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENDPOINTS_CANDIDATOS,
  exigirHabilitado,
  ler,
  verificarConfiguracao,
} from '../src/integracoes/sienge/cliente.js';

const RAIZ = new URL('../../', import.meta.url).pathname;

describe('o conector nasce desligado', () => {
  it('SIENGE_HABILITADO ausente mantem a trava', () => {
    // O ambiente de teste nao define a variavel.
    expect(() => exigirHabilitado()).toThrow(/desligado/i);
  });

  it('a mensagem explica o motivo e o que fazer', () => {
    try {
      exigirHabilitado();
      expect.unreachable('deveria ter lancado');
    } catch (erro) {
      const mensagem = (erro as Error).message;
      expect(mensagem).toMatch(/nao foram confirmados no ambiente da Coevo/i);
      expect(mensagem).toMatch(/SIENGE_HABILITADO=true/);
    }
  });

  it('ler() recusa antes de qualquer chamada de rede', async () => {
    // Se a trava falhasse, a chamada sairia e o teste quebraria por rede.
    await expect(ler({ endpoint: 'receivable_bills' })).rejects.toThrow(/desligado/i);
  });
});

describe('nenhum endpoint foi confirmado', () => {
  it('todos os candidatos estao marcados como NAO confirmados', () => {
    const confirmados = Object.values(ENDPOINTS_CANDIDATOS).filter((e) => e.confirmado);
    expect(confirmados).toEqual([]);
  });

  it('os sete candidatos vem do levantamento REAL da Coevo, sem invencao', () => {
    // docs/SIENGE-INFORMACOES-PREENCHIDAS.md §3 — confirmados por consulta
    // executada na API. Os caminhos hipoteticos anteriores (/receivable-bills,
    // /current-debit-balance) NAO existem e sairam do catalogo.
    const caminhos = Object.values(ENDPOINTS_CANDIDATOS).map((e) => e.caminho);
    expect(caminhos).toEqual([
      '/companies',
      '/enterprises',
      '/customers',
      '/accounts-receivable/receivable-bills',
      '/accounts-receivable/receivable-bills/{receivableBillId}/installments',
      '/total-current-debit-balance',
      '/commissions',
    ]);
  });

  it('cada candidato declara se e posicao ou movimentacao', () => {
    for (const e of Object.values(ENDPOINTS_CANDIDATOS)) {
      expect(['posicao', 'movimentacao']).toContain(e.natureza);
    }
    // Comissao e evento, nao posicao: somar posicao entre datas seria erro.
    expect(ENDPOINTS_CANDIDATOS.commissions!.natureza).toBe('movimentacao');
    expect(ENDPOINTS_CANDIDATOS.total_current_debit_balance!.natureza).toBe('posicao');
  });
});

describe('verificacao de configuracao nao vaza credencial', () => {
  it('informa o que falta pelo NOME da variavel, nunca pelo valor', () => {
    const r = verificarConfiguracao();
    expect(r.completa).toBe(false);
    expect(r.faltando).toEqual(['SIENGE_SUBDOMAIN', 'SIENGE_USER', 'SIENGE_PASSWORD']);

    // O resultado contem SOMENTE nomes de variavel conhecidos — nada mais.
    // Verificar ausencia de /password/i seria errado: SIENGE_PASSWORD e o nome
    // da variavel, e informa-lo e justamente o comportamento correto.
    const NOMES_PERMITIDOS = ['SIENGE_SUBDOMAIN', 'SIENGE_USER', 'SIENGE_PASSWORD'];
    for (const texto of [...r.faltando, ...r.presentes]) {
      expect(NOMES_PERMITIDOS).toContain(texto);
    }

    // Nenhuma URL, host ou credencial embutida.
    const serializado = JSON.stringify(r);
    expect(serializado).not.toMatch(/:\/\//);
    expect(serializado).not.toMatch(/sienge\.com\.br/i);
  });
});

describe('somente leitura por construcao', () => {
  it('o cliente nao possui nenhum caminho que envie escrita ao Sienge', () => {
    const codigo = readFileSync(
      join(RAIZ, 'server/src/integracoes/sienge/cliente.ts'),
      'utf8',
    );

    // O unico metodo HTTP no arquivo e GET, e ele e fixo, nao parametro.
    expect(codigo).toContain("method: 'GET'");
    for (const verbo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(codigo, `metodo ${verbo} nao pode existir no cliente`).not.toMatch(
        new RegExp(`method:\\s*['"]${verbo}['"]`),
      );
    }
  });

  it('nenhuma URL do Sienge esta no frontend', () => {
    for (const arquivo of ['js/monday-sync.js', 'index.html']) {
      const conteudo = readFileSync(join(RAIZ, arquivo), 'utf8');
      expect(conteudo).not.toMatch(/api\.sienge\.com\.br/i);
      expect(conteudo).not.toMatch(/SIENGE_(USER|PASSWORD|SUBDOMAIN)/);
    }
  });
});

describe('a lista de perguntas para a Coevo existe e e acionavel', () => {
  const documento = readFileSync(
    join(RAIZ, 'docs/SIENGE-INFORMACOES-NECESSARIAS.md'),
    'utf8',
  );

  it('cobre os treze blocos exigidos', () => {
    const exigidos = [
      /URL.*subdom[íi]nio/i,
      /Vers[ãa]o da API/i,
      /Autentica[çc][ãa]o/i,
      /Endpoints/i,
      /Par[âa]metros/i,
      /Pagina[çc][ãa]o/i,
      /Limites de requisi[çc][ãa]o/i,
      /Empresas/i,
      /empreendimentos/i,
      /ambiente de homologa[çc][ãa]o/i,
      /Exemplos de resposta/i,
      /Dados dispon[íi]veis/i,
      /Datas e regras de atualiza[çc][ãa]o/i,
    ];
    for (const padrao of exigidos) {
      expect(documento, `faltou o bloco ${padrao}`).toMatch(padrao);
    }
  });

  it('orienta a NAO enviar a senha por escrito', () => {
    expect(documento).toMatch(/N[ãa]o envie a senha por e-mail/i);
    expect(documento).toMatch(/vari[áa]vel de ambiente/i);
  });

  it('declara que ausencia de dado nao vira zero', () => {
    expect(documento).toMatch(/sem dado/i);
    expect(documento).toMatch(/Nunca como zero|nunca como zero/);
  });
});
