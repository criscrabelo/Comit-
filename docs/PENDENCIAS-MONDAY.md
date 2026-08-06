# Ajustes pedidos nos quadros do Monday

Documento para quem mantém os quadros do jurídico. Saiu das homologações dos
sete quadros, executadas contra os dados reais em 06/08/2026.

**Nada aqui é urgente e nada quebra o que já funciona.** Cada item é uma
informação que a plataforma consegue ler, mas que hoje não existe ou está em
branco na origem — então ela aparece como "sem dado", nunca como zero.

---

## 1. Ligações entre quadros (4 colunas)

O código já procura estas colunas. **No dia em que forem criadas, passam a ser
preenchidas sozinhas** — nada precisa ser refeito do lado da plataforma.

São colunas de **conexão** (o tipo que aponta para um item de outro quadro),
não texto. Ligar por nome não serve: `SIETE 44-C` e `SIETE 44C` são o mesmo
imóvel escrito de dois jeitos, e só o identificador resolve.

| Quadro | Coluna a criar | Aponta para |
| --- | --- | --- |
| Distratos e Desistências | Notificação de origem | quadro de Notificações |
| Cessão de Direitos de Recompra | Notificação de origem | quadro de Notificações |
| Cessão de Direitos de Recompra | Contrato de origem | quadro de Contratos |
| Cessão de Direitos de Recompra | Processo relacionado | quadro de Processos Judiciais |

**Por que importa:** hoje não há como responder *"esta recompra veio de qual
cobrança?"* nem *"quantas notificações viraram distrato?"* — a ligação existe
na prática, mas não no dado.

---

## 2. Colunas que faltam (2)

| Quadro | Coluna | Para quê |
| --- | --- | --- |
| Distratos e Desistências | **Data de conclusão do distrato** | Hoje só existe a data da solicitação. Sem a conclusão não há tempo de ciclo — só se sabe quando pediu, não quando terminou |
| Cessão de Direitos de Recompra | Terceiro valor no status: **"desistiu após aceitar"** | Hoje o status só admite aceitar ou recusar. Quem aceita e depois desiste não tem onde ser registrado, e acaba contado como aceite |

---

## 3. Preencher o que está em branco (2)

| Quadro | Coluna | Situação |
| --- | --- | --- |
| Honorários Extrajudiciais | 5 colunas que começam com emoji (📋 Tipo de Honorário e outras) | **0 de 500 preenchidas** — foram criadas e nunca usadas |
| Controle de Entrega Carpe Diem | **HABITE-SE** | **0 de 112 preenchidas** — num quadro cujo propósito é acompanhar entrega |

O segundo é o mais estranho: sem habite-se, o quadro de controle de entrega não
consegue dizer se a entrega está no prazo.

---

## 4. Padronizar grafia (1)

**`ALAMEDA` e `ALAMEDAS`** aparecem como empreendimentos diferentes, e são o
mesmo prédio. A plataforma não junta nomes parecidos por decisão de projeto —
juntar por semelhança é como se cria cliente duplicado. Precisa ser padronizado
na origem.

---

## 5. Uma pergunta que só o jurídico responde

Quando **o cliente pede** o distrato (em vez de a Coevo iniciar), onde isso deve
ser registrado?

- **Opção A** — um valor novo na coluna `MOTIVO` que já existe
- **Opção B** — uma coluna separada, tipo "quem iniciou"

A diferença importa para o indicador: se for valor de `MOTIVO`, ele concorre com
os outros motivos e não dá para cruzar *"quem pediu"* com *"por quê"*. Se for
coluna separada, dá.

---

## Resumo por quadro

| Quadro | Itens |
| --- | --- |
| Distratos e Desistências | 1 ligação, 1 coluna nova, 1 pergunta |
| Cessão de Direitos de Recompra | 3 ligações, 1 valor de status |
| Honorários Extrajudiciais | 5 colunas a preencher |
| Controle de Entrega Carpe Diem | 1 coluna a preencher |
| Empreendimentos (todos) | padronizar ALAMEDA/ALAMEDAS |
