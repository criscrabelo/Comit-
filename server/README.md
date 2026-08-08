# Patrono Alta Performance — Backend

Camada de dados, autenticação e integrações da plataforma. Serviço independente
em `server/`, com seu próprio `package.json`. A interface atual continua
funcionando durante toda a migração.

- **Plano da Fase 1, com diagnóstico e diagramas:** <https://claude.ai/code/artifact/0d2b9ad1-017b-41ac-9370-b3c549aeb429>
- **Decisões e desvios:** [`../DECISOES.md`](../DECISOES.md)

---

## Como executar

Requisitos: Node.js 22+ e PostgreSQL 16+.

```bash
cd server
npm install
cp .env.example .env      # preencha DATABASE_URL
createdb -U postgres patrono   # o banco da DATABASE_URL precisa existir
npm run migrate:up        # aplica as migrações
npm run dev               # sobe em modo desenvolvimento
```

`migrate` roda com `--no-single-transaction`, e isso **não** é detalhe de
estilo: as migrações 014 e 015 estão separadas porque o PostgreSQL não permite
usar um valor de enum na mesma transação em que ele foi criado. Numa transação
única a 015 falha com `unsafe use of new value "sistema"`. Cada migração precisa
da própria transação.

**Na máquina da Coevo**, onde a plataforma roda, o caminho é por scripts do
Windows: veja
[`../docs/LIGAR-NA-SUA-MAQUINA.md`](../docs/LIGAR-NA-SUA-MAQUINA.md).

Criar o primeiro usuário (a senha vem de variável de ambiente, nunca de
argumento — argumento aparece em `ps` e no histórico do shell):

```bash
SENHA='uma-senha-longa-de-verdade' npx tsx scripts/criar-usuario.ts \
  --usuario cristiane --nome 'Cristiane Rabelo' --perfil gestora \
  --area juridico --todos-empreendimentos --documento-completo
```

Verificar se está tudo no ar:

```bash
curl localhost:3131/api/saude
```

## Testes

Os testes rodam contra um PostgreSQL **real**, não contra mock. As regras que
importam (idempotência, deduplicação de carteira, posição × movimentação,
trilha append-only) são regras do banco — testá-las contra um mock provaria
apenas que o mock concorda consigo mesmo.

```bash
export DATABASE_URL='postgres://postgres@localhost:5432/patrono_test'
npm run test:banco        # recria o banco e roda tudo
npm test                  # roda sobre o banco existente
```

Verificação do fluxo de autenticação pela rede, com o servidor no ar:

```bash
BASE=http://localhost:3131 ./scripts/verificar-autenticacao.sh
```

## Variáveis de ambiente

Nenhuma credencial vive no código-fonte, no navegador ou em arquivo
versionado. O modelo completo está em [`.env.example`](.env.example).

| Variável | Obrigatória | Observação |
|---|:--:|---|
| `DATABASE_URL` | sim | PostgreSQL 16+. Em produção, exija `sslmode=require` |
| `CORS_ORIGINS` | em produção | Lista de origens. `*` é recusado fora de development |
| `PORT` | não | Padrão 3131 |
| `SESSAO_DURACAO_HORAS` | não | Padrão 12 |
| `MONDAY_TOKEN` | não | Ausente = integração desligada. **Só no servidor**. Cole sem delimitador em volta |
| `SIENGE_SUBDOMAIN` / `SIENGE_USER` / `SIENGE_PASSWORD` | não | Conector nasce desligado |
| `SIENGE_HABILITADO` | não | Mantenha `false` até confirmar os endpoints no ambiente real |
| `PATRONO_SEM_BANCO` | não | `1` dispensa `DATABASE_URL`, **só** para ferramenta que não toca o banco (ver abaixo). O acesso ao banco recusa ser importado nesse modo |

## Levantamento de quadro do Monday

Passo zero de homologar um quadro: descobrir o id dele e quais colunas ele tem.
Somente leitura, e **não grava nada** — nem no Monday, nem no banco.

```bash
PATRONO_SEM_BANCO=1 npx tsx scripts/descobrir-quadro.ts --listar
PATRONO_SEM_BANCO=1 npx tsx scripts/descobrir-quadro.ts --nome 'PROJETOS DE TI'
PATRONO_SEM_BANCO=1 npx tsx scripts/descobrir-quadro.ts \
  --quadro <id> --conferir honorarios --saida forma.md
```

Não exige banco de propósito: o destino de um quadro novo é o que se decide
**depois** do levantamento. Detalhe em
[`../docs/HOMOLOGACAO-QUADROS-NOVOS.md`](../docs/HOMOLOGACAO-QUADROS-NOVOS.md).

## Estrutura

