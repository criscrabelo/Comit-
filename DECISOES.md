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


---

## B16 — Preparação da homologação controlada do Monday

Quadro autorizado: `(JUR) PROCESSOS JUDICIAIS`, board 5959705266. Demais quadros
desligados. Detalhe em `docs/HOMOLOGACAO-MONDAY.md`.

### As duas execuções reais não foram feitas

`MONDAY_TOKEN` não está no ambiente, e não deve ser enviado por mensagem. Sem
ele não há como ler o board, e portanto não há como preencher as métricas com
números reais. Preencher com números do dublê e apresentá-los como homologação
seria exatamente o que a regra "nenhum dado demonstrativo apresentado como real"
proíbe.

Tudo o que não depende do token está pronto e provado. O runner
(`scripts/homologar-monday.ts`) recusa rodar sem token e recusa rodar se o
quadro configurado não for o 5959705266.

### A trava de escrita desceu para o transporte

`recusarEscrita` saiu da rota do proxy e foi para `cliente.ts`, dentro de
`consultar()` — a única função que fala com a API do Monday. Qualquer caminho
que chegue ao Monday passa por ali, inclusive código interno futuro que não use
a rota. A rota continua recusando também, antes de repassar.

### Dois defeitos que a prova 4 encontrou

**`versao` e `historico` inflavam a cada carga.** `extraido_em`, `execucao_id` e
`versao_regra` mudam a cada sincronização, e o gatilho da trilha os via como
alteração. Depois de trinta dias de carga diária, todo registro estaria na
versão 31 com trinta entradas de histórico dizendo apenas que a hora de extração
mudou — e o controle otimista de concorrência da interface passaria a recusar
edições legítimas, porque a versão teria avançado durante a noite sem ninguém
ter editado nada.

Migração 017: `versao` e `historico` descrevem o **conteúdo**. Metadado de carga
não conta. `valor_original` continua contando — se o payload da origem mudou, o
registro de origem mudou de fato.

**`atualizados` contava releitura como atualização.** O contador registrava toda
linha que passasse pelo caminho de conflito do upsert, ou seja, o conjunto
inteiro a cada re-sincronização. O relatório diria "31 atualizados" todo dia.
Agora `atualizados` conta o que mudou, e **`inalterados`** conta o que foi
reconhecido sem nada a alterar — que é a evidência direta da idempotência.

### O que NÃO foi alterado

A lista de termos de classificação de judicialização. O primeiro rascunho do
teste usou `JUDICIALIZADO` como rótulo de status, ele caiu em
`revisao_necessaria`, e a tentação seria acrescentar o termo à lista para o
teste passar. Não há nenhuma referência do projeto dizendo que esse é um rótulo
real do board — foi um valor que inventei.

Mexer numa regra de classificação com base num palpite sobre os dados do cliente
mudaria a taxa de judicialização, que é indicador de comitê. A amostra foi
trocada por um valor documentado (`ACAO AJUIZADA`, que casa com `ajuizad`), e
ficou registrado como limitação: os rótulos reais precisam ser conferidos na
primeira execução, e qualquer ajuste depende de aprovação.

### Métricas acrescentadas à execução

`paginas`, `ultimo_cursor`, `normalizados`, `data_referencia`,
`id_origem_escopo`, `ultimo_dado_valido_em` e `inalterados` — migrações 016 e
017. `ultimo_cursor = null` significa "leu até o fim"; preenchido significa
"parou no meio", e permite retomar sem reler.


---

## B16.1 — Rótulos reais, pré-confirmação e ensaio do runner

Continuação da preparação da homologação. `MONDAY_TOKEN` continua ausente do
ambiente deste processo; as duas execuções reais seguem pendentes.

### Nota sobre variável de ambiente e sessão

O processo do agente herda as variáveis no momento em que sobe. Uma variável
configurada depois só é vista por uma **sessão nova** — reiniciar o backend não
basta se o processo do agente continuar o mesmo. Registrado na documentação
para que a próxima tentativa não esbarre nisso de novo.

### Pré-confirmação antes de qualquer leitura

Os quatro itens são verificados e, falhando um, a carga não começa. Uma
verificação depois da carga não é verificação: é constatação.

O quarto item — "nenhuma mutation ou subscription no pipeline" — submete as
consultas reais do cliente à **própria trava**, em vez de usar um regex
paralelo. Uma segunda implementação da regra poderia divergir da primeira, e a
divergência passaria despercebida justamente ali.

O primeiro rascunho desse check usava regex próprio e reprovou por ler um
**comentário** como se fosse consulta: o código da trava traz um exemplo
comentado. Trocar pelo reuso da função resolveu a causa, não o sintoma.

### Rótulos reais: levantados do bruto, não do interpretado

`src/integracoes/monday/rotulos.ts` levanta os valores distintos de **todas** as
colunas a partir de `registros_brutos`. Levantar do dado já transformado
mostraria apenas o que a interpretação deixou passar — e é justamente a coluna
que ninguém mapeou (responsável, por exemplo) que precisa aparecer.

Colunas espelho e fórmula são lidas por `display_value`: pelo `text` elas
apareceriam vazias, e a conclusão seria "a equipe não preenche essa coluna".

### Proposta de regra é proposta

Rótulo não coberto vira `revisao_necessaria`, com quantidade de **registros**
afetados e exemplos de `id_origem`. A proposta traz lista sugerida e
justificativa; as palavras que a orientam **não classificam nada**.

Rótulo com indício dos dois lados sai como `indefinida`, com a ambiguidade
declarada — "AGUARDANDO SENTENÇA" é o caso: "aguardando" sugere etapa anterior,
"sentença" sugere processo em curso. Inferir ali seria escolher no lugar de quem
conhece o fluxo.

### Amostra: varredura sobre o valor, não sobre o nome do campo

`MOTIVO` é digitado à mão. A varredura procura CPF e CNPJ no **conteúdo**, e o
ensaio inclui um caso com documento em campo livre para provar que a máscara o
remove.

A primeira versão conferia a amostra contra os dados de ORIGEM, e por isso
acusava documento que a máscara já havia removido — um alerta sempre verdadeiro
e, portanto, inútil. Agora confere o que **sai**, e informa separadamente
quando a origem tinha documento em campo livre. Essa segunda informação é para
o jurídico: documento digitado em campo livre não é protegido por mascaramento
de coluna.

### Ensaio do runner

`scripts/ensaiar-homologacao.ts` sobe um servidor local no formato da API e roda
o runner inteiro. As sete provas passam. O relatório de ensaio nasce com aviso
em destaque de que os dados são simulados — sem ele, em duas semanas alguém
chamaria aquilo de "o relatório da homologação".

O dublê só conhece o board 5959705266; qualquer outro id recebe erro. Isso torna
o ensaio fiel e permite exercitar de verdade a prova 6, que simula falha da
origem apontando para quadro inexistente. Na primeira versão o dublê respondia a
qualquer board, a falha não acontecia, e a prova 6 reprovava — por defeito do
ensaio, não do produto.

`MONDAY_ENDPOINT` foi acrescentada para o ensaio. Em produção não é definida e o
endereço é o oficial, mas fica registrado que ela existe: quem controla o
ambiente do servidor pode redirecionar a integração.


---

## B16.2 — Tentativa de homologação real: o bloqueio mudou de causa

Tentativa de executar a homologação controlada do board 5959705266 com
`MONDAY_TOKEN` presente no ambiente. Detalhe em `docs/HOMOLOGACAO-MONDAY.md`.

### O que passou a ser possível

`MONDAY_TOKEN` está no ambiente — o impedimento de B16 e B16.1 acabou. A
**pré-confirmação dos quatro itens rodou e passou**, o que até aqui nunca havia
sido verificado fora de teste. Os quatro são locais (variável, trava, id do
quadro, consultas do pipeline) e não dependem de alcançar a API.

Também foram executados contra PostgreSQL real: a suíte inteira, 328 testes,
dos quais 31 de Monday; e o ensaio ponta a ponta, 7 de 7 provas.

### O que continua impedindo, e é outra coisa

A política de egresso do ambiente **recusa o host `api.monday.com`**: `403` no
`CONNECT`, antes de qualquer TLS com o Monday. O token nunca chega a ser
apresentado. Repetiu em todas as tentativas — não é intermitência.

O que separa "rede bloqueada" de "credencial inválida" é o momento da recusa: o
gateway responde antes do handshake. E o que separa "bloqueio geral de saída" de
"bloqueio deste host" é o controle: `api.github.com` responde `200` pelo mesmo
proxy. Sem esses dois recortes, o sintoma — `fetch failed`, três vezes — seria
lido como token errado, e a próxima sessão rodaria atrás do problema errado.
Evidência em `docs/evidencias/bloqueio-rede-monday.txt`.

Conferido também que `MONDAY_ENDPOINT` não está definida: o cliente aponta para
o endereço oficial, e o bloqueio não é efeito de redirecionamento (B16.1).

Rota de saída: liberar `api.monday.com:443` na política de egresso. Nenhuma
alteração de código é necessária.

### O que NÃO foi feito

Métricas, rótulos reais e amostra com dados reais continuam **em branco**. O
ensaio produz um relatório completo, com números plausíveis, e a tentação é
usá-lo — o relatório existe, está pronto, e a diferença é uma linha de aviso.
Apresentá-lo como homologação seria a regra "nenhum dado demonstrativo
apresentado como real" violada da forma mais direta possível. O relatório de
homologação real não existe porque não pode existir ainda.

### `--pre-confirmacao`

Opção acrescentada ao runner: roda os quatro itens e para **antes de qualquer
tráfego de rede**. Separa dois diagnósticos que a falha de rede confunde — "a
pré-confirmação não passou" e "a pré-confirmação passou, mas não se chegou ao
Monday". O segundo não é defeito do produto, e sem a separação a distinção
depende de ler log de erro.

Ela não afrouxa nada: para mais cedo, não mais tarde. Não lê, não grava e não
emite prova. O runner completo continua exigindo os quatro antes de sincronizar.


---

## B16.3 — Homologação real executada: rede liberada, e o defeito que só o dado real mostrou

A política de egresso passou a aceitar `api.monday.com`. A homologação
controlada do board 5959705266 **rodou de ponta a ponta com dados reais**:
pré-confirmação, credencial autenticada na conta Coevoconstrutora, duas
execuções consecutivas, rótulos, propostas e amostra. Relatório em
`docs/evidencias/homologacao-monday.md`; resultado em
`docs/HOMOLOGACAO-MONDAY.md`.

