# Parcelas dos títulos inadimplentes e inadimplência por faixa

**Executado em:** 2026-08-07T14:38:23.053Z  
**Data de referência:** 2026-08-07  
**Fonte:** Sienge, somente leitura

## Escopo

| Item | Valor |
| --- | --- |
| Títulos inadimplentes na base | 1022 |
| Orçamento disponível hoje | 900 |
| Teto desta execução | 850 |
| Ordem | maior valor primeiro |

## Carga

- títulos visitados: **850** de 1022
- parcelas gravadas: **47162**
- requisições: 850 · saldo restante: 50

> ⚠️ **Interrompido pelo orçamento: 172 título(s) não foram lidos.**
> Como a ordem foi por valor decrescente, o que ficou de fora é a cauda
> de menor exposição. Os números abaixo são de uma carga **parcial** e
> estão declarados como tal.

## Inadimplência por faixa de atraso

| Faixa | Parcelas | Clientes | Saldo vencido | % do vencido |
| --- | ---: | ---: | ---: | ---: |
| **1-30 dias** | 243 | 190 | R$ 720.866 | 2.5% |
| **31-60 dias** | 186 | 137 | R$ 806.678 | 2.8% |
| **61-90 dias** | 170 | 125 | R$ 699.103 | 2.4% |
| **91-120 dias** | 168 | 121 | R$ 314.488 | 1.1% |
| **>120 dias** | 5381 | 614 | R$ 26.562.767 | 91.3% |
| **Total vencido** | 6148 | | **R$ 29.103.903** | 100% |

### Contra as metas gerenciais

> Metas de `references/metodologia.md` §5: até 120 dias, **até 4%** da
> carteira de referência; acima de 120 dias, **entre 2% e 2,1%**.

| Recorte | Saldo vencido |
| --- | ---: |
| Até 120 dias | R$ 2.541.136 |
| Acima de 120 dias | R$ 26.562.767 |

⚠️ **O percentual NÃO é apresentado.** A metodologia exige que o
denominador seja a **carteira ativa exigível**, e o que é carteira ativa
exigível no Sienge da Coevo está declarado como pendência de regra de
negócio (`docs/SIENGE-INFORMACOES-PREENCHIDAS.md` §12). Dividir pelo total
de títulos daria um número plausível e errado — e o documento pede,
literalmente, "sempre informar o denominador utilizado".

