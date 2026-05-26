# Documentação Técnica — Plataforma de Comitês Jurídicos

> Plataforma web interna do **Departamento Jurídico — Grupo Patrono** para consolidação de informações mensais (notificações, contratos, distratos, retomadas, processos, análise de risco e temas regulatórios) e geração automática da apresentação em PDF do **Comitê do Mês**.

---

## 1. Visão Geral

A aplicação é uma **SPA (Single Page Application)** totalmente client-side, escrita em **JavaScript vanilla** (sem frameworks), com um servidor **Node.js puro** (sem dependências externas) que serve os arquivos estáticos e expõe uma API REST mínima (`GET /api/db`, `POST /api/db`) para compartilhar o banco de dados entre múltiplos usuários.

### Características principais
- **Zero dependências NPM** — usa apenas módulos nativos do Node (`http`, `https`, `fs`, `path`, `os`).
- **Persistência híbrida** — `localStorage` (cache local) + servidor (arquivo `db.json` OU GitHub Gist).
- **Integração com Monday.com** via GraphQL API v2024-10.
- **Geração de PDF** via `window.print()` com CSS `@media print` específico (formato A4 paisagem).
- **Charts** com Chart.js 4.4.1 (carregado por CDN).
- **Modo compartilhado** via Cloudflare Tunnel (`Iniciar e Compartilhar.bat`).
- **Deploy** containerizado pronto para Fly.io (`Dockerfile` + `fly.toml`) ou local via Node.

---

## 2. Estrutura de Arquivos

```
Comit-/
├── server.js                    # Servidor HTTP + API REST + integração Gist
├── package.json                 # Metadata (sem dependências)
├── index.html                   # Shell da SPA (sidebar + main + modal + toast)
├── Dockerfile                   # Imagem node:20-alpine
├── fly.toml                     # Deploy Fly.io (região GRU, volume persistente)
├── .gitignore                   # Exclui db.json, *.backup, node_modules
│
├── Iniciar Plataforma.bat       # Inicia o servidor local
├── Iniciar e Compartilhar.bat   # Inicia + tunnel Cloudflare (compartilha link público)
├── Liberar Firewall (Admin).bat # Libera porta 3131 no firewall do Windows
│
├── css/
│   ├── styles.css               # Estilos da UI (layout, sidebar, KPIs, charts, tabelas)
│   └── print.css                # Estilos exclusivos de impressão (slides A4 paisagem)
│
└── js/
    ├── db.js          # Camada de dados — CRUD + sync localStorage ↔ servidor
    ├── seed.js        # Dados iniciais (Comitê Abril 2026 — demonstração)
    ├── utils.js       # Helpers (datas, DOM, modal, toast, badges, esc, etc.)
    ├── charts.js      # Wrappers do Chart.js (bar, donut, line) + paleta global
    ├── views.js       # Renderização e CRUD de todos os módulos
    ├── comite.js      # Gerador de slides (tela + versão print)
    ├── monday-sync.js # Integração GraphQL com Monday.com
    └── app.js         # Router + bootstrap (chama DB.ready → seedIfEmpty → navigate)
```

---

## 3. Arquitetura

### 3.1 Camada de Apresentação (Client)
Tudo roda no browser. O **Router** (em `app.js`) é uma função `navigate(route)` que despacha para uma função `renderXxx()` em `views.js`. Cada `render*` constrói o HTML com **template literals** e injeta no `<div id="view">` via `setView(...)`.

Modais são abertos pelo helper `openModal(titulo, bodyHTML, footHTML)` — todos os formulários (inserir/editar) usam esse mecanismo.

### 3.2 Camada de Dados (`js/db.js`)
- Cada **tabela** é um array JSON serializado em `localStorage[jur_comite_<tabela>]`.
- Tabelas: `comites`, `empreendimentos`, `fatos`, `notificacoes`, `contratos`, `retomadas`, `distratos`, `processos`, `unidades`, `riscos`, `regulatorios`.
- **API pública**: `getAll`, `getById`, `insert`, `update`, `remove`, `where`, `forComite(table, comiteId)`, `getComites`, `getActiveComite`, `setActiveComite`, `getEmpreendimentos`, `exportAll`, `importAll`, `storageSize`.
- Cada `insert` gera `id` via `uid()` (`Date.now().toString(36) + Math.random().toString(36).slice(2,7)`).
- Após cada `_write` há **debounce de 400 ms** que faz `POST /api/db` enviando o dump completo das tabelas + `_meta.active_comite`.

### 3.3 Camada de Servidor (`server.js`)
Servidor HTTP nativo (~190 linhas). Rotas:

| Método | Rota         | Função                                                  |
|--------|--------------|---------------------------------------------------------|
| GET    | `/api/db`    | Retorna o JSON consolidado (de `db.json` ou Gist).      |
| POST   | `/api/db`    | Valida JSON e grava (em arquivo ou Gist).               |
| OPTIONS| `*`          | CORS preflight (libera `*`).                            |
| GET    | qualquer outro| Serve arquivo estático sob o ROOT (com proteção path-traversal). |