### Os números da primeira leitura real

273 itens, 2 páginas, cursor no fim. 250 incluídos, 23 ignorados — todos por
grupo excluído do comitê, com motivo — 0 erros, contabilidade fechando. Na
segunda execução: 0 incluídos, 0 atualizados, **250 inalterados**, e as sete
provas passaram sobre o board real.

### `'MEU TRABALHO'` — o defeito que o ensaio não podia pegar

O título real da coluna de situação tem **apóstrofos dentro do título**,
digitados por quem a criou. A comparação exata não a encontrava: na primeira
rodada real, `situacao` saiu nula nos 250 registros e 100% caíram em
`revisao_necessaria` — sem erro, sem aviso, com a taxa de judicialização
silenciosamente indisponível. O relatório dessa rodada está preservado em
`docs/evidencias/homologacao-monday-antes-da-correcao.md`.

A correção trata aspas em volta do título como decoração, não identidade —
e título exato **continua vencendo** o que só casa depois de remover aspas,
para que criar `'STATUS'` ao lado de `STATUS` não troque em silêncio a coluna
que alimenta o campo. O mesmo defeito escondia `STATUS (para comitê)` (caixa
mista) da lista de colunas de classificação do relatório: a comparação agora
tem uma forma canônica única (`chaveDeColuna`/`mesmoTitulo`), em vez de um
`===` em cada lugar. Oito testes novos fixam o caso
(`test/monday-titulo-coluna.test.ts`); a suíte foi a 336.

Depois da correção, a homologação foi **reexecutada do zero** — banco
recriado, não aproveitado — para que o relatório final não fosse uma emenda
sobre a carga defeituosa.

### O que o board real corrigiu na documentação

- **`COMARCA` existe** (13 valores; TAUBATÉ 91, JACAREÍ 89, PINDA 50…) — a
  documentação anterior dizia que não havia coluna própria e que `comarca`
  ficaria nula. Ficou preenchida em 244 de 250.
- **`cliente`, `cpf_cnpj`, `contrato` e `numero` não existem** como colunas.
  `numero` cai para o nome do item; as inconsistências de documento inválido
  não são geradas para processos.
- **Os 6 rótulos reais de situação** (ACOMPANHANDO 150, FINALIZADO 69, ACORDO
  47, BAIXA DEFINITIVA 3, RECOMPRA/ACORDO 3, ARQUIVADO PROVISORIAMENTE 1) não
  casam com **nenhuma** lista de termos: 0 de 6 cobertos. A limitação prevista
  em B16 se confirmou no pior grau.

### O que NÃO foi feito

As listas de classificação **não foram alteradas**. As propostas estão
emitidas no relatório — `finalizad`, `acordo`, `baixa`, `arquivad` como
candidatos a `TERMOS_NAO_JUDICIAL`; `ACOMPANHANDO` como indefinida — e os 250
registros seguem em `revisao_necessaria`. A tentação era óbvia: com os rótulos
reais na mão, aplicar as regras e entregar a taxa de judicialização
preenchida. Mas todos os itens vêm de um quadro chamado PROCESSOS JUDICIAIS, e
talvez a resposta certa seja outra coluna (`DECISÃO`) ou a premissa de que
tudo ali é judicializado — decisão de quem conhece o fluxo, que muda indicador
de comitê. Heurística não aprova regra.

A execução rodou em banco local de homologação (`patrono_homolog`), recriado
pelas 17 migrações — o esquema é o de produção; o banco, não.

## B16.4 — Regra de judicialização configurável por fonte e vigência

**Data:** 2026-08-05 · **Decisão da Coevo, implementada como proposta pendente
de aprovação**

### A decisão

> Neste momento, considerar judicializado todo registro que esteja no quadro
> "Processos Judiciais" do Monday, pois hoje essa é a fonte oficial da
> informação jurídica. Contudo, essa regra deve ser configurável e não ficar
> presa ao Monday. A plataforma deve guardar a origem do dado e permitir que,
> futuramente, o Sienge passe a ser a fonte principal sem necessidade de
> refazer a lógica.

Com cinco condições: (1) hoje, Monday como fonte oficial; (2) na transição,
Monday e Sienge coexistem com identificação da fonte e tratamento de
divergências; (3) futuramente, Sienge como principal, após homologação;
(4) **não aplicar classificação definitiva aos 250 registros sem aprovação**;
(5) regra versionada, auditável e configurável por fonte e data de vigência.

### O que foi construído

- **Migração 018** — `politicas_judicializacao` (fonte, escopo, tipo,
  configuração, precedência, vigência, ciclo proposta→aprovada→revogada, autor
  e justificativa obrigatórios) e `judicializacao_apuracoes` (a conclusão de
  CADA fonte sobre CADA registro — na transição, as duas coexistem).
  `processos_judiciais` ganhou `judicializacao_fonte`, `judicializacao_politica`
  e `judicializacao_divergente`.
- **Três travas no banco, por gatilho:** duas políticas aprovadas não podem
  valer ao mesmo tempo para o mesmo par (fonte, escopo); política aprovada é
  imutável no critério (mudança = versão nova); aprovação sem autor é recusada.
- **`src/juridico/judicializacao.ts`** — `avaliar` (uma política, um registro),
  `consolidar` (precedência decide o exibido; divergência **preserva os dois
  lados**, reabre revisão e vira inconsistência `divergencia_judicializacao`,
  que bloqueia indicador), `apurar`, `aprovar`, `revogar`. A sincronização do
  Monday deixou de chamar as listas de termos diretamente: ela aplica as
  políticas vigentes da fonte.
- **`scripts/politica-judicializacao.ts`** — `listar`, `simular`, `aprovar`,
  `revogar`, `reapurar`. Aprovar **não** reclassifica; reapurar é passo
  separado, e a simulação usa a MESMA função da apuração real.
- **Vigência de verdade:** `politicasVigentes(escopo, data)` recebe a data.
  Reapurar março usa a política de março — o número de comitê fechado não muda
  porque a regra mudou em agosto.
- **21 testes novos** (`test/judicializacao-politica.test.ts`), incluindo a
  transição completa Monday → Sienge sem alteração de lógica.
- **`docs/REGRA-JUDICIALIZACAO.md`** — o documento da regra.

### O que deliberadamente NÃO aconteceu

A política `1.0.0 monday/processos` (premissa de escopo: estar no board
5959705266 = judicializado) foi **semeada como `proposta`**, não aprovada. Os
250 registros continuam em `revisao_necessaria` e a taxa de judicialização
continua indisponível. Aprovar é ato registrado, com autor — não efeito
colateral de migração. O comando para ver o efeito antes de decidir:
`npx tsx scripts/politica-judicializacao.ts simular`.

A coluna `'MEU TRABALHO'` continua alimentando `situacao` — ela descreve
andamento, e é isso que ela passa a significar no sistema. Consequência para o
indicador: se tudo no quadro é judicializado, a taxa não sai de rótulo; vira
uma razão contra um denominador de outra fonte (contratos/distratos). A forma
final do indicador fica para a etapa "indicadores com dados reais".

### Correções e ajustes na passagem

- O gatilho reescrito na 018 gravava o histórico como par `[antes, depois]` em
  vez de `{de, para}` — regressão pega pela suíte; corrigido antes do commit.
- `test/monday-homologacao.test.ts` agora aprova uma política `por_termos` de
  teste no setup: o critério de termos continua existindo, mas como TIPO de
  política, não como caminho fixo no código.
- Catálogo de inconsistências: 20 → **21 tipos** com
  `divergencia_judicializacao` (gravidade alta, área jurídico, bloqueia
  indicador).

### Backlog registrado nesta entrega

- `reapurar` cobre apenas `processos`; distratos/notificações quando houver
  política para eles.
- Precedência por registro/empreendimento (o campo `escopo` suporta; sem
  interface).
- Tela de gestão de políticas (hoje: linha de comando).
- `reapurar` não registra o operador que o disparou.
- Remoção de aspas tipográficas simples ('') na normalização de título de
  coluna (B16.3 cobre retas e duplas curvas).

## B17 — Homologação aprovada e runner generalizado para os demais quadros

**Data:** 2026-08-06

### A aprovação

A Cristiane aprovou a homologação do quadro **Processos Judiciais**
(board `5959705266`). O portão que ela mesma tinha colocado — *"não ative os
demais quadros até que essa entrega seja revisada e aprovada"* — está aberto.

Segue pendente, e é decisão separada, a aprovação da **política de
judicialização**: os 250 registros continuam em `revisao_necessaria`.

### Por que o runner precisava mudar

`scripts/homologar-monday.ts` estava travado em três constantes:
`QUADRO = 'processos'`, `BOARD_ESPERADO = '5959705266'` e
`TABELA = 'processos_judiciais'`. Homologar Notificações copiando o arquivo
produziria dois runners divergindo com o tempo — e a divergência apareceria
justamente nas provas, que é onde ela não pode aparecer.

### O desenho: perfil por quadro

Cada quadro ganhou um `PerfilHomologacao` com board, rótulo, colunas da amostra
anonimizada, campos de texto livre a varrer, campo usado na prova 5 e — só para
processos — a coluna que alimenta a classificação de judicialização.

Três decisões dentro disso:

1. **O board fica no perfil E em `quadros.ts`, e os dois são comparados.**
   Alterar o id num lugar só não redireciona a carga: precisaria de duas
   alterações deliberadas, em arquivos diferentes.
2. **A amostra publica as colunas do perfil, não `SELECT *`.** Uma coluna nova
   no esquema não passa a ser publicada por omissão — e a amostra é o único
   lugar do relatório com dado real. `cliente_nome` é mascarado sempre.
3. **A cobertura de judicialização só roda onde faz sentido.** Sem
   `colunaClassificacao`, a seção declara que não se aplica. Rodá-la sobre
   Notificações produziria uma "taxa de judicialização de notificações" —
   número sem significado.

`--quadro` é opcional e o padrão continua `processos`: o comando registrado na
documentação não muda de significado por causa da generalização.

### Verificação

Ensaio com dublê local, sem rede, nos dois quadros:

- `processos` — **7/7 provas**, sem regressão em relação a B16.3
- `notificacoes` — **7/7 provas**, exercitando tabela, colunas e campo de teste
  diferentes

