import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes de banco compartilham um PostgreSQL real e limpam as tabelas
    // entre casos. Rodar arquivos em paralelo faria um teste apagar os dados do
    // outro — por isso a execucao e sequencial.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // DATABASE_URL vem do ambiente. Sem ela os testes de banco falham com
      // mensagem clara, em vez de silenciosamente nao verificar nada.
    },
  },
});
