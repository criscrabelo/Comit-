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

### 4.2 O tempo da recompra ainda não é medido em lugar nenhum

Fechar a notificação no acordo resolve o prazo de **cobrança** — era esse o
problema, e está resolvido. Mas o tempo da **recompra**, do acordo até a
revenda, passa a não ser medido por ninguém: a notificação já fechou, e a
ingestão do quadro de distratos ainda não alimenta `data_venda`.

Enquanto isso não for feito, não há resposta para *"quantas recompras estão
abertas e há quanto tempo"* — que é justamente a pergunta que a diretoria faz
sobre unidade parada em estoque.

**Encaminhamento:** alimentar `distratos.data_venda` na homologação do quadro
de Distratos e Retomadas, e derivar dali o tempo de ciclo da recompra.

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
| `normalizarEstagio()` | `Recompra` → `Encerrada`: fecha a cobrança, não a recompra |
| `distratos.data_venda` | data disponível para registrar a revenda — ainda não alimentada pela ingestão |

O que **não** existe: campo para valor devolvido, campo para financiamento
assumido, e segmentação de recompra nos indicadores de tempo.
