# Saída de cliente — distrato, retomada e recompra

Regra de negócio da Coevo, registrada a partir da explicação da Cristiane
Rabelo em 06/08/2026. Existe porque os três caminhos eram tratados no código
como variações do mesmo evento, e **não são**: têm gatilho diferente,
responsável diferente e ciclo de vida diferente.

---

## 1. A árvore de decisão

Quando o cliente vai sair, o caminho depende de duas perguntas: **ele está
financiado?** e **ele responde?**

| Situação do cliente | Caminho |
| --- | --- |
| Quer distratar, ou é caso de distrato | **Distrato** |
| Não responde à Coevo | **Retomada** |
| **Financiado**, sem interesse na unidade | **Recompra** pode ser oferecida |

A recompra é uma **oferta**, não uma consequência automática: ela existe como
alternativa ao distrato quando o cliente está financiado.

---

## 2. O que é a recompra

É um processo próprio, não uma variação do distrato. Na recompra:

- a **Coevo assume o financiamento** do cliente;
- a Coevo **devolve algum valor** ao cliente, avaliado **caso a caso**, em
  função do que ele já pagou;
- a unidade retorna para a Coevo e **no Sienge fica como distratada**;
- **o financiamento continua no nome do cliente junto ao banco**, mesmo com a
  Coevo pagando — é o único vínculo que sobra, e ele é fora dos sistemas da
  plataforma;
- quem opera é **outra pessoa**: distrato tem um responsável, recompra tem
  outro.

> **Termo comercial:** a Cristiane mencionou que é o que a Caixa Econômica hoje
> chama de _contra-intermediária_ (grafia a confirmar antes de virar rótulo de
> interface).

---

## 3. Quando a recompra termina

**Não é no acordo.** A recompra continua sendo acompanhada depois de
registrada, porque para finalizá-la é preciso:

1. encontrar um **novo comprador** para a unidade; e
2. o novo comprador **concluir todo o processo de compra**.

Isso pode levar **seis meses, um ano ou até dois anos**.

### A notificação e a recompra são dois objetos diferentes

É a distinção que resolve o modelo, e ela precisa ficar explícita porque os dois
falam da mesma unidade:

| | A que se refere | Quando termina |
| --- | --- | --- |
| **Notificação** | o ciclo de **cobrança** com o cliente inadimplente | **quando a recompra é acordada** — não há mais o que cobrar dele |
| **Recompra** | o processo da **unidade** até a revenda | quando um novo comprador conclui a compra: seis meses a dois anos |

Por isso o estágio `Recompra` na notificação é **`Encerrada`**: encerra a
cobrança, que é do que a notificação trata. A recompra em si continua sendo
acompanhada no quadro de **Distratos e Retomadas**, com
`categoria = 'recompra'`.

**O motivo de fechar** é concreto: se a notificação ficasse aberta durante todo
o processo de recompra, o prazo de notificação viraria um número sem sentido —
um caso de cobrança de três dias e um de setecentos entrariam na mesma média.

`Encerrada` e não `Resolvida`, porque recompra não é cobrança bem-sucedida: é
saída do cliente. Contar como resolução inflaria a taxa de resolução.

---

## 4. Consequências que ainda não estão tratadas

### 4.1 O que fica no nome do cliente é o financiamento — no banco, não no Sienge

Correção de um entendimento errado registrado antes: **no Sienge a unidade
aparece como distratada**, normalmente. O que continua no nome do cliente é o
**financiamento junto ao banco** — a Coevo o assumiu de fato, mas
formalmente ele segue em nome dele na instituição financeira.

Duas consequências, e as duas importam:

**A Coevo carrega uma obrigação que o sistema não enxerga.** O banco não é
fonte de dados da plataforma — não há integração com a Caixa. Então o
financiamento assumido não aparece em lugar nenhum: nem no Monday, nem no
Sienge, nem aqui. É exposição real, invisível ao sistema por construção.

