/**
 * Concede a um usuario as acoes de operacao do mes, alem do que o perfil dele
 * ja da — e o escopo completo de empreendimentos e tipos de informacao.
 *
 * Existe para a instalacao em maquina propria, onde uma unica pessoa e ao
 * mesmo tempo quem administra a base (perfil administrador) e quem opera o
 * comite (perfil gestora). O modelo de permissoes separa os dois papeis de
 * proposito; esta concessao e a excecao POR USUARIO prevista no proprio
 * modelo (permissoes_usuario), com motivo gravado — nao um enfraquecimento
 * do padrao dos perfis.
 *
 * Uso:
 *   npx tsx scripts/conceder-operacao.ts --usuario cris
 *
 * Rodar de novo e seguro: as concessoes ja existentes sao preservadas.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carrega o server/.env quando DATABASE_URL nao veio do ambiente. Numa maquina
// Windows nao ha plataforma de hospedagem nem linha de comando exportando
// variaveis; o .env criado pelo instalador e a unica fonte.
if (!process.env.DATABASE_URL) {
  const caminhoEnv = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (existsSync(caminhoEnv)) {
    for (const linha of readFileSync(caminhoEnv, 'utf8').split(/\r?\n/)) {
      if (/^\s*#/.test(linha)) continue;
      const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && m[2] !== undefined) {
        const valor = m[2].trim().replace(/^["']|["']$/g, '');
        if (valor !== '' && process.env[m[1]!] === undefined) process.env[m[1]!] = valor;
      }
    }
  }
}

const { db, fecharBanco } = await import('../src/db/pool.js');

const MODULOS = [
  'visao_geral',
  'equipe',
  'juridico',
  'empreendimentos',
  'inteligencia',
  'tecnologia',
] as const;
const ACOES = ['criar', 'editar', 'remover', 'exportar', 'executar'] as const;
const TIPOS = [
  'dado_pessoal',
  'valor_financeiro',
  'situacao_juridica',
  'documento',
  'desempenho_individual',
] as const;
const MOTIVO =
  'Instalacao em maquina propria: a mesma pessoa administra a base e opera o comite.';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const usuario = argumento('usuario');
if (!usuario) {
  console.error('Uso: npx tsx scripts/conceder-operacao.ts --usuario <nome>');
  process.exit(1);
}

const conta = await db
  .selectFrom('usuarios')
  .select(['id', 'usuario', 'perfil'])
  .where('usuario', '=', usuario)
  .executeTakeFirst();

if (!conta) {
  console.error(`Usuario "${usuario}" nao encontrado.`);
  await fecharBanco();
  process.exit(1);
}

// 1. Acoes de operacao, como excecao por usuario com motivo.
let concedidas = 0;
for (const modulo of MODULOS) {
  for (const acao of ACOES) {
    const r = await db
      .insertInto('permissoes_usuario')
      .values({ usuario_id: conta.id, modulo, acao, concedida: true, motivo: MOTIVO })
      .onConflict((oc) => oc.columns(['usuario_id', 'modulo', 'acao']).doNothing())
      .executeTakeFirst();
    if ((r.numInsertedOrUpdatedRows ?? 0n) > 0n) concedidas++;
  }
}

// 2. Escopo de empreendimentos: todos.
const escopoEmpr = await db
  .insertInto('escopos_empreendimento')
  .values({ usuario_id: conta.id, empreendimento_id: null, todos: true })
  .onConflict((oc) => oc.doNothing())
  .executeTakeFirst();

// 3. Tipos de informacao completos (CPF sem mascara etc.) — a instalacao e da
// gestora juridica; mascarar dela o proprio dado nao protege ninguem.
let tipos = 0;
for (const tipo of TIPOS) {
  const r = await db
    .insertInto('escopos_tipo_informacao')
    .values({ usuario_id: conta.id, tipo, completo: true })
    .onConflict((oc) => oc.columns(['usuario_id', 'tipo']).doUpdateSet({ completo: true }))
    .executeTakeFirst();
  if ((r.numInsertedOrUpdatedRows ?? 0n) > 0n) tipos++;
}

console.log(`✓ ${conta.usuario} (perfil ${conta.perfil})`);
console.log(`  acoes de operacao concedidas agora: ${concedidas} (ja existentes preservadas)`);
console.log(
  `  escopo de empreendimentos: ${(escopoEmpr.numInsertedOrUpdatedRows ?? 0n) > 0n ? 'todos (novo)' : 'ja era todos'}`,
);
console.log(`  tipos de informacao completos: ${tipos} ajustados`);
console.log(`  motivo gravado: "${MOTIVO}"`);

await fecharBanco();
