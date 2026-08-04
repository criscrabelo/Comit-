# Inventário de `js/db.js` — inversão da fonte da verdade

Levantado em 2026-08-04, antes de qualquer alteração de código, sobre
`js/db.js` (197 linhas, revisão `82a77f1`).

Objetivo da inversão: **PostgreSQL passa a ser a fonte oficial**. O navegador
deixa de guardar dado de negócio. `views.js` continua chamando a mesma
interface pública.

```
views.js ──► DB (adaptador compatível) ──► /api/dados ──► PostgreSQL
```

---

## 0. Estado atual, medido

| Medida | Valor |
| --- | --- |
| Métodos públicos de `DB` | 17 |
| Chamadas `DB.*` no frontend | 138 |
| Arquivos que chamam `DB` | 6 (`views.js`, `comite.js`, `utils.js`, `monday-sync.js`, `seed.js`, `app.js`) |
| Linhas de `db.js` que gravam dado de negócio no navegador | 4 (`:23`, `:69`, `:72`, `:151`) |
| Métodos síncronos | 16 de 17 (só `ready` é assíncrono) |

O `_write` atual grava em `localStorage` e, com atraso de 400 ms, envia o
**dump inteiro** (11 tabelas) por `POST /api/db`. Duas consequências que a
inversão elimina:

1. **Última gravação vence, silenciosamente.** Duas pessoas editando comitês
   diferentes sobrescrevem uma à outra: o dump não tem versão nem comparação.
2. **O servidor é cópia, não fonte.** Em `_loadFromServer`, se o servidor
   responde vazio, o navegador *sobe* os dados locais (`db.js:60-64`) — a
   direção da verdade é a inversa da desejada.

---

## 1. Métodos públicos, telas, API, destino, risco e estratégia

Legenda de risco: **A** = alto (muda semântica de retorno), **M** = médio
(muda momento do efeito), **B** = baixo (comportamento equivalente).

### 1.1 `ready` — promessa de inicialização

| Item | Conteúdo |
| --- | --- |
| **Usos** | `app.js:55` (bootstrap: `seedIfEmpty`, `populateMonthSelector`, `updateStorageInfo`, `Router.navigate`) |
| **API** | `GET /api/dados/carga-inicial` |
| **Destino** | todas as entidades do comitê ativo + base (empreendimentos, comitês) |
| **Hoje** | promessa que resolve mesmo com servidor offline, caindo para `localStorage` |
| **Depois** | promessa que resolve quando o cache de trabalho estiver preenchido **pela API**; sem API não há dado, e a tela mostra "sem conexão" |
| **Risco** | **B** — já era assíncrono |
| **Estratégia** | Mantido idêntico. Passa a rejeitar apenas em erro de programação; falha de rede resolve com estado `sem_conexao` e cache vazio, para o bootstrap não travar. |

### 1.2 `uid()` — identificador local

| Item | Conteúdo |
| --- | --- |
| **Usos** | `views.js:1250` (`DB.insert('riscos', { id: DB.uid(), ... })`) |
| **API** | nenhuma — o `id` real passa a ser o `uuid` do PostgreSQL |
| **Destino** | — |
| **Hoje** | `Date.now().toString(36) + random` |
| **Depois** | passa a gerar `crypto.randomUUID()`; o servidor **ignora** id enviado pelo cliente e devolve o seu |
| **Risco** | **M** — o id que volta não é o que foi enviado |
| **Estratégia** | Preservado. O adaptador troca o id provisório pelo id do servidor no cache assim que a resposta chega, e a tela é redesenhada. Nenhuma tela guarda id entre renderizações. |

### 1.3 `getAll(tabela)` — lista completa

| Item | Conteúdo |
| --- | --- |
| **Usos** | `seed.js:3` (`getAll('comites')`), indiretamente por `getComites` e `getEmpreendimentos` |
| **API** | `GET /api/dados/:entidade?tamanho=…&pagina=…` |
| **Destino** | conforme mapa da seção 2 |
| **Hoje** | `JSON.parse(localStorage)` — síncrono, sempre disponível |
| **Depois** | leitura síncrona do **cache em memória**, preenchido pela API na carga e após cada escrita confirmada |
| **Risco** | **A** — se o cache não estiver carregado, devolve lista vazia, e a tela diria "nenhum registro" quando na verdade é "ainda carregando" |
| **Estratégia** | O cache expõe o estado (`carregando` / `carregado` / `erro` / `sem_conexao`). O adaptador **bloqueia a renderização** até `ready` resolver (já é o que `app.js:55` faz) e o `Router` consulta `DB.estado()` antes de desenhar "sem dados". |