**No cruzamento Monday × Sienge, uma recompra vai parecer um distrato.** O
Monday classifica como `recompra`, o Sienge representa como distrato. Os dois
estão certos: são representações diferentes do mesmo fato, em sistemas com
finalidades diferentes.

Isso **não é inconsistência**, e precisa estar registrado antes de chegarmos ao
cruzamento — senão a Central de Inconsistências vai abrir um caso para cada
recompra, e alguém vai "corrigir" uma das pontas.

### 4.2 O tempo da recompra ainda não é medido — e o encaminhamento anterior não resolve

Fechar a notificação no acordo resolve o prazo de **cobrança** — era esse o
problema, e está resolvido. O tempo da **recompra**, do acordo até a revenda,
continua sem medição.

> **Correção (06/08/2026, homologação do board `18404493605`).** A versão
> anterior desta seção dizia que "a ingestão do quadro de distratos ainda não
> alimenta `data_venda`", e encaminhava alimentá-la. **As duas coisas estavam
> erradas**, e a homologação mostrou por quê. Ver seção 4.3.

**A Coevo confirmou que precisa desse dado** (06/08/2026). A medição depende de
**duas coisas que hoje não existem** — uma data de revenda na origem e itens com
`categoria = 'recompra'` —, e nenhuma se obtém ajustando o mapa de colunas. O
diagnóstico está na seção 4.3; o encaminhamento, na seção 7.

### 4.3 O que a homologação de Distratos encontrou sobre `data_venda`

Três achados, em ordem de consequência.

**1. `data_venda` JÁ é alimentada pela ingestão.** O mapa liga
`data_venda → DATA DA VENDA` (`quadros.ts`), a transformação a lê
(`sincronizar.ts`), e a carga real gravou os **38 de 38** registros com o campo
preenchido. A afirmação anterior de que a ingestão não a alimentava era
factualmente errada.

**2. Mas ela não é a revenda — é a venda ORIGINAL ao cliente que está saindo.**
Isso não é interpretação; é o que o dado e a origem dizem:

| Evidência | O que mostra |
| --- | --- |
| Em **36 dos 38** registros, `data_venda` é **anterior** à `data_solicitacao` | a venda aconteceu antes do pedido de saída |
| Intervalo médio venda → solicitação: **300 dias**; máximo **1312** | é tempo de posse, não de revenda |
| Fórmula da coluna `PERÍODO (DIAS)` no board: `DAYS({DATA DA SOLICITAÇÃO}, {DATA DA VENDA})` | o próprio quadro define esse par como um período de posse |

Ou seja: `distratos.data_venda` hoje responde *"quando o cliente comprou"*, e não
*"quando a unidade foi revendida"*. Usá-la para medir o ciclo da recompra daria
um número plausível e errado — e errado para mais, já que incluiria todo o
tempo em que o cliente teve a unidade.

**Não existe coluna de revenda em nenhum dos dois quadros.** Nem em Distratos
(`18404493605`) nem em Retomadas (`18413057491`).

**3. E não há nenhuma recompra para medir.** A seção 3 diz que a recompra é
acompanhada "no quadro de Distratos e Retomadas, com `categoria = 'recompra'`".
`classificarCategoriaDistrato()` só produz `recompra` quando o título do grupo
contém `RECOMPRA` ou `RE-COMPRA`. Os grupos reais são:

| Quadro | Grupos | Categoria produzida |
| --- | --- | --- |
| `18404493605` Distratos | `DISTRATOS` (26), `DESISTÊNCIAS` (12) | `distrato`, `desistencia` |
| `18413057491` Retomadas | `RETOMADAS` (23) | `retomada` |

**Nenhum grupo de recompra existe.** Hoje `categoria = 'recompra'` é um valor
que o `CHECK` do banco aceita e que a ingestão **nunca produz**. A pergunta
*"quantas recompras estão abertas e há quanto tempo"* não tem fonte de dados —
não é questão de derivar de `data_venda`, é que a recompra não é registrada como
tal em lugar nenhum.

