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

### Produção: mesma origem, sem servidor legado — resolvido

O backend passou a servir a interface (`@fastify/static`, lista fechada de
caminhos). Frontend e API são a mesma origem por construção, o que também é
pré-requisito do cookie de sessão `SameSite=Strict`.

Verificado em Chromium real (`docs/evidencias/inversao-fonte-verdade.txt`):
nenhuma requisição ao `server.js` legado, ao Gist ou a `api.monday.com`.

Continua pendente para a implantação:

- `CORS_ORIGINS` com a lista explícita do domínio de produção — a configuração
  já recusa `*` fora de development;
- `DATABASE_URL` com `sslmode=require`.

### Ingestão do Monday não validada contra a API real

Cliente, transformações e persistência têm testes, mas a leitura ponta a ponta
só se confirma com token real. Previsto para a homologação controlada do quadro
Processos Judiciais.


---

## Inversão da fonte da verdade no frontend

Decisões tomadas ao apontar `js/db.js` para a API. Registradas aqui porque
mudam comportamento visível e não são reversíveis sem nova decisão.

### 1. `seed.js` foi removido

Semeava treze fatos, oito notificações, treze processos e mais, direto pela
interface, sem marcação de origem. Uma vez que a fonte da verdade é o banco,
esses registros entrariam como dado real de abril de 2026.

A regra do produto é explícita: *nenhum dado demonstrativo apresentado como
real*. Banco vazio passa a mostrar o estado **sem dados**, com o caminho para
criar o primeiro comitê. Os dados de exemplo continuam disponíveis pelo fluxo
de migração, que os marca `demonstrativo = true` e nunca os mistura ao real.

### 2. Exclusão pela interface passou a ser lógica

`DELETE` marca `ausente_desde`; o registro sai das listagens e permanece no
banco, com trilha. Não há exclusão física pela API — uma tela não deve
conseguir destruir histórico.

Consequência: o botão "Limpar Todos os Dados" da tela de Backup foi desativado.
Ele removia chaves do navegador, o que hoje não apagaria nada de verdade e daria
a impressão contrária. Exclusão em massa exige registro de quem pediu, quando e
por quê, com backup verificado antes — tratado em B14.

### 3. Concorrência por `versao`, não por "último a gravar vence"

Coluna `versao` em todas as tabelas de negócio, incrementada pelo mesmo gatilho
que mantém a trilha — e só quando algum campo muda de fato, para que reenviar o
mesmo valor não invalide a versão de ninguém.

`PATCH` sem versão, ou com versão vencida, responde **409** com o registro atual
do servidor no corpo, para a tela poder comparar. O `UPDATE` ainda carrega
`WHERE versao = ?`: se outra transação alterar entre a leitura e a escrita, a
linha não é encontrada e a gravação não acontece.

### 4. Sessão em cookie `httpOnly`

A regra é *nenhuma credencial no navegador*. Guardar o token em `localStorage`
ou `sessionStorage` o deixaria ao alcance de qualquer script da página.

O servidor emite `patrono_sessao` com `HttpOnly`, `SameSite=Strict` e `Secure`
em produção. O `Authorization: Bearer` continua valendo para integrações e
testes. Contra CSRF, além do `SameSite`, escritas autenticadas por cookie exigem
o cabeçalho `X-Patrono-App: 1` — que um formulário hospedado em outro site não
consegue definir.

Sem dependência nova: montar e ler um cookie são dez linhas em
`src/auth/cookie.ts`.

### 5. Migrar o próprio navegador não é ato administrativo

A migração exigia `administracao`. Quem tem dado de versão anterior no navegador
é quem usava a plataforma — a gestora, o líder —, não o administrador. Com a
regra antiga o dado ficaria preso no navegador de quem não podia migrá-lo.

Passou a exigir `administracao` **ou** `juridico:criar`. Colaborador e convidado
continuam recusados, porque a migração grava em tabela compartilhada. A
propriedade do dump continua garantida no serviço, que filtra por usuário.

### 6. `date` do PostgreSQL passa a chegar como texto

O driver devolvia `date` como `Date`, interpretado no fuso do processo. Um prazo
de habite-se em `2026-12-31` virava `2026-12-30` a oeste de Greenwich: o dia
mudava por causa do fuso do servidor. O parser foi fixado para manter a string —
que é o que `db/schema.ts` já declarava.

### 7. `exportAll` e `importAll` viraram assíncronos

São os dois únicos métodos de `DB` cuja assinatura mudou. O navegador não tem
mais a base inteira para serializar: o dump vem do servidor, com autorização
aplicada e exportação registrada na trilha. A restauração passa pelo fluxo de
migração, que classifica, versiona e audita.

### Backlog acrescentado — aprovado em 04/08/2026

Cinco pendências registradas na aprovação da inversão. Nenhuma bloqueia B14.

1. **Retirar o toast otimista.** `views.js` anuncia "salvo!" antes da resposta
   da API. O adaptador desfaz a alteração e mostra o erro por cima, mas a
   mensagem prematura aparece primeiro. Exibir sucesso somente após a
   confirmação exige tornar as funções `save*` assíncronas — 10 pontos em
   `views.js`.
2. **Indicação visual de sincronização parcial.** A carga inicial já informa
   quais entidades foram truncadas em 500 registros e o estado
   `sincronizacao_parcial` existe no adaptador; nenhuma tela o desenha.
3. **Índice para o filtro por responsável.** Nenhuma tabela da Fase 1 tem
   coluna de responsável: a informação vive no Monday e chega em
   `valor_original`. A busca por texto no dado bruto é correta, mas não usa
   índice. Rever quando houver coluna própria — ou criar índice GIN sobre o
   jsonb, se o filtro se tornar frequente antes disso.
4. **Empacotar Chart.js localmente.** Hoje vem de CDN; onde a rede externa está
   bloqueada os gráficos não desenham (13 ocorrências registradas na evidência
   da inversão).
5. **`CORS_ORIGINS` e `sslmode=require` na implantação.** A configuração já
   recusa `*` fora de development e exige a lista em produção; falta preencher
   com o domínio real e exigir TLS no `DATABASE_URL`.


---

## B14 — Backup e restauração

### 1. Módulo `sistema`, e não `administracao`

Backup e restauração não cabem em `administracao`. Administrar a base é uma
coisa; poder levar a base inteira embora num arquivo, ou substituí-la por outra,
é outra. Separar permite conceder uma sem a outra — e permite que a Gestora
consulte o estado da continuidade sem poder restaurar nada.

Restaurar e baixar exigem **perfil Administrador além da permissão**. Permissão
é concedível por exceção de usuário; o perfil é uma segunda barreira,
deliberada: substituir a base não deve depender de uma única linha numa tabela.

### 2. Dump lógico, não físico

`pg_dump -Fc` é restaurável em outra versão do PostgreSQL e em outra máquina, e
permite restaurar num banco isolado ao lado do vivo — que é o que o procedimento
exige antes de tocar em produção. O backup físico (`pg_basebackup` + WAL) é mais
rápido em bases grandes e permite recuperação a ponto no tempo, mas amarra a
restauração à mesma versão maior e exige acesso ao sistema de arquivos do
servidor.

**WAL não foi implementado**, e a razão é honesta: o arquivamento de WAL é
configuração do *servidor* PostgreSQL, não da aplicação. Ligá-lo pelo código
daria a impressão de um recurso que só funciona se a infraestrutura cooperar.
O caminho está documentado em `docs/BACKUP-RESTAURACAO.md`, seção 8, e o
relatório de continuidade alerta quando o intervalo entre backups passa de 48h.

### 3. AES-256-GCM, e sem backup em claro

O GCM autentica além de cifrar: um arquivo adulterado não decifra, ele **falha**.
Com um modo sem autenticação, bytes trocados produziriam lixo plausível e a
restauração seguiria adiante com dado corrompido.

Sem `BACKUP_CHAVE` **nenhum backup é gerado**. Gravar a base em claro seria pior
do que não gravar: o dump contém CPF, contrato, valor e situação jurídica de
clientes reais, sem nenhum controle de acesso próprio.

Contrapartida registrada: perder a chave torna todos os backups irrecuperáveis.

### 4. Dois checksums

`checksum` é do arquivo cifrado — verificável **sem a chave**, detecta corrupção
em repouso. `checksum_claro` é do dump antes de cifrar — só verificável na
restauração, prova que a decifragem devolveu byte a byte o que o `pg_dump`
gerou.

### 5. A restauração recria o schema, e não usa `--clean`

`pg_restore --clean` derruba objeto por objeto e **esbarra em tabela
particionada**: `fotografias_diarias` e `registros_brutos` têm restrição herdada
pelas partições, e o PostgreSQL recusa derrubá-la isoladamente
(`cannot drop inherited constraint`). A restauração morria no meio — descoberto
pelo teste, não em produção.

Solução: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` seguido do SQL do
dump, numa **única transação do `psql`**. Mais fiel (não sobra objeto do estado
anterior) e atômico: uma restauração interrompida não deixa a base pela metade.

### 6. O catálogo sobrevive à restauração que ele descreve

Restaurar sobre o banco em uso substitui **também** a tabela `backups`. Sem
tratamento, o registro do backup preventivo — a única volta possível —
desapareceria junto, e a restauração não deixaria rastro de si mesma.

As linhas do backup restaurado, do preventivo e da própria restauração são
reinseridas depois do restore, capturadas **antes** dele. A primeira versão lia
o catálogo depois e encontrava vazio.

### 7. Três travas contra exclusão acidental

Aplicadas nesta ordem: backup protegido nunca sai; nada é expurgado antes da
retenção mínima; o expurgo para antes de deixar menos que o mínimo de
recuperáveis. Backups `preventivo` e `pre_migracao` nascem protegidos.

**Backup corrompido não é expurgado automaticamente**: é a evidência de um
problema de armazenamento que alguém precisa olhar. **O metadado sobrevive ao
expurgo**: saber que existiu um backup daquele dia, e que foi removido pela
política, faz parte da trilha.

### 8. Retenção operacional ≠ retenção histórica

A política de retenção (14 diários, 8 semanais, 12 mensais, mínimo de 30 dias)
existe para **recuperação e continuidade**. Não é o mecanismo de guarda dos 20
anos: o dado histórico permanece no banco — `fotografias_diarias` particionada,
`registros_brutos`, `historico` append-only, `logs_auditoria` imutável — e nos
arquivos oficiais de cada competência.

### 9. Milissegundos no rótulo do backup

Dois backups podem nascer no mesmo segundo: uma restauração gera o preventivo e,
logo em seguida, outro backup. Sem milissegundos, o índice único do rótulo
derrubava a operação inteira.

### Backlog acrescentado

1. **Rotina periódica de verificação de checksum** — hoje é sob demanda.
2. **Adaptador de armazenamento em nuvem** (S3/GCS/Azure) — a interface está
   isolada em `servico.ts`; falta o adaptador.
3. **WAL e recuperação a ponto no tempo** — configuração de servidor.
4. **Backup de anexos** — quando a plataforma passar a armazenar arquivos.
   Hoje nenhuma tela faz upload e nenhuma tabela guarda caminho de arquivo.
5. **Teste de restauração agendado** — um ensaio mensal automático em banco
   isolado transformaria "temos backup" em "sabemos que o backup funciona", sem
   depender de disciplina.


---

## B15 — Requisitos obrigatórios antes da produção

Sete requisitos registrados na aprovação de B14. Quatro viraram código; três
dependem da Coevo. Detalhe operacional em `docs/BACKUP-RESTAURACAO.md`, seção
10b.

### Por que quatro deles não ficaram só no documento

Registrar como "obrigatório" algo que o sistema continua permitindo não é
registrar — é adiar. Os requisitos 1 e 2 descreviam exatamente o que o código
fazia de errado: `DROP SCHEMA` direto no banco vivo, sem ensaio prévio e sem
estado anterior preservado. Ficaram como trava, verificada pelo servidor **e**
pelo `CHECK` do banco.

### 1 e 2 — corte com ensaio e rollback

A restauração em produção deixou de destruir e passou a **renomear**:
`ALTER SCHEMA public RENAME TO antes_<carimbo>`. O estado anterior fica no mesmo
banco, íntegro, e o rollback vira um `ALTER SCHEMA` — sem depender de restaurar
arquivo, e sem a janela em que não existe volta.

O corte exige, além do que já existia: **ensaio isolado com status `concluida`
nas últimas 72 horas** do mesmo backup, e **plano de corte declarado**.
`concluida_com_ressalvas` não serve como ensaio: se a conferência divergiu no
banco isolado, divergirá no de produção.

### Dois problemas que só apareceram ao implementar

**As extensões acompanham o rename.** `citext` e `pgcrypto` moram em `public`;
renomear o schema as leva junto, e o `CREATE EXTENSION IF NOT EXISTS` do dump
vira no-op. A restauração morria em `type public.citext does not exist`. São
trazidas de volta logo após o rename — colunas e defaults referenciam tipo e
função por OID, que acompanha a mudança de schema.

**O registro do ensaio some com o restore.** `ensaio_id` aponta para uma linha
de `restauracoes` que a própria restauração substitui. Sem reinseri-la, a
operação falharia *depois* de já ter trocado o banco.

**`pg_dump` exclui os schemas preservados por exclusão, não por `--schema
public`.** Restringir a um schema faz o `pg_dump` omitir `CREATE EXTENSION`, e o
banco restaurado ficaria sem `gen_random_uuid()` em toda chave primária.

### 5 — verificação periódica e ensaio amostral

`src/backup/vigilancia.ts`, disparado pelo agendador após o backup do dia:
checksum de todos os backups **diariamente**; ensaio real de restauração em
banco isolado **aos domingos**. O ensaio escolhe o backup mais antigo ainda não
testado — o recente costuma estar bom; quem se degrada em repouso é o que está
há mais tempo no disco. Divergência mantém o banco do ensaio de pé para
investigação.

### 6 — alerta de backup agendado não concluído

A janela do dia é **aberta antes** da tentativa e só fecha quando o backup
conclui. Janela aberta e vencida vira alerta no relatório de continuidade. O
estado vive no banco: reiniciar o servidor não apaga a memória de que a janela
de ontem ficou aberta.

### 3, 4 e 7 — pendentes

- **Chave em cofre** (3): depende da Coevo. Inclui **teste de recuperação** —
  recuperar a chave do cofre e restaurar um backup com ela, sem consultar o
  ambiente de produção. Sem esse teste, a cópia de emergência é suposição.
- **Armazenamento externo** (4): a interface está isolada; falta o adaptador.
- **Contatos de emergência** (7): três papéis a preencher. Enquanto vazios, o
  procedimento de emergência não tem a quem escalar.

Os requisitos 3 e 7 **bloqueiam a ida para produção** e não podem ser resolvidos
deste lado.
