# Patrono Alta Performance — o que foi recebido e o que ele muda

Inventário do material enviado pela Cristiane em 06/08/2026, e o que ele altera
no plano do projeto. Existe porque o material chegou em **11 envios**, com
duplicatas, e sem este documento ninguém saberia o que é canônico.

---

## 1. O que é canônico

| Peça | Onde | Papel |
| --- | --- | --- |
| **Frontend Patrono** | `Patrono_Alta_Performance.zip` + `tweakspanel*.zip` | 37 `.jsx` distintos, **34 telas**, design system, marca white-label |
| **Documentação de produto** | `Documentacao_Claude_Design…docx` | 31 mil caracteres, 15 partes. Chegou 2× idêntica (a outra cópia é `brief-design.docx`) |
| **Descrição da plataforma** | `Patrono_Alta_Performance_Descricao.docx` | Stack, deploy, funcionalidades |
| **Diagnóstico e Wireframes** | `Diagnostico e Wireframes.html` | 90 KB — arquitetura, fluxos, wireframes |
| **Telas desenhadas** | `assets.zip` | **15 PNG**: login, home, diário, check-in, comitê, feedback, IA, relatórios, config, cobrança, planos, recompensas, mobile |
| **Skill de indicadores** | `tests.zip` | `references/`, `schemas/`, scripts Python. Já é a base do que foi construído |
| **Código legado** | `Redesign…zip` | A `plataforma-comites` original, com `fly.toml`, `Dockerfile`, `server.js` |

## 2. O que chegou quebrado ou vazio

- **10 arquivos `.napkin`** — todos vazios (`"objects": []`), todos com o mesmo
  carimbo de criação. A exportação não produziu conteúdo nenhum.
- **`Comites Juridicos - Patrono (offline).html`** (2,4 MB) — apesar do nome,
  **não abre sem internet**: busca o React em `unpkg.com`. Testado, falha.
- **2 dos 3 "`.html`" de vídeo** são **PNG** renomeados — quadros do vídeo.
- **Duplicatas:** `Patrono_Alta_Performance_Descricao.zip` chegou 2× idêntico;
  os PDFs de feedback são 3 documentos distintos em 5 arquivos.

---

## 3. Três descobertas que mudam o plano

### 3.1 Já existe onde a plataforma roda — Fly.io

`fly.toml` do pacote legado:

```toml
app = "plataforma-comites"
primary_region = "gru"          # São Paulo
[env] DB_PATH = "/data/db.json"
[[vm]] memory = "256mb"
[mounts] source = "comites_data" → /data
```

A pergunta "onde a plataforma vai morar", aberta há dias, **está respondida**:
conta e aplicação no Fly.io, região São Paulo.

O que roda lá hoje guarda tudo num `db.json` com 256 MB de RAM. Para o Patrono
com PostgreSQL é preciso provisionar o banco e trocar a configuração — trabalho
conhecido, não é pesquisa.

### 3.2 O handoff está desatualizado — os P0 já existem

`HANDOFF-CLAUDE-CODE.md` lista 5 itens "que destravam todo o resto":

| P0 do handoff | Situação real |
| --- | --- |
| 1. Persistência (sair do localStorage) | ✅ PostgreSQL, 64 tabelas |
| 2. Autenticação e permissões | ✅ 6 perfis, 4 dimensões, auditoria |
| 3. Proxy do Monday | ✅ token só no servidor, 7 quadros homologados |
| 4. Conector Sienge | ✅ pronto e desligado |
| 5. Origem em cada KPI | 🟡 proveniência existe; falta ligar ao `DsSeloFonte` |

O handoff foi escrito supondo que o backend não existia. **O trabalho não é
construir o backend — é ligar as 34 telas ao backend que já está pronto.**

### 3.3 Uma regra de carteira que NÃO está implementada

`CLAUDE.md` do pacote de Redesign:

> Carteira do painel exclui: trabalhista, comarca Lambari, natureza "Atraso na
> entrega", natureza "Cível" (mantém Execução Civil), e Tetus Locação.

O código exclui **grupos** (`TETUS LOCAÇÃO`, `CJ (REGRESSO)`, `CREDENTE`,
`LEONICE`, `GILMAR`, `DANILO`, `FGLASS/GRADFIBRA`), mas **não filtra** por
trabalhista, comarca Lambari nem pelas naturezas.

Isso muda quantos processos entram na carteira do painel — ou seja, **muda
indicador de comitê**. **Não foi aplicado**: depende de aprovação, pela mesma
regra que vale desde o começo.

Do mesmo arquivo, quatro rótulos de `MEU TRABALHO` que **não apareceram** nos
273 processos da homologação: `AG CITAÇÃO`, `AG PRAZO RECURSAL`,
`AG CUMPRIMENTO DE MANDADO`, `ATRASADO`. Ou não estão em uso, ou vão aparecer.
Rótulo novo já cai em revisão necessária, então não quebra nada.

---

## 4. A identidade visual

Tokens do `:root`, extraídos de `Patrono Alta Performance.html`:

| Token | Valor | Uso |
| --- | --- | --- |
| `--espresso` | `#2C1A0E` | barra lateral |
| `--accent` | `#B85C30` | ação primária |
| `--cream` | `#FAF7F2` | fundo |
| `--sev-critico` … `--sev-neutro` | 7 cores | **semânticas — não mudam no white-label** |

Tipografia: **Lora** (títulos) e **Plus Jakarta Sans** (texto).

A separação importa e está declarada no handoff: trocar a marca troca
`--espresso` e `--accent`; **não pode alterar o significado de "crítico"**.

---

## 5. Três problemas técnicos a resolver na integração

1. **React, ReactDOM e Babel vêm de CDN** (`unpkg.com`), e o JSX é compilado
   **no navegador**. Três dependências externas na página que exibe dado de
   cliente, e compilação em tempo de execução. Precisa ser empacotado local.
2. **Autenticação conflita.** `patrono-realdb.jsx` envia `Authorization: Bearer`
   lido do `localStorage`. O backend usa **cookie httpOnly**, que o navegador
   não consegue ler. A interface se adapta ao backend, não o contrário.
3. **Duas interfaces no mesmo repositório.** A SPA atual (`index.html` + `js/`)
   e o Patrono. É substituição, não soma.

---

## 6. Ordem de trabalho

1. **Patrono servido pelo backend** — mesma origem, login por cookie, telas do
   Jurídico lendo o PostgreSQL, Monday pelo proxy, React empacotado local.
2. **Publicação no Fly.io** com PostgreSQL de verdade.
3. **Gestão do Time** — Diário, Feedback, PDI, Desempenho. Exige tabelas novas.
4. **Comitê como fluxo, Modo Diretoria, IA, relatórios.**

## 7. O que ainda falta receber

- `video-scenes.jsx` — chegou como `video-social-scenes.jsx` em `assets.zip`;
  falta conferir se é o mesmo que os HTML de vídeo esperam.
- Nada mais é bloqueante.