### 1.4 `getById(tabela, id)`

| Item | Conteúdo |
| --- | --- |
| **Usos** | 11: `utils.js:62` (`emprName`), `views.js:262,287,339,547,714,753,956,1060,1209,1309` — todos os modais de edição e exclusão |
| **API** | `GET /api/dados/:entidade/:id` |
| **Destino** | conforme mapa |
| **Hoje** | `find` sobre o array local |
| **Depois** | `find` sobre o cache; consulta direta à API disponível em `DB.consultar(tabela, id)` (assíncrona) para quem precisar do dado fresco |
| **Risco** | **B** — os modais abrem sobre registros que a lista acabou de renderizar |
| **Estratégia** | Assinatura preservada. Quando o registro não está no cache, o adaptador devolve `null` — igual a hoje. |

### 1.5 `insert(tabela, registro)`

| Item | Conteúdo |
| --- | --- |
| **Usos** | 28: `views.js` (10 formulários), `seed.js` (11), `monday-sync.js` (6), `utils.js:157` (novo comitê) |
| **API** | `POST /api/dados/:entidade` |
| **Destino** | conforme mapa |
| **Hoje** | grava em `localStorage`, devolve o registro com `id` e `_created`; nunca falha |
| **Depois** | envia à API; o retorno síncrono é **provisório** e o registro fica marcado como pendente até a confirmação |
| **Risco** | **A** — `views.js` chama `toast('…adicionado!')` **antes** de o servidor responder |
| **Estratégia** | O adaptador assume a responsabilidade pelo estado de gravação: mostra `salvando…` e, em falha, **desfaz** a inserção do cache, mostra erro específico (`sem permissão`, `conflito`, `sem conexão`) e redesenha a tela. O toast otimista de `views.js` é substituído na tela pelo estado final do adaptador. Nenhuma escrita fica em `localStorage`. |

### 1.6 `update(tabela, id, alteracoes)`

| Item | Conteúdo |
| --- | --- |
| **Usos** | 11: `views.js` (9 formulários), `monday-sync.js:447,643` (evolução mensal do comitê) |
| **API** | `PATCH /api/dados/:entidade/:id` com `versao` do registro |
| **Destino** | conforme mapa |
| **Hoje** | substitui a linha no array e regrava tudo; **última gravação vence** |
| **Depois** | envia só os campos alterados + a versão lida; servidor devolve **409** se a versão mudou |
| **Risco** | **A** — surge um caminho de erro que hoje não existe (conflito de edição) |
| **Estratégia** | Assinatura preservada. Em 409 o adaptador desfaz a alteração local, recarrega o registro do servidor e abre o estado `conflito de edição` com a opção de recarregar e comparar. Não sobrescreve em silêncio. |

### 1.7 `remove(tabela, id)`

| Item | Conteúdo |
| --- | --- |
| **Usos** | 14: `views.js` (9 confirmações de exclusão), `monday-sync.js:317,397,479,585,661` (limpeza antes de reimportar) |
| **API** | `DELETE /api/dados/:entidade/:id` — **exclusão lógica** (`ausente_desde`) |
| **Destino** | conforme mapa |
| **Hoje** | `filter` que descarta a linha — o dado deixa de existir |
| **Depois** | marca ausência; o registro sai das listas mas continua no banco, com trilha |
| **Risco** | **M** — a semântica muda de "apagar" para "marcar ausente" |
| **Estratégia** | Assinatura preservada. As telas continuam vendo o registro sumir. O ganho é que "falha de uma fonte não apaga o último dado válido" passa a valer também para a interface. Os cinco `remove` de `monday-sync.js` passam a usar `DB.removerLote(tabela, ids)` — uma chamada só, para não disparar N requisições. |

### 1.8 `where(tabela, predicado)`

