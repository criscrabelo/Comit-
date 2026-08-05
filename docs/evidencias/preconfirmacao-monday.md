# Homologação controlada do Monday

**Quadro:** Processos Judiciais — board `5959705266`  
**Ambiente:** development  
**Competência:** todas  
**Executado em:** 2026-08-05T02:05:13.535Z  
**Versão da API do Monday:** 2024-10

> Nenhum dado foi alterado no Monday. O proxy recusa `mutation` e
> `subscription` antes de qualquer chamada — ver item 2 da pré-confirmação.

## Pré-confirmação

| Item | Resultado |
| --- | --- |
| `token_configurado: true` | ✅ MONDAY_TOKEN presente no ambiente (valor nunca exibido) |
| integração em modo somente leitura | ✅ trava no transporte (`consultar`), antes de qualquer requisição |
| quadro configurado = 5959705266 | ✅ (JUR) PROCESSOS JUDICIAIS — `5959705266` |
| nenhuma mutation ou subscription no pipeline | ✅ 4 consulta(s) do pipeline, todas aceitas pela trava |

_Execução limitada à pré-confirmação: nenhuma leitura foi feita e nada foi gravado._