**Modos de persistência (auto-detect):**
- Se `GITHUB_GIST_ID` e `GITHUB_TOKEN` estiverem definidos → escrita no Gist com debounce de 1 s.
- Caso contrário → grava em `DB_PATH` (default: `./db.json`; em produção/Fly.io: `/data/db.json`).

### 3.4 Sincronização Multi-usuário
1. Cliente A carrega → `DB.ready` faz `GET /api/db` (timeout 4 s).
2. Se o servidor responde, sobrescreve o `localStorage` com o que veio do servidor.
3. Cada `insert/update/remove` faz `_pushToServer()` (debounce 400 ms).
4. Quando a aba ganha foco (`visibilitychange`), recarrega do servidor e re-renderiza.

---

## 4. Módulos Funcionais

### 4.1 Dashboard (`renderDashboard`)
KPIs do comitê ativo + gráficos (notificações por mês/grupo/modelo, contratos por tipo, processos por empreendimento/posição, distratos por motivo) + painel **"Notificações por Estágio"** (vem da coluna `ESTÁGIOS` do Monday) + lista dos 6 últimos fatos relevantes.

### 4.2 Cadastros do Mês
Todos seguem o mesmo padrão: lista → modal de inserção/edição → CRUD via `DB.*`.

| Rota              | Tabela          | Campos principais                                                          |
|-------------------|-----------------|----------------------------------------------------------------------------|
| `fatos`           | `fatos`         | empreendimento, data, título, descrição                                    |
| `notificacoes`    | `notificacoes`  | empreendimento, torre, unidade, grupo, modelo, estágio, data notif./sol.   |
| `contratos`       | `contratos`     | empreendimento, categoria (clientes/prestadores/obra/outros), tipo, data, status |
| `retomadas`       | `retomadas`     | empreendimento, motivo, equipe, data início, data retomada, dias           |
| `distratos`       | `distratos`     | empreendimento, motivo, data venda, data distrato, dias                    |
| `processos`       | `processos`     | empreendimento, motivo, posição, status, local, ano, **interno** (bool)    |
| `risco`           | `riscos`        | contrato_ref, alerta, cronograma[], riscos_lista[], recomendacoes[]        |
| `regulatorio`     | `regulatorios`  | título, data_vigencia, destaque, descrição, checklist[]                    |

### 4.3 Base
- **Empreendimentos** (`empreendimentos`): nome, tipo (Vertical, Horizontal, Loteamento, Imobiliária, Em constituição, Outro).
- **Unidades / Habite-se** (`unidades`): por empreendimento, com prazo habite-se, prazo + 180 dias, previsão de entrega, e cálculo automático de **dias de atraso**. Suporta **importação CSV em lote**.

### 4.4 Comitê do Mês (`renderComite` em `comite.js`)
Constrói **duas árvores DOM**:
- `#slidesPreview` — visualização em tela (cards com a etiqueta "Slide X · Y").
- `#printSlides` — versão `display:none` que é o que aparece quando o usuário pressiona `Ctrl+P`.

Estrutura dos slides:
1. **Capa** (fundo escuro)
2. **Fatos Relevantes** (3 empreendimentos por slide)
3. **Notificações** (KPIs + 2 charts)
4. **Contratos** (KPIs + charts por tipo e empreendimento)
5. **Retomadas** (KPIs + motivos e equipes)
6. **Distratos** (KPIs + motivos e empreendimento)
7. **Temas Regulatórios** (cada um em slide próprio)
8. **Processos Judiciais Externos / Internos** (tabela + KPIs)
9. **OBRIGADA** (encerramento)
10. **Anexos: Análise de Risco** (capa + cronograma + riscos 2/slide + recomendações)

A versão print substitui `<canvas>` por **barras CSS estáticas** (`printKpiSlide`) — não há renderização de Chart.js no PDF.

### 4.5 Backup / Restaurar
- `exportAll()` retorna JSON contendo todas as tabelas + timestamp `_exported`.
- `importAll(json)` percorre as chaves do dump e grava cada tabela (ignorando chaves começando com `_`).
- "Limpar tudo" remove apenas chaves com prefixo `jur_comite_`.

### 4.6 Integração Monday.com (`monday-sync.js`)
Módulo independente que puxa dados de **7 boards** via GraphQL:

| Variável               | Board ID         | Conteúdo                                                |
|------------------------|------------------|---------------------------------------------------------|
| `processos`            | `5959705266`     | (JUR) PROCESSOS JUDICIAIS                               |
| `distratos`            | `18404493605`    | (JUR) DISTRATOS E DESISTÊNCIAS                          |
| `retomadas`            | `18413057491`    | (JUR) RETOMADAS                                         |
| `notificacoes`         | `5630368737`     | (JUR) NOTIFICAÇÕES CLIENTES                             |
| `carpedie`             | `18410779605`    | CONTROLE DE ENTREGA CARPE DIEM                          |
| `contratosClientes`    | `5821473011`     | (JUR) CONTRATOS PARA CLIENTES                           |
| `contratosObra`        | `5800267760`     | (JUR) OBRA — CONTRATO DE PRESTAÇÃO DE SERVIÇO           |
| `contratosPrestadores` | `8734722297`     | (JUR) CONTRATOS PRESTADORES DE SERVIÇOS                 |

