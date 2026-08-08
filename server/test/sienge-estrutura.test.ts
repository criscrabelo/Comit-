/**
 * Estrutura do conector Sienge.
 *
 * O que estes testes provam: a estrutura existe, está completa, e está
 * TRAVADA. Nenhum endpoint foi inventado; nenhuma chamada sai antes da
 * homologação; ausência de dado nunca vira zero.
 */
import { describe, expect, it, vi } from 'vitest';
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

  it('os cinco candidatos vem de references/sienge.md, sem invencao', () => {
    const caminhos = Object.values(ENDPOINTS_CANDIDATOS).map((e) => e.caminho);
    expect(caminhos).toEqual([
      '/receivable-bills',
      '/installments',
      '/current-debit-balance',
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
    expect(ENDPOINTS_CANDIDATOS.current_debit_balance!.natureza).toBe('posicao');
  });
});

/**
 * Recarrega o cliente com as variaveis do Sienge exatamente como descritas.
 *
 * O teste NAO pode depender do que a maquina tem no ambiente. Ele passou meses
 * verde porque o ambiente estava vazio, e quebrou no dia em que a sessao
 * ganhou `SIENGE_SUBDOMAIN`, `SIENGE_USER` e `SIENGE_PASSWORD` — sem que nada
 * no produto mudasse. Um teste que muda de resultado conforme a maquina nao
 * prova o que diz provar.
 */
async function comSienge(variaveis: Record<string, string | undefined>) {
  const anterior = { ...process.env };

  for (const nome of ['SIENGE_SUBDOMAIN', 'SIENGE_USER', 'SIENGE_PASSWORD', 'SIENGE_HABILITADO']) {
    delete process.env[nome];
  }
  for (const [nome, valor] of Object.entries(variaveis)) {
    if (valor !== undefined) process.env[nome] = valor;
  }

  vi.resetModules();
  const modulo = await import('../src/integracoes/sienge/cliente.js');
  return {
    modulo,
    restaurar: () => {
      process.env = anterior;
      vi.resetModules();
    },
  };
}

describe('verificacao de configuracao nao vaza credencial', () => {
  it('informa o que falta pelo NOME da variavel, nunca pelo valor', async () => {
    const { modulo, restaurar } = await comSienge({});
    const r = modulo.verificarConfiguracao();
    restaurar();

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

  it('com tudo configurado, o valor das credenciais nao aparece no resultado', async () => {
    // O caso que importa de verdade: com as variaveis VAZIAS nao ha o que
    // vazar. O vazamento so pode acontecer quando ha valor — e e justamente
    // esse caso que o teste antigo nunca exercitou.
    const { modulo, restaurar } = await comSienge({
      SIENGE_SUBDOMAIN: 'coevo-secreto',
      SIENGE_USER: 'usuario-secreto',
      SIENGE_PASSWORD: 'senha-secretissima',
    });
    const r = modulo.verificarConfiguracao();
    restaurar();

    expect(r.completa).toBe(true);
    expect(r.faltando).toEqual([]);
    expect(r.presentes).toEqual(['SIENGE_SUBDOMAIN', 'SIENGE_USER', 'SIENGE_PASSWORD']);

    const serializado = JSON.stringify(r);
    for (const valor of ['coevo-secreto', 'usuario-secreto', 'senha-secretissima']) {
      expect(serializado).not.toContain(valor);
    }
  });

  it('configuracao completa NAO liga o conector — quem liga e SIENGE_HABILITADO', async () => {
    // Credencial presente nao autoriza chamada. A trava e outra variavel, e
    // esta distincao e o que impede uma carga acidental contra o Sienge real.
    const { modulo, restaurar } = await comSienge({
      SIENGE_SUBDOMAIN: 'coevo',
      SIENGE_USER: 'u',
      SIENGE_PASSWORD: 's',
    });

    expect(modulo.verificarConfiguracao().completa).toBe(true);
    expect(() => modulo.exigirHabilitado()).toThrow(/desligado/i);
    restaurar();
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
