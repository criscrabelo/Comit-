# Plano de Melhorias e Correções — Plataforma de Comitês

> Lista organizada por severidade. Itens marcados como **🔴 Crítico** afetam funcionamento atual; **🟠 Alto** trazem risco de bug ou de segurança; **🟡 Médio** são limpeza/UX; **🟢 Baixo** são melhorias incrementais.

---

## 🔴 CRÍTICO — Bugs que afetam funcionamento atual

### C1. Rota `retomadas` quebrada — `renderRetomadas` não existe
**Arquivo**: [js/app.js:10](js/app.js#L10) (referência) — função **nunca foi definida** em `views.js`.

O router declara:
```js
retomadas: renderRetomadas,
```
mas **não há nenhuma função `renderRetomadas`** em todo o projeto. Clicar em **🔁 Retomadas** na sidebar resulta em `ReferenceError: renderRetomadas is not defined` (o item é cadastrável apenas via sync do Monday e via geração de slides; o usuário não consegue editar/adicionar manualmente pela UI).

**Correção**: criar `renderRetomadas()` em `views.js` seguindo o padrão de `renderDistratos` (lista + KPIs + modal CRUD). Já existe a estrutura de dados e o seed (`js/seed.js:101-106`).

---

### C2. Inconsistência no sync de Distratos/Retomadas — chamadas duplicadas
**Arquivo**: [js/monday-sync.js:613-615](js/monday-sync.js#L613)

```js
await run('Distratos/Retomadas',() => syncDistratosRetomadas(comiteId, mesRef));
await run('Retomadas',          () => syncRetomadas(comiteId, mesRef));
```

`syncDistratosRetomadas` (board `distratos`) **insere** retomadas (linhas 274-285) — depois `syncRetomadas` (board `retomadas`) **apaga TODAS** as retomadas do comitê (linha 330) e re-insere apenas as do board dedicado. Resultado: as retomadas inseridas no passo anterior são **silenciosamente apagadas**, e o passo 1 desperdiça processamento.

**Correção**: remover a inserção de retomadas em `syncDistratosRetomadas` (deixar só distratos) **ou** remover a chamada de `syncRetomadas` se o board "distratos" já consolida ambos.

---

### C3. Versão "print" não aparece quando se imprime
**Arquivo**: [js/comite.js:118-120](js/comite.js#L118) + [css/print.css](css/print.css)

O HTML gera `<div id="printSlides" style="display:none;">` — mas o `print.css` **nunca** faz `display:block !important` para esse container, e **nunca** esconde o `#slidesPreview`. Resultado: o `Ctrl+P` imprime os **cards de preview** (com etiquetas "Slide 1 · Capa") em vez dos slides limpos.

**Correção**: em `print.css`, dentro do `@media print`:
```css
#slidesPreview { display: none !important; }
#printSlides   { display: block !important; }
```

---

### C4. Loop de carregamento ao trocar de aba pode falhar
**Arquivo**: [js/db.js:84-89](js/db.js#L84)

```js
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && _serverAvailable) {
    _loadFromServer().then(...);   // ← _loadFromServer não está no escopo!
  }
});
```
A função `_loadFromServer` é declarada como **IIFE** anônima (linha 46) — o identificador `_loadFromServer` não existe no escopo. Esse `visibilitychange` lança `ReferenceError` toda vez que o usuário troca de aba e volta.

**Correção**: extrair em uma função nomeada acessível dentro do módulo IIFE do `DB`:
```js
async function _loadFromServer() { ... }
const ready = _loadFromServer();
```

---

### C5. `confirmDelete` usa eval implícito — quebra se houver aspas
**Arquivo**: [js/utils.js:103-109](js/utils.js#L103) e usos em `views.js`

```js
confirmDelete(`Excluir <strong>${esc(e?.nome)}</strong>?`,
  `()=>{ DB.remove('empreendimentos','${id}'); ... }`);
```
O callback é passado como **string** que é interpolada em `onclick="closeModal();(${cb})()"`. Se `id` contiver aspas simples (o `uid()` atual não gera, mas qualquer ID importado pode), ou se o callback for renomeado em refactor, quebra silenciosamente. Também desativa minificação e impede CSP `script-src 'self'`.

**Correção**: passar a função como callback real, salvar em `window._pendingDelete` e chamar `window._pendingDelete()` no botão. Ou usar `addEventListener` em vez de `onclick`.

---

## 🟠 ALTO — Segurança e robustez

### A1. Token Monday.com em texto puro no `localStorage`
**Arquivo**: [js/monday-sync.js:25](js/monday-sync.js#L25)

Qualquer script (extensão, XSS, lib CDN comprometida) lê `localStorage.getItem('jur_monday_token')`. Como a app carrega `chart.js` de CDN externa (`cdn.jsdelivr.net`), uma comprometimento do CDN expõe o token de todos os usuários.

**Correções recomendadas (em ordem de eficácia):**
1. Hospedar `chart.umd.min.js` localmente (eliminar dependência do CDN).
2. Adicionar `Content-Security-Policy` no servidor restringindo `script-src 'self'`.
3. Considerar mover o sync Monday para o servidor (token fica em variável de ambiente, nunca trafega ao client).

---

### A2. `POST /api/db` sem autenticação nem rate-limit
**Arquivo**: [server.js:117-138](server.js#L117)

Qualquer pessoa com a URL pública (Cloudflare Tunnel ou Fly.io) pode **sobrescrever todo o banco** com um simples `curl -X POST -d '{}' /api/db`.

**Correções:**
- Adicionar header `X-Auth-Token` simples comparado a `process.env.AUTH_TOKEN`.
- Bloquear `POST` se o body for menor que um threshold (evita zerar o banco).
- Manter histórico de N versões em `db.json.bak.1`, `db.json.bak.2`, etc., antes de sobrescrever.

---

### A3. CORS aberto (`Access-Control-Allow-Origin: *`)
**Arquivo**: [server.js:83-87](server.js#L83)

Combinado com A2, qualquer site pode chamar a API. Restringir o CORS a origens conhecidas (ou remover, já que a SPA é servida pelo mesmo domínio).

```js
const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'http://localhost:3131',
  ...
};
```

---

### A4. Validação só no client — JSON arbitrário sobrescreve `db.json`
**Arquivo**: [server.js:122](server.js#L122)

```js
JSON.parse(body); // valida JSON antes de gravar
```
Valida apenas que é **JSON parseável**. Não verifica estrutura. Um `POST {}` apaga tudo. Um `POST {"comites":"foo"}` causa quebras na próxima leitura (`Array.isArray` falha silenciosamente).

**Correção**: validar shape mínimo (cada tabela deve ser array; pelo menos uma das tabelas esperadas deve existir).

---

### A5. `findOrMakeEmpr` cria duplicatas em race condition
**Arquivo**: [js/monday-sync.js:131-146](js/monday-sync.js#L131)

`DB.insert` + `DB.getEmpreendimentos().find` são duas operações separadas. Se duas notificações com o mesmo empreendimento novo são processadas em paralelo (não no código atual, mas a função é chamada várias vezes no mesmo sync), pode criar dois `empreendimentos` com o mesmo nome.

**Correção**: normalizar a comparação para `find` com `toUpperCase().trim()` (já feito) e usar `Map` em cache local da sync.

---

### A6. Sem proteção contra perda de dados durante sync
**Arquivo**: [js/monday-sync.js:209](js/monday-sync.js#L209) (e padrão em todos os `sync*`)

```js
DB.forComite('processos', comiteId).forEach(p => DB.remove('processos', p.id));
```
**Apaga tudo primeiro, depois insere.** Se o sync falhar no meio (rede caiu, token expirou), o comitê fica vazio.

**Correção**: implementar transação otimista — salvar lista atual em variável, só remover se a inserção foi bem-sucedida. Ou inserir tudo com IDs novos e remover os antigos no final (atômico).

---

### A7. Carga inicial sobrescreve dados locais sem confirmação
**Arquivo**: [js/db.js:67-70](js/db.js#L67)

Se o usuário fez alterações offline e o servidor ainda tem versão antiga, a versão local é **silenciosamente sobrescrita** pela do servidor.

**Correção**: comparar `_meta.saved` local vs. servidor — se o local for mais recente, fazer **push** em vez de pull, ou perguntar ao usuário.

---

## 🟡 MÉDIO — UX, qualidade de código e manutenção

### M1. Snapshot fixo de "Notificações por Mês" hard-coded
**Arquivos**: [js/views.js:178](js/views.js#L178), [js/views.js:443](js/views.js#L443), [js/views.js:617](js/views.js#L617)

```js
ChartManager.bar('ch_notifMes', ['Jan','Fev','Mar','Abr','Mai'],
  [{ data: [51, 65, 23, 52, 45] }]);
```
Os valores `[51, 65, 23, 52, 45]` e `[62, 82, 74, 95, 52]` são **constantes** no código (snapshot do Monday em 19/05/2026). Ficam errados em **junho** e em qualquer outro comitê.

**Correção**: calcular dinamicamente a partir dos `notificacoes` / `contratos` agrupados por mês (`data_notificacao.slice(0,7)`).

---

### M2. Versionamento de assets manual e propenso a erro
**Arquivo**: [index.html:7-9, 79-86](index.html#L7)

```html
<link rel="stylesheet" href="css/styles.css?v=10" />
<script src="js/views.js?v=18"></script>
```
Cada arquivo tem sua própria `?v=N`. Esquecer de incrementar = usuários ficam com versão antiga em cache.

**Correção**: usar um único `?v=` global (gerado no build/start) ou servir com `Cache-Control: no-cache` para `*.js`/`*.css` (a app é pequena, ~4 KLoC).

---

### M3. Variáveis globais espalhadas no `window`
**Exemplos**: `window._contTab`, `window._procTab`, `window._unidadesEmpr` (em `views.js`).

Estado da UI armazenado em variáveis globais sem encapsulamento. Difícil de testar e de raciocinar.

**Correção**: criar um objeto `UIState` simples ou mover para `sessionStorage` para sobreviver a F5.

---

### M4. Falta `noComiteAlert` na rota `dashboard` no caso "sem comitê"
**Arquivo**: [js/views.js:19](js/views.js#L19)

Quando não há comitê, mostra um alerta inline. Demais views chamam `noComiteAlert()`. Inconsistente.

---

### M5. Render de gráficos com `setTimeout(..., 50)` é frágil
**Exemplos**: [js/views.js:173](js/views.js#L173), [js/comite.js:124](js/comite.js#L124), etc.

```js
setView(`...<canvas id="ch_notifMes">...`);
setTimeout(() => { ChartManager.bar('ch_notifMes', ...); }, 50);
```
Funciona porque `setView` é síncrono — mas se um dia injetar HTML async (Web Components, lazy load), quebra.

**Correção**: usar `requestAnimationFrame` ou chamar a renderização imediatamente após `setView` (o DOM já está pronto).

---

### M6. `views.js` está com 1306 linhas e crescendo
Concentra **todas** as views (Dashboard, Empreendimentos, Fatos, Notificações, Contratos, Distratos, Processos, Unidades, Risco, Regulatório, Backup). Difícil navegar e dá conflito de merge.

**Correção**: split em `views/dashboard.js`, `views/notificacoes.js`, etc. Como não há bundler, basta carregar cada um no `index.html`.

---

### M7. Falta tratamento de erro no `importAll`
**Arquivo**: [js/db.js:167-173](js/db.js#L167)

`JSON.parse(json)` pode lançar; nada captura. O `try` está em [`restaurarDados`](js/views.js#L1287) — ok. Mas se algum dia chamar `DB.importAll` programaticamente, vaza exceção.

---

### M8. `daysBetween` usa `new Date()` sem fuso
**Arquivo**: [js/utils.js:16-19](js/utils.js#L16)

```js
const da = new Date(a), db = new Date(b);
return Math.round((db - da) / 86400000);
```
`new Date("2026-04-05")` interpreta como **UTC 00:00**; em fuso BRT (-3h) vira 04/04 21:00, gerando off-by-one em alguns casos.

**Correção**: parsear como local: `new Date(a + 'T12:00:00')` ou usar uma lib leve.

---

### M9. Inputs `<input type="date">` aceitam datas inválidas
Nenhuma validação adicional. O usuário pode digitar "2020-13-45" via teclado em browsers que aceitam. Adicionar guarda em `save*`.

---

### M10. `seed.js` insere dados com `id` hardcoded misturado com gerado
**Arquivo**: [js/seed.js:6-17, 21, 152](js/seed.js#L6)

`empreendimentos` usam `id: 'e_alencar'`, `'e_coevo'`, etc. (hardcoded). `comites` usa `id: 'comite_abr26'`. Mas `riscos` usa `id: 'risco_jp_abc'` e os outros tipos não passam `id` (deixam o `uid()` gerar).

Inconsistência — se o seed roda duas vezes, hardcoded gera duplicatas com mesmo ID; demais geram IDs únicos.

**Correção**: padronizar — ou tudo via `uid()`, ou tudo hardcoded com checagem `if (DB.getById(...)) return`.

---

### M11. `_pushToServer` envia o banco inteiro a cada operação
**Arquivo**: [js/db.js:30-42](js/db.js#L30)

A cada `insert/update/remove` (após 400 ms de debounce) envia o **dump completo** das 11 tabelas. Em uso real (centenas de itens), pode ser pesado, especialmente sobre Cloudflare Tunnel.

**Correção**: enviar apenas a tabela alterada + meta (`PATCH /api/db/<tabela>`). Estima-se 90% de redução do payload típico.

---

## 🟢 BAIXO — Melhorias incrementais

### B1. Faltam testes automatizados
Não há nenhuma suíte de testes. Mesmo sem framework, dá para fazer um `test.html` com asserts inline para as funções puras de `utils.js` e `db.js`.

### B2. README desatualizado vs. realidade
[README.md](README.md) não menciona:
- Deploy Fly.io (mas o `fly.toml` existe).
- Persistência via GitHub Gist (mas o `server.js` suporta).
- Que `node server.js` é necessário (sugere clique duplo em `index.html`, que funciona limitadamente).

### B3. Sem indicador visual de "sincronizando" no header
Quando o `_pushToServer` está em curso, o usuário não sabe. Um pequeno ícone de status em `sidebar-footer` ajudaria.

### B4. Confirmação de fechar com alterações não salvas
N/A — tudo já é salvo em localStorage; mas vale `beforeunload` se uma sync Monday estiver em andamento.

### B5. Não há "desfazer"
Excluir um fato ou notificação é irreversível. Implementar "undo" curto (5 s) com toast.

### B6. Charts não respondem a redimensionamento perfeito
Chart.js `responsive: true` está habilitado, mas ao redimensionar o sidebar via DevTools, alguns gráficos ficam cortados. Forçar `resize()` no `window.resize`.

### B7. PWA / instalável
Adicionar `manifest.json` + `service-worker.js` permitiria usar offline em mobile.

### B8. `console.log` deixados em produção
Vários `console.log('[Retomadas] ...')` em [monday-sync.js:333-339, 369-371](js/monday-sync.js#L333). Logs verbosos em produção. Mover para um helper `debug()` controlado por flag.

### B9. Strings duplicadas (i18n light)
Lista de meses aparece em pelo menos 3 lugares (`utils.js:11`, `utils.js:126`, `seed.js`). Centralizar em uma constante.

### B10. Empreendimento "tipo" diverge entre seed e Monday
- Seed usa `'Vertical'`, `'Horizontal'`, etc. ([js/seed.js:6](js/seed.js#L6))
- `findOrMakeEmpr` cria com `tipo: 'Residencial'` ([js/monday-sync.js:140](js/monday-sync.js#L140))
- View espera `TIPOS_EMPR = ['Vertical','Horizontal','Loteamento','Imobiliária','Em constituição','Outro']` ([js/views.js:203](js/views.js#L203))

`Residencial` não está na lista → select fica em branco. Padronizar ou adicionar `'Residencial'` à lista.

### B11. Cores de status do badge faltando alguns valores
**Arquivo**: [js/utils.js:77-86](js/utils.js#L77)

`'Cancelado'` e `'Pendente'` (status de contratos) não têm cor no `BADGE_COLORS` → caem em `'gray'`. Funciona, mas perde semântica.

### B12. Não há paginação nas tabelas
Tabelas como "Processos" podem ter 100+ linhas. Renderiza tudo de uma vez. Adicionar paginação simples (50/página) melhoraria o uso em listagens grandes.

### B13. Backup JSON cresce indefinidamente
Não há rotina de "arquivar comitês antigos". Em 2-3 anos, o JSON pode ficar pesado. Implementar export por ano e botão "Arquivar".

### B14. `package.json` sem campos de manutenção
Falta `author`, `repository`, `license`, `private: true`. Não impede execução, mas é boa prática.

---

## Resumo executivo

| Prioridade | Itens                                                     | Impacto                          |
|------------|-----------------------------------------------------------|----------------------------------|
| 🔴 Crítico  | Bug em `renderRetomadas`, sync duplicado, print quebrado, `_loadFromServer` em escopo errado, `eval` no `confirmDelete` | Funcionalidades não funcionam   |
| 🟠 Alto     | Sem auth na API, token em localStorage, sync apaga antes de inserir, CORS aberto                                          | Risco de perda/exposição de dados |
| 🟡 Médio    | Snapshot fixo, modularização, fuso horário, validação fraca                                                              | Bugs sutis e dívida técnica       |
| 🟢 Baixo    | Testes, README, PWA, paginação, logs                                                                                      | Polimento e escalabilidade        |

**Recomendação imediata**: atacar **C1, C3 e C4** (correções pequenas, alto impacto), depois **A1, A2 e A6** (segurança).