**O que efetivamente destrava a medição** está na **seção 7**, que trata dela de
ponta a ponta. Em resumo: a recompra precisa existir na origem, uma data de
revenda precisa existir na origem, e só então o ciclo pode ser derivado.

### 4.4 A ligação com a notificação: pronta no código, faltando no quadro de Distratos

Pergunta relacionada e distinta: **quantos dias da NOTIFICAÇÃO até o fim de todo
o processo?** Ela atravessa dois quadros, e cada ponta tem um estado diferente.

| | Onde | Existe? |
| --- | --- | --- |
| Início — data da notificação | Notificações `5630368737` | ✅ 1019 de 1072 |
| Fim — conclusão do distrato | Distratos `18404493605` | ❌ sem coluna (item 6.1 da homologação) |
| **Qual notificação corresponde a qual saída** | ligação entre quadros | ✅ em Retomadas · ❌ em Distratos |

**A coluna `PERÍODO (DIAS)` do quadro NÃO responde isso.** A fórmula é
`DAYS({DATA DA SOLICITAÇÃO}, {DATA DA VENDA})` — tempo de posse do imóvel, da
compra até o pedido de saída. Os valores de três dígitos e quatro dígitos que
aparecem na coluna (643, 1.057, 1.312) são anos de posse, não duração de
processo.

**O que foi implementado (migração 020):** `distratos.notificacoes_origem`,
guardando o `id_origem` das notificações ligadas na origem. Mapeado nos **dois**
quadros com os mesmos títulos aceitos — eles gravam na mesma tabela, e listas
divergentes fariam a ligação existir num e não no outro.

Guarda o `id_origem` e não uma chave estrangeira, para não criar dependência de
ordem de carga; e é ARRAY porque a mesma unidade pode ser notificada mais de uma
vez antes de sair.

**Validado com dado real pelo quadro de Retomadas**, que já tem a coluna:

| | Resultado |
| --- | --- |
| Retomadas com ligação declarada | **23 de 23** |
| Ligações que resolvem para uma notificação existente | **23 de 23** |
| Distratos com ligação | **0 de 38** — a coluna ainda não existe no quadro |
| Notificação → pedido, pelos pares ligados | **21 pares · média 39 dias · 3 a 108** |

Por que a ligação declarada importa mais do que parece: casar por
empreendimento + unidade é adivinhação, e **erra**. Nos distratos esse palpite
produziu um par com **–29 dias** — pedido antes da notificação, ou seja, dois
episódios diferentes da mesma unidade tratados como um. Pela ligação declarada,
nenhum dos 21 pares é negativo. E o nome também não serve como chave: no quadro
de Retomadas o item `SIETE 44-C` aponta para a notificação `SIETE 44C`, com um
hífen de diferença — por isso o vínculo lê o **id**, não o texto visível.

**Falta, no quadro de Distratos:** criar a coluna de ligação para
`(JUR) NOTIFICAÇÕES CLIENTES` e preenchê-la. A ingestão passa a gravar sozinha,
**sem nenhuma alteração de código** — inclusive se a coluna for criada com o
nome automático `link to (JUR) NOTIFICAÇÕES CLIENTES`. Enquanto não existir, o
campo aparece em `ausentes` no relatório e o array fica vazio: vazio significa
"sem ligação declarada", nunca "sem notificação".

Com a ligação e a data de conclusão, o ciclo completo fecha. Só com a ligação,
já se mede notificação → pedido — que é a metade que existe hoje.

Enquanto isso, **`distratos.data_venda` não deve ser usada como data de
revenda**, e o campo merece ser lido como "data da venda original".

> **Anomalia registrada:** um item (`VERANO 1003B`, desistência) tem
> `data_venda` **46 dias depois** da solicitação, e outro tem as duas datas
> iguais. Pode ser erro de digitação ou uso da coluna com outro sentido naquela
> linha. Vale conferência do jurídico — são 2 em 38.
---