**Funcionamento da sincronização (`syncAll`):**
1. Para cada módulo, faz `fetchAllItems(boardId)` com paginação (200 itens/página).
2. **Apaga** todos os registros do comitê ativo da tabela alvo.
3. **Re-insere** os itens que se enquadram no filtro de mês (`mesRange(mesRef)`).
4. Empreendimentos novos vistos no Monday são auto-criados via `findOrMakeEmpr(name)`.
5. Mapeamento de status: tabelas (`mapProcStatus`, `mapStatusContCliente`, `mapStatusContObra`) traduzem nomenclatura Monday → plataforma.
6. **Fatos Relevantes**, **Análise de Risco** e **Temas Regulatórios** NÃO são sincronizados — são manuais.

**Token**: armazenado em `localStorage[jur_monday_token]`. O dot 🟠/🟢 ao lado do menu indica o status.

---

## 5. Convenções e Padrões

### 5.1 IDs e referências
- `id` → string curta gerada por `DB.uid()`.
- `comite_id` → FK para `comites.id`.
- `empreendimento_id` → FK para `empreendimentos.id` (alguns seeds usam IDs literais como `e_alencar`, `e_coevo`, etc.).
- `ref` (em `comites`) → `"YYYY-MM"` (usado em filtros mensais).

### 5.2 Datas
Padrão **ISO 8601** (`YYYY-MM-DD`). Conversão para exibição via `fmtDate(iso)` → `DD/MM/YYYY`.

### 5.3 Versionamento de assets
Os scripts e CSS são carregados com query string `?v=N` (ex: `views.js?v=18`) para forçar cache-busting quando o arquivo muda. **Lembre-se de incrementar o `v=` ao publicar mudanças.**

### 5.4 Estilo visual
- Paleta definida em `:root` (`--blue`, `--orange`, `--green`, `--red`, etc.).
- Componentes nomeados: `.kpi-card`, `.section-card`, `.empr-chip`, `.badge badge-<cor>`, `.chart-card`, `.estagio-panel`.
- Tipografia: `Segoe UI`, 14 px base.
- Layout: sidebar fixa 240 px + main scrollável (flex).

### 5.5 Escape de strings
Tudo que entra em HTML via template literal **deve** passar por `esc()` para evitar XSS (já há uso amplo, mas conferir sempre).

---

## 6. Como executar

### 6.1 Local (Windows)
```
1. Instale Node.js >= 18
2. Duplo-clique em "Iniciar Plataforma.bat"
3. Acesse http://localhost:3131
```

### 6.2 Local (qualquer SO)
```bash
node server.js
# Variáveis opcionais:
#   PORT=8080
#   DB_PATH=./meu-banco.json
#   GITHUB_GIST_ID=xxxxx
#   GITHUB_TOKEN=ghp_xxxx
```

### 6.3 Compartilhar via Cloudflare Tunnel
```
Duplo-clique em "Iniciar e Compartilhar.bat"
→ gera uma URL pública trycloudflare.com (salva em URL_PUBLICA.txt)
```

### 6.4 Deploy Fly.io
```bash
fly launch                       # primeira vez
fly volumes create comites_data --size 1   # cria volume persistente
fly deploy
```
O `fly.toml` já aponta `DB_PATH=/data/db.json`.

### 6.5 Modo offline (sem servidor)
Basta abrir `index.html` diretamente no browser. A app funciona 100% com `localStorage` (mas sem sincronização entre dispositivos).

---

## 7. Fluxo de uso típico (mensal)

1. **Criar comitê do mês** → barra lateral → `+ Mês`.
2. **Sincronizar Monday** → puxa Processos, Distratos, Retomadas, Notificações, Unidades, Contratos.
3. **Cadastrar manualmente** Fatos Relevantes, Análise de Risco (se houver) e Tema Regulatório.
4. **Conferir Dashboard** → verifica KPIs e gráficos.
5. **Gerar Comitê do Mês** → `Ctrl+P` → "Salvar como PDF" (formato A4 paisagem).
6. **Backup** → exportar JSON ao final do ciclo.

---

## 8. Segurança e Limitações

- **CORS aberto** (`Access-Control-Allow-Origin: *`) — adequado para uso interno, não para internet aberta.
- **Sem autenticação** — qualquer um com a URL acessa tudo. O modelo de compartilhamento via Cloudflare Tunnel depende de o link ser secreto.
- **Token Monday em localStorage** — vulnerável a XSS. Por isso o `esc()` em todos os pontos de injeção HTML é crítico.
- **POST `/api/db` sem rate-limit / sem autenticação** — qualquer um pode sobrescrever o banco.
- **Inputs validados apenas no client** — o servidor só valida que o body é JSON parseável.