O ensaio de `notificacoes` roda contra colunas simuladas no formato de
processos, então `situacao` volta `null`. Isso é fiel ao que o ensaio é: prova
que o caminho inteiro funciona, não que o mapa de colunas está certo. O mapa
real só se confirma contra o quadro real.

### Limitação registrada

A sessão em que esta generalização foi escrita **não alcança `api.monday.com`**:
ela nasceu antes da liberação do domínio na política de rede do ambiente, e a
política é aplicada quando a sessão é criada. As duas sincronizações reais de
Notificações rodam numa sessão nova, com o comando já pronto.

---

## B17.1 — Homologação de Notificações a Clientes: três defeitos que Processos não podia revelar

**Data:** 2026-08-06
**Board:** `5630368737` — `(JUR) NOTIFICAÇÕES CLIENTES`
**Resultado:** 1072 lidos, 1072 incluídos, 0 erros; **7 de 7 provas**.
Relatório em `docs/evidencias/homologacao-monday-notificacoes.md`; documentação
em `docs/HOMOLOGACAO-MONDAY-NOTIFICACOES.md`.

### O que a segunda homologação comprou

A generalização do runner (B17) foi verificada com dublê e passou nos dois
quadros. Contra o quadro vivo, a primeira execução **gravou zero registros**. O
ensaio não tinha como pegar: o defeito estava numa chave estrangeira que os
grupos de processos nunca acionavam.

É a segunda vez que o rito paga o próprio custo — em B16.3 foi o título com
apóstrofos, aqui foram três defeitos de uma vez. Fica registrado como argumento
a favor de homologar **um quadro por vez, contra o dado real**, e não extrapolar
a aprovação de um quadro para os demais.

### 1. Competência derivada nunca era criada (bloqueante)

`competencia_ref` é chave estrangeira para `competencias(ref)` em todas as
tabelas de negócio, e nenhum ponto da ingestão criava a linha. Em processos o
campo ficava nulo — aqueles grupos (`CJ (REGRESSO)`, `TETUS LOCAÇÃO`) não
derivam competência, e nulo não viola chave estrangeira. Em notificações os
grupos são meses: a carga inteira foi recusada pelo PostgreSQL.

**Decisão:** `garantirCompetencias` cria as competências do conjunto antes do
upsert, com a janela do mês e rótulo legível. Três regras dentro dela:

- **nasce aberta** — `fechada_em` nulo; fechar competência é ato de gestão, e
  uma carga automática não pratica esse ato;
- **`ON CONFLICT DO NOTHING`** — não reabre, não renomeia, não sobrescreve o que
  a gestão já definiu;
- **uma vez por carga** — o conjunto é conhecido inteiro antes do upsert; 38
  competências custam uma consulta, não 1072.

A competência de `--competencia` é garantida antes de `iniciarExecucao`, porque
`execucoes_importacao.competencia` tem a mesma chave estrangeira — e sem execução
aberta não haveria onde contabilizar a falha.

### 2. Três títulos de coluna errados no mapa

`MODELOS DE NOTIFICAÇÃO` (plural), `TOTAL DIAS` (sem o "DE") e `RESOLUÇÃO` como
data de solução. Sem correção, `modelo`, `total_dias` e `data_solucao` ficariam
nulos em 1072 registros, sem erro nenhum — o mesmo sintoma silencioso de B16.3.

**`RESOLUÇÃO` não foi inferida do nome.** A fórmula da coluna `TOTAL DIAS` é
`DAYS({RESOLUÇÃO},{DATA DA NOTIFICAÇÃO})`: o próprio quadro declara que a
resolução fecha o intervalo aberto pela notificação. O título entrou **depois**
dos explícitos na lista de preferência — se alguém criar `DATA DA SOLUÇÃO`, ela
vence. Título real de hoje não vira definição do campo.

### 3. Títulos repetidos desempatavam em silêncio

O board tem duas colunas `'MEU TRABALHO'` (uma `date` quase vazia, uma `status`
com FEITO/ACOMPANHANDO) e três `link to (JUR) RETOMADAS`. A resolução por título
escolhia a primeira não-espelho sem deixar rastro.

Não afeta a carga de notificações — nenhum campo mapeia esse título. **Afeta
processos:** lá `'MEU TRABALHO'` alimenta `situacao`, e uma segunda coluna
homônima trocaria a fonte da situação de 250 processos sem aviso, levando junto
a taxa de judicialização.

**Decisão:** `titulosAmbiguos` **declara** a ambiguidade, não a resolve. A carga
segue — a coluna escolhida pode ser a certa —, mas o relatório traz o título, as
colunas concorrentes e qual venceu. Separar "resolvido por título" de "resolvido
por acaso de ordenação" é o mínimo para que a resolução por título continue
sendo uma regra, e não uma sorte.

### O que ficou aberto, e por quê

- **`situacao` sem coluna de origem** — 0 de 1072. O candidato é o
  `'MEU TRABALHO'` do tipo `status`, mesmo título que alimenta `situacao` em
  processos e mesmo vocabulário (`ACOMPANHANDO`). **Não foi mapeado:** com
  `ESTÁGIOS` já alimentando `estagio`, é preciso decidir qual das duas manda nos
  indicadores; e mapear antes de resolver a ambiguidade gravaria datas dentro de
  `situacao`.
- **Sete itens terminais perdem a data de resolução** — `Distratado` (6) e
  `A Retomar` (1) têm `RESOLUÇÃO` na origem mas não contam como `Resolvida`, e a
  transformação não grava `data_solucao` para item não resolvido. Se esses
  estágios encerram a notificação, entram na regra — e o tempo médio de solução
  muda. Indicador de comitê: decisão do jurídico, não heurística.
- **3 CPF em campo de texto livre da ORIGEM**, removidos da amostra publicada.
  Informação para o jurídico: documento digitado em campo livre não é protegido
  por mascaramento de coluna.

### Verificação

`test/monday-notificacoes.test.ts` — **14 testes** fixando os três defeitos
contra PostgreSQL real: competência criada, mês bissexto, competência fechada
preservada, competência de argumento, títulos reais resolvidos, título explícito
vencendo `RESOLUÇÃO`, restrição `notificacao_solucao_coerente` respeitada,
ambiguidade declarada, processos sem ambiguidade, e idempotência.

Suíte completa: **371 testes passando** (eram 336 em B16.3).

## B17.2 — As duas decisões do quadro de Notificações

**Data:** 2026-08-06 · Decisão da Coevo sobre os itens levantados na
homologação do board 5630368737.

### 1. `situacao` fica NULA — `'MEU TRABALHO'` não é mapeada

A coluna estava nula em 1072 de 1072 registros, porque o board não tem coluna
`SITUAÇÃO`. O candidato era a coluna de status `'MEU TRABALHO'`
(`FEITO` 743 / `ACOMPANHANDO` 329).

**Não foi mapeada, por decisão.** O nome diz o que ela é: o acompanhamento
pessoal de quem toca o caso, não o estado da notificação. `ESTÁGIOS` já
alimenta `estagio` e descreve o ciclo de vida real. Mapear a primeira para
`situacao` colocaria progresso de tarefa de uma pessoa dentro de um campo de
negócio que alimenta indicador.

Nenhuma alteração de código: a decisão foi **não fazer**.

### 2. Estágios terminais passam a registrar a data — sem virar "resolvidos"

7 notificações tinham data de resolução na origem e a perdiam: 6 `Distratado`
e 1 `A Retomar`. O modelo só admitia `data_solucao` com
`estagio = 'Resolvida'`, então elas ficavam eternamente "em andamento" no
tempo médio de solução.

A correção óbvia — classificá-las como `Resolvida` — seria errada. O cliente
distratou, a unidade foi para retomada: o caso acabou, mas não com o desfecho
que se queria. Contar isso como resolução **inflaria a taxa de resolução de
notificações**, que é indicador de comitê.

**Terceiro estado, `Encerrada`** (migração 019):

| Estágio | Significado | Admite `data_solucao` | Conta como resolvida |
| --- | --- | --- | --- |
| `Resolvida` | desfecho favorável | sim | sim |
| `Encerrada` | caso fechado sem resolução | **sim** | **não** |
| `Em Andamento` | aberto | não | não |

Assim o tempo médio passa a medir *quanto tempo o caso ficou aberto*, que é a
pergunta que ele responde, sem contaminar a taxa de resolução.

Distinção preservada de propósito: **`Unidade retomada`** (passado, a retomada
se concretizou) continua `Resolvida`; **`A Retomar`** (futuro, caso
encaminhado) é `Encerrada`. Colapsar as duas faria caso encaminhado contar
como retomada concluída.

### O que NÃO foi alterado

**`Recompra`** (7 ocorrências) é da mesma família de `Distratado` e continua
`Em Andamento`. A pergunta não foi feita sobre ela, e nenhuma das 7 tem data
de resolução hoje — então a inconsistência é latente, não ativa. Mexer numa
regra de indicador sem a decisão ter sido tomada é exatamente o que não se faz
aqui. **Fica registrado como pendência.**

### Verificação

- migração 019 relaxa `notificacao_solucao_coerente` para os dois estágios
  terminais; o DOWN zera as datas antes de restaurar a restrição antiga, para
  não falhar deixando o esquema no meio
- `normalizarEstagio` devolve três valores; `estagioEncerra` autoriza a data
- mensagem da API e comentário de `entidades.ts` atualizados
- **10 testes novos**; suíte completa **381/381**

### Confirmação sobre Processos

O achado das colunas homônimas levantou a dúvida sobre o quadro já aprovado.
Verificado no relatório de evidências: o board 5959705266 tem **uma única**
coluna `'MEU TRABALHO'`. A homologação aprovada está correta; a detecção de
ambiguidade é proteção prospectiva.

## B17.3 — Recompra encerra a notificação, não a recompra

**Data:** 2026-08-06 · Regra de negócio explicada pela Cristiane Rabelo.

Esta seção passou por duas correções na mesma conversa, e as duas ficam
registradas porque o caminho até a regra certa é parte dela.

**Primeira volta.** Propus incluir `Recompra` entre os estágios terminais. A
resposta foi que a recompra continua sendo acompanhada por até dois anos — o
que parecia invalidar a proposta.

**Segunda volta, e a regra final.** A distinção que faltava é que **notificação
e recompra são objetos diferentes**:

| | A que se refere | Quando termina |
| --- | --- | --- |
| Notificação | o ciclo de **cobrança** com o cliente | **no acordo de recompra** |
| Recompra | o processo da **unidade** até a revenda | na conclusão da compra pelo novo comprador |