| Item | Conteúdo |
| --- | --- |
| **Usos** | 2: `monday-sync.js:660`, `views.js:1004` (unidades por empreendimento) |
| **API** | `GET /api/dados/:entidade?empreendimento_id=…` |
| **Destino** | conforme mapa |
| **Hoje** | `filter` com função JavaScript arbitrária |
| **Depois** | idêntico, sobre o cache — o predicado é uma função e não trafega |
| **Risco** | **B** |
| **Estratégia** | Preservado sobre o cache. O filtro **por empreendimento com corte de autorização** é do servidor: o cache só contém o que a sessão pode ver. |

### 1.9 `forComite(tabela, comiteId)`

| Item | Conteúdo |
| --- | --- |
| **Usos** | 26: `views.js` (13), `comite.js` (8), `monday-sync.js` (5) — é o filtro principal de todas as telas do mês |
| **API** | `GET /api/dados/:entidade?comite_id=…` |
| **Destino** | conforme mapa |
| **Hoje** | `where(t, r => r.comite_id === comiteId)` |
| **Depois** | idêntico, sobre o cache já recortado pelo comitê ativo |
| **Risco** | **B** |
| **Estratégia** | Preservado. A carga inicial e a troca de mês recarregam o cache do comitê pela API. |

### 1.10 `getComites()`

| Item | Conteúdo |
| --- | --- |
| **Usos** | `utils.js:114` (`populateMonthSelector`), `utils.js:154` (impedir mês duplicado) |
| **API** | `GET /api/dados/comites?ordenar=ref&direcao=desc` |
| **Destino** | `comites` + `competencias` |
| **Hoje** | ordena por `ref` decrescente no navegador |
| **Depois** | ordenação no servidor; o adaptador mantém a mesma ordenação sobre o cache |
| **Risco** | **B** |
| **Estratégia** | Preservado. `ref` (`AAAA-MM`) e `label` continuam existindo no formato que a tela espera. |

### 1.11 `getActiveComite()`

| Item | Conteúdo |
| --- | --- |
| **Usos** | 27 — o método mais chamado. Todas as telas de cadastro e `comite.js` |
| **API** | nenhuma para ler; a escolha é **preferência de interface** |
| **Destino** | `patrono.pref.v1.comite_ativo` (preferência, não dado de negócio) |
| **Hoje** | lê `jur_comite_active_comite` do `localStorage`; se não achar, o primeiro comitê |
| **Depois** | lê a preferência pelo catálogo (`Migracao.lerPreferencia('comiteAtivo')`); mesma queda para o primeiro comitê |
| **Risco** | **B** |
| **Estratégia** | Preservado. Guardar *qual mês está aberto* no navegador é legítimo: é escolha de visualização, não dado de negócio — está no catálogo de preferências aprovado em `docs/INVENTARIO-LOCALSTORAGE.md`. |

### 1.12 `setActiveComite(id)`

| Item | Conteúdo |
| --- | --- |
| **Usos** | 3: `app.js:47` (seletor de mês), `utils.js:158` (novo mês), `seed.js:28` |
| **API** | nenhuma; dispara `GET /api/dados/carga-inicial?comite_id=…` para recarregar o recorte |
| **Destino** | preferência |
| **Hoje** | grava a chave e faz push do dump inteiro |
| **Depois** | grava a preferência e recarrega o cache do novo comitê |
| **Risco** | **M** — a troca de mês passa a depender de ida ao servidor |
| **Estratégia** | Assinatura preservada. `app.js:47` já chama `Router.navigate` logo depois; o adaptador expõe `DB.trocarComite(id)` (assíncrono) e `setActiveComite` continua funcionando, disparando a recarga e o redesenho. |

### 1.13 `comiteRef(comite)`

| Item | Conteúdo |
| --- | --- |
| **Usos** | nenhum no código atual |
| **API** | — |
| **Destino** | — |
| **Hoje** | `comite ? comite.ref : null` |
| **Depois** | idêntico |
| **Risco** | **B** |
| **Estratégia** | Preservado sem alteração. |

### 1.14 `getEmpreendimentos()`

| Item | Conteúdo |
| --- | --- |
| **Usos** | 7: `utils.js:66` (`emprOptions`), `views.js:112,236,1001`, `comite.js:21`, `monday-sync.js:177,186` |
| **API** | `GET /api/dados/empreendimentos?ordenar=nome` |
| **Destino** | `empreendimentos` |
| **Hoje** | ordena por nome no navegador |
| **Depois** | cache ordenado; a lista já vem recortada pelo escopo de empreendimentos da sessão |
| **Risco** | **M** — um usuário com escopo restrito verá menos empreendimentos que hoje. Isso é a correção, não a quebra. |
| **Estratégia** | Preservado. `monday-sync.js:186` casa empreendimento por nome em maiúsculas; passa a usar o `nome_normalizado` que o servidor devolve. |

