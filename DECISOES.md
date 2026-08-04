# Decisões técnicas da Fase 1

Registro das decisões tomadas durante a implementação da fundação técnica, para
que possam ser contestadas e revertidas com contexto. Cada item traz o motivo e
o que muda se a decisão for outra.

Plano completo da Fase 1, com diagnóstico e diagramas:
<https://claude.ai/code/artifact/0d2b9ad1-017b-41ac-9370-b3c549aeb429>

---

## Pendência que não depende de mim

**Revogar o token do GitHub exposto.** O arquivo
`Redesign_Plataforma_Comites_Juridicos.zip → uploads/plataforma-comites-design/koyeb.yaml`
continha, em texto puro, um token OAuth ativo (prefixo `gho_`) e o
`GITHUB_GIST_ID` do Gist usado como banco de dados. Revogar exige acesso às
configurações da conta GitHub, fora do alcance desta sessão.

Verificado: **o token não está neste repositório**, nem no código atual nem no
histórico de commits. A cópia que existia no ambiente de trabalho foi redigida.

Caminho: `github.com/settings/applications` → aba *Aplicativos OAuth
autorizados* → revogar. Depois da migração para PostgreSQL o Gist deixa de ser
usado como banco, o que encerra o risco pela raiz.

---

## Decisões de produto

### 1. Base de código oficial

**Decisão:** `criscrabelo/comit-` é a fonte da verdade para regras de negócio.

A auditoria encontrou três bases divergentes. A de produção tem regras que o
code-drop paralelo perdeu: separação Distrato × Desistência
(`js/comite.js:13`), board próprio de Retomadas (`18413057491`), leitura de
colunas *mirror* e *formula* do Monday, painel de estágio de notificações. O
code-drop tem autenticação e os módulos de Honorários, que a produção não tem.

O backend é construído como camada independente. A autenticação e os módulos de
Honorários são reescritos sobre ele; as regras de negócio vêm da produção.
Nenhuma das duas perde funcionalidade.

**Se for outra:** adotar o code-drop como base regride quatro regras de negócio
já corrigidas. Seria preciso reimplementá-las.

### 2. Retomadas — dois boards

**Decisão:** ler os dois (`18404493605` e `18413057491`), deduplicar por
`id_origem` e registrar qualquer sobreposição como inconsistência.

A produção usa dois boards separados; o `HANDOFF-MONDAY.md` e o protótipo usam
apenas o primeiro, separando por título do grupo. Escolher um caminho só
perderia registros ou contaria em duplicidade. Lendo os dois com deduplicação,
nenhum registro se perde e a sobreposição fica visível para revisão humana.

### 3. Escopo da plataforma

**Decisão:** uma plataforma, dois domínios — Pessoas e Jurídico — no mesmo
banco, separados por módulo na autorização.

O `Patrono_Alta_Performance_Descricao.docx` descreve gestão de pessoas (Diário
do Dia, PDI, feedback, recompensas) e aponta para o repositório
`plataforma-comites`; o código deste repositório é o módulo jurídico. A
arquitetura do Claude Design já desenha as duas coisas como áreas da mesma
navegação. O tipo `modulo_plataforma` contempla ambos.

### 4. CVCRM

**Decisão:** modelo de dados preparado, conector não implementado.

O tipo `fonte_dado` inclui `cvcrm` e a tabela `reservas` existe, mas nenhum
conector é escrito nesta fase — CVCRM não está no escopo da Fase 1.

### 5. Onde o banco roda

**Decisão:** definido por `DATABASE_URL`, sem provisionamento nesta fase.

A retenção mínima de 20 anos não é compatível com banco em disco efêmero de
contêiner. A recomendação é PostgreSQL gerenciado com backup automático e
recuperação a um ponto no tempo. O backend não depende de qual provedor.

---

## Desvios em relação ao plano aprovado

Registrados porque o plano dizia outra coisa.

### Hash de senha: scrypt em vez de Argon2id

O plano indicava Argon2id. As implementações em Node exigem compilação nativa,
que é um risco de instalação no ambiente da Coevo. `scrypt` vem na biblioteca
padrão do Node, é memory-hard e não precisa compilar nada.