## 5. O que o modelo hoje não guarda

Nenhum dos dois bloqueia as homologações do Monday, mas os dois viram pergunta
na etapa de indicadores:

1. **O valor devolvido ao cliente** na recompra. Avaliado caso a caso, e não há
   campo para ele. "Quanto devolvemos em recompras neste mês" hoje não tem
   resposta.
2. **O financiamento assumido pela Coevo.** Continua em nome do cliente no
   banco, e o banco não é fonte de dados da plataforma. Não há campo, e não há
   de onde puxar automaticamente: se esse número precisar existir, será entrada
   manual com proveniência declarada.

---

## 6. Como está no código hoje

| Onde | O que faz |
| --- | --- |
| `distratos.categoria` | `distrato`, `desistencia`, `retomada`, `recompra` — os quatro já são distintos, com CHECK no banco |
| `classificarCategoriaDistrato()` | separa pelo título do grupo no Monday; produziria `recompra` para um grupo `RECOMPRA` — **que não existe em nenhum dos dois quadros** |
| `normalizarEstagio()` | `Recompra` → `Encerrada`: fecha a cobrança, não a recompra |
| `distratos.data_venda` | **alimentada** desde a homologação, com a **venda original** ao cliente que sai — **não** com a revenda (seção 4.3) |

O que **não** existe: campo para valor devolvido, campo para financiamento
assumido, segmentação de recompra nos indicadores de tempo, **coluna de revenda
na origem** e **qualquer item classificado como recompra**.

> Atenção ao ler esta tabela junto com a seção 3: o estágio `Recompra` **existe**
> na notificação (16 rótulos reais em `ESTÁGIOS`, board `5630368737`) e fecha a
> cobrança corretamente. O que não existe é o registro do **processo** de
> recompra do outro lado — a notificação encerra apontando para um
> acompanhamento que nenhum quadro faz hoje.

---

## 7. Como medir recompras abertas e por quanto tempo

A pergunta — *"quantas recompras estão em aberto e há quanto tempo"* — precisa
de três informações. Duas já existem; a terceira é a incógnita.

| Informação | Onde está | Situação |
| --- | --- | --- |
| Quando a recompra começou | `distratos.data_solicitacao` | mapeada nos dois quadros |
| Que é recompra | `distratos.categoria` | classificada pelo grupo do Monday |
| **Quando terminou (revenda)** | `distratos.data_venda` | **é o que falta descobrir** |

Enquanto a data de venda não for conhecida, não há como distinguir recompra
aberta de recompra concluída — e o indicador contaria as duas juntas.

### Passo 1 — procurar a coluna nos dois quadros

Os candidatos foram acrescentados aos dois quadros: `DATA DA VENDA`,
`DATA VENDA`, `DATA DA REVENDA`, `REVENDA`, `NOVA VENDA`.

Procurar não inventa dado: se nenhuma existir, `resolverMapa` reporta em
`ausentes` e o campo fica nulo.

> **Correção de duas premissas (homologação de 06/08/2026).**
>
> **1. Recompra NÃO tem grupo próprio no quadro de Retomadas.** Conferido contra
> o board `18413057491`: ele tem **um único grupo, `RETOMADAS`** (23 itens).
> Nenhum grupo de recompra existe em nenhum dos dois quadros.
>
> **2. Incluir `DATA DA VENDA` na lista de Retomadas é ativamente perigoso**, e
> foi revertido só para aquele quadro. Aquele board **tem** a coluna
> `DATA DA VENDA` — e ela é a **venda original**, igual à de Distratos: as datas
> vão de 2022 a 2025 contra solicitações de 2026, e a fórmula de `PERÍODO (DIAS)`
> é a mesma `DAYS({SOLICITAÇÃO}, {VENDA})`.
>
> Com ela na lista, `retomadas.data_venda` sairia **preenchido em quase todos os
> itens** — com a data errada. Pelo critério do Passo 2 abaixo, alguém leria
> "a coluna existe e está preenchida → o indicador sai direto" e publicaria um
> indicador que trata toda retomada como recompra concluída. É o pior dos três
> desfechos, porque parece o melhor.
>
> Em Retomadas, `data_venda` agora aceita **apenas** títulos de revenda
> (`DATA DA REVENDA`, `REVENDA`, `NOVA VENDA`). Nenhum existe, então o campo cai
> em `ausentes` e fica nulo — que é o resultado honesto e o que o próprio Passo 1
> pede.

