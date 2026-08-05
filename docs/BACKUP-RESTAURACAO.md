# Backup e restauração — Patrono Alta Performance

Documento operacional. A parte final, **Procedimento de emergência**, é a que
se lê às três da manhã: está escrita para ser seguida sem depender do resto.

---

## 1. Arquitetura

```
                        ┌──────────────────────┐
   agendador embutido ──┤                      │
   cron / systemd    ───┤  executarBackup()    │──► pg_dump -Fc (dump lógico)
   API /api/backup   ───┤                      │         │
   scripts/backup.ts ───┤                      │         ▼
                        └──────────────────────┘   AES-256-GCM (cofre.ts)
                                                         │
                                    ┌────────────────────┼────────────────────┐
                                    ▼                    ▼                    ▼
                            BACKUP_DIRETORIO   BACKUP_DIRETORIO_REDUNDANTE  tabela
                              (primário)            (cópia)              `backups`
                                                                       (metadados)
```

**Dump lógico (`pg_dump -Fc`)**, e não físico. O lógico é restaurável em outra
versão do PostgreSQL e em outra máquina, e permite restaurar num banco isolado
ao lado do banco em uso — que é exatamente o que o procedimento exige antes de
tocar em produção. Backup físico (`pg_basebackup` + WAL) é mais rápido em bases
grandes e permite recuperação a um ponto no tempo, mas amarra a restauração à
mesma versão maior e exige acesso ao sistema de arquivos do servidor. Para o
tamanho desta base, o lógico cobre com folga.

### O que entra no backup

`pg_dump` do banco inteiro, sem exclusão de tabela. Isso cobre, nomeadamente:

| Exigido | Onde está |
| --- | --- |
| banco PostgreSQL | dump integral |
| estrutura e versão das migrations | esquema + tabela `migracoes_aplicadas` + coluna `versao_esquema` do backup |
| usuários e permissões | `usuarios`, `permissoes_perfil`, `permissoes_usuario`, `escopos_*` |
| empreendimentos, contratos, unidades, clientes | tabelas de cadastro |
| processos, notificações, distratos e retomadas | módulo jurídico (retomadas são `distratos` com `categoria='retomada'`) |
| comitês, fatos, riscos, regulatórios | `comites`, `competencias`, `fatos`, `riscos`, `regulatorios` |
| decisões e ações | `comites.ata_aprovada_*`, `inconsistencias_eventos`, `vinculos_eventos` |
| vínculos | `vinculos_fontes`, `vinculos_eventos` |
| inconsistências | `inconsistencias`, `inconsistencias_eventos` |
| proveniência | 17 colunas em cada uma das 20 tabelas de negócio |
| histórico | coluna `historico` (append-only) + `registros_brutos` |
| fotografias | `fotografias_diarias` e partições |
| configurações | `integracoes`, `politica_retencao`, `preferencias_permitidas` |
| logs de auditoria | `logs_auditoria` |

**Anexos e arquivos associados:** não existem hoje. A plataforma não armazena
arquivo binário — nenhuma tela faz upload, e nenhuma tabela guarda caminho de
arquivo. Quando existirem, o backup precisará de uma segunda etapa para o
armazenamento de objetos; está registrado no backlog ao final deste documento.

### O que NÃO entra

Nenhuma credencial em texto aberto:

- **senhas** já estão no banco como hash scrypt (`scrypt$N$r$p$sal$hash`);
- **tokens de sessão** estão como SHA-256 em `sessoes`;
- **tokens de recuperação** idem, em `tokens_recuperacao`;
- **credenciais de Monday e Sienge** vivem em variável de ambiente e nunca
  estiveram no banco;
- **a chave de cifra do backup** (`BACKUP_CHAVE`) não é gravada em lugar nenhum
  — nem no metadado, nem no log, nem na resposta de endpoint.

Um dump restaurado devolve os hashes, não os segredos.

### Tipos de backup

| Tipo | Quando | Disparo |
| --- | --- | --- |
| `completo` | manual, autorizado | `POST /api/backup` ou `scripts/backup.ts` |
| `agendado` | diário, na hora configurada | agendador embutido ou cron externo |
| `pre_migracao` | antes de migração destrutiva | `scripts/migrar-com-backup.sh` — **protegido** |
| `preventivo` | antes de qualquer restauração sobre o banco em uso | automático — **protegido** |

