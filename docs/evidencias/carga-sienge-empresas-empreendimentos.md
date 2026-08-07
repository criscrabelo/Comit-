# Carga incremental do Sienge

**Executado em:** 2026-08-07T15:01:44.407Z  
**Etapas:** empresas, empreendimentos

## Planejamento (antes de gastar)

| Etapa | Registros na origem | Requisições estimadas | Cabe hoje? |
| --- | ---: | ---: | --- |
| empresas | 43 | 1 | ✅ |
| empreendimentos | 285 | 2 | ✅ |
| clientes | 3258 | 17 | ✅ |
| titulos | 5149 | 26 | ✅ |
| parcelas | 5149 | 5149 | ⚠️ nao cabe num dia (5149 requisicoes contra 850 disponiveis); a etapa processa o que couber e retoma na proxima carga |
| comissoes | 7387 | 37 | ✅ |

Total estimado: **5232** requisições · saldo disponível: **850** · carga completa cabe hoje: não — parcelas retoma em dias seguintes

## Execução

| Etapa | Executada | Requisições | Lidos | Incluídos | Atualizados | Inalterados | Ignorados | Observação |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| empresas | ✅ | 1 | 43 | 0 | 0 | 0 | 43 |  |
| empreendimentos | ✅ | 2 | 285 | 274 | 0 | 0 | 11 |  |

## Orçamento diário

Saldo antes: 895 · consumidas: 3 · saldo depois: 892 · reserva preservada: 50

---

**Status:** `sucesso` · contabilidade fecha: sim