```
server/
├── migrations/            # SQL versionado, reversível
├── scripts/
│   ├── recriar-banco.sh          # recria do zero (dev/teste)
│   ├── criar-usuario.ts          # cria ou atualiza usuário
│   └── verificar-autenticacao.sh # verificação pela rede
├── src/
│   ├── config.ts          # validação do ambiente na partida
│   ├── logging.ts         # redação de token, senha e CPF na saída
│   ├── errors.ts          # formato uniforme de erro
│   ├── app.ts             # montagem, CORS, limites
│   ├── db/                # pool e tipos do esquema
│   ├── auth/              # senha, sessões, tentativas, rotas
│   ├── rbac/              # autorização em quatro dimensões
│   ├── audit/             # trilha append-only
│   ├── dominio/           # CPF/CNPJ e regras de negócio
│   ├── inconsistencias/   # catálogo e Central
│   └── integracoes/
│       ├── execucoes.ts   # contadores e estados
│       ├── upsert.ts      # persistência idempotente
│       └── monday/        # cliente, quadros, transformações
└── test/
```

---

## Perfis e autorização

A autorização é verificada **sempre no servidor**, nunca na tela. O efeito é a
**interseção** de quatro dimensões — cada uma pode negar isoladamente:

- **Módulo** — visão geral, equipe, jurídico, empreendimentos, inteligência, administração
- **Área** — jurídico, TI, financeiro, comercial, obras, diretoria
- **Empreendimento** — lista explícita por usuário, com opção "todos"
- **Tipo de informação** — dado pessoal, valor financeiro, situação jurídica, documento, desempenho individual

| Perfil | Verbo | Alcance padrão | CPF/CNPJ |
|---|---|---|---|
| Diretoria | aprova | consolidado de todos os empreendimentos | mascarado |
| Gestora | prepara | todos os módulos e empreendimentos | completo |
| Líder | distribui | a própria área e sua equipe | mascarado |
| Colaborador | registra | o próprio trabalho | mascarado |
| Administrador | garante a base | integrações, usuários, auditoria | conforme escopo |
| Convidado | consulta | somente o autorizado, **com prazo de validade** | mascarado |

Rota é **negada por omissão**: uma rota que esqueça de se declarar pública
exige sessão. O esquecimento falha fechado, não aberto.

## Regras impostas pelo banco

Estas regras não dependem da disciplina de quem programa — o banco as recusa.
Cada uma é verificada por teste contra PostgreSQL real.

| Regra | Como é imposta |
|---|---|
| Indicador de posição não soma entre dias | `agregar_indicador()` levanta exceção |
| Reprocessamento cria nova versão | índice de versão + `CHECK` que exige motivo |
| Fotografia não se apaga | gatilho `tg_fotografia_sem_exclusao` |
| Importação idempotente | `UNIQUE (fonte, id_origem)` em toda tabela de negócio |
| Carteira deduplicada | `UNIQUE (empresa, empreendimento, data_referencia, tipo)` |
| Saldo não duplica entre notificações | `UNIQUE (contrato_id, data_referencia)` |
| Toda alteração é auditável | gatilho acumula o valor anterior em `historico` |
| Trilha de auditoria é imutável | `UPDATE`/`DELETE` bloqueados |
| Área bruta é imutável | `UPDATE`/`DELETE` bloqueados |
| Sem dado nunca é zero | `CHECK` exige valor **ou** motivo declarado |
| CPF/CNPJ inválido não vincula | índice único só sobre documento validado |
| Sem percentual aprovado não há PDD financeira | tabela exige aprovador e data |
| Falha não apaga o último dado válido | `ausente_desde` marca; nenhuma carga executa `DELETE` |
| Integração é somente leitura | `CHECK (modo = 'leitura')` |

## Proveniência

Toda tabela de negócio carrega, sem exceção — aplicado por função no banco, não
copiado à mão:

`fonte` · `id_origem` · `valor_original` · `valor_normalizado` ·
`extraido_em` · `data_referencia` · `data_fato` · `regra_vinculo` ·
`confianca_vinculo` · `versao_regra` · `execucao_id` · `historico` ·
`ausente_desde` · `demonstrativo`

As três datas são colunas distintas de propósito. `extraido_em` é quando lemos,
`data_referencia` é a que dia a posição se refere, `data_fato` é quando o evento
aconteceu. É isso que impede comparar a posição de duas datas como se fossem o
mesmo instante.

---

## Integração com o Monday

O token vive **apenas no servidor**, lido de variável de ambiente. Nunca é
devolvido em resposta, nunca aparece em log e nunca chega ao navegador.

O cliente percorre `items_page` por cursor **até o fim**. Se um teto de
segurança for atingido, o resultado é marcado como truncado — nunca apresentado
como completo. Colunas são resolvidas por **título**, nunca por ID fixo: ID de
coluna do Monday muda quando alguém recria a coluna, e o quadro não avisa.

