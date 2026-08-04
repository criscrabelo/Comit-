# Inventário do localStorage — antes da migração

Levantamento feito lendo o código, não por suposição. Três bases foram
inspecionadas, porque as chaves não estão todas no mesmo lugar.

---

## Observação importante sobre o escopo

Sua lista de módulos a inspecionar inclui **diário, tarefas, metas, PDI,
feedbacks, recompensas, usuários simulados, pautas, decisões e planos de ação**.

Esses módulos **não existem no frontend em produção** deste repositório. Eles
existem nos protótipos React do Claude Design, que são artefatos de design e
não estão implantados. As chaves deles estão inventariadas abaixo na classe
**5 — revisão**, mas migrá-las agora seria migrar dados que nenhum usuário
possui.

O que existe hoje, em produção, são as 11 tabelas de negócio do módulo
jurídico/comitês.

---

## Classe 1 — Migrar para PostgreSQL

Dados de negócio. Prefixo `jur_comite_`, gravados por `js/db.js:23`.

| Chave | Módulo | Conteúdo | Pessoal/sensível | Demonstrativo | Destino | Estratégia | Deduplicação | Excluível | Risco |
|---|---|---|---|:--:|---|---|---|:--:|---|
| `jur_comite_comites` | Comitê | competências e comitês mensais | não | sim (seed) | `competencias` + `comites` | upsert por `ref` | `ref` (YYYY-MM) | após confirmar | **baixo** |
| `jur_comite_empreendimentos` | Cadastro | nome, tipo, cidade, status | não | sim (8 IDs fixos) | `empreendimentos` | upsert por `nome_normalizado` | nome normalizado | após confirmar | **médio** — nomes divergentes podem fundir ativos |
| `jur_comite_processos` | Jurídico | processo, cliente, valor da causa, situação | **sim** — nome de cliente | sim | `processos_judiciais` | upsert por `(migracao, id)` | `id` do registro local | após confirmar | **alto** — dado jurídico |
| `jur_comite_notificacoes` | Jurídico | cliente, unidade, estágio, datas | **sim** — nome, unidade | sim | `notificacoes` | upsert por `(migracao, id)` | `id` do registro local | após confirmar | **alto** |
| `jur_comite_distratos` | Jurídico | cliente, unidade, motivo, datas | **sim** | sim | `distratos` (categoria distrato/desistência) | upsert por `(migracao, id)` | `id` do registro local | após confirmar | **alto** |
| `jur_comite_retomadas` | Jurídico | cliente, unidade, motivo | **sim** | sim | `distratos` (categoria retomada) | upsert por `(migracao, id)` | `id` do registro local | após confirmar | **alto** |
| `jur_comite_contratos` | Jurídico | contratos e situação | **sim** — nome, contrato | sim | `contratos` | upsert por `(migracao, id)` | `numero_normalizado` quando houver | após confirmar | **alto** |
| `jur_comite_unidades` | Cadastro | torre, bloco, unidade, prazos | não | sim | `unidades` | upsert por `(empr, torre, bloco, unidade)` | chave composta | após confirmar | **médio** |
| `jur_comite_fatos` | Comitê | fatos relevantes redigidos à mão | possível — texto livre | sim | `fatos` | upsert por `(migracao, id)` | `id` do registro local | após confirmar | **médio** — conteúdo autoral, não recriável |
| `jur_comite_riscos` | Comitê | cronograma, riscos, renegociação | possível — texto livre | sim | `riscos` | upsert por `(migracao, id)` | `id` do registro local | após confirmar | **médio** — autoral |
| `jur_comite_regulatorios` | Comitê | legislação, checklist | não | sim | `regulatorios` | upsert por `(migracao, id)` | `id` do registro local | após confirmar | **baixo** |

**Todas** recebem `fonte = 'migracao'` e `id_origem = 'localstorage:<chave>:<id>'`.

## Classe 2 — Manter localmente como preferência

| Chave atual | Conteúdo | Sensível | Chave nova | Por quê |
|---|---|:--:|---|---|
| `jur_comite_active_comite` | ID do comitê selecionado | não | `patrono.pref.v1.comite_ativo` | É "última visualização utilizada". Não é dado de negócio: se perder, a pessoa escolhe de novo |

