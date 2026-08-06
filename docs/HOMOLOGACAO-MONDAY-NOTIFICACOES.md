# Homologação controlada do Monday — Notificações a Clientes

> ## ⏳ AGUARDANDO APROVAÇÃO
>
> Homologação do quadro **Notificações a Clientes** (board `5630368737`)
> executada de ponta a ponta em **2026-08-06**, com o mesmo rito aprovado para
> Processos Judiciais: pré-confirmação, duas execuções consecutivas, 14
> métricas, 7 provas, rótulos reais e amostra anonimizada.
>
> **As sete provas passaram.** Há **três itens abertos** que dependem de decisão
> do jurídico, nenhum deles bloqueante para a carga — seção 6.

**Quadro autorizado:** `(JUR) NOTIFICAÇÕES CLIENTES` — board **5630368737**
**Rito:** o mesmo de `docs/HOMOLOGACAO-MONDAY.md`, aprovado em 06/08/2026.
**Relatório completo, com os números reais:**
`docs/evidencias/homologacao-monday-notificacoes.md`

---

## 1. Estado desta entrega

**Execução real: 2026-08-06, contra o board `5630368737` da conta
Coevoconstrutora.** O token autenticou, as duas execuções consecutivas rodaram
até o fim, e as sete provas passaram.

| Item | Situação |
| --- | --- |
| **Pré-confirmação dos 4 itens** | ✅ **os 4 passaram** antes de qualquer leitura |
| Credencial autenticada (`query { me }`) | ✅ conta Cristiane C. Rabelo |
| **Primeira execução** — 14 métricas | ✅ **1072 lidos, 1072 incluídos, 0 ignorados, 0 erros** |
| **Segunda execução** — 7 provas | ✅ **7 de 7** — idempotência provada sobre o board real |
| Rótulos reais do board | ✅ **levantados** — 27 colunas, todos os valores distintos |
| Títulos repetidos no quadro | ⚠️ **2 detectados e declarados** — seção 4 |
| Amostra anonimizada com dados reais | ✅ emitida; varredura final: **nenhum CPF/CNPJ presente** |
| CPF em campo de texto livre da ORIGEM | ⚠️ **3 encontrados e removidos da amostra** — seção 5 |
| Suíte contra PostgreSQL real | **371 testes passando**, dos quais **14 novos** de Notificações |
| Classificação de judicialização | não se aplica — este quadro não a alimenta |

### Resumo da primeira execução (dados reais)

| Métrica | Valor |
| --- | --- |
| Quantidade recebida (lidos da origem) | 1072 |
| Páginas consultadas | 6 |
| Último cursor | `null` — leitura chegou ao fim |
| Quantidade normalizada | 1072 |
| Incluída | 1072 |
| Atualizada / Inalterada | 0 / 0 (primeira carga) |
| Ignorada | 0 — este quadro não tem grupo excluído do comitê |
| Duplicada / Com erro | 0 / 0 |
| Data de referência | 2026-08-05 |
| Duração | 19,8 s |
| Contabilidade fecha | sim |

Na segunda execução, os mesmos 1072 lidos saem como **0 incluídos, 0
atualizados, 1072 inalterados** — a prova direta de que rodar de novo não
duplica nem reescreve.

**Nota de leitura do relatório:** a inconsistência `falha_importacao` que
aparece ao final é a **falha simulada da prova 6**. Não é falha da carga real —
as duas execuções reais terminaram com status `sucesso`.

Para repetir a homologação:

```bash
MONDAY_TOKEN=<token> \
DATABASE_URL=<url> \
npx tsx scripts/homologar-monday.ts --quadro notificacoes \
  --saida ../docs/evidencias/homologacao-monday-notificacoes.md
```

---

## 2. Os três defeitos que só a execução real revelou

Os três apareceram contra o quadro vivo, e **nenhum deles podia ter aparecido na
homologação de Processos Judiciais**. É a segunda vez que o rito paga o próprio
custo: em processos foi o título com apóstrofos; aqui foram estes.

### 2.1 A competência derivada do grupo nunca era criada — a carga inteira era recusada

`competencia_ref` é chave estrangeira para `competencias(ref)` em **todas** as
tabelas de negócio, e **nada no fluxo de ingestão criava a linha**.

Em processos o defeito não tinha como aparecer: os grupos daquele quadro
(`CJ (REGRESSO)`, `TETUS LOCAÇÃO`, `CREDENTE`…) não derivam competência nenhuma,
o campo ficava nulo, e **nulo não viola chave estrangeira**. Em notificações os
grupos **são meses** (`AGOSTO/ 2026`, `DEZEMBRO/  2025`), a competência é
derivada de cada um — e o PostgreSQL recusou o lote inteiro:

```
insert or update on table "notificacoes"
violates foreign key constraint "notificacoes_competencia_ref_fkey"
```

**1072 itens lidos, 0 gravados.** O relatório dessa primeira rodada está
preservado em `docs/evidencias/homologacao-monday-notificacoes-antes-da-correcao.md`.

**Correção (`garantirCompetencias`, em `sincronizar.ts`):** antes do upsert, as
competências referenciadas pelo conjunto são criadas com a janela do mês e um
rótulo legível (`Dezembro 2025`, `01/12` a `31/12`). Três decisões dentro disso:

1. **A competência nasce aberta.** `fechada_em` fica nulo. Fechar competência é
   ato de gestão, e uma carga automática não pratica esse ato.
2. **`ON CONFLICT DO NOTHING`.** O que já existe é preservado — inclusive o
   rótulo escolhido pela gestão e o `fechada_em` de uma competência encerrada.
   Uma carga não reabre nem renomeia competência.
3. **Uma vez por carga, não por item.** O conjunto é conhecido inteiro antes do
   upsert: as 38 competências de um quadro de três anos custam uma consulta e
   uma inserção, não 1072 idas ao banco para obter sempre a mesma resposta.

A competência pedida por `--competencia` é garantida **antes de abrir a
execução**: `execucoes_importacao.competencia` é chave estrangeira igual, e sem
execução aberta não haveria onde contabilizar a falha.

**38 competências foram criadas pela carga**, de `2022-08` a `2026-08`.

### 2.2 Três colunas do mapa não existiam com aqueles títulos

O board usa títulos que o mapa não previa. Sem correção, três campos ficariam
nulos nos 1072 registros — **sem erro, sem aviso**, exatamente como `situacao`
ficou nula nos 250 processos antes da correção de aspas.

| Campo | Título no mapa (antes) | Título real do board | Evidência |
| --- | --- | --- | --- |
| `modelo` | `MODELO`, `TIPO DE NOTIFICAÇÃO`, `TIPO` | **`MODELOS DE NOTIFICAÇÃO`** | os valores são os modelos em si (`PARCELAS REGULARES EM ATRASO`, `FINANCIAMENTO EM ATRASO`…) |
| `total_dias` | `TOTAL DE DIAS`, `DIAS` | **`TOTAL DIAS`** (sem o "DE") | coluna de fórmula |
| `data_solucao` | `DATA DA SOLUÇÃO`, `DATA DE SOLUÇÃO` | **`RESOLUÇÃO`** | ver abaixo |

**`RESOLUÇÃO` não é suposição — o próprio quadro declara.** A fórmula da coluna
`TOTAL DIAS` é:

```
DAYS({date_mm2v7zz4}, {date0})   →   DAYS({RESOLUÇÃO}, {DATA DA NOTIFICAÇÃO})
```

Ou seja: o board define o total de dias como o intervalo que **começa na
notificação e fecha na resolução**. Isso é a definição de data de solução, dita
pelo quadro, não inferida do nome da coluna.

O título `RESOLUÇÃO` entrou **depois** dos títulos explícitos na lista de
preferência: se alguém criar uma coluna `DATA DA SOLUÇÃO`, ela vence. O título
real de hoje não vira a definição do campo.

Resultado: `modelo` preenchido em **1071 de 1072**, `total_dias` em 181,
`data_solucao` em 175.

### 2.3 Dois títulos iguais no mesmo quadro — o desempate era silencioso

O board tem **duas colunas chamadas `'MEU TRABALHO'`**:

| Coluna | Tipo | Preenchimento | Valores |
| --- | --- | --- | --- |
| `nome_m_s` | `date` | 21 de 1072 | datas soltas |
| `status68` | `status` | 1072 de 1072 | `FEITO` (743), `ACOMPANHANDO` (329) |

E três colunas chamadas `link to (JUR) RETOMADAS`.

A resolução por título pressupõe que o título **identifique** a coluna. Aqui ele
não identifica, e a regra de desempate — a primeira que não for espelho —
decidia sozinha, sem deixar rastro. Hoje a escolha recai sobre `nome_m_s`, a
coluna de data quase toda vazia.

Isso não afeta a carga atual: nenhum campo de notificações mapeia
`'MEU TRABALHO'`. **Afeta processos.** Naquele quadro, `'MEU TRABALHO'` é a
coluna que alimenta `situacao` — e se ele ganhar uma segunda coluna com o mesmo
título, a situação de 250 processos troca de coluna sem nenhum aviso, levando
junto a taxa de judicialização.

**Correção (`titulosAmbiguos`, em `quadros.ts`):** a ambiguidade passou a ser
**declarada**, não resolvida. A carga não é interrompida — a coluna escolhida
pode muito bem ser a certa —, mas o relatório de homologação traz uma tabela
com o título repetido, todas as colunas que o usam e qual foi escolhida. É o que
separa "resolvido por título" de "resolvido por acaso de ordenação".

---

## 3. Mapa de colunas — Monday → Patrono

**Conferido contra o board real (2026-08-06).** O quadro tem 27 colunas; 6
alimentam campos do Patrono.

| Campo no Patrono | Coluna no Monday | Coluna no banco | Preenchimento |
| --- | --- | --- | --- |
| `cliente` | CLIENTE | `notificacoes.cliente_nome` | 1072 / 1072 |
| `empreendimento` | EMPREENDIMENTO | `empreendimento_id`, `torre` | 1072 / 1072 |
| `estagio` | ESTÁGIOS | `estagio` + `estagio_detalhe` | 1072 / 1072 |
| `modelo` | **MODELOS DE NOTIFICAÇÃO** | `modelo` | 1071 / 1072 |
| `data_notificacao` | DATA DA NOTIFICAÇÃO | `data_notificacao` | 1019 / 1072 |
| `data_solucao` | **RESOLUÇÃO** | `data_solucao` | 175 / 1072 |
| `total_dias` | **TOTAL DIAS** | `total_dias` | 181 / 1072 |
| — | título do grupo | `competencia_ref`, `grupo` | 1072 / 1072 |
| — | nome do item | `unidade` | 1072 / 1072 |

### Campos derivados, não lidos de coluna

`torre` e `unidade` **não vêm de colunas**, e por isso aparecem na lista de
"colunas do mapa não encontradas" sem que isso seja defeito:

- **`torre`** sai do sufixo do EMPREENDIMENTO: `AURORA TORRE B` → empreendimento
  `AURORA`, torre `TORRE B`. Preenchida em 282 registros — os empreendimentos
  sem torre (`CARPE DIEM`, `ALAMEDAS`, `BELLA VIDA`) ficam nulos, corretamente.
- **`unidade`** sai do nome do item, sem o prefixo do empreendimento:
  `BELLA VIDA 124` → `124`. Preenchida em 1072.

**13 empreendimentos** foram resolvidos por nome normalizado a partir do quadro.

### Colunas do quadro que ninguém mapeou

Levantadas com seus rótulos reais no relatório, disponíveis para decisão futura:
`AR`, `NEGATIVAÇÃO`, `FINANCEIRO/RENEGOCIAÇÃO`, `FINANCIAMENTO`,
`MEIOS DA NOTIFICAÇÃO`, `PRAZO FINAL`, `REQUERIMENTO`,
`DIAS PARA O ENVIO DA NOTIFICAÇÃO`, `RESPONSÁVEL`, `REQUERENTE`, `EXECUTOR`,
`ID Honorários`, `ELEMENTO` e as ligações para os quadros de Retomadas e
Honorários.

### Colunas que o quadro não tem

`cpf_cnpj`, `contrato`, `acordo`, `saldo_vencido`, `saldo_atualizado` e
`dias_atraso` — gravadas como nulas, nunca presumidas. **Consequência:** sem
`cpf_cnpj`, as inconsistências de documento inválido não são geradas para
notificações, e o vínculo com cliente depende do motor de relacionamento.

---

## 4. Estágio: o rótulo bruto é preservado

`ESTÁGIOS` tem **16 rótulos distintos**, todos preservados em `estagio_detalhe`.
A normalização para os dois valores dos indicadores é derivada:

| Regra | Resultado | Registros |
| --- | --- | --- |
| rótulo contém `resolvid` ou `unidade retomada` | `Resolvida` | 824 |
| qualquer outro | `Em Andamento` | 248 |

Os cinco rótulos mais frequentes: `Resolvido` (777), `Processo Judicial Dra.
Michele` (60), `Processo judicial interno` (52), `Unidade retomada` (47),
`Enviado para Protesto` (32).

**A restrição do banco é respeitada.** `notificacao_solucao_coerente` exige que
`data_solucao` só exista para item resolvido, e a transformação já grava a data
apenas quando `estagio = 'Resolvida'`. Nenhuma linha foi recusada por isso.

---

## 5. Amostra anonimizada

Emitida com **dados reais do board**, já mascarados. A varredura final sobre a
amostra publicada **não encontrou CPF nem CNPJ**.