**Incremental / WAL.** Não implementado, e a razão é honesta: o arquivamento de
WAL é configuração do *servidor* PostgreSQL (`archive_mode`, `archive_command`,
`wal_level = replica|logical`), não da aplicação. Ligá-lo a partir do código
daria a impressão de um recurso que só funciona se a infraestrutura cooperar.
O caminho está documentado na seção 8, e o relatório de continuidade informa
quando o intervalo entre backups completos passa de 48 horas — que é o risco
concreto que o WAL reduziria.

---

## 2. Segurança

| Exigência | Como é atendida |
| --- | --- |
| criptografar em repouso | AES-256-GCM, chave derivada por scrypt (N=32768, r=8, p=1) com sal aleatório por arquivo |
| transmissão segura | download por HTTPS na mesma origem, `Cache-Control: no-store`; o arquivo trafega **cifrado** — interceptá-lo entrega bytes, não dados |
| nenhum segredo no repositório | `BACKUP_CHAVE` só por variável de ambiente; `.env` não é versionado |
| credenciais do armazenamento por env/cofre | `BACKUP_DIRETORIO`, `BACKUP_DIRETORIO_REDUNDANTE`, `DATABASE_URL` |
| limitar download e restauração | `sistema:restaurar` **e** perfil Administrador — duas barreiras |
| auditar criação, download, exclusão e restauração | `backup_criado`, `backup_baixado`, `backup_protegido`, `backup_expurgado`, `restauracao_solicitada`, `restauracao_recusada`, `backup_restaurado` |
| mascarar dados sensíveis nos logs | `mascarar()` remove usuário e senha de qualquer URL antes de gravar erro |
| sem acesso público ao arquivo | diretório `0700`, arquivo `0600`, fora da raiz servida como estático |

**Por que GCM e não CBC:** o GCM autentica além de cifrar. Um arquivo adulterado
não decifra — ele *falha*. Com um modo sem autenticação, bytes trocados
produziriam lixo plausível e a restauração seguiria adiante com dado corrompido.

**Dois checksums, de propósito:**

- `checksum` — SHA-256 do arquivo como está no disco. Verificável **sem a
  chave**: detecta corrupção em repouso, e é o que a rotina de verificação usa;
- `checksum_claro` — SHA-256 do dump antes de cifrar. Só verificável com a
  chave, na restauração: prova que a decifragem devolveu byte a byte o que o
  `pg_dump` gerou.

---

## 3. Permissões

Módulo `sistema`, ações `backup` e `restaurar` (migração 014).

| Perfil | ler | backup | restaurar | remover |
| --- | :-: | :-: | :-: | :-: |
| **Administrador** | ✅ | ✅ | ✅ | ✅ |
| **Gestora** | ✅ | ✅ | — | — |
| **Diretoria** | ✅ | — | — | — |
| Líder, Colaborador, Convidado | — | — | — | — |

- **Administrador**: executa e restaura. Também baixa o arquivo, exclui e altera
  a política de retenção.
- **Gestora**: consulta o status e solicita backup. Não restaura, não baixa.
- **Diretoria**: consulta o relatório de continuidade. Não opera.
- **Demais perfis**: sem acesso — negação por omissão.

Restaurar e baixar exigem **perfil Administrador além da permissão**. Permissão
é concedível por exceção de usuário; o perfil é uma segunda barreira,
deliberada: substituir a base não deve depender de uma única linha numa tabela.

Baixar exige `restaurar`, e não `ler`: o arquivo é a base inteira, e quem pode
levá-lo para fora tem o mesmo poder de quem restaura.

---

## 4. Endpoints

| Método | Rota | Permissão |
| --- | --- | --- |
| `GET` | `/api/backup` | `sistema:ler` |
| `GET` | `/api/backup/continuidade` | `sistema:ler` |
| `GET` | `/api/backup/politica` | `sistema:ler` |
| `PATCH` | `/api/backup/politica` | `sistema:remover` + Administrador |
| `POST` | `/api/backup` | `sistema:backup` |
| `GET` | `/api/backup/:id` | `sistema:ler` |
| `GET` | `/api/backup/:id/verificar` | `sistema:ler` |
| `GET` | `/api/backup/:id/baixar` | `sistema:restaurar` + Administrador |
| `PATCH` | `/api/backup/:id/protecao` | `sistema:remover` + Administrador |
| `DELETE` | `/api/backup/:id` | `sistema:remover` + Administrador |
| `POST` | `/api/backup/retencao` | `sistema:remover` + Administrador |
| `POST` | `/api/backup/:id/avaliar` | `sistema:ler` |
| `POST` | `/api/backup/:id/restaurar` | `sistema:restaurar` + Administrador |
| `GET` | `/api/backup/restauracoes` | `sistema:ler` |
| `POST` | `/api/backup/verificar-tudo` | `sistema:backup` |
| `POST` | `/api/backup/ensaiar` | `sistema:restaurar` + Administrador |
| `GET` | `/api/backup/janelas` | `sistema:ler` |

