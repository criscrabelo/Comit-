/**
 * Verificacao do saneamento NO NAVEGADOR DE VERDADE.
 *
 * Os testes de codigo-fonte provam que a credencial nao esta mais no codigo.
 * Este script prova o comportamento em tempo de execucao: abre a pagina num
 * Chromium real, injeta um token legado em localStorage como se fosse uma
 * instalacao antiga, recarrega, e confere que:
 *
 *   - o token legado foi removido do navegador;
 *   - nenhuma requisicao saiu para api.monday.com;
 *   - nenhum campo de entrada de token existe na interface;
 *   - as consultas ao Monday vao para o proxy do backend.
 *
 * Uso: BASE=http://localhost:3199 node scripts/verificar-saneamento.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3199';
const TOKEN_FALSO = 'eyJhbGciOiJIUzI1NiJ9.token-legado-de-teste.assinatura';

let falhas = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const falha = (m) => { console.log(`  ✗ ${m}`); falhas++; };

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const contexto = await navegador.newContext();
const pagina = await contexto.newPage();

// Registra toda requisicao de saida, para provar que nada vai ao Monday.
const requisicoes = [];
pagina.on('request', (r) => requisicoes.push(r.url()));

console.log(`\nVerificando o saneamento em ${BASE}\n`);

// ── 1. Simula instalacao antiga com token no navegador ─────────────────────
await pagina.goto(BASE, { waitUntil: 'domcontentloaded' });
await pagina.evaluate((token) => {
  localStorage.setItem('jur_monday_token', token);
  sessionStorage.setItem('monday_token', token);
}, TOKEN_FALSO);

const antes = await pagina.evaluate(() => localStorage.getItem('jur_monday_token'));
if (antes === TOKEN_FALSO) {
  ok('token legado injetado, simulando instalacao anterior');
} else {
  falha('nao foi possivel injetar o token legado');
}

// ── 2. Recarrega: a limpeza roda na carga da pagina ────────────────────────
requisicoes.length = 0;
await pagina.reload({ waitUntil: 'networkidle' });

const depois = await pagina.evaluate(() => ({
  local: localStorage.getItem('jur_monday_token'),
  sessao: sessionStorage.getItem('monday_token'),
  // Qualquer chave remanescente que mencione token.
  chavesComToken: Object.keys(localStorage).filter((k) => /token|senha|credencial/i.test(k)),
}));

if (depois.local === null) ok('token legado removido do localStorage');
else falha(`token legado PERMANECE no localStorage: ${depois.local?.slice(0, 12)}…`);

if (depois.sessao === null) ok('token legado removido do sessionStorage');
else falha('token legado PERMANECE no sessionStorage');

if (depois.chavesComToken.length === 0) ok('nenhuma chave de credencial no navegador');
else falha(`chaves remanescentes: ${depois.chavesComToken.join(', ')}`);

// ── 3. Nenhuma requisicao ao Monday ────────────────────────────────────────
const aoMonday = requisicoes.filter((u) => u.includes('api.monday.com'));
if (aoMonday.length === 0) ok('nenhuma requisicao saiu para api.monday.com');
else falha(`${aoMonday.length} requisicao(oes) para o Monday: ${aoMonday[0]}`);

// ── 4. Interface sem campo de token ────────────────────────────────────────
const camposToken = await pagina.evaluate(() =>
  [...document.querySelectorAll('input')]
    .filter((i) => /token|senha.*monday/i.test(`${i.id} ${i.name} ${i.placeholder}`))
    .map((i) => i.id || i.name || i.placeholder),
);
if (camposToken.length === 0) ok('nenhum campo de entrada de token na interface');
else falha(`campos encontrados: ${camposToken.join(', ')}`);

const menuToken = await pagina.evaluate(() =>
  [...document.querySelectorAll('a, button')]
    .filter((e) => /configurar token/i.test(e.textContent ?? ''))
    .map((e) => e.textContent?.trim()),
);
if (menuToken.length === 0) ok('nenhum item de menu para configurar token');
else falha(`itens de menu: ${menuToken.join(', ')}`);

// ── 5. A consulta ao Monday vai para o proxy ───────────────────────────────
//
// Medido no nivel da REDE, com as requisicoes que o navegador realmente emitiu
// no recarregamento. E evidencia mais forte do que interceptar `fetch`: pega
// tambem XMLHttpRequest, imagem, iframe e qualquer outro caminho de saida.
//
// Observacao: `MondaySync` e declarado com `const` no topo de um script
// classico, portanto NAO vira propriedade de `window` — verificar
// `window.MondaySync` daria falso negativo.
const modulo = await pagina.evaluate(() => typeof MondaySync);
if (modulo === 'object') ok('modulo do Monday carregado e integro');
else falha(`modulo do Monday nao carregou (typeof = ${modulo})`);

const paraProxy = requisicoes.filter((u) => u.includes('/api/monday/'));
const paraMonday = requisicoes.filter((u) => u.includes('api.monday.com'));

if (paraProxy.length > 0) {
  ok(`consulta direcionada ao proxy do backend: ${new URL(paraProxy[0]).pathname}`);
} else {
  falha(`nenhuma consulta ao proxy entre ${requisicoes.length} requisicoes`);
}

if (paraMonday.length === 0) ok('nenhuma consulta direta ao Monday em tempo de execucao');
else falha(`consulta direta ao Monday: ${paraMonday[0]}`);

// ── 6. Nenhuma credencial no HTML entregue ─────────────────────────────────
const html = await pagina.content();
const padroes = [/gh[pousr]_[A-Za-z0-9]{20,}/, /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./];
if (!padroes.some((p) => p.test(html))) ok('nenhum padrao de credencial no HTML entregue');
else falha('padrao de credencial encontrado no HTML');

await navegador.close();

console.log(
  falhas === 0
    ? '\n✓ saneamento verificado no navegador: nenhuma credencial, nenhuma chamada direta\n'
    : `\n✗ ${falhas} verificacao(oes) falharam\n`,
);
process.exit(falhas > 0 ? 1 : 0);