| Quadro | ID | Destino | Recorte |
|---|---:|---|---|
| (JUR) PROCESSOS JUDICIAIS | 5959705266 | `processos_judiciais` | carteira |
| (JUR) NOTIFICAÇÕES CLIENTES | 5630368737 | `notificacoes` | competência |
| (JUR) DISTRATOS E DESISTÊNCIAS | 18404493605 | `distratos` | competência |
| (JUR) RETOMADAS | 18413057491 | `distratos` | competência |
| (JUR) HONORÁRIOS EXTRAJUDICIAIS | 7231876117 | `honorarios` | histórico |
| CONTROLE DE ENTREGA CARPE DIEM | 18410779605 | `unidades` | carteira |

Regras de leitura preservadas do código em produção:

- Situação do processo vem de **MEU TRABALHO**, não de STATUS (para comitê)
- Colunas *mirror* e *formula* são lidas por `display_value` — o `text` vem vazio
- Mês da notificação vem do **título do grupo**, não de coluna de data
- Distrato e Desistência são categorias **distintas**, classificadas pelo grupo
- A coluna LOCAL é **atuação** (interno/externo), **não** comarca
- Os 7 grupos excluídos de processos passam a ser contados como ignorados, com
  motivo registrado, em vez de descartados em silêncio

## Integração com o Sienge

Conector **somente leitura** e **desligado por padrão**. Existe uma rotina de
verificação de ambiente que precisa passar antes de qualquer ingestão.

`references/sienge.md` lista cinco endpoints com a ressalva explícita "confirmar
no ambiente", e o adaptador Python da skill traz a mesma advertência. **Nenhum
foi validado contra a API da Coevo.** Enquanto a verificação não passar, os
indicadores financeiros exibem *sem dado* com o motivo declarado — nunca zero.

Posição e movimentação ficam em tabelas **separadas**: saldo e carteira são
posição numa data e nunca se somam entre períodos; pagamento e comissão são
movimentação e somam eventos únicos. Separar fisicamente é o que torna o erro
difícil de cometer.

## Relacionamento entre fontes

Cinco níveis, nesta ordem, com confiança declarada:

| Nível | Chave | Confiança | Condição |
|---:|---|---|---|
| 1 | CPF ou CNPJ | alta | somente validado por dígito verificador |
| 2 | Número do contrato | alta | normalizado |
| 3 | Empreendimento + unidade | média | empreendimento por identificador, não por texto |
| 4 | Identificadores relacionados | média | nunca o ID do item do Monday como identidade do cliente |
| 5 | Nome completo normalizado | baixa | primeiro nome **nunca** vincula |

Empate no mesmo nível **não** é resolvido automaticamente: preserva todos os
registros, abre `vinculo_ambiguo` e encaminha para validação humana.

Em divergência entre fontes, nada é sobrescrito em silêncio: os dois valores
ficam gravados com sua proveniência, a precedência configurada define qual entra
no indicador, e uma inconsistência mostra os dois lados.

---

## Estado da implementação

| # | Entrega | Situação |
|---|---|---|
| B1 | Esqueleto do backend | ✅ concluída |
| B2 | Esquema PostgreSQL (51 tabelas) | ✅ concluída |
| B3 | Autenticação individual | ✅ concluída |
| B4 | Autorização em quatro dimensões | ✅ concluída |
| B5 | Auditoria e sessões | ✅ concluída |
| B6 | Proxy seguro do Monday | ✅ cliente e transformações |
| B7 | Persistência idempotente | ✅ concluída |
| B12 | Logs de integração | ✅ concluída |
| B9 | Central de Inconsistências | 🔄 em andamento |
| B8 | Migração do localStorage | ⏳ |
| B10 | Motor de relacionamento | ⏳ |
| B11 | Estrutura do conector Sienge | ⏳ |
| B13 | Testes restantes | ⏳ |
| B14 | Backup e restauração | ⏳ |

**Fora do escopo da Fase 1:** IA avançada, white-label, cobrança comercial e
marketplace. A identidade visual, os fluxos aprovados e a arquitetura da
informação não foram alterados — o backend é construído para atender os
contratos que o design já definiu.

## Restrições do ambiente de desenvolvimento

- **Docker indisponível** nesta sessão: os testes rodam contra uma instância
  local do PostgreSQL 16, não via Testcontainers. O `docker-compose.yml` para o
  ambiente da Coevo precisará ser validado por vocês.
- **Endpoints do Sienge não confirmados** — ver seção acima.
- **Credenciais reais não configuradas.** Serão informadas por variável de
  ambiente no ambiente de vocês.