`cliente_nome` é substituído por `***` sempre — nome de cliente não entra na
amostra de jeito nenhum. `id_origem` é reduzido aos 4 últimos caracteres.

> ⚠️ **A varredura acusou 3 CPF nos campos de texto livre da ORIGEM**, removidos
> da amostra antes de publicar. Isto é informação para o jurídico, não defeito
> da plataforma: **documento digitado em campo livre não é protegido por nenhum
> mascaramento de coluna**. Vale conferir o preenchimento desses campos no
> quadro.

---

## 6. Itens abertos — decisão do jurídico

Nenhum é bloqueante. Nenhum foi decidido por inferência.

### 6.1 `situacao` não tem coluna de origem — 0 de 1072 preenchidos

O board **não tem** coluna `SITUAÇÃO`, `SITUACAO` nem `STATUS`. O campo
`notificacoes.situacao` está nulo em toda a carga.

O candidato natural é a coluna `'MEU TRABALHO'` do tipo `status`
(`FEITO` 743 / `ACOMPANHANDO` 329), pelas duas razões óbvias: é o mesmo título
que alimenta `situacao` em Processos Judiciais, e `ACOMPANHANDO` é o mesmo
vocabulário que aparece lá.

**Não foi mapeada.** O que não se reconhece não é presumido, e aqui há dois
motivos concretos para não presumir:

1. `ESTÁGIOS` já alimenta `estagio` e `estagio_detalhe`. Se `situacao` também
   sair de uma coluna de status, é preciso saber **qual das duas manda** nos
   indicadores — e isso é decisão de quem monta o comitê.
2. Se a resposta for `'MEU TRABALHO'`, a resolução **precisa ser feita por
   tipo**: há duas colunas com esse título, e hoje a escolhida é a de data
   (item 2.3). Mapear sem resolver isso gravaria datas dentro de `situacao`.

**Pergunta para o jurídico:** `FEITO`/`ACOMPANHANDO` deve alimentar
`notificacoes.situacao`? Se sim, ela manda ou o `ESTÁGIOS` manda?

### 6.2 Sete itens terminais perdem a data de resolução

Seis itens com estágio `Distratado` e um com `A Retomar` têm `RESOLUÇÃO`
preenchida na origem, mas são classificados como `Em Andamento` — e a
transformação, corretamente, não grava `data_solucao` para item não resolvido.

O sintoma visível: **181 registros têm `total_dias`, mas só 175 têm
`data_solucao`**. A diferença são esses sete.

A pergunta não é técnica: **`Distratado`, `Recompra` e `A Retomar` encerram a
notificação?** Se encerram, entram na regra de `Resolvida` junto com `Resolvido`
e `Unidade retomada`, e o tempo médio de solução passa a considerá-los. Alterar
a regra muda um indicador de comitê — por isso fica com quem conhece o fluxo.

### 6.3 Títulos repetidos no board

Duas colunas `'MEU TRABALHO'` e três `link to (JUR) RETOMADAS`. A plataforma
declara a ambiguidade e segue; a limpeza é do lado do Monday, e é o caminho mais
seguro: renomear uma das duas resolve o item 6.1 de quebra.

---

## 7. Limitações

1. **A execução real rodou em banco local de homologação** (`patrono_homolog`),
   recriado do zero pelas 18 migrações, não no banco de produção. As provas
   valem para o esquema — que é o mesmo —, e a primeira carga em produção repete
   o mesmo runner.
2. **O board é vivo.** Os números valem para 2026-08-06. As contagens por coluna
   mudam conforme a equipe trabalha no quadro; o runner pode ser reexecutado a
   qualquer momento, e a idempotência provada garante que reexecutar não duplica.
3. **Teto de 200 páginas** na leitura. O board tem 1072 itens em 6 páginas —
   folga ampla. Acima do teto a carga é marcada truncada e **nenhum registro é
   marcado ausente**.
4. **Sem `cpf_cnpj` no quadro**, notificações não geram inconsistência de
   documento inválido, e o vínculo com cliente depende do motor de
   relacionamento (`docs/` — motor de vínculos).
5. **`situacao` indisponível** até a decisão do item 6.1.

---

## 8. Ordem seguinte, após aprovação

1. **Distratos e Desistências** (board `18404493605`) — mesmo rito;
2. Retomadas (`18413057491`);
3. Honorários Extrajudiciais (`7231876117`) — exige destino de ingestão, hoje
   ausente;
4. Controle de Entrega Carpe Diem (`18410779605`) — idem;
5. validação dos endpoints do Sienge;
6. cruzamento Monday × Sienge.

Um quadro por vez, como aprovado em 06/08/2026.