O estágio `Recompra` na notificação é **`Encerrada`**. O motivo, nas palavras da
Cristiane: *"se a gente deixar com uma notificação, acaba que esse prazo de
notificação ele fica gigantesco"*. Um caso de cobrança de três dias e um de
setecentos entrariam na mesma média.

`Encerrada` e não `Resolvida`: recompra não é cobrança bem-sucedida, é saída do
cliente.

O contexto de negócio que sustenta a regra:

Recompra não é uma variação do distrato — é um terceiro caminho, com gatilho,
responsável e ciclo próprios. A Coevo assume o financiamento do cliente,
devolve um valor avaliado caso a caso, e a unidade retorna. Mas:

> Para finalizar a recompra é preciso conseguir um novo comprador para a
> unidade, e esse novo comprador tem que encerrar todo o processo de compra —
> o que pode demorar seis meses, um ano ou até dois anos.

Ou seja: registrar a recompra é o começo do acompanhamento **da unidade** — que
segue no quadro de Distratos e Retomadas, com `categoria = 'recompra'`. O que
termina ali é a cobrança.

Regra completa em `docs/REGRA-SAIDA-DE-CLIENTE.md`, incluindo a árvore de
decisão entre distrato, retomada e recompra.

### Duas consequências registradas, ainda não tratadas

1. **No Sienge a unidade fica como distratada** — normalmente. O que continua
   no nome do cliente é o **financiamento junto ao banco**, que a Coevo assumiu
   de fato mas não formalmente. Duas consequências: (a) essa obrigação é
   invisível ao sistema, porque o banco não é fonte de dados; (b) no cruzamento
   Monday × Sienge uma recompra vai **parecer um distrato** — os dois estão
   certos, são representações diferentes do mesmo fato. Precisa estar
   registrado como não-inconsistência antes do cruzamento, ou a Central abre um
   caso por recompra.
2. **O tempo da recompra não é medido em lugar nenhum.** Fechar a notificação
   resolveu o prazo de cobrança — era o problema, e está resolvido. Mas o tempo
   do acordo até a revenda passa a não ter dono: a notificação fechou, e a
   ingestão de distratos ainda não alimenta `data_venda`. Não há resposta para
   *"quantas recompras estão abertas e há quanto tempo"*, que é a pergunta da
   diretoria sobre unidade parada. **Encaminhamento:** alimentar `data_venda`
   na homologação do quadro de Distratos e Retomadas.

### Campos que o modelo não tem

Valor devolvido ao cliente e financiamento assumido pela Coevo. Nenhum bloqueia
as homologações; os dois viram pergunta na etapa de indicadores. O segundo não
tem de onde ser puxado automaticamente — vive no banco, que não é fonte de
dados —, então será entrada manual com proveniência declarada, se for
necessário.
---

## B17.4 — Homologação de Distratos e Desistências: a coluna EMPREENDIMENTO não é o empreendimento

**Data:** 2026-08-06
**Board:** `18404493605` — `(JUR) DISTRATOS E DESISTÊNCIAS`
**Resultado:** 38 lidos, 38 incluídos, 0 erros; **7 de 7 provas**.
Relatório em `docs/evidencias/homologacao-monday-distratos.md`; documentação em
`docs/HOMOLOGACAO-MONDAY-DISTRATOS.md`.

### O detector de títulos repetidos pagou na primeira oportunidade

`titulosAmbiguos`, criado em B17.1 para um caso que não afetava a carga de
notificações, encontrou **dois** casos neste quadro: `EMPREENDIMENTO` e `SETOR`,
cada um com uma coluna espelho e uma de status. A regra "espelho perde para
não-espelho" acertou nos dois — os espelhos vêm vazios em 12 dos 38 itens —, e
agora a escolha aparece no relatório em vez de acontecer em silêncio.

Os dois espelhos ainda discordam do status no conteúdo: `SETOR` espelhado traz
`JURIDICO/RELACIONAMENTO/COMERCIAL/CRÉDITO`, o de status traz
`PÓS VENDAS/JURÍDICO/COMERCIAL`. Vocabulários diferentes sob o mesmo título.

### Três defeitos corrigidos

**1. O perfil de homologação nomeava colunas inexistentes.** Os perfis de
`distratos` e `retomadas` pediam `situacao`, `torre`, `grupo` e `total_dias` na
amostra, e usavam `situacao` na prova 5. A tabela `distratos` não tem nenhuma
das quatro: a amostra falharia no `SELECT`, depois das duas execuções já terem
rodado. Encontrado estaticamente, contra a migração 005, antes da carga.

Perfis alinhados ao esquema; campo da prova 5 passou a ser `motivo` — existe,
vem sempre preenchido e não tem `CHECK` que recuse o valor de teste, como
`categoria` tem. Um teste compara os nomes do perfil com o `information_schema`.

**2. O prefixo do empreendimento era cortado no meio da palavra.** Item
`ALAMEDAS 406A` com EMPREENDIMENTO `ALAMEDA` produzia a unidade `S 406A`. A
remoção passou a exigir fronteira de palavra; quando o nome não é prefixo do
item, o nome do item inteiro vira a unidade. **Informação incompleta e
verdadeira vale mais que recorte inventado.**

**3. O relatório publicava 22 links de assinatura da ClickSign.** A coluna
espelhada `Espelho` carrega endereços de assinatura notarial, e o levantamento
de rótulos os listava um a um — num arquivo versionado no repositório.

O runner já suprimia valores de colunas `text`, pela regra do texto digitado à
mão. Link não é texto livre; é pior: **não descreve o dado, dá acesso a ele.**
Coluna com endereço `http(s)` passou a ter os valores suprimidos, publicando só
a contagem.

Consequência de método: não há relatório "antes da correção" preservado para
este quadro — as versões anteriores continham os links, e versioná-las anularia
a correção. E fica o registro de que a varredura automática cobre CPF/CNPJ na
amostra, não tudo que é sensível em todas as seções: a conferência final do
relatório gerado é parte do rito.

### A decisão que NÃO foi tomada: EMPREENDIMENTO é a SPE

A coluna `EMPREENDIMENTO` deste quadro não traz o empreendimento do item:
`ALENCAR MAZZEO` para itens `MORATTA …`, `COEVO E CONELESTE` para `ALAMEDA …`,
`SAN MARINO` para `VERANO …`, `FGV` para `VITA 02`. Às vezes coincidem
(`GRAN PARK`), o que torna o defeito mais difícil de ver, não menos.

É a mesma classe de `LOCAL` em B16.3: coluna com nome familiar carregando outro
conceito. Aqui parece ser a SPE/incorporadora.

Três consequências medidas: **9 empreendimentos criados na base**, cinco dos
quais não são empreendimentos; **o cruzamento com Notificações não fecha** — o
mesmo prédio entra com dois nomes que não se encontram; e **25 de 38 unidades
ficaram com o nome do item inteiro**, porque o recorte depende de o nome do
empreendimento ser o começo do nome do item.

**Nada foi corrigido por suposição.** A saída limpa é renomear a coluna para
`SPE` no Monday e criar um `EMPREENDIMENTO` de verdade — resolve na origem e não
deixa dívida no código. Enquanto a decisão não vem, **a carga de distratos não
deve alimentar indicadores por empreendimento nem ser cruzada com Notificações
por esse campo**.

### A outra decisão que NÃO foi tomada: PERÍODO (DIAS) ≠ tempo_dias

Seria natural ligar a coluna `PERÍODO (DIAS)` a `tempo_dias`. A fórmula diz que
seria errado: `DAYS({DATA DA SOLICITAÇÃO}, {DATA DA VENDA})` é o tempo que o
cliente segurou a unidade antes de pedir o distrato — período de posse, não
tempo de processamento.

Vale registrar a simetria com B17.1: lá a fórmula de `TOTAL DIAS` **confirmou**
que `RESOLUÇÃO` era a data de solução; aqui a fórmula **desmentiu** a associação
óbvia. Ler a fórmula da origem antes de mapear vale nos dois sentidos.

### Aberto e consequente: o quadro não tem data de conclusão

Não existe coluna de conclusão. `data_conclusao` e `tempo_dias` ficam nulos em
38 de 38, e — mais grave — `dataReferencia` deriva de `data_conclusao`, então
**a carga saiu sem data de referência**: não sabe declarar até quando o dado
está atualizado. Três saídas possíveis (criar a coluna; usar a solicitação;
aceitar que o quadro não tem corte próprio) e nenhuma foi assumida.

Também sem destino: nove colunas financeiras (venda, pago, devolvido, a receber,
corretagem, comissões, honorários, multa). A tabela `distratos` não tem campo de
valor — se o comitê precisa de perda financeira por distrato, é coluna nova e
migração, não ajuste de mapa.

### Verificação

`test/monday-distratos.test.ts` — **9 testes**: prefixo não cortado no meio da
palavra, prefixo ainda removido quando termina em espaço, item igual ao
empreendimento, coluna que não é prefixo do item, as duas categorias reais pelos
grupos, mapa contra as colunas reais, ausência de `data_conclusao`/`tempo_dias`,
ambiguidade de `EMPREENDIMENTO`/`SETOR`, e o perfil conferido contra o
`information_schema`.

Suíte completa: **380 testes passando** (eram 371 em B17.1).
---

## B17.5 — `data_venda` é a venda original, não a revenda; e não existe recompra para medir

**Data:** 2026-08-06
**Motivo:** verificação pedida sobre `docs/REGRA-SAIDA-DE-CLIENTE.md` §4.2, que
encaminhava "alimentar `distratos.data_venda` na homologação do quadro de
Distratos e Retomadas, e derivar dali o tempo de ciclo da recompra".

O encaminhamento não se sustenta, por três razões independentes. Cada uma
sozinha já bastaria.

### 1. O campo já era alimentado — a premissa do encaminhamento estava errada

`quadros.ts` liga `data_venda → DATA DA VENDA`, `sincronizar.ts` a lê, e a carga
real do board `18404493605` gravou **38 de 38** preenchidos. A afirmação de que
"a ingestão ainda não alimenta `data_venda`" era factualmente errada quando foi
escrita.

Vale como método: a regra descreveu o código de memória em vez de conferir. O
mesmo documento que corrigiu um entendimento errado sobre o Sienge (§4.1) trazia
um sobre o próprio repositório.

### 2. O que ela carrega não é a revenda

É a venda ORIGINAL ao cliente que está saindo. Três evidências convergentes:

- `data_venda` é **anterior** à `data_solicitacao` em **36 dos 38** registros;
- o intervalo médio venda → solicitação é de **300 dias**, com máximo de 1312;
- a fórmula da coluna `PERÍODO (DIAS)` no board é
  `DAYS({DATA DA SOLICITAÇÃO}, {DATA DA VENDA})` — o quadro define esse par como
  período de posse.

Usá-la como data de revenda daria número **plausível e errado**, inflado por
todo o tempo em que o cliente teve a unidade. É o terceiro caso nesta série em
que a fórmula da origem decide um mapeamento: em B17.1 confirmou `RESOLUÇÃO`,
em B17.4 desmentiu `PERÍODO (DIAS) → tempo_dias`, e aqui desmente
`DATA DA VENDA → revenda`.

**Nenhum dos dois quadros tem coluna de revenda** — conferido em `18404493605`
e `18413057491`.

### 3. Não há nenhuma recompra registrada para medir

A seção 3 daquele documento diz que a recompra é acompanhada "no quadro de
Distratos e Retomadas, com `categoria = 'recompra'`". Os grupos reais são:

| Quadro | Grupos |
| --- | --- |
| `18404493605` Distratos | `DISTRATOS` (26), `DESISTÊNCIAS` (12) |
| `18413057491` Retomadas | `RETOMADAS` (23) |

`classificarCategoriaDistrato()` só produz `recompra` para grupo
`RECOMPRA`/`RE-COMPRA`. **Nenhum existe.** Hoje `recompra` é um valor que o
`CHECK` do banco aceita e que a ingestão nunca produz.

O desenho ficou meio construído sem que isso aparecesse: o estágio `Recompra`
**existe** na notificação (board `5630368737`) e a encerra corretamente — B17.3
—, mas a notificação encerra apontando para um acompanhamento que **nenhum
quadro faz**. O lado que fecha foi implementado; o lado que continua, não.

### Encaminhamento revisado

Na ordem, e nenhum se obtém ajustando mapa de colunas:

1. a recompra precisa existir na ORIGEM, com grupo próprio num dos dois quadros;
2. uma data de revenda precisa existir na ORIGEM, distinta de `DATA DA VENDA` —
   e o nome importa, porque as duas são "venda" e serão confundidas;
3. só então o ciclo acordo → revenda pode ser derivado.

Até lá, **`distratos.data_venda` não deve ser lida como data de revenda**.
`docs/REGRA-SAIDA-DE-CLIENTE.md` foi corrigido nas seções 4.2, 4.3 e 6.

### Anomalia registrada

2 dos 38 registros têm `data_venda` igual ou posterior à solicitação —
`VERANO 1003B` por 46 dias. Erro de digitação ou uso da coluna com outro sentido
naquela linha. Conferência do jurídico.

### Correção aplicada sobre o commit paralelo `e86fff3`

Enquanto esta verificação rodava, outra sessão acrescentou candidatos de data de
venda aos dois quadros, com a justificativa de medir o ciclo da recompra. A
intenção está certa e a seção 7 que ela escreveu é o plano correto; **duas
premissas do Passo 1, não.**

**1. Recompra não tem grupo próprio no quadro de Retomadas.** O board
`18413057491` tem um único grupo, `RETOMADAS`, com 23 itens. Conferido duas
vezes contra a origem.

**2. Incluir `DATA DA VENDA` na lista de Retomadas era ativamente perigoso.**
Aquele board TEM essa coluna, e ela é a venda original: datas de 2022 a 2025
contra solicitações de 2026, com a mesma fórmula `DAYS({SOLICITAÇÃO},{VENDA})`.
Com ela na lista, `retomadas.data_venda` sairia preenchido em quase todo item —
com a data errada. E pelo critério do Passo 2 da própria seção 7, alguém leria
"a coluna existe e está preenchida → o indicador sai direto" e publicaria um
indicador que trata toda retomada como recompra concluída.

É o pior dos três desfechos previstos, **porque parece o melhor**. Um campo
nulo é obviamente uma lacuna; um campo preenchido com o dado errado não.

Em Retomadas, `data_venda` passou a aceitar só títulos de revenda
(`DATA DA REVENDA`, `REVENDA`, `NOVA VENDA`). Nenhum existe, o campo cai em
`ausentes` e fica nulo — que é o que o próprio Passo 1 pede quando escreve
"procurar não inventa dado". Em Distratos a lista segue aceitando
`DATA DA VENDA`: lá o sentido é a venda original, e a assimetria entre os dois
quadros é deliberada.

O Passo 2 daquela seção — "a homologação de Distratos e Retomadas responde" —
está respondido: vale a terceira saída, a coluna não existe. E falta mais do que
ela previa: das três informações necessárias, **duas faltam**, porque não há
nenhuma recompra registrada.

### Nota de modelagem levantada, não decidida

`distratos.data_venda` é gravada pelos dois quadros, que compartilham a tabela.
Se Retomadas passar a alimentá-la com a revenda e Distratos continuar com a
venda original, a mesma coluna significa coisas diferentes conforme a
`categoria`. Vale decidir antes de criar a coluna no Monday: campo próprio
(`data_revenda`) ou um sentido só. Não foi decidido aqui.

### Verificação

Cinco testes novos em `test/monday-distratos.test.ts`: nenhum grupo real produz
`recompra`; a regra de recompra continua valendo se o grupo passar a existir
(a capacidade está pronta — o que falta é a origem); `data_venda` sai de
`DATA DA VENDA`, sem nenhum título de revenda no quadro; Retomadas **não** aceita
`DATA DA VENDA` e cai em `ausentes` contra as colunas reais daquele board; e
Distratos continua aceitando, fixando a assimetria como deliberada.

O primeiro falha no dia em que o grupo de recompra for criado, que é exatamente
quando esta regra precisa ser revisitada.

---

## B17.6 — `EMPREENDIMENTO` corrigido na origem: o cruzamento entre quadros fechou

**Data:** 2026-08-06
**Board:** `18404493605` · resolve o item 6.3 de `docs/HOMOLOGACAO-MONDAY-DISTRATOS.md`

A coluna `EMPREENDIMENTO` trazia a SPE/incorporadora em vez do prédio (B17.4).
A Coevo corrigiu no Monday, e a correção foi **melhor que a proposta original**.

### A correção: valores, não estrutura

A proposta era renomear a coluna para `SPE` e criar um `EMPREENDIMENTO` novo. O
que se fez foi trocar os **valores** da coluna de **status** para os prédios,
deixando a coluna **espelhada** — de mesmo título — com as SPEs.

Como `montarMapaColunas` já prefere não-espelho, a ingestão passou a ler o campo
certo **sem uma linha de código alterada**. E a informação de SPE não se perdeu:
ficou no espelho, disponível para o dia em que virar dimensão de análise.

Vale como registro de método: a regra de desempate "espelho perde para
não-espelho" — herdada de `js/monday-sync.js`, onde foi descoberta na prática —
sustentou uma correção feita na origem meses depois, sem coordenação com o
código. Regra boa é a que continua certa quando o mundo muda sozinho.

### Verificado com reexecução real, banco recriado

| | Antes | Depois |
| --- | --- | --- |
| Empreendimentos criados na base | 9 — cinco eram SPE | **7, todos prédios** |
| Unidades com o nome do item inteiro | 25 de 38 | **2 de 38** |
| Empreendimentos que cruzam com Notificações | **0** | **6 de 7** |

7 de 7 provas, 38 lidos, 38 incluídos. O cruzamento fechou: `VERANO` (256
notificações + 10 distratos), `MORATTA` (152 + 8), `CARPE DIEM` (88 + 3),
`VITA VILLAGE` (27 + 1), `SIETE` (16 + 3), `GRAN PARK` (9 + 5).

### O que sobrou: `ALAMEDA` vs `ALAMEDAS`

Notificações usa `ALAMEDAS` (33 registros), Distratos usa `ALAMEDA` (8). Duas
linhas em `empreendimentos` para o mesmo prédio, e nenhum indicador soma as duas.
O quadro de Distratos é inconsistente por dentro: 7 itens `ALAMEDA …` e 1
`ALAMEDAS 406A` — este último é o que ficou com a unidade inteira, porque a
extração se recusa a cortar `ALAMEDA` no meio de `ALAMEDAS` (B17.4, item 2).

**Decisão: resolver na origem, não no código.** Uma regra de plural genérica
juntaria `ALAMEDA`/`ALAMEDAS` hoje e, um dia, dois empreendimentos que só
diferem por uma letra — trocaria um erro visível por um invisível. Padronizar em
`ALAMEDAS` custa 8 registros; em `ALAMEDA`, custa 33.

Resíduo menor: `VITA 02` mantém a unidade `VITA 02` porque a coluna diz
`VITA VILLAGE` e o item diz `VITA`. O empreendimento cruza; só a unidade fica
com o nome inteiro. 1 em 38.

### A pendência de título repetido mudou de natureza

Não é mais "qual das duas colunas está certa" — as duas estão, para coisas
diferentes. É **um título que descreve mal uma delas**. Renomear o espelho para
`SPE` tornaria a distinção explícita. Enquanto isso, o detector de B17.1 continua
sinalizando, que é o comportamento certo: dois títulos iguais continuam sendo
dois títulos iguais, mesmo quando o desempate acerta.

---

## B17.7 — Ligação notificação → distrato: id, não nome; array, não chave estrangeira

**Data:** 2026-08-06
**Pergunta que originou:** "quantos dias, da NOTIFICAÇÃO até finalizar todo o
processo?" — e se a coluna `PERÍODO (DIAS)` do quadro responde isso.

**Não responde.** `PERÍODO (DIAS)` é `DAYS({DATA DA SOLICITAÇÃO}, {DATA DA
VENDA})`: tempo de posse do imóvel, da compra até o pedido de saída. Os valores
de quatro dígitos que aparecem na coluna (1.312, 1.057, 643) são anos de posse,
não duração de processo. É a terceira medida distinta que essas duas datas já
produziram — depois de `tempo_dias` (B17.4) e da revenda (B17.5).

### O que faltava, e o que foi feito

A medida pedida atravessa dois quadros. O início existe
(`notificacoes.data_notificacao`, 1019 de 1072); o fim não (o quadro de
Distratos não tem data de conclusão — item 6.1). E faltava o elo: **qual
notificação corresponde a qual saída.**

Migração 020 acrescenta `distratos.notificacoes_origem text[]`, mapeada nos dois
quadros com a mesma lista de títulos. Três decisões de desenho:

**1. Guarda o `id_origem`, não uma chave estrangeira.** Uma FK para
`notificacoes(id)` criaria dependência de ORDEM de carga: um distrato
sincronizado antes da notificação que referencia teria o vínculo nulo em
silêncio, e só uma segunda passada consertaria. `id_origem` já é a chave de
junção de toda a ingestão, e o vínculo é proveniência da origem — continua
verdadeiro mesmo que a notificação ainda não tenha sido lida.

**2. Lê o ID, nunca o nome.** O `display_value` de uma ligação traz o nome do
item ligado, e nome é digitado: no quadro de Retomadas, o item `SIETE 44-C`
aponta para a notificação `SIETE 44C` — um hífen de diferença. `cliente.ts`
passou a pedir `linked_item_ids` no fragmento `BoardRelationValue`.

**3. ARRAY, e deduplicado + ordenado.** A mesma unidade pode ser notificada mais
de uma vez antes de sair — são 1072 notificações em 38 competências, e
reincidência é o caso comum. Guardar só a primeira descartaria o histórico de
cobrança; só a última responderia outra pergunta. A ordenação não é cosmética: a
API não garante ordem estável, e sem normalizar o upsert veria mudança de
conteúdo a cada carga, inflando `versao` e histórico — o defeito da migração 017
por outro caminho.

### Validado com dado real, pelo quadro que já tem a coluna

Retomadas (`18413057491`) tem a ligação preenchida em **23 de 23** itens — o que
descobri só depois de um falso negativo: meu script de inspeção descartável não
pedia `display_value` no fragmento de `BoardRelationValue`, e a coluna apareceu
como vazia em 23 de 23. Conferir com a consulta certa inverteu o resultado. Fica
o registro: ferramenta de diagnóstico também erra, e "vazio" merece segunda
leitura antes de virar conclusão.

| | Resultado |
| --- | --- |
| Retomadas com ligação declarada | **23 de 23** |
| Ligações que resolvem para notificação existente | **23 de 23** |
| Distratos com ligação | **0 de 38** — a coluna não existe no quadro |
| Notificação → pedido, pelos pares ligados | **21 pares · média 39 dias · 3 a 108** |

**Por que a ligação declarada vale mais que o palpite:** casar por empreendimento
+ unidade produziu, nos distratos, um par com **–29 dias** — pedido antes da
notificação, ou seja, dois episódios diferentes da mesma unidade tratados como
um. Pela ligação declarada, nenhum dos 21 pares é negativo. Chave errada não
produz erro, produz número errado.

### O que falta, e é da origem

Criar no quadro de Distratos a coluna de ligação para
`(JUR) NOTIFICAÇÕES CLIENTES`. A ingestão passa a gravar **sem alteração de
código**, inclusive se a coluna nascer com o nome automático
`link to (JUR) NOTIFICAÇÕES CLIENTES` — que está na lista de títulos aceitos
justamente por ser o caso mais provável. Enquanto não existir, o campo aparece
em `ausentes` e o array fica vazio: vazio significa "sem ligação declarada",
nunca "sem notificação".

Com a ligação e a data de conclusão, o ciclo completo fecha. Só com a ligação,
já se mede notificação → pedido — a metade que existe hoje.

### Verificação

Seis testes em `test/monday-distratos.test.ts`: lê id e não nome visível;
deduplica e ordena; os três casos que devolvem lista vazia; os dois quadros
aceitam os mesmos títulos; Retomadas resolve e Distratos cai em `ausentes`; e o
nome automático do Monday é aceito. Suíte em **402 testes**.

---

## B17.8 — Duas portas de entrada do distrato, e o quadro da recompra que eu não tinha achado

**Data:** 2026-08-06

### O pedido de distrato não vem só da notificação

A Coevo apontou que o pedido também entra pelo quadro de contratos, por onde
Relacionamento e Crédito (repasses, financiamentos) encaminham. Conferido: a
coluna de ligação `(JUR) CONTRATOS PARA CLIENTES` **já existe** no board
`18404493605` e **já está preenchida em 26 dos 38 itens**. Não faltava nada na
origem — faltava a ingestão ler.

**Eu havia reportado essa coluna como "vazia em 38/38".** Era o mesmo falso
negativo de B17.7: meu script de inspeção não pedia `display_value` no fragmento
`BoardRelationValue`. Registrei a lição naquele registro e repeti o erro no mesmo
dia, no mesmo arquivo. A correção agora é estrutural: `lerVinculo` usa
`linked_item_ids`, e o teste cobre o caso.

Migração 021: `distratos.contratos_origem text[]`, mesmas três decisões da 020.
Carga real com as duas portas mapeadas:

| Categoria | Registros | Via notificação | Via contrato | Sem origem |
| --- | --- | --- | --- | --- |
| distrato | 26 | 0 | **17** | 9 |
| desistência | 12 | 0 | **9** | 3 |
| retomada | 23 | **23** | 0 | 0 |

O padrão confirma o que a Coevo descreveu, e não estava no modelo: **retomada
vem da cobrança que não se resolveu; distrato e desistência vêm do
encaminhamento de Relacionamento/Crédito.** São portas diferentes, e por isso
são dois campos e não um — juntá-las apagaria justamente a distinção.

### O quadro da recompra existe, e eu afirmei que não

B17.5 diz: *"não há nenhuma recompra registrada para medir"* e *"a recompra não
é registrada como tal em lugar nenhum"*. **Falso.** Existe
`(JUR) CESSÃO DE DIREITOS DE RECOMPRA` — board `6149480325`, **25 itens**.

O que era verdade é mais estreito: os dois quadros *mapeados* não produzem
`categoria = 'recompra'`. Generalizei para "não existe em lugar nenhum" sem ter
listado os quadros da conta — e bastava listar. São 213 quadros fora
subelementos; a busca levou um minuto.

**A coluna `ASS. NOVO FINANCIAMENTO`**, que a Coevo acabou de criar, é o
marcador de conclusão que a seção 7 daquele documento dava como inexistente. E
ela fecha a exposição da seção 4.1: o financiamento que continua no nome do
cliente antigo se extingue quando o **novo** comprador assina o dele.

Números reais: ciclo de **5 pares, média 474 dias, de 196 a 667** — o que
confirma com dado o "seis meses a dois anos" que a seção 3 afirmava de memória.
E **11 recompras em aberto**, a mais antiga desde **2024-03-01**.

**Cuidado de contagem registrado:** `Status = RECUSADO PELO CLIENTE` em 9 dos
25. Recompra oferecida e recusada não é recompra — contar os 25 infla o número
em mais de um terço.

O quadro **não foi mapeado** nesta rodada: exige decisões de destino, de
competência (os grupos são empreendimentos, não meses), de contagem e de destino
para 15 colunas de valor. Documentado na seção 8 de
`docs/REGRA-SAIDA-DE-CLIENTE.md`. Também apareceu `(PÓS) Distratos das Unidades`
(`3978322943`, 96 itens), não investigado.

### Método

Duas afirmações minhas foram desmentidas hoje pela própria Coevo, e as duas
tinham a mesma forma: **eu não achei, logo não existe.** Uma coluna vazia por
consulta incompleta; um quadro ausente por eu não ter listado os quadros.
Verificar ausência custa mais que verificar presença, e nenhuma das duas foi
verificada antes de virar afirmação em documento.

---

## B17.9 — Três quadros numa tabela: a carga de um marcava o outro como ausente

**Data:** 2026-08-06

Mapeado o quadro `(JUR) CESSÃO DE DIREITOS DE RECOMPRA` (`6149480325`), e
homologados Distratos, Retomadas e Recompras — **7 de 7 provas em cada**. Só a
coexistência dos três revelou dois defeitos, e os dois são da mesma família.

### 1. Ausência declarada sobre o que a carga não lê

`distratos`, `retomadas` e `recompras` gravam na tabela `distratos`.
`marcarAusentes` filtrava por `fonte = 'monday'` e "não veio nesta carga" — então
**carregar Retomadas marcou os 38 registros de Distratos como ausentes**. Medido:
38 de 61.

O defeito é antigo: `retomadas → distratos` estava no mapa desde o início, e
nunca havia sido exercitado junto. Não apareceu em nenhuma homologação anterior
porque cada quadro rodava sozinho, com o banco recriado.

**Correção:** `marcarAusentes` recebe as categorias que a carga governa.
**Ausência só pode ser afirmada sobre o que a carga realmente enxerga** — o
resto não foi consultado, e silêncio não é ausência. Dois testes: um garante que
o vizinho não é marcado, outro que dentro do próprio escopo a marcação continua
acontecendo — o recorte não pode virar desculpa para nunca marcar nada.

### 2. A prova 5 testava o quadro errado

Corrigido o item 1, a prova 5 passou a falhar em Retomadas e Recompras.
`conferirAtualizacao` pegava o **primeiro registro da tabela** por `criado_em` —
que era de Distratos. Alterava esse registro, ressincronizava Retomadas (que não
lê aquela origem), e o valor naturalmente não voltava.

Pior: na terceira execução o registro já vinha com `DIVERGENCIA DE TESTE`
gravado pela prova anterior — a evidência impressa foi
`devolvido pela origem (DIVERGENCIA DE TESTE)`, que é literalmente o valor de
teste apresentado como valor de origem.

**Correção:** o perfil declara suas categorias, e `fotografar`,
`conferirAtualizacao` e a amostra recortam por elas. A fotografia também passou a
ser honesta: antes dizia "61 → 61 registros" para uma carga de 23.

**O que isto diz sobre o rito:** as sete provas foram desenhadas para um quadro
por tabela. Rodar quadros isolados, com banco recriado, escondeu os dois
defeitos. A homologação de Retomadas só valeu alguma coisa porque rodou **depois**
de Distratos, no mesmo banco.

### Decisões do mapeamento de recompras

- **Destino:** `distratos` com `categoria = 'recompra'`, como a seção 3 previa.
- **Recusadas:** `Status = RECUSADO PELO CLIENTE` (9 de 25) são ignoradas COM
  motivo. Recompra oferecida e recusada não é recompra; contá-las inflaria o
  número em mais de um terço. O bruto das 25 fica em `registros_brutos` e a
  contagem aparece no relatório, então a taxa de recusa é recuperável.