Preferências passam a usar prefixo e versão padronizados: **`patrono.pref.v1.`**

Só entram aqui: menu recolhido, tema, aba selecionada, densidade de tabela e
última visualização. Nenhuma preferência pode conter CPF/CNPJ, nome de cliente,
valor financeiro, situação jurídica ou credencial — há teste que falha se
alguém tentar.

## Classe 3 — Excluir definitivamente

| Chave | Conteúdo | Situação |
|---|---|---|
| `jur_monday_token` | token pessoal do Monday | **já removido** na Etapa 1. A limpeza roda na carga da página e apaga de `localStorage` e `sessionStorage` |
| `monday_token`, `jur_token_monday` | variantes de versões anteriores | idem — incluídas na limpeza por precaução |

## Classe 4 — Cache recriável, ignorar

Nenhuma chave nesta classe no frontend em produção.

O espelho do servidor (`db.json` / Gist, via `js/db.js:30-42`) funciona como
cache, mas não é uma chave de `localStorage` — é o arquivo do servidor legado, e
sai com a virada da fonte da verdade.

## Classe 5 — Encaminhar para revisão

Chaves dos **protótipos React do Claude Design**. Não estão implantadas; nenhum
usuário possui esses dados hoje. Inventariadas para que a decisão seja
consciente quando esses módulos forem construídos.

| Chave | Módulo | Pessoal | Destino provável |
|---|---|:--:|---|
| `patrono_diarios_v1` | Diário do Dia | **sim** — texto pessoal do colaborador | tabela própria, com escopo por autor |
| `patrono_feedbacks_v1` | Feedback | **sim** — avaliação nominal | tabela própria, acesso restrito |
| `patrono_recompensas_v1` | Recompensas | sim | tabela própria |
| `patrono_usuarios_v1` | Usuários simulados | **sim** | **descartar** — o backend já tem `usuarios` de verdade |
| `patrono_departamentos_v1` | Departamentos | não | tabela de cadastro |
| `patrono_lembretes_v1` | Lembretes | possível | tabela própria |
| `patrono_tickets_v1` | Suporte | possível | tabela própria |
| `patrono_ia_chats_v1` | IA | **sim** — conversas | fora do escopo da Fase 1 |
| `patrono_modulos_v1` | Configuração | não | tabela de configuração |
| `patrono_plano_v1` | Plano comercial | não | fora do escopo (cobrança comercial) |
| `patrono_brand_overrides_v1` | White-label | não | fora do escopo |
| `patrono_regulatorio_check_v1` | Regulatório | não | juntar a `regulatorios` |
| `patrono_setup_done_v1` | Onboarding | não | **preferência** |
| `patrono_onboarding_colab_v1` | Onboarding | não | **preferência** |
| `patrono_onboarding_dismissed_v1` | Onboarding | não | **preferência** |
| `patrono_trial_banner_dismissed_v1` | Comercial | não | **preferência** |

**Recomendação:** quando esses módulos forem implementados, nascer já falando
com o backend. Não replicar o padrão de guardar dado de negócio no navegador.

---

## Dados demonstrativos

`js/seed.js` (190 linhas) insere dados fictícios **nas mesmas tabelas** dos
dados reais, sem marcação. Identificados pelos IDs fixos:

`e_alencar` · `e_carpe` · `e_coevo` · `e_jp` · `e_js` · `e_moratta` · `e_pe` ·
`e_tetus` · `risco_jp_abc`

Na migração, registros com esses IDs entram com **`demonstrativo = true`**.
Nunca se misturam a dado real, e a interface pode marcá-los.

## Resumo

| Classe | Chaves | Ação |
|---|---:|---|
| 1 — Migrar | 11 | para PostgreSQL, com proveniência |
| 2 — Preferência local | 1 | renomeada para `patrono.pref.v1.` |
| 3 — Excluir | 3 | já removidas na Etapa 1 |
| 4 — Cache | 0 | — |
| 5 — Revisão | 16 | protótipos, não implantados |

**Risco mais alto:** as cinco chaves jurídicas (`processos`, `notificacoes`,
`distratos`, `retomadas`, `contratos`) contêm nome de cliente e dado jurídico. A
migração as trata como dado pessoal: entram no banco, saem do navegador, e o
acesso passa a depender de perfil e escopo.
