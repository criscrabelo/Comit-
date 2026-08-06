# Homologação controlada do Sienge

**Ambiente:** development  
**Executado em:** 2026-08-06T19:26:34.832Z  
**Base:** `https://api.sienge.com.br/<subdomínio>/public/api/v1` (subdomínio no ambiente)  
**Escopo:** todos os 7 endpoints do catálogo

> Integração somente leitura por construção. Cada sonda é mínima e o
> consumo da franquia diária (plano Start, 1.000/dia) é prestado ao final.

## Pré-confirmação (local, sem rede)

| Item | Resultado |
| --- | --- |
| credenciais configuradas | ✅ SIENGE_SUBDOMAIN, SIENGE_USER, SIENGE_PASSWORD presentes no ambiente (valores nunca exibidos) |
| SIENGE_HABILITADO=true | ✅ ligado por decisao explicita para esta homologacao |
| integracao em modo somente leitura | ✅ o cliente so possui GET; o metodo e fixo, nao parametro |
| orcamento diario ≤ franquia (900/1000) | ✅ 900 requisicoes restantes hoje; folga minima por endpoint: 10 |
| catalogo identico ao levantamento (§3) | ✅ 7 caminhos, todos do documento de 06/08/2026 |
| registro de homologacao tem destino no banco | ✅ linha `sienge` presente, modo `leitura` |

_Execução limitada à pré-confirmação: nenhuma requisição foi enviada._