- **Competência:** de `DATA DE RECOMPRA`. Os grupos deste quadro são
  empreendimentos, não meses — `competenciaDoGrupo` não teria de onde tirar.
- **Empreendimento:** é o grupo. Unidade e cliente saem do nome do item
  (`304 C - GUSTAVO`), com cuidado para não cortar `SIETE 44-C` no hífen.
- **`ASS. NOVO FINANCIAMENTO`** alimenta `data_venda` E `data_conclusao`: neste
  quadro "quando revendeu" e "quando acabou" são o mesmo fato. Continuam campos
  distintos porque nos outros quadros não coincidem.
- **15 colunas de valor não mapeadas** — `distratos` não tem campo de valor.
  Inclui `DEVOLUÇÃO AO CLIENTE`, que a seção 5 dava como inexistente e existe.

Resultado: **16 recompras**, 5 concluídas (média 474 dias, de 196 a 667) e
**11 em aberto**, a mais antiga desde **2024-03-01**.

Suíte em **410 testes**.

---

## B17.10 — Origem é vínculo, desfecho é campo: as três portas da recompra

**Data:** 2026-08-06

### As três portas

A Coevo explicou que a recompra entra por três caminhos, em momentos diferentes:
negociação após a notificação; solicitação do próprio cliente (via
Relacionamento/Crédito); e dentro de um processo judicial já em andamento.

**Decisão: a porta é VÍNCULO, não categoria.** Em todas as três a recompra é a
mesma coisa — a Coevo assume o financiamento, a unidade volta, o ciclo fecha na
assinatura do novo financiamento. Criar `recompra_judicial` e afins
multiplicaria o `CHECK`, quebraria a contagem única e obrigaria todo indicador a
somar três coisas para responder "quantas recompras temos".

A infraestrutura já existe e está provada: `notificacoes_origem` (B17.7) e
`contratos_origem` (B17.8). Falta `processos_origem` — e falta o principal:

**O quadro de recompra não tem NENHUMA coluna de ligação.** Zero
`board_relation`, conferido na origem. O de Processos também tem zero. Hoje é
impossível dizer por qual porta cada uma das 25 recompras entrou, e essa é
justamente a pergunta que diz onde investir esforço comercial. É pedido à
origem, não trabalho de código.

### O desfecho: eu tinha descartado o denominador

Em B17.9 decidi ignorar as 9 recompras `RECUSADO PELO CLIENTE`, para não inflar
a contagem. A Coevo corrigiu: **precisa saber quantas tentou e quantas deram
certo** — é para isso que a recusa é registrada no quadro.

Estava errado pela metade. Não inflar o numerador era correto; descartar o
denominador apagava a pergunta. O erro de fundo foi tratar "não contamina o
indicador que eu conheço" como se fosse "não serve para nada".

Migração 022: `distratos.desfecho`, sem `CHECK`. As 25 entram:

**25 tentativas · 16 aceitas · 9 recusadas · conversão 64%.**

São dois eixos independentes, e colapsá-los perderia informação: `desfecho` é a
decisão do CLIENTE (SUCESSO / RECUSADO), `motivo` é o andamento OPERACIONAL
(Concluído / Em andamento). Cinco recompras estão aceitas E em andamento — um
campo só não expressa isso.

### O caso que a origem ainda não sabe registrar

O cliente pode aceitar a recompra e desistir depois. Hoje `Status` só tem
`SUCESSO` e `RECUSADO PELO CLIENTE`: uma desistência posterior vira ou um
`SUCESSO` que nunca conclui — indistinguível de uma recompra legitimamente em
andamento — ou um `RECUSADO` retroativo, que apaga o fato de a oferta ter sido
aceita.

`desfecho` foi criado **sem `CHECK` de propósito**, por isso: o rótulo vem da
origem, a lista vai crescer, e um `CHECK` recusaria a carga inteira no dia em
que o valor novo aparecesse — exatamente quando se quer que ele entre e apareça.
Falta o terceiro valor na coluna `Status` do Monday, e uma data se o momento da
desistência importar.

### Tabela própria de recompra: considerado e descartado

A recompra divide com distrato e retomada a unidade, o cliente, o
empreendimento e a pergunta de negócio. Tabela separada obrigaria toda consulta
de saída de cliente a unir duas fontes, e `categoria` já distingue os quatro
tipos com `CHECK`. O que ela tem de próprio — 15 colunas de valor, incluindo
`DEVOLUÇÃO AO CLIENTE` — segue sem destino, e é a única parte que talvez
justifique estrutura nova.

Homologação de recompras reexecutada: **7 de 7 provas**, 25 lidos, 25 incluídos,
0 ignorados. Suíte em 410 testes.

---

## B17.11 — Honorários e Entregas: os dois últimos quadros ganham ingestão

**Data:** 2026-08-06
**Boards:** `7231876117` (Honorários Extrajudiciais) e `18410779605` (Controle de
Entrega Carpe Diem). **7 de 7 provas em cada.**

Os dois estavam com `DESTINO` apontando para `null` — a carga respondia
*"ingestao ainda nao implementada nesta fase"*. As tabelas de destino
(`honorarios` e `unidades`) já existiam, com proveniência e trilha; faltava a
transformação e o registro do tipo.

| Quadro | Lidos | Incluídos | Erros |
| --- | --- | --- | --- |
| Honorários | **890** | 890 | 0 |
| Entregas | **112** | 112 | 0 |

### Emoji no título de coluna

Oito colunas de Honorários começam com emoji: `📋 Tipo de Honorário`,
`✅ Data Pagamento Efetivo`, `🏗️ Torre/Bloco`… Escrevi o título idêntico no mapa
e `categoria` saiu **nula nos 890 registros** — o mesmo sintoma silencioso de
`'MEU TRABALHO'` em B16.3, por outra causa.

O emoji pode trazer um **seletor de variação (U+FE0F) invisível**: o texto
parece igual e a comparação falha. `chaveDeColuna` passou a remover pictogramas
do começo do título, pela mesma lógica das aspas — decoração de quem digitou,
não identidade da coluna.

**Só pictograma, e só no começo.** Pontuação ASCII fica: `(JUR) NOTIFICAÇÕES
CLIENTES` e `Nº PROCESSO` são títulos reais que precisam continuar casando.

Depois da correção a coluna resolve — e **continua vazia, agora legitimamente**:
as cinco colunas com emoji estão em **0 de 500** na origem. São colunas novas que
ninguém preencheu. A diferença importa: antes era defeito nosso, agora é dado
que a equipe ainda não digitou, e o relatório mostra qual dos dois é.

### `AURORA - Torre B`

`extrairLocalizacao` removia o sufixo ` TORRE X`, mas não o separador antes
dele: a base ficava `AURORA -`, com o traço pendurado — o que criaria um
empreendimento `AURORA -` ao lado do `AURORA` legítimo, partindo o histórico do
mesmo ativo. Terceira variação do mesmo problema, depois de `ALAMEDAS 406A`
(B17.4) e da SPE (B17.8).

### Campos que vêm do QUADRO, não de coluna

Os dois destinos têm colunas `NOT NULL` sem coluna correspondente na origem:

- **`honorarios.especie`** — o board inteiro é o de extrajudiciais. A espécie sai
  do quadro; deixá-la sair de um campo vazio faria a carga falhar na primeira
  linha.
- **`unidades.empreendimento_id`** e **`unidades.unidade`** — o empreendimento é
  o GRUPO (`CARPE DIEM`) e a unidade é o nome do item (`11`). Quando o grupo não
  resolve, o item é ignorado COM motivo, em vez de derrubar a carga.

### O que NÃO foi mapeado, e por quê

- **`CARÊNCIA (180 DIAS)` → `prazo_180`.** É coluna de STATUS com rótulos de mês
  (`DEZEMBRO 2025`, `ESTOQUE`, `VENDA NOVA`), não data. Converter "DEZEMBRO 2025"
  em data exigiria escolher um dia do mês — invenção.
- **`ENTREGA DAS CHAVES` → `previsao_entrega`.** Entrega realizada e previsão são
  coisas diferentes num quadro cujo propósito é acompanhar prazo. A data
  realizada vira `data_fato`, que é o que ela é.
- **`STATUS` genérico → `situacao`.** O quadro tem sete colunas de status
  diferentes; aceitar o título genérico faria a situação da unidade sair da
  primeira que aparecesse.

### Preenchimento real

| Honorários (890) | | Entregas (112) | |
| --- | --- | --- | --- |
| valor honorários | 872 | unidade | 112 |
| valor OAB | 871 | tipo financiamento | 15 |
| status | 881 | liberação jurídica | 12 |
| data do evento | 849 | habite-se | **0** |
| empreendimento | 873 | | |
| competência | 455 | | |

Dois pontos para o jurídico: **competência em 455 de 890** — os grupos de
Honorários misturam meses (`AGOSTO/2026`) com um grupo `DISTRATO/ RETOMADA` que
não deriva competência nenhuma; e **habite-se vazio em 112 de 112**, num quadro
cujo nome é controle de entrega.

A tabela `honorarios` **não tem coluna de unidade**, e o quadro tem `UNIDADE`
preenchida — o dado é lido e não tem onde ser gravado. Fica registrado.

Suíte em **421 testes**.

## B18 — A política de judicialização não está mais pendente da Cristiane

**Data:** 2026-08-06

Três relatórios seguidos listaram "aprovar a política de judicialização" como
pendência dela. **É engano nosso, e vale corrigir de vez.**

A decisão **já foi tomada**, em 06/08/2026, com estas palavras:

> Neste momento, considerar judicializado todo registro que esteja no quadro
> "Processos Judiciais" do Monday, pois hoje essa é a fonte oficial da
> informação jurídica.

O que falta não é decisão: é o **ato registrado no banco**, que exige duas
coisas que ainda não existem — um banco de produção e um usuário nomeado para
constar como autor. Aprovar no banco efêmero de uma sessão não vale nada: ele é
descartado quando o contêiner é reciclado.

Pedir a mesma aprovação de novo, em cada relatório, transfere para ela uma
tarefa que **não é executável hoje** — e enche a lista dela de um item que ela
não consegue resolver.

### Encaminhamento

A aprovação passa a ser um **passo do roteiro de instalação em produção**, não
uma pendência de conversa:

```bash
# depois de criar o usuário nomeado que vai constar como autor
npx tsx scripts/politica-judicializacao.ts simular
npx tsx scripts/politica-judicializacao.ts aprovar --politica <id> --usuario <login>
npx tsx scripts/politica-judicializacao.ts reapurar --escopo processos
```

A autorização da Cristiane está registrada acima e em B16.4. O `--usuario` do
comando é quem executa o ato, e fica gravado com data.

**Até a instalação, o comportamento correto é o atual:** os 250 processos em
`revisao_necessaria`, taxa de judicialização indisponível com motivo declarado.
Não é pendência esquecida — é o estado correto de um sistema que ainda não foi
instalado.

## B19 — O checklist do Sienge voltou preenchido

**Data:** 2026-08-06 · Documento consolidado pela Coevo/Tetus com consultas
reais executadas na API. Cópia versionada em
`docs/SIENGE-INFORMACOES-PREENCHIDAS.md` (exemplos anonimizados: nome de
cliente e corretor com CPF embutido foram mascarados).

### O que a espera comprou

Os caminhos que a documentação genérica sugeria — e que o conector guardou
como hipótese desligada — **estavam errados**. O real é
`/accounts-receivable/receivable-bills`, não `/receivable-bills`. Se a regra
"não invente endpoints" tivesse sido violada, a integração teria nascido
apontando para caminhos inexistentes e a primeira carga teria falhado em
produção.

### Confirmado

- Base: `https://api.sienge.com.br/tetus/public/api/v1` · Basic Auth ·
  usuário de integração `tetus-patrono`, somente leitura, senha não expira
- Endpoints: companies, enterprises (+groupings), customers,
  accounts-receivable/receivable-bills (+installments),
  total-current-debit-balance, commissions
- Paginação: `limit`/`offset` com `resultSetMetadata.count` (máx 200)
- Carga incremental de clientes: `modifiedAfter`/`modifiedBefore`
- Volumes reais: 43 empresas, 285 empreendimentos, 3.257 clientes ativos
- `defaulting` e `subjudice` vêm prontos por título
- Acréscimos vêm AGREGADOS (`totalAdditionalValue`): juros, multa e correção
  não têm separação confirmada

### O achado que muda o desenho da carga

**A franquia diária do plano Start é 1.000 requisições REST** (200/min).
`receivable-bills` exige `customerId` — não há como listar títulos sem passar
cliente por cliente. Com 3.257 clientes ativos, uma carga completa de títulos
custa no mínimo 3.257 requisições: **três dias de franquia, ou custo excedente
contratual ainda não conhecido**.

Consequência: a carga do Sienge NÃO pode ser "ler tudo, todo dia". O desenho
precisa ser incremental por construção — clientes via `modifiedAfter`, títulos
apenas dos clientes que mudaram, saldo por CPF/CNPJ sob demanda — com
orçamento diário de requisições explícito e monitorado.

### Pendências que o documento declara (não bloqueiam o início)

Técnicas: juros/multa/correção separados, endpoint de pagamentos, contratos e
unidades estruturados, frequência de atualização, fuso.
De negócio: carteira ativa exigível, renegociação, acordo, distrato, retomada,
recompra, cessão, cobrança judicial — como aparecem no Sienge da Coevo.

### Próximos passos

1. Cristiane configura `SIENGE_SUBDOMAIN=tetus`, `SIENGE_USER=tetus-patrono` e
   `SIENGE_PASSWORD` no ambiente (mesmo caminho do MONDAY_TOKEN; senha nunca
   em chat/arquivo)
2. Atualizar o catálogo de endpoints do conector para os caminhos reais
3. Homologação endpoint por endpoint (`POST /api/sienge/homologar`), começando
   por companies/enterprises — baratos e pequenos
4. Desenho da carga incremental com orçamento diário ANTES da primeira carga
   de títulos

## B20 — Homologação do Sienge virou script auditável; a primeira tentativa esbarrou na rede

**Data:** 2026-08-06 · Sessão com as variáveis `SIENGE_*` já no ambiente.

### A decisão

A homologação endpoint por endpoint não será um `POST /api/sienge/homologar`
preenchido à mão: é `scripts/homologar-sienge.ts`, no mesmo molde do
`homologar-monday.ts`. O script executa uma **sonda real e mínima** por
endpoint (~10 requisições para os 7 candidatos, contra franquia de 1.000/dia),
confere formato de paginação, campos e totais contra o levantamento
(`docs/SIENGE-INFORMACOES-PREENCHIDAS.md`), e **só então** grava a confirmação
em `integracoes.relatorio_verificacao` — com autor (`--confirmado-por`), data,
observação com evidência e trilha de auditoria. Sonda que falha não registra
nada: o endpoint continua travado.

Por que assim: a confirmação registrada é o ato que LIBERA a chamada em
produção. Se ela puder nascer de um formulário sem consulta real, a trava vira
cerimônia. O script amarra o registro à evidência.

Ordem das sondas: companies e enterprises primeiro (dados corporativos),
depois customers, títulos, parcelas, saldo devedor (CPF obtido em memória,
nunca publicado) e comissões. Pré-confirmação local com 6 itens roda antes de
qualquer requisição — inclusive prova de "somente leitura por construção" e
folga no orçamento diário. Retentativa também consome franquia, e o script
recusa iniciar um endpoint sem folga mínima de 10 requisições.

### O que aconteceu na primeira execução

A pré-confirmação passou inteira (`docs/evidencias/preconfirmacao-sienge.md`).
A sonda de `/companies` falhou: **o proxy de egresso deste ambiente recusa
`CONNECT api.sienge.com.br:443` com 403** — a requisição nunca chegou ao
Sienge. Evidência completa em `docs/evidencias/bloqueio-rede-sienge.txt`, no
mesmo formato do bloqueio do Monday (que foi liberado depois; o caminho é
conhecido).

**Nenhuma confirmação foi registrada.** Confirmar sem consulta real seria
inventar — exatamente o que o conector existe para impedir.

Achado de diagnóstico que fica: o cliente trata 401/403 como "credenciais
recusadas". Quando o 403 vem do proxy de rede, a mensagem engana. A evidência
registra a distinção; se o falso diagnóstico incomodar de novo, o cliente pode
passar a diferenciar resposta do proxy de resposta da API.

### Para destravar (fora do alcance desta sessão)

1. **Incluir `api.sienge.com.br` na allowlist de egresso** do ambiente Claude
   Code (mesmo ajuste feito para `api.monday.com`).
2. **Conferir `SIENGE_PASSWORD`**: o valor presente hoje tem cara de texto de
   instrução (contém `<` e `>`), não de senha. Trocar pelo valor real, direto
   na configuração do ambiente — nunca em chat, arquivo ou argumento.

Depois disso, uma execução única faz a homologação completa e gera o
relatório:

```bash
cd server && SIENGE_HABILITADO=true DATABASE_URL=... \
  npx tsx scripts/homologar-sienge.ts --confirmado-por "Nome Sobrenome" \
    --saida ../docs/evidencias/homologacao-sienge.md
```

### Desfecho (mesmo dia, 06/08/2026)

Os dois destravamentos foram feitos — `api.sienge.com.br` entrou na allowlist
de egresso e `SIENGE_PASSWORD` recebeu o valor real — e a homologação rodou
completa: **7 de 7 endpoints confirmados e registrados**, com autor e trilha
de auditoria, gastando **10 requisições** da franquia de 1.000/dia. Relatório
em `docs/evidencias/homologacao-sienge.md`.

Totais reais conferem com o levantamento: 43 empresas, 285 empreendimentos,
3.257 clientes ativos. `modifiedAfter` funciona (57 clientes alterados em 30
dias — a carga incremental é viável). Saldo devedor confirmou o resíduo
decimal além de 2 casas (§8.6). Comissões: 7.382 registros no ambiente.

**Divergência achada e registrada:** a API ACEITOU consulta de títulos SEM
`customerId` — o §4.4 do levantamento diz que o parâmetro é obrigatório.
Ficou como aviso na observação da confirmação. Se a listagem geral de títulos
for real, o desenho da carga muda: talvez não precise passar cliente por
cliente. Validar com a Coevo antes de aproveitar.

Notas de ambiente que valem para as próximas execuções:

- O `fetch` embutido do Node ignora `HTTPS_PROXY`; neste ambiente o script
  precisa de `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21). Sem isso o proxy devolve
  403 e o cliente confunde com credencial recusada.
- O registro desta homologação vive no PostgreSQL **desta sessão**, que é
  efêmera. Ao implantar no ambiente definitivo (produção/fly.io), rodar o
  script de novo contra o `DATABASE_URL` real — as sondas custam 10
  requisições e o registro nasce no banco certo, com nova evidência.

## B19.2 — A limitação do §4.4 não existe: a carga de títulos é 100× mais barata

**Data:** 2026-08-06 · Sonda de 2 requisições GET, executada após a homologação
para resolver a divergência que o próprio relatório apontou.

O levantamento (§4.4) afirmava que `customerId` era obrigatório em
`/accounts-receivable/receivable-bills` — "não permite listar todos os títulos
sem cliente". A homologação notou que a API **aceitou** a consulta sem o
parâmetro; a sonda confirmou e quantificou:

- **Listagem geral existe**: `count = 5.142` títulos no ambiente.
- Carga completa de títulos: **26 requisições** (5.142 ÷ 200 por página) — e
  não as 3.257+ do desenho anterior (um cliente por vez).
- O medo de "3+ dias de franquia" caiu: **a primeira carga completa
  (empresas + empreendimentos + clientes + títulos) cabe em ~46 requisições**,
  um único dia com folga enorme.

**Segunda descoberta, negativa e igualmente importante:** `defaulting=true`
como filtro devolveu o MESMO count (5.142) — o parâmetro é ignorado em
silêncio pela API. Filtrar inadimplentes no servidor não funciona; a seleção é
nossa, depois da carga. Isso também é um aviso geral: parâmetro desconhecido
não dá erro, dá resultado errado com cara de certo — nunca inferir filtro novo
sem sonda.

**O que continua caro:** parcelas são por título ({receivableBillId}) —
5.142 requisições para o conjunto todo, acima da franquia. Estratégia para o
desenho da carga: parcelas apenas dos títulos que interessam à inadimplência
(os `defaulting`, contados na nossa base após a carga de títulos), e sob
demanda para os demais.

Consumo do dia após a sonda: 12 requisições das 1.000 (10 da homologação + 2).