### Passo 2 — RESPONDIDO pela homologação de 06/08/2026

O quadro de Distratos foi homologado (`docs/HOMOLOGACAO-MONDAY-DISTRATOS.md`) e
o de Retomadas, inspecionado. Das três saídas previstas, vale a terceira:

- ~~A coluna existe e está preenchida~~ → **não**. A única coluna de venda nos
  dois quadros é a venda original ao cliente que sai.
- ~~A coluna existe mas está vazia nas recompras~~ → **não**. Não há coluna de
  revenda, e não há recompras.
- ✅ **A coluna não existe** — e falta mais do que ela.

**Falta uma coisa a mais que o Passo 1 não previa: não há nenhuma recompra.**
`categoria = 'recompra'` só é produzida por um grupo `RECOMPRA`/`RE-COMPRA`, e
nenhum dos dois quadros tem esse grupo. A linha "Que é recompra — classificada
pelo grupo do Monday" da tabela acima descreve uma capacidade **pronta e nunca
exercida**: das três informações necessárias, **duas faltam**, não uma.

**Encaminhamento, na ordem:**

1. **a recompra precisa existir na origem** — grupo próprio num dos dois
   quadros. Sem isso não há o que contar, e a data de revenda não resolve nada;
2. **uma data de revenda precisa existir na origem** — coluna nova, com nome que
   não se confunda com `DATA DA VENDA`. As duas são "venda", e a homologação
   mostrou que a confusão é fácil;
3. só então o indicador do Passo 3.

Criar as duas no Monday continua sendo o caminho mais barato: os quadros são da
equipe. A alternativa de esperar o Sienge e detectar o fechamento pelo novo
contrato na unidade continua mais tarde e mais frágil — e não resolve o item 1.

### Nota de modelagem: uma coluna, dois significados

`distratos.data_venda` é gravada pelos **dois** quadros, que escrevem na mesma
tabela. Se Retomadas passar a alimentá-la com a **revenda** e Distratos continuar
com a **venda original**, a mesma coluna passa a significar coisas diferentes
conforme a `categoria` — e qualquer indicador que a leia sem filtrar por
categoria mistura as duas.

Vale decidir antes de criar a coluna no Monday: ou a revenda ganha campo próprio
(`data_revenda`), ou `data_venda` é redefinida para um sentido só e o outro sai
de outro lugar. **Não foi decidido aqui.**

### Passo 3 — a forma do indicador

Três cuidados, os três decorrentes de regras já estabelecidas no projeto:

**É indicador de posição, não de movimentação.** "Recompras abertas hoje" não
pode ser somado entre dias. Segue a regra registrada em `versoes_regras`, e a
função `agregar_indicador` já recusa somar posição.

**Precisa de fotografia diária para ter série.** Sem `fotografias_diarias`,
existe só o número de hoje — e a diretoria pergunta se está melhorando ou
piorando, que é uma pergunta sobre a série.

**Faixa de envelhecimento vale mais que média.** Uma média de 400 dias não diz
o que fazer. O que diz é:

| Faixa | O que significa |
| --- | --- |
| 0–6 meses | dentro do esperado |
| 6–12 meses | acompanhar |
| 12–24 meses | atenção |
| acima de 24 meses | fora do ciclo normal declarado pela própria regra |

A cauda é o que importa: três unidades acima de dois anos é uma informação
acionável; a média que as esconde, não.