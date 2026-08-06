# Homologação controlada do Sienge

**Ambiente:** development  
**Executado em:** 2026-08-06T19:42:47.336Z  
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
| autor da confirmacao declarado (--confirmado-por) | ✅ confirmacoes serao registradas em nome de "Cristiane Rabelo (juridico@coevoconstrutora.com.br)" |

## `/companies`

Requisições da sonda: 1

- `resultSetMetadata`: count=43, offset=0, limit=200
- registros recebidos na pagina 1: 43
- campos confirmados no 1º registro: id, name, cnpj, tradeName

✅ **Confirmado e registrado** em `integracoes.relatorio_verificacao` por Cristiane Rabelo (juridico@coevoconstrutora.com.br), com trilha de auditoria.

## `/enterprises`

Requisições da sonda: 2

- count=285; 285 registros recebidos em 2 pagina(s) de 200
- campos confirmados no 1º registro: id, name, cnpj, type, companyId, companyName, creationDate, modificationDate

✅ **Confirmado e registrado** em `integracoes.relatorio_verificacao` por Cristiane Rabelo (juridico@coevoconstrutora.com.br), com trilha de auditoria.

## `/customers`

Requisições da sonda: 2

- clientes ativos: count=3257; pagina 1 com 200 registros
- campos confirmados no 1º registro: id, createdAt, modifiedAt
- registros com CPF/CNPJ na pagina 1: 200 de 200 (valores nao publicados neste relatorio)
- `modifiedAfter=2026-07-07` aceito: count=57

✅ **Confirmado e registrado** em `integracoes.relatorio_verificacao` por Cristiane Rabelo (juridico@coevoconstrutora.com.br), com trilha de auditoria.

## `/accounts-receivable/receivable-bills`

Requisições da sonda: 2

- customerId=3431 (cliente do levantamento §8.3): count=1
- campos confirmados no 1º titulo: receivableBillId, customerId, companyId, issueDate, receivableBillValue, defaulting, subjudice, payOffDate
- ⚠️ a API ACEITOU consulta sem customerId — diverge do §4.4; revisar a limitacao

✅ **Confirmado e registrado** em `integracoes.relatorio_verificacao` por Cristiane Rabelo (juridico@coevoconstrutora.com.br), com trilha de auditoria.

## `/accounts-receivable/receivable-bills/{receivableBillId}/installments`

Requisições da sonda: 1

- titulo 5600 (do levantamento §8.5): count=41
- campos confirmados na 1ª parcela: installmentId, dueDate, balanceDue, conditionTypeId, generatedBoleto

✅ **Confirmado e registrado** em `integracoes.relatorio_verificacao` por Cristiane Rabelo (juridico@coevoconstrutora.com.br), com trilha de auditoria.

## `/total-current-debit-balance`

Requisições da sonda: 1

- consultado com CPF de cliente ativo da pagina 1 de /customers (valor nao publicado); count=1
- campos confirmados: totalOriginalValue, totalAdjustedValue, totalAdditionalValue, totalCurrentDebitBalanceValue
- valor com residuo alem de 2 casas decimais — confirma o tratamento decimal obrigatorio (§8.6)

✅ **Confirmado e registrado** em `integracoes.relatorio_verificacao` por Cristiane Rabelo (juridico@coevoconstrutora.com.br), com trilha de auditoria.

## `/commissions`

Requisições da sonda: 1

- limit=10&offset=0&commissionFilterType=ALL: count=7382
- campos confirmados na 1ª comissao: commissionID, companyId, enterpriseID, brokerID, value, installmentStatus, dueDate

✅ **Confirmado e registrado** em `integracoes.relatorio_verificacao` por Cristiane Rabelo (juridico@coevoconstrutora.com.br), com trilha de auditoria.

## Orçamento diário — prestação de contas

| Item | Valor |
| --- | --- |
| Teto configurado (SIENGE_ORCAMENTO_DIARIO) | 900 |
| Franquia do plano Start | 1.000/dia |
| Saldo ao iniciar | 900 |
| Requisições desta execução | 10 |
| Saldo ao terminar | 890 |

---

**7 de 7 endpoint(s) confirmados e registrados.**
