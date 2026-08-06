# Orçamento Planejado x Realizado 2026 — Jurídico e TI

Planilha de acompanhamento orçamentário dos departamentos Jurídico e TI,
construída a partir da ficha de orçamento (`ficha_CRIS`).

**Arquivo:** `Orcamento_Planejado_x_Realizado_2026.xlsx`
**Período:** janeiro a dezembro/2026 (12 meses)
**Total orçado:** R$ 547.548,72

| Departamento | Equipe | Despesas | Total |
|---|---:|---:|---:|
| Jurídico | 239.406,18 | 51.324,24 | **290.730,42** |
| TI | 167.778,30 | 89.040,00 | **256.818,30** |
| **Total** | **407.184,48** | **140.364,24** | **547.548,72** |

### Realizado lançado

Mai–jul/26: R$ 81.544,29 realizado contra R$ 60.996,08 planejado no mesmo trimestre.
Jan–abr ainda não foi lançado, e do TI só a equipe. A coluna **Linhas lançadas** do
Painel mostra a cobertura (11 de 23) — desvio negativo em linha não lançada é ausência
de dado, não economia.

Colaboradores CLT (Geovanna e Vinicius) estão divididos em duas linhas, salário bruto
e encargos/benefícios, porque o orçamento foi feito em custo total mas o dado
disponível é o bruto. As linhas de encargos aguardam preenchimento.

Dois aumentos foram tratados de formas diferentes, e a distinção importa:

- **Thamar** (PJ, R$ 5.000 para R$ 5.500): o reajuste estourou o orçado, então o
  planejado foi revisado para cima de out a dez. Orçamento total sobe R$ 1.500.
- **Vinicius** (CLT, bruto de R$ 2.570,52 para R$ 3.070,52 em 05/08): o envelope de
  custo total dele já tinha folga provisionada para um aumento, então o reajuste é
  absorvido e o orçado permanece em R$ 5.416,525/mês. O orçamento não muda.

## Abas

| Aba | Para que serve |
|---|---|
| **Painel** | Visão executiva: desvio por departamento e os 5 maiores estouros. É a tela para levar à diretoria. |
| **Comparativo** | Planejado x realizado linha a linha, no mês e no acumulado. O mês de referência é escolhido em `B3` e comanda todas as outras abas. |
| **Planejado** | Orçamento aprovado. Só deve ser alterado em revisão oficial. |
| **Realizado** | Onde se lança o gasto de cada mês (células amarelas). |
| **Evolução Mensal** | Série mês a mês com gráficos de acumulado e de mês a mês. |
| **Por Plano de Contas** | Mesma comparação agrupada por plano de contas — linguagem do financeiro. |
| **Pendências** | Decisões em aberto que afetam a confiabilidade do comparativo. |
| **Como usar** | Rotina mensal de fechamento. |

## Rotina mensal

1. Na aba **Realizado**, preencher as células amarelas do mês que fechou.
   Item sem gasto no mês: lançar `0`. Deixar em branco significa "ainda não lancei".
2. Preencher a coluna **Fonte do dado** para o número ficar auditável.
3. Na aba **Comparativo**, selecionar o mês em `B3`.
4. Ler o **Painel**.
5. Atualizar a aba **Pendências** conforme as decisões forem tomadas.

## Convenções

- **Desvio = Realizado − Planejado.** Positivo (vermelho) = gastou acima do orçado.
- Tolerância de 5% para classificar como "Dentro do orçado".
- O ranking de estouros ignora desvios de até R$ 1,00 (ruído de arredondamento:
  o rateio mensal da folha CLT tem meio centavo).
- Colaboradores CLT estão orçados pelo custo total (encargos de folha + benefícios).

## Base de meses

A ficha original trazia a coluna TOTAL do time de TI digitada manualmente, em bases
diferentes de pessoa para pessoa, enquanto o grid mensal cobria apenas 8 colunas
(mai–dez). Com o período estendido para o ano inteiro, os três totais se reconciliam
exatamente:

| Pessoa | Valor/mês | Meses | Total | Confere com a ficha |
|---|---:|---:|---:|---|
| Vinicius | 5.416,525 | 12 (jan–dez) | 64.998,30 | sim |
| Elias | 1.065,00 | 12 (jan–dez) | 12.780,00 | sim |
| Jonathan | 10.000,00 | 9 (abr–dez) | 90.000,00 | sim |
| | | | **167.778,30** | **sim** |

Não era erro de digitação: o grid mensal é que estava incompleto. A entrada do
Jonathan em abril é o que explica os 9 meses.

O 1º quadrimestre foi preenchido replicando os valores mensais conhecidos, já que
a ficha não o cobria — ver a pendência "Planejado de jan a abr" na planilha.

## Manutenção

- As colunas de identificação da aba **Realizado** (A a G) são fórmulas que
  espelham a aba **Planejado**. Alterá-las quebra o comparativo.
- Para incluir uma nova linha de orçamento, inseri-la na aba **Planejado** e
  replicar nas abas **Realizado** e **Comparativo**, mantendo o mesmo ID.
- A coluna `O` da aba **Comparativo** está oculta: é a chave de ordenação do
  ranking de estouros do Painel.

O arquivo é gerado pelo script `gerar_planilha.py`, que pode ser reexecutado
para recriar a planilha do zero (`python3 gerar_planilha.py`). Os lançamentos do
realizado ficam apenas no `.xlsx` — reexecutar o script sobrescreve o arquivo.
