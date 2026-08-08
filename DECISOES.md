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


---

## B17 — Quadros novos: a credencial recusa, e o levantamento nasce antes da definição

Pedido: homologar Projetos de TI, Honorários e Transferência Intermediada.
**Nenhum foi lido.** Estado completo em `docs/HOMOLOGACAO-QUADROS-NOVOS.md`.

### O bloqueio inverteu de lado

Em 05/08 o gateway recusava o `CONNECT` e o token nunca era apresentado. Agora o
`CONNECT` responde `200`, o TLS conclui, e quem recusa e o **Monday**:
`401 NOT_AUTHENTICATED`, `server: cloudflare`. O token no ambiente e
estruturalmente integro — JWT de tres partes, conta e usuario certos, emitido no
mesmo dia — e ainda assim rejeitado, que e o sintoma de token pessoal
regenerado depois de o valor ter sido capturado.

Registrar os dois recortes (momento da recusa e host de controle) e o que evita a
proxima sessao correr atras do problema errado. Sem eles, `fetch failed` seria
lido como bloqueio de rede outra vez.

### Dois dos tres quadros nao existem no projeto

`Honorarios` tem definicao (`7231876117`) e tabela de destino. `Projetos de TI` e
`Transferencia Intermediada` nao aparecem em lugar nenhum: nem no
`js/monday-sync.js` de producao, nem nas migracoes, nem na documentacao. Nao tem
id, nao tem mapa de colunas e **nao tem tabela de destino**.

### O que NAO foi feito, e por que

**A definicao dos quadros novos nao foi escrita.** Escrever mapa de colunas de
quadro que nao se leu e inventar titulo, e o custo disso acabou de ser medido em
Processos: a coluna real e `'MEU TRABALHO'`, com apostrofos, e o mapa dizia
`MEU TRABALHO` — 250 registros com situacao nula e a taxa de judicializacao
indisponivel, sem um erro na tela. Um mapa inventado para um quadro que ninguem
leu produziria o mesmo silencio, sem homologacao anterior para desconfiar.

**O runner nao foi generalizado.** Ele esta travado no board 5959705266 e
acoplado a `processos_judiciais`: projecao da amostra, prova 5 sobre `situacao` e
cobertura de judicializacao. A forma certa da generalizacao depende do que os
quadros novos tem — mascaramento e campo a perturbar na prova 5 mudam por
quadro. Projetar a abstracao antes do levantamento seria adivinhar duas vezes.

**Onde os dados aterram e decisao de produto.** Projetos de TI nao e assunto de
comite; Transferencia Intermediada tem cara de operacao de unidade/contrato e
pode tocar o motor de vinculos. Estrutura errada custa mais que coluna errada, e
essa resposta nao se infere do nome do quadro.

### Levantamento antes de destino — a inversao que o script desfaz

`scripts/descobrir-quadro.ts` le o quadro e imprime a forma sem gravar nada. O
levantamento de `rotulos.ts` sai de `registros_brutos`, ou seja, exige que a
carga ja tenha acontecido — e carga exige destino decidido. Para quadro novo isso
e circular: precisaria decidir onde os dados aterram antes de saber quais dados
existem.

Por isso o script roda com `PATRONO_SEM_BANCO=1`: `DATABASE_URL` deixou de ser
exigida por `config` quando o flag esta presente, e `db/pool.ts` recusa ser
importado nesse modo — a folga vale para ferramenta que nao toca o banco, nunca
para subir o servidor.

O script tambem nao lista valor de coluna de texto livre (relatorio e evidencia
versionada, e coluna digitada a mao guarda nome de parte), remove CPF e CNPJ
antes da contagem, e **nao sugere mapeamento**: diz qual campo nao tem coluna, e
para ai.

### Recusa de token malformado — e a regressao que ela causou

O token de 05/08 vinha envolto em `<`...`>`, o `.trim()` do config nao pega isso,
e o sintoma era `401` igual ao de credencial revogada. O cliente agora recusa
antes de qualquer requisicao, distinguindo "tem delimitadores" de "tem caractere
que nao existe em token". O valor nunca vai para mensagem nem para log.

A primeira versao dessa mensagem citava o marcador entre acentos graves — e a
pre-confirmacao passou a reprovar, porque ela extrai as consultas GraphQL de
`cliente.ts` delimitando por acento grave. Um acento grave em prosa deslocou a
delimitacao e o extrator capturou texto em vez de consulta.