### 1.15 `exportAll()`

| Item | Conteúdo |
| --- | --- |
| **Usos** | `views.js:1392` (tela Backup) |
| **API** | `GET /api/dados/exportar` |
| **Destino** | todas as entidades |
| **Hoje** | serializa o `localStorage` |
| **Depois** | pede o dump ao servidor, que aplica autorização e registra a exportação na auditoria |
| **Risco** | **A** — passa a ser assíncrono; hoje o retorno é a string |
| **Estratégia** | `exportAll()` passa a devolver **`Promise<string>`**. É o único método cuja assinatura muda, e `views.js:1392` é ajustado (3 linhas). A alternativa — servir o cache — exportaria só o comitê carregado e seria um backup incompleto apresentado como completo. Backup completo é B14 e será tratado lá; aqui a exportação apenas deixa de vir do navegador. |

### 1.16 `importAll(json)`

| Item | Conteúdo |
| --- | --- |
| **Usos** | `views.js:1409` (restaurar backup) |
| **API** | `POST /api/migracao/importar` (mecanismo já existente, idempotente e auditado) |
| **Destino** | conforme classificação do inventário de migração |
| **Hoje** | grava direto no `localStorage`, sem validação |
| **Depois** | encaminha ao fluxo de migração, que classifica, versiona e audita |
| **Risco** | **A** — passa a ser assíncrono e pode recusar conteúdo |
| **Estratégia** | `importAll` passa a devolver **`Promise`** e a delegar. Restauração completa é B14; aqui apenas se garante que restaurar não repovoa o navegador. |

### 1.17 `storageSize()`

| Item | Conteúdo |
| --- | --- |
| **Usos** | `utils.js:99` (`updateStorageInfo`, rodapé da barra lateral) |
| **API** | — |
| **Destino** | — |
| **Hoje** | soma o tamanho das chaves `jur_comite_` |
| **Depois** | passa a informar **o estado da sessão de dados**, não o tamanho do armazenamento local: `123 registros · sincronizado` |
| **Risco** | **B** — é texto de rodapé |
| **Estratégia** | Assinatura preservada (devolve string). O significado muda porque a métrica antiga deixa de existir: não há mais dado de negócio no navegador para medir. |

---

## 2. Mapa entidade da SPA → tabela do PostgreSQL

O `DB` da SPA tem 11 "tabelas". Nem todas são tabelas no banco.

| Entidade na SPA | Tabela | Observação |
| --- | --- | --- |
| `comites` | `comites` + `competencias` | `ref` → `competencia_ref`, `label` → `rotulo` |
| `empreendimentos` | `empreendimentos` | `tipo` (Vertical/Horizontal/Loteamento/…) **não existe** no banco — coluna criada na migração 013 |
| `fatos` | `fatos` | direto |
| `notificacoes` | `notificacoes` | `data_solucao` só é aceita com `estagio = 'Resolvida'` (`CHECK notificacao_solucao_coerente`) |
| `distratos` | `distratos` com `categoria IN ('distrato','desistencia')` | `data_distrato` → `data_conclusao`; `tipo` da SPA → `categoria` |
| `retomadas` | `distratos` com `categoria = 'retomada'` | **não é tabela própria**: `data_inicio` → `data_solicitacao`, `data_retomada` → `data_conclusao` |
| `processos` | `processos_judiciais` | `status` → `situacao`; `local` → `comarca`; `motivo`, `posicao`, `ano`, `interno` diretos |
| `unidades` | `unidades` | `numero` (número na SPA) → `unidade` (texto no banco) |
| `riscos` | `riscos` | `cronograma`, `riscos_lista`, `renegociacao`, `recomendacoes` são `jsonb` |
| `regulatorios` | `regulatorios` | `checklist` é `jsonb` |
| `contratos` | `contratos` | declarado em `TABLES` mas **sem nenhum uso na interface**: exposto só para leitura |

