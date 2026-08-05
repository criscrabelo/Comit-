# Orçamento Planejado x Realizado 2026 — Jurídico e TI

Planilha de acompanhamento orçamentário dos departamentos Jurídico e TI,
construída a partir da ficha de orçamento (`ficha_CRIS`).

**Arquivo:** `Orcamento_Planejado_x_Realizado_2026.xlsx`
**Período:** maio a dezembro/2026 (8 meses)
**Total orçado:** R$ 395.852,68 (revisado — inclui o reajuste da Thamar)

| Departamento | Equipe | Despesas | Total |
|---|---:|---:|---:|
| Jurídico | 160.104,12 | 41.936,36 | **202.040,48** |
| TI | 131.852,20 | 61.960,00 | **193.812,20** |
| **Total** | **291.956,32** | **103.896,36** | **395.852,68** |

### Realizado lançado

Jurídico, mai–jul/26 (3 meses fechados): R$ 54.932,73 contra R$ 66.517,46 planejado.
O TI ainda não foi lançado. A coluna **Linhas lançadas** do Painel mostra a cobertura
(8 de 22) — desvio negativo em linha não lançada é ausência de dado, não economia.

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

## Base de meses do time de TI

A ficha original trazia a coluna TOTAL do time de TI com valores digitados
manualmente, em bases de meses diferentes de pessoa para pessoa (Vinicius e Elias
em 12 meses, Jonathan em 9), enquanto o grid mensal cobria 8 meses (mai–dez).
As demais linhas da ficha usavam `=SOMA()` sobre os meses.

Ficou definido que **vale mai–dez (8 meses) para todos**, o que leva o orçamento
de equipe do TI de R$ 167.778,30 para **R$ 131.852,20** (−R$ 35.926,10).

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