O ensaio ponta a ponta pegou antes do commit. Alem de tirar os acentos graves, o
extrator ficou capaz de notar a propria degradacao: a consulta precisa COMECAR
por `query`/`mutation`/`subscription`, e encontrar menos consultas que o piso
conhecido interrompe a homologacao. Uma verificacao que nao olhou nao aprova —
esse era o defeito de fundo, e ele existia antes desta sessao.

### Um teste que dependia da maquina

`sienge-estrutura.test.ts` afirmava configuracao do Sienge incompleta, e passava
so porque o ambiente estava vazio. Esta sessao trouxe `SIENGE_SUBDOMAIN`,
`SIENGE_USER` e `SIENGE_PASSWORD`, e o teste quebrou sem nada mudar no produto.
Passou a controlar as variaveis, e ganhou o caso que faltava: com credencial
PREENCHIDA, nenhum valor aparece no resultado — o vazamento so e possivel quando
ha valor. Tambem ficou provado que credencial completa nao liga o conector: quem
liga e `SIENGE_HABILITADO`.

357 testes contra PostgreSQL real (eram 336), 19 novos. Ensaio da homologacao de
Processos: 7 de 7.


---

## B18 — Ligar na maquina da Coevo: o caminho de producao das migracoes estava quebrado

A plataforma roda da maquina da Cristiane, nao em nuvem — os `.bat` na raiz sao
a interface real de operacao. "Ligar" e, portanto, subir o backend novo ali.
Roteiro em `docs/LIGAR-NA-SUA-MAQUINA.md`.

### `npm run migrate:up` falhava em banco novo

O comando que o README manda rodar em producao **nao funcionava**. Erro:
`unsafe use of new value "sistema" of enum type modulo_plataforma`, na 015.

As migracoes 014 e 015 foram separadas de proposito — o comentario da 014 e da
010 dizem por que: o PostgreSQL nao permite USAR um valor de enum na mesma
transacao em que ele foi criado. O que anulava a separacao era a invocacao:
`node-pg-migrate` envolve a execucao INTEIRA numa transacao unica por padrao, e
com isso a 015 voltava a usar o valor antes do commit da 014.

Corrigido com `--no-single-transaction`, que da a cada migracao a propria
transacao — exatamente o que `recriar-banco.sh` ja fazia, e o que a separacao
pressupoe.

**Por que ninguem viu:** os testes rodam sobre `recriar-banco.sh`, que aplica
cada arquivo em transacao propria; e em banco ja migrado nao ha o que aplicar. O
defeito so aparece em banco NOVO — que e o primeiro contato de quem instala a
plataforma. O teste novo (`migracoes-caminho-de-producao.test.ts`) cria banco do
zero e roda o comando do README, nao uma invocacao propria: reproduzir as flags
no teste provaria apenas que a invocacao do teste funciona, e era justamente a
invocacao declarada no `package.json` que estava errada. Conferido que ele
reprova sem a correcao.

### Os `.bat` passaram a iniciar o backend novo

Nesta versao o backend serve a propria interface (`@fastify/static`), e o
frontend ja fala com `/api/dados` e `/api/auth`. Iniciar o `server.js` antigo
daria plataforma quebrada — deixar os `.bat` apontando para ele seria uma
armadilha. A porta continua 3131, entao firewall e acesso por IP nao mudam.

`Preparar Plataforma (Primeira Vez).bat` confere Node e PostgreSQL e **para com
instrucao** quando falta, em vez de seguir e falhar adiante. A senha do primeiro
usuario e lida oculta e nao entra no historico do terminal.

### Os dois modos rodam com NODE_ENV diferente, e e proposital

O cookie de sessao recebe `Secure` em producao, e o navegador so o envia por
HTTPS. Na rede local o acesso e `http://` sem certificado: com `Secure` o cookie
seria descartado e o login pareceria quebrado **sem mensagem de erro**. Por isso
rede local roda em development e o link publico (HTTPS do Cloudflare) roda em
producao. Verificado na pratica: em producao o `set-cookie` sai com `Secure`.

No script compartilhado o tunel sobe ANTES do servidor. Producao exige a lista
de origens, e a origem e o endereco do tunel — que so existe depois que o tunel
sobe. A ordem inversa obrigaria a reiniciar o servidor a cada execucao.

### O que NAO foi testado

Os proprios arquivos `.bat`. O ambiente e Linux, e nao ha como executar batch do
Windows aqui. Cada comando que eles chamam foi verificado contra PostgreSQL
real — migracoes em banco novo, criacao de usuario, subida do servidor servindo
interface e API, login real devolvendo cookie, e a recusa de subir em producao
sem origens. A sintaxe do batch, nao. Esta registrado no roteiro para que a
primeira execucao seja lida com essa expectativa.

358 testes.