Campos da SPA sem coluna correspondente ficam preservados em
`valor_original` — nada é descartado.

---

## 3. Telas impactadas

| Rota | Função | Métodos usados | Impacto |
| --- | --- | --- | --- |
| `dashboard` | `renderDashboard` (`views.js:55`) | `getActiveComite`, `forComite`×6, `getEmpreendimentos` | leitura; ganha estado de carregamento |
| `empreendimentos` | `renderEmpreendimentos` (`views.js:236`) | `getEmpreendimentos`, `getById`, `insert`, `update`, `remove` | escrita pela API |
| `fatos` | `renderFatos` (`views.js:295`) | `getActiveComite`, `forComite`, `getById`, `insert`, `update`, `remove` | escrita pela API |
| `notificacoes` | `renderNotificacoes` (`views.js:380`) | idem | escrita pela API + validação de `data_solucao` |
| `distratos` | `renderDistratosRetomadas` (`views.js:591`) | idem, em duas entidades | `retomadas` passa a gravar em `distratos` |
| `processos` | `renderProcessos` (`views.js:819`) | idem | escrita pela API |
| `unidades` | `renderUnidades` (`views.js:1000`) | `where`, `getById`, `insert`×2, `update`, `remove` | importação CSV vira lote |
| `risco` | `renderRisco` (`views.js:1138`) | `forComite`, `getById`, `insert`, `update`, `remove` | escrita pela API |
| `regulatorio` | `renderRegulatorio` (`views.js:1262`) | idem | escrita pela API |
| `comite` | `renderComite` (`comite.js:4`) | `getActiveComite`×3, `forComite`×8, `getEmpreendimentos` | somente leitura |
| `backup` | `renderBackup` (`views.js:1392`) | `exportAll`, `importAll` | **os dois viram assíncronos** |
| barra lateral | `populateMonthSelector` (`utils.js:114`) | `getComites`, `getActiveComite`, `setActiveComite` | troca de mês recarrega da API |
| Monday | `monday-sync.js` | `insert`×6, `remove`×5, `forComite`×5, `update`×2 | passa a usar lote |
| semente | `seed.js` | `insert`×11, `getAll`, `setActiveComite` | **desativado**: dado demonstrativo não pode ser apresentado como real |

---

## 4. Decisões que a inversão obriga a tomar

1. **`seedIfEmpty` é desativado.** Regra do produto: "nenhum dado demonstrativo
   apresentado como real". Semear a base pela interface, sem marcação de
   proveniência, viola isso. Banco vazio passa a mostrar o estado **sem dados**
   com o caminho para criar o primeiro comitê. Os dados de exemplo continuam
   disponíveis pela migração, marcados como `demonstrativo = true`.

2. **`POST /api/db` (dump inteiro) é aposentado.** Substituído por operações por
   registro, com versão. Enquanto existir, é ele que permite última-gravação-vence.

3. **Exclusão passa a ser lógica.** `ausente_desde` já existe em todas as tabelas
   de negócio; a interface só precisa deixar de ver.

4. **Concorrência por `versao`.** Coluna `versao integer` criada na migração 013,
   incrementada pelo mesmo gatilho que já mantém a trilha. `PATCH` sem versão,
   ou com versão vencida, responde **409** com o registro atual do servidor no
   corpo, para a tela poder comparar.

5. **O frontend não decide permissão.** O cache só contém o que a sessão pode
   ver; 401, 403, 404 e 409 têm tratamento distinto e mensagem própria.

---

## 5. Riscos remanescentes após a inversão

| Risco | Gravidade | Mitigação |
| --- | --- | --- |
| `views.js` mostra "salvo!" antes da confirmação do servidor | média | o adaptador exibe o estado real e desfaz em falha; o toast otimista fica visualmente superado pelo estado de erro |
| `exportAll` e `importAll` mudam de assinatura | baixa | únicos dois pontos ajustados em `views.js`; tela de backup é reescrita em B14 |
| Troca de mês passa a depender da rede | baixa | estado `carregando` explícito; falha mantém o mês anterior em vista |
| Escopo de empreendimento reduz o que alguns perfis viam | baixa | é a correção pretendida; documentado para não ser lido como perda de dados |
| Sem conexão, não há operação de escrita | média | recusa explícita com estado `sem conexão`; nada é enfileirado às escondidas nem dado como concluído |