O algoritmo fica **declarado no próprio registro** (`usuarios.algoritmo_senha`),
então migrar para Argon2id depois é trocar a função de verificação e reidratar o
hash no próximo login de cada pessoa — sem migração destrutiva.

#### Parâmetros de segurança adotados

Implementação em `server/src/auth/senha.ts`.

| Parâmetro | Valor | Por quê |
|---|---|---|
| Algoritmo | `scrypt` (RFC 7914), via `node:crypto` | Memory-hard; sem dependência nativa |
| `N` (custo de CPU/memória) | `32768` (2¹⁵) | ~32 MB por verificação, ~100 ms em servidor comum. Torna ataque por GPU caro sem inviabilizar o login |
| `r` (tamanho do bloco) | `8` | Valor de referência da RFC 7914 |
| `p` (paralelismo) | `1` | Recomendado quando `N` já é alto; aumentar `p` não acrescenta resistência aqui |
| `maxmem` | `256 × N × r` (128 MB) | O mínimo exigido é `128 × N × r`; a folga de 2× evita falha por limite em ambiente com memória contada |
| Tamanho do hash derivado | `32` bytes | 256 bits |

**Salt**

- **16 bytes (128 bits)**, gerado por `crypto.randomBytes` — CSPRNG do sistema
  operacional.
- **Único por senha.** Gerado a cada `gerarHashSenha`, inclusive quando a mesma
  pessoa troca para uma senha que já usou antes. Duas contas com senhas
  idênticas produzem hashes diferentes, o que inviabiliza tabela pré-computada.
- **Armazenado junto ao hash**, em base64, dentro do próprio valor. Não existe
  coluna separada de salt nem salt global — um salt compartilhado anularia o
  propósito.

**Formato armazenado em `usuarios.hash_senha`**

```
scrypt$32768$8$1$<salt-base64>$<hash-base64>
```

Os parâmetros viajam com o hash de propósito: a verificação lê o custo do
próprio registro, em vez de assumir o custo atual do código. É isso que permite
endurecer o custo no futuro sem invalidar as senhas já cadastradas.

**Política de atualização do hash (rehash)**

1. No login bem-sucedido, `verificarSenha` compara os parâmetros gravados com os
   parâmetros atuais do código.
2. Se diferirem, devolve `precisaRehash = true` e a rota de login regrava o hash
   com os parâmetros novos — de forma transparente, **sem pedir a senha de novo**
   e sem derrubar a sessão.
3. Trocar `N`, `r` ou `p` no código é, portanto, suficiente: a base migra sozinha
   conforme as pessoas entram.
4. Quem não fizer login continua com o hash antigo, que permanece válido. Não há
   invalidação em massa nem expiração forçada de senha.
5. A mesma mecânica cobre a troca de algoritmo: o prefixo `scrypt` no valor
   permite adicionar um verificador `argon2id` e migrar por login, sem migração
   destrutiva.

**Comparação em tempo constante**

`timingSafeEqual` compara o hash derivado com o armazenado. Comparação com `===`
vazaria informação pelo tempo de resposta.

**Defesa contra enumeração de usuário**

Quando o usuário não existe, `consumirTempoVerificacao` executa um scrypt
descartável com os mesmos parâmetros, para que o tempo de resposta de "usuário
inexistente" seja indistinguível de "senha errada". A mensagem devolvida também
é idêntica nos dois casos.

**Força mínima exigida**

12 caracteres, no mínimo 5 caracteres distintos, sem espaço nas pontas, máximo
256 caracteres. O comprimento é priorizado sobre composição obrigatória de
caracteres, porque é o fator que mais encarece o ataque.

### `valor_original` renomeado no financeiro

Colisão real de nomes. `valor_original` é coluna de proveniência (o payload cru
da fonte, conforme `schemas/base-consolidada.schema.json`) **e** campo financeiro
do Sienge (valor original do título/parcela).

A proveniência mantém `valor_original`, porque o nome vem do schema da skill. O
campo financeiro passou a `valor_nominal`, com comentário mapeando para o "valor
original" do Sienge. Nenhum dado é perdido; muda apenas o nome da coluna.

### Três tipos de inconsistência acrescentados

