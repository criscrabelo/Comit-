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

Consequência direta no modelo: uma notificação em estágio `Recompra` fica
**`Em Andamento`**, e é correto que fique. Ela não é um caso encerrado
aguardando fechamento burocrático — ela está genuinamente em curso.

### Por que isto foi registrado

Na homologação do quadro de Notificações (board 5630368737), `Recompra`
apareceu com 7 ocorrências e foi cogitado tratá-la como estágio terminal, junto
com `Distratado` e `A Retomar`. Seria errado: encerraria na origem um processo
que continua por até dois anos, e a unidade sairia do acompanhamento justamente
durante o período em que ela precisa ser acompanhada.

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

### 4.2 Recompra envelhece de forma diferente das demais

Um caso em `Aguardando pagamento` há 400 dias é problema. Um caso em
`Recompra` há 400 dias é **normal**.

Hoje os dois ficam juntos em `Em Andamento`, então qualquer indicador de tempo
médio de notificações abertas, ou qualquer alerta de caso parado, vai tratar os
dois do mesmo jeito. O tempo médio sobe por causa das recompras, e um caso de
cobrança realmente esquecido fica escondido no meio delas.

**Proposta, não aplicada:** segmentar recompra nos indicadores de tempo — ou
como série própria, ou excluída do tempo médio de cobrança, com o número dela
reportado à parte. Depende de decisão de quem lê o indicador no comitê.

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
| `classificarCategoriaDistrato()` | separa pelo título do grupo no Monday; recompra tem grupo próprio |
| `normalizarEstagio()` | `Recompra` → `Em Andamento`, **confirmado correto** por esta regra |
| `distratos.data_venda` | data disponível para registrar a revenda — ainda não alimentada pela ingestão |

O que **não** existe: campo para valor devolvido, campo para financiamento
assumido, e segmentação de recompra nos indicadores de tempo.