`avaliar` exige apenas `ler`: mostrar o impacto a quem acompanha não restaura
nada, e esconder o impacto só tornaria a decisão pior informada.

---

## 5. Comandos

```bash
# Backup manual
npx tsx scripts/backup.ts
npx tsx scripts/backup.ts --motivo "antes da homologação do Monday"
npx tsx scripts/backup.ts --proteger              # nunca sai pela retenção
npx tsx scripts/backup.ts --retencao              # aplica a política depois
npx tsx scripts/backup.ts --simular-retencao      # mostra o que seria expurgado
npx tsx scripts/backup.ts --continuidade          # relatório em JSON

# Restauração
npx tsx scripts/restaurar.ts --listar
npx tsx scripts/restaurar.ts --backup <rótulo> --avaliar     # não altera nada
npx tsx scripts/restaurar.ts --backup <rótulo>               # banco isolado
npx tsx scripts/restaurar.ts --backup <rótulo> \
    --destino producao \
    --confirmacao "SUBSTITUIR DADOS DE PRODUCAO" \
    --justificativa "Perda de dados por <motivo>, chamado <n>"

# Migração com backup obrigatório antes das destrutivas
./scripts/migrar-com-backup.sh --verificar    # só informa
./scripts/migrar-com-backup.sh                # faz backup e migra

# Verificação completa (os dez passos do teste obrigatório)
PGPORT=5432 BACKUP_CHAVE='...' ./scripts/verificar-restauracao.sh
```

### Agendamento

Duas opções. **Escolha uma**, não as duas.

**a) Agendador embutido** — para instalação simples:

```bash
BACKUP_HORA_DIARIA=3
```

Verifica a cada 10 minutos se já passou das 3h e se ainda não houve backup
bem-sucedido hoje. A decisão vem do *estado do banco*, não de um cronômetro em
memória: reiniciar o servidor às 3h05 não pula o backup do dia, e duas
instâncias da aplicação não geram dois backups.

**b) Agendador externo** — preferido onde já existir um:

```cron
0 3 * * *  cd /opt/patrono/server && /usr/bin/npx tsx scripts/backup.ts --tipo agendado --retencao >> /var/log/patrono-backup.log 2>&1
```

```ini
# /etc/systemd/system/patrono-backup.service
[Service]
Type=oneshot
WorkingDirectory=/opt/patrono/server
EnvironmentFile=/etc/patrono/backup.env      # DATABASE_URL, BACKUP_CHAVE, BACKUP_DIRETORIO
ExecStart=/usr/bin/npx tsx scripts/backup.ts --tipo agendado --retencao

# /etc/systemd/system/patrono-backup.timer
[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true          # roda ao ligar, se a janela passou com a máquina fora
```

---

## 6. Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | :-: | --- |
| `BACKUP_CHAVE` | **sim** | Chave de cifra, mínimo 16 caracteres. Sem ela nenhum backup é gerado. |
| `BACKUP_DIRETORIO` | não | Destino primário. Padrão `/var/backups/patrono`. **Fora do repositório.** |
| `BACKUP_DIRETORIO_REDUNDANTE` | não | Segundo destino, em outro volume ou montagem de rede. |
| `BACKUP_HORA_DIARIA` | não | 0–23. Vazio desliga o agendador embutido. |
| `PERMITIR_RESTAURACAO_PRODUCAO` | não | `true` libera restaurar sobre o banco em uso. Padrão `false`. |
| `PG_BIN` | não | Caminho de `pg_dump`/`pg_restore`/`psql`, se não estiverem no `PATH`. |

**A chave não pode ser perdida.** Sem `BACKUP_CHAVE` os backups são
irrecuperáveis — é a contrapartida de cifrá-los. Guarde-a no mesmo cofre das
demais credenciais de produção, **fora** do servidor que hospeda os backups.
Trocar a chave não reescreve os arquivos antigos: guarde as chaves anteriores
enquanto houver backup gerado com elas.

---

## 7. Política de retenção — proposta inicial

Vive na tabela `politica_retencao`, consultável e auditável; alterá-la deixa
rastro na trilha.

| Parâmetro | Valor inicial | Razão |
| --- | --- | --- |
| Diários mantidos | 14 | duas semanas cobrem a descoberta tardia de um erro operacional |
| Semanais mantidos | 8 | dois meses |
| Mensais mantidos | 12 | um ano |
| Retenção mínima | 30 dias | piso absoluto: nada é expurgado antes disso, qualquer que seja a classe |
| Mínimo de recuperáveis | 3 | nunca sobram menos de três backups íntegros |

Um backup gerado no dia 1º do mês conta como mensal; num domingo, como semanal;
nos demais dias, diário.

**Três travas contra exclusão acidental**, aplicadas nesta ordem:

1. backup **protegido** nunca é expurgado — nem pela retenção, nem pela API;
2. nada é expurgado antes da **retenção mínima**, independentemente da cota;
3. o expurgo para antes de deixar menos que o **mínimo de recuperáveis**.

Os backups `preventivo` e `pre_migracao` nascem protegidos: são a única volta
possível das duas operações mais arriscadas do sistema.

**Backup corrompido não é expurgado automaticamente.** É marcado `corrompido` e
mantido: é a evidência de um problema de armazenamento que alguém precisa olhar,
e apagá-lo destruiria a única pista.

**O metadado sobrevive ao expurgo.** O arquivo some; a linha permanece, com
rótulo, data, tamanho e checksum. Saber que existiu um backup daquele dia — e
que foi removido pela política, e por quem — faz parte da trilha de
continuidade.

**Localização primária e cópia redundante.** `BACKUP_DIRETORIO` deve estar em
volume separado do volume de dados do PostgreSQL; `BACKUP_DIRETORIO_REDUNDANTE`,
em outra máquina ou montagem de rede. Sem a segunda, o relatório de continuidade
alerta: um único disco guardando todos os backups é um ponto único de falha.

### Retenção operacional ≠ retenção histórica

A política acima é de **recuperação e continuidade**: existe para voltar a um
estado recente depois de uma falha. Não é o mecanismo de guarda dos 20 anos.

O dado histórico permanece **no banco** — `fotografias_diarias` particionada por
ano, `registros_brutos`, `historico` append-only em cada tabela de negócio,
`logs_auditoria` que recusa `UPDATE` e `DELETE` — e nos arquivos oficiais de
cada competência. Um backup de 12 meses atrás não é onde se procura o
indicador de 2027: ele está no banco, vigente.

---

## 8. Evolução de infraestrutura — WAL e ponto no tempo

Não implementado nesta entrega. Registrado com o caminho concreto, para não
virar promessa vaga:

```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/backups/patrono/wal/%f && cp %p /var/backups/patrono/wal/%f'
archive_timeout = 300         # fecha o segmento a cada 5 min mesmo sem tráfego
```

Com isso, `pg_basebackup` semanal + WAL contínuo permitem recuperar a qualquer
instante entre a base e o último segmento arquivado, reduzindo a perda máxima
das ~24 horas atuais para ~5 minutos.

Estado atual verificado neste ambiente: `archive_mode = off`,
`wal_level = replica`. Enquanto assim for, a janela de perda é o intervalo entre
backups completos, e o relatório de continuidade alerta quando ele passa de 48
horas.

---

## 9. Fluxo de restauração — os doze passos

| # | Passo | Onde |
| --- | --- | --- |
| 1 | seleção do backup | `avaliar()` |
| 2 | validação do checksum | `avaliar()` — SHA-256 do arquivo cifrado |
| 3 | validação da versão | `compararEsquema()` — aplicação e PostgreSQL |
| 4 | verificação das migrations | lista + checksum de cada uma |
| 5 | identificação do ambiente de origem | `backups.ambiente` × `NODE_ENV` |
| 6 | alerta sobre impacto | comparação tabela a tabela do que se perde |
| 7 | confirmação expressa | frase literal digitada + justificativa |
| 8 | backup preventivo do estado atual | automático, protegido |
| 9 | restauração | `pg_restore` → SQL → `psql --single-transaction` |
| 10 | verificações de integridade | contagens, usuários, permissões, proveniência |
| 11 | resultado detalhado | relatório com divergências e como reverter |
| 12 | registro de auditoria | trilha, inclusive das tentativas recusadas |

Os passos 1 a 6 rodam **sozinhos**, por `POST /api/backup/:id/avaliar`. É o que
permite mostrar o impacto antes de pedir confirmação — em vez de perguntar "tem
certeza?" sobre uma coisa que a pessoa não viu.

### Por que a restauração recria o schema

`pg_restore --clean` derruba objeto por objeto e **esbarra em tabela
particionada**: `fotografias_diarias` e `registros_brutos` têm restrição herdada
pelas partições, e o PostgreSQL recusa derrubá-la isoladamente
(`cannot drop inherited constraint`). A restauração morria no meio.

A solução é `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` seguido do SQL
do dump, **numa única transação do `psql`**. Resolve na raiz e é mais fiel: não
sobra objeto do estado anterior que o dump não conheça. E, sendo uma transação
só, uma restauração interrompida não deixa a base pela metade.

### Restaurar produção: três barreiras

1. permissão `sistema:restaurar` **e** perfil Administrador;
2. `PERMITIR_RESTAURACAO_PRODUCAO=true` no ambiente do servidor — um ato de
   quem opera a infraestrutura, não um clique na tela;
3. a frase literal `SUBSTITUIR DADOS DE PRODUCAO` mais uma justificativa.

Além disso, backup de outro ambiente **nunca** substitui o banco em uso; para
examiná-lo, restaure num banco isolado.

### O catálogo sobrevive à restauração que ele descreve

Restaurar sobre o banco em uso substitui **também** a tabela `backups`, que
volta como estava no momento do dump. Sem tratamento, o registro do backup
preventivo — a única volta possível — desapareceria junto, e a restauração não
deixaria rastro de si mesma.

Por isso as linhas do backup restaurado, do preventivo e da própria restauração
são reinseridas logo depois, e a entrada de auditoria é gravada após o restore.

---

## 10. Testes executados

**`server/test/backup.test.ts` — 38 testes contra PostgreSQL real**, com
`pg_dump` e `pg_restore` reais:

| Exigido | Coberto por |
| --- | --- |
| backup bem-sucedido | metadados completos, arquivo cifrado, permissão `0600`, cópia redundante |
| falha de armazenamento | diretório inacessível → status `erro`, sem arquivo pela metade |
| checksum inválido | byte trocado → `corrompido`, e recusa restaurar em produção |
| arquivo corrompido | GCM recusa decifrar; chave errada recusa; arquivo alheio recusa |
| versão incompatível | migração desconhecida impede; migração faltante ressalva; PostgreSQL maior impede |
| usuário sem permissão | perfil verificado nas rotas; `exigirAdministrador` |
| restauração em ambiente errado | recusa em produção; permite em banco isolado |
| restauração interrompida | `--single-transaction`: ou tudo, ou nada |
| backup preventivo | gerado antes, protegido, com caminho de reversão |
| auditoria | seis ações registradas, checksum na trilha, recusas incluídas |
| restauração real | ver abaixo |
| aplicação funcional após restauração | ver abaixo |

**`server/scripts/verificar-restauracao.sh` — os dez passos obrigatórios**, com
resultado em `docs/evidencias/restauracao-real.txt`:

```
  OK    1. dados de teste criados          notificacoes=1 usuarios=1 versao=2
  OK    2. backup gerado                   patrono-development-completo-…
  OK       arquivo cifrado no disco        -rw------- 288841 bytes
  OK    3. dados removidos
  OK    4. restauracao concluida           duracao 0.8s
  OK    5. dados voltaram                  cliente='MARIA APARECIDA SILVA'
  OK       o banco de origem NAO foi tocado
  OK    6. usuarios e permissoes           permissoes_perfil=78 hash=scrypt escopo_total=t
  OK    7. proveniencia e historico        fonte=manual versao=2 historico=1
  OK       trilha de auditoria preservada
  OK    8. vinculos e inconsistencias      vinculos=1 inconsistencias=1
  OK       regras do banco voltaram        gatilhos=36 agregar_indicador=1
  OK    9. aplicacao inicia                {"estado":"ok","banco":{"ok":true}}
  OK       interface responde              HTTP 200
  OK   10. suite passa apos a restauracao  Tests 289 passed (289)
```

O passo 10 é o que fecha a prova: a **suíte inteira** roda apontada para o banco
restaurado e passa. Não é o backup que se prova funcionando — é o sistema.

---

## 10b. REQUISITOS OBRIGATÓRIOS ANTES DA PRODUÇÃO

Sete requisitos registrados na aprovação de B14. Quatro deles não são texto:
são travas no código, porque registrar como "obrigatório" algo que o sistema
continua permitindo não é registrar — é adiar.

| # | Requisito | Estado |
| --- | --- | --- |
| 1 | Nunca `DROP SCHEMA` no banco vivo sem restauração isolada prévia, validação e plano de corte | **Implementado** — trava |
| 2 | Banco anterior preservado para rollback | **Implementado** — trava |
| 3 | `BACKUP_CHAVE` em cofre, com cópia de emergência, responsáveis e teste de recuperação | **Pendente — Coevo** |
| 4 | Adaptador de armazenamento externo e redundante | **Backlog** |
| 5 | Verificação automática periódica de checksum e teste amostral de restauração | **Implementado** |
| 6 | Alerta quando um backup agendado não concluir | **Implementado** |
| 7 | Contatos de emergência da Coevo preenchidos | **Pendente — Coevo** |

### 1. Sem `DROP SCHEMA` direto no banco vivo

O código **não faz mais** `DROP SCHEMA` em produção. Ele **renomeia**. E o corte
só é aceito depois de três condições verificadas pelo servidor:

- **ensaio isolado validado do mesmo backup**, com status `concluida` (não
  `concluida_com_ressalvas`: se a conferência divergiu no banco isolado,
  divergirá no de produção), nas últimas **72 horas**. Um ensaio de três meses
  atrás não diz nada sobre o arquivo que está no disco hoje;
- **plano de corte declarado** — quem para a aplicação, em que janela, quem
  confere depois, como se volta atrás. Mínimo de 20 caracteres, gravado na
  tabela;
- as barreiras anteriores continuam: perfil Administrador,
  `PERMITIR_RESTAURACAO_PRODUCAO`, frase literal e justificativa.

A exigência é do banco também: o `CHECK restauracao_producao_confirmada` recusa
gravar uma restauração em produção sem `ensaio_id` e sem `plano_corte`.

### 2. Banco anterior preservado para rollback

Em vez de destruir o estado atual, a restauração em produção faz:

```sql
ALTER SCHEMA public RENAME TO antes_<AAAAMMDDHHMMSS>;
CREATE SCHEMA public;
-- extensões trazidas de volta para public
```

O estado anterior continua **no mesmo banco**, íntegro e consultável. O rollback
deixa de depender de restaurar arquivo:

```sql
ALTER SCHEMA public RENAME TO descartado_<id>;
ALTER SCHEMA antes_<carimbo> RENAME TO public;
```

O relatório de restauração devolve esses comandos prontos, em `como_reverter`.

Dois detalhes que custaram achar, e que estão no código com o motivo:

- **as extensões acompanham o rename.** `citext` e `pgcrypto` moram em `public`;
  renomear o schema as leva junto, e o `CREATE EXTENSION IF NOT EXISTS` do dump
  vira no-op. Resultado: `type public.citext does not exist` no meio do restore.
  As extensões são trazidas de volta logo após o rename;
- **o registro do ensaio some com o restore.** `ensaio_id` é chave estrangeira
  para uma linha de `restauracoes` que a própria restauração substitui. Sem
  reinseri-la, a operação falharia *depois* de já ter trocado o banco.

**Os schemas preservados não entram no backup seguinte**: `pg_dump` exclui
`antes_*` e `descartado_*`. Por exclusão, e não por `--schema public` —
restringir a um schema faz o `pg_dump` omitir `CREATE EXTENSION`, e o banco
restaurado ficaria sem `gen_random_uuid()` em toda chave primária.

**Descarte o schema preservado apenas depois de fechada a janela de corte.**
Enquanto ele existir, ocupa espaço equivalente à base inteira.

### 3. Chave em cofre — *pendente da Coevo*

`BACKUP_CHAVE` só existe hoje como variável de ambiente. Antes da produção:

- [ ] guardar no cofre de credenciais da Coevo, fora do servidor de backups;
- [ ] cópia de emergência em envelope lacrado ou segundo cofre, com registro de
      quem tem acesso;
- [ ] dois responsáveis nomeados (titular e substituto);
- [ ] **teste de recuperação**: recuperar a chave a partir do cofre e restaurar
      um backup com ela, sem consultar o ambiente de produção. É o único teste
      que prova que a cópia serve.

Sem esse teste, a cópia de emergência é uma suposição. E perder a chave torna
todos os backups irrecuperáveis.

### 4. Armazenamento externo e redundante — *backlog*

Hoje o destino é sistema de arquivos local, com cópia redundante opcional em
outro caminho. A interface de armazenamento está isolada em `servico.ts`; falta
o adaptador para S3/GCS/Azure, com credenciais por variável de ambiente ou
cofre e ciclo de vida no lado do provedor.

### 5. Verificação periódica e ensaio amostral

Implementado em `src/backup/vigilancia.ts`, disparado pelo agendador logo após
o backup do dia:

| Rotina | Cadência | O que faz |
| --- | --- | --- |
| `verificarChecksums` | diária | confere o SHA-256 de **todos** os backups recuperáveis; o que divergir vira `corrompido` |
| `ensaiarRestauracao` | semanal (domingo) | restaura de verdade um backup em banco isolado, confere e derruba o banco |

O ensaio escolhe o backup **mais antigo ainda não testado** — o recente costuma
estar bom; quem se degrada em repouso é o que está há mais tempo no disco. Se a
conferência divergir, o banco do ensaio **permanece de pé** para investigação.

Cada rodada grava uma linha em `verificacoes_backup`. O relatório de
continuidade alerta quando a última verificação tem mais de 2 dias, quando o
último ensaio tem mais de 10, e sempre que houver backup corrompido ou ausente.

Sob demanda:

```bash
curl -X POST .../api/backup/verificar-tudo   # checksum de todos
curl -X POST .../api/backup/ensaiar          # ensaio de restauração
```

### 6. Alerta de backup agendado não concluído

A janela do dia é **aberta antes** da tentativa (`janelas_backup`) e só fecha
quando o backup conclui. Uma janela aberta e vencida — mais de 2 horas depois da
hora esperada — aparece como alerta no relatório de continuidade, com o dia, as
horas em aberto, o número de tentativas e o último erro.

Sem isso, um agendamento quebrado seria indistinguível de um dia em que ninguém
olhou. O estado vive no banco: reiniciar o servidor não apaga a memória de que a
janela de ontem ficou aberta.

### 7. Contatos de emergência — *pendente da Coevo*

A tabela da seção 12 está com três papéis a preencher. Enquanto estiverem
vazios, o procedimento de emergência não tem a quem escalar.

---

## 11. Limitações

1. **Sem recuperação a ponto no tempo.** A perda máxima é o intervalo desde o
   último backup completo. Endereçável com WAL (seção 8).
2. **Sem backup de anexos.** A plataforma não armazena arquivo binário hoje.
   Quando armazenar, o backup precisará de uma segunda etapa.
3. **Restauração sobre o banco em uso derruba a aplicação durante o processo.**
   O schema é recriado; conexões abertas veem erro. Faça em janela combinada.
4. **A chave de cifra é ponto único.** Perdê-la torna todos os backups
   irrecuperáveis. Guarde-a fora do servidor de backups.
5. **Armazenamento é local (sistema de arquivos).** Destino em nuvem
   (S3, GCS, Azure) exigiria um adaptador; a interface de armazenamento já está
   isolada em `servico.ts`, mas o adaptador não existe.
6. **O schema preservado dobra o espaço em disco** durante a janela de corte.
   É o preço do rollback imediato; descarte-o assim que a janela fechar.
7. **A chave de cifra ainda não está em cofre** (requisito 3) e os contatos de
   emergência ainda não foram preenchidos (requisito 7). Os dois dependem da
   Coevo e bloqueiam a ida para produção.

---

## 12. PROCEDIMENTO DE EMERGÊNCIA

**Leia inteiro antes de executar qualquer linha.**

### Passo 0 — Não apague nada

Não rode `DROP`, não rode `TRUNCATE`, não "limpe para reimportar". O estado
atual, mesmo quebrado, é informação. O primeiro comando é um **backup do estado
atual**, não uma correção.

```bash
cd /opt/patrono/server
export DATABASE_URL='...'  BACKUP_CHAVE='...'  BACKUP_DIRETORIO='/var/backups/patrono'

npx tsx scripts/backup.ts --tipo preventivo --proteger \
  --motivo "estado antes da recuperação — chamado <n>"
```

Se este comando falhar por o banco estar inacessível, siga para o passo 1 — mas
anote que não há preventivo.

### Passo 1 — Ver o que existe

```bash
npx tsx scripts/restaurar.ts --listar
```

Backups protegidos aparecem com 🔒. Escolha o mais recente **anterior ao
incidente** — não o mais recente de todos, se o incidente foi silencioso e o
último backup já contém o problema.

### Passo 2 — Avaliar sem tocar em nada

```bash
npx tsx scripts/restaurar.ts --backup <rótulo> --destino producao --avaliar
```

Leia as três validações e o bloco IMPACTO. Se aparecer algum **IMPEDIMENTO**,
pare: restaurar mesmo assim é como o problema piora.

### Passo 3 — Ensaiar em banco isolado

**Obrigatório.** Sem um ensaio bem-sucedido nas últimas 72 horas, o passo 4 é
recusado pelo servidor. Não toca no banco em uso.

```bash
npx tsx scripts/restaurar.ts --backup <rótulo>
```

Confira no relatório: registros restaurados, usuários ativos, permissões de
perfil, trilha de auditoria, tabelas de negócio. Nenhuma divergência deve
aparecer. Se aparecer, o backup escolhido não serve — volte ao passo 1.

### Passo 4 — Restaurar sobre o banco em uso

Só depois do passo 3, e em janela combinada. A aplicação fica fora do ar.

```bash
# 1. parar a aplicação
systemctl stop patrono

# 2. liberar a trava de infraestrutura
export PERMITIR_RESTAURACAO_PRODUCAO=true

# 3. restaurar — o preventivo é gerado automaticamente antes
npx tsx scripts/restaurar.ts \
  --backup <rótulo> \
  --destino producao \
  --confirmacao "SUBSTITUIR DADOS DE PRODUCAO" \
  --justificativa "<o que aconteceu, chamado, quem autorizou>" \
  --plano-corte "Janela 02h-03h. TI para a aplicação. <nome> confere depois. \
                 Rollback pelo schema preservado."

# 4. aplicar migrations pendentes, se a avaliação apontou ressalva
./scripts/migrar-com-backup.sh

# 5. retirar a trava
unset PERMITIR_RESTAURACAO_PRODUCAO

# 6. subir
systemctl start patrono
curl -sf http://127.0.0.1:3131/api/saude
```

O comando imprime o nome do **schema preservado** com o estado anterior. Anote-o:
é o caminho de rollback imediato.

### Passo 4b — Rollback, se a conferência reprovar

Não precisa restaurar arquivo nenhum. O estado anterior está no mesmo banco:

```sql
ALTER SCHEMA public RENAME TO descartado_<qualquer>;
ALTER SCHEMA antes_<carimbo> RENAME TO public;
-- trazer as extensões de volta
DO $$ DECLARE e record; BEGIN
  FOR e IN SELECT x.extname FROM pg_extension x
           JOIN pg_namespace n ON n.oid = x.extnamespace
           WHERE n.nspname = 'descartado_<qualquer>'
  LOOP EXECUTE format('ALTER EXTENSION %I SET SCHEMA public', e.extname); END LOOP;
END $$;
```

### Passo 4c — Fechar a janela

Depois de conferido e com a aplicação estável, **descarte o schema preservado**.
Enquanto existir, ocupa espaço equivalente à base inteira.

```sql
DROP SCHEMA antes_<carimbo> CASCADE;
```

### Passo 5 — Conferir

```bash
npx tsx scripts/backup.ts --continuidade
```

E na interface, em **Backup e Restauração**: a restauração deve aparecer no
histórico com o resultado, e o backup preventivo deve estar listado e protegido.

### Se a restauração falhar no meio

A restauração roda numa transação única: ou o banco inteiro volta, ou nada muda.
Se o comando falhou, o banco está como estava antes. Leia a mensagem — ela diz
o rótulo do backup preventivo.

Para voltar ao estado anterior explicitamente:

```bash
npx tsx scripts/restaurar.ts \
  --backup <rótulo-do-preventivo> \
  --destino producao \
  --confirmacao "SUBSTITUIR DADOS DE PRODUCAO" \
  --justificativa "reversão da restauração <n>"
```

### Se a chave de cifra estiver perdida

Não há recuperação dos arquivos. Verifique, nesta ordem:

1. o cofre de credenciais de produção;
2. o `EnvironmentFile` do serviço systemd (`/etc/patrono/backup.env`);
3. as variáveis do processo em execução, se a aplicação ainda estiver de pé:
   `tr '\0' '\n' < /proc/$(pgrep -f 'patrono')/environ | grep BACKUP_CHAVE`.

Se ainda assim não aparecer, os backups existentes são inúteis e o dado
recuperável é apenas o que estiver no banco em uso. Gere imediatamente um
backup novo com uma chave nova e registre a perda.

### Contatos

| Papel | Responsável |
| --- | --- |
| Administrador da plataforma | *a preencher pela Coevo* |
| Responsável pelo banco de dados | *a preencher pela Coevo* |
| Guarda da chave de cifra | *a preencher pela Coevo* |

---

## 13. Backlog

1. **Adaptador de armazenamento em nuvem** — a interface está isolada; falta o
   adaptador S3/GCS/Azure (requisito obrigatório 4).
2. **WAL e recuperação a ponto no tempo** — configuração de servidor, seção 8.
3. **Backup de anexos** — quando a plataforma passar a armazenar arquivos.
4. **Descarte automático do schema preservado** — hoje é manual, e precisa ser:
   apagar sozinho o único caminho de rollback seria pior que ocupar disco.

Concluídos nesta rodada: verificação periódica de checksum e ensaio agendado de
restauração (requisito obrigatório 5).