`schemas/inconsistencias.schema.json` define 17 tipos, e nenhum deles cobre a
divergência **Monday × Sienge** — que é justamente o caso desenhado na seção
`3d` do Diagnóstico e Wireframes (contrato C-1042, R$ 64.000 do Monday contra
R$ 66.071 do Sienge). O schema tem `conflito_monday_cvcrm` e
`conflito_cvcrm_sienge`, mas não o par que a Fase 1 realmente integra.

Acrescentados e marcados com `[EXT]` na migração:

| Tipo | Por quê |
|---|---|
| `conflito_monday_sienge` | o caso central de divergência financeira da Fase 1 |
| `divergencia_valor` | divergência genérica preservando os dois lados |
| `falha_importacao` | fonte falhou; último dado válido preservado |

---

## Regras impostas pelo banco, não por convenção

Verificadas por execução contra PostgreSQL 16 real.

| Regra obrigatória | Como é imposta |
|---|---|
| Indicadores de posição não somam entre dias | `agregar_indicador()` levanta exceção ao somar posição |
| Reprocessamento cria nova versão | `ux_fotografia_versao` + `CHECK` que exige motivo a partir da versão 2 |
| Fotografia não se apaga | gatilho `tg_fotografia_sem_exclusao` |
| Importação idempotente | `UNIQUE (fonte, id_origem)` em toda tabela de negócio |
| Carteira deduplicada | `UNIQUE (empresa, empreendimento_id, data_referencia, tipo)` |
| Saldo não duplica entre notificações | `UNIQUE (contrato_id, data_referencia)` em `saldos_financeiros` |
| Toda alteração é auditável | gatilho `registrar_alteracao()` acumula em `historico` (append-only) |
| Trilha de auditoria é imutável | `UPDATE`/`DELETE` bloqueados em `logs_auditoria` |
| Área bruta é imutável | `UPDATE`/`DELETE` bloqueados em `registros_brutos` |
| Sem dado nunca é zero | `CHECK indicador_valor_ou_motivo` exige valor ou motivo declarado |
| CPF/CNPJ inválido não vincula | índice único só sobre documento com `cpf_cnpj_valido = true` |
| Sem percentual aprovado não há PDD financeira | tabela `percentuais_perda` exige `aprovado_por` e `aprovado_em` |
| Falha não apaga dado válido | `ausente_desde` marca; nenhuma rotina de carga executa `DELETE` |
| Integração é somente leitura | `CHECK (modo = 'leitura')` em `integracoes` |
| Prazo de acesso só para convidado | `CHECK prazo_so_para_convidado` em `usuarios` |
| CORS nunca aberto fora de dev | `src/config.ts` recusa `*` e exige lista de origens |

---

## Backlog técnico registrado

Itens identificados durante a construção, ainda não executados.

### Chart.js por CDN → dependência local

`index.html` carrega `chart.js@4.4.1` de `cdn.jsdelivr.net`. Três problemas:

1. **Disponibilidade** — a plataforma para de renderizar gráficos se o CDN
   estiver fora do ar ou bloqueado pela rede da Coevo. Já acontece no ambiente
   de desenvolvimento desta sessão, onde o proxy bloqueia CDNs externos.
2. **Integridade** — sem `subresource integrity`, uma alteração no CDN executa
   código arbitrário na página que exibe dado de cliente.
3. **Privacidade** — cada carregamento informa a um terceiro que alguém da Coevo
   abriu a plataforma.

**Encaminhamento:** empacotar a biblioteca junto à aplicação e servir da mesma
origem. Enquanto não for feito, os gráficos dependem de rede externa.

### Produção: mesma origem, sem servidor legado

A implantação precisa comprovar, antes de subir:

- frontend e backend na **mesma origem**, com `/api` encaminhado ao backend
  (hoje o backend não serve os estáticos, e o frontend legado responde 404 em
  `/api/monday/*` quando servido isoladamente);
- `CORS_ORIGINS` com a lista explícita do domínio de produção — a configuração
  já recusa `*` fora de development;
- nenhuma dependência do `server.js` legado nem do Gist do GitHub como banco;
- `DATABASE_URL` com `sslmode=require`.

### Ingestão do Monday não validada contra a API real

Cliente, transformações e persistência têm testes, mas a leitura ponta a ponta
só se confirma com token real. Previsto para a homologação controlada do quadro
Processos Judiciais.
