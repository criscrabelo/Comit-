# Sienge — informações consolidadas para ativação da integração

Documento consolidado a partir do levantamento realizado no ambiente da Tetus/CoEvo, da documentação oficial do Sienge e de consultas reais executadas na API.

> **Objetivo:** fornecer ao responsável pelo sistema desenvolvido com Claude as informações já confirmadas para configurar e homologar a integração com o Sienge, sem depender de suposições sobre endpoints, parâmetros, paginação ou formato de resposta.


> **Nota de anonimização:** os exemplos da seção 8 continham nome de cliente e
> nome de corretor com CPF embutido. Foram mascarados nesta cópia versionada —
> documento em repositório não carrega dado pessoal. Os valores estruturais
> (ids, datas, valores) foram preservados.

---

## 1. Acesso à API

| # | Informação | Resposta |
|---|---|---|
| 1.1 | URL base da API REST | `https://api.sienge.com.br/tetus/public/api/v1` |
| 1.2 | Subdomínio | `tetus` |
| 1.3 | Versão | `v1` |
| 1.4 | API habilitada | Sim — API REST habilitada |
| 1.5 | Ambiente separado de homologação | Não |
| 1.6 | URL de homologação | Não se aplica |

---

## 2. Autenticação

| # | Informação | Resposta |
|---|---|---|
| 2.1 | Método | Basic Auth |
| 2.2 | Usuário de integração | `tetus-patrono` |
| 2.3 | Senha | Já existe; inserir no ambiente seguro do responsável pelo sistema |
| 2.4 | Modelo de permissão | O usuário acessa os endpoints liberados no Painel de Integrações |
| 2.5 | Escopo da automação | Somente leitura |
| 2.6 | Expiração da senha | Não expira |
| 2.7 | Troca periódica | Não exigida |
| 2.8 | Bloqueio por tentativas incorretas | Não informado |

### Endpoints já liberados/utilizados

- Empresas
- Empreendimentos
- Clientes
- Títulos do Contas a Receber
- Parcelas dos títulos
- Saldo Devedor Presente do Cliente — Total
- Comissões

---

## 3. Endpoints confirmados

### 3.1 Empresas

- `GET /companies`
- `GET /companies/{companyId}`

### 3.2 Empreendimentos

- `GET /enterprises`
- `GET /enterprises/{enterpriseId}`
- `GET /enterprises/{enterpriseId}/groupings`

### 3.3 Clientes

- `GET /customers`
- `GET /customers/{id}`

### 3.4 Títulos do Contas a Receber

- `GET /accounts-receivable/receivable-bills`
- `GET /accounts-receivable/receivable-bills/{receivableBillId}`

### 3.5 Parcelas do título

- `GET /accounts-receivable/receivable-bills/{receivableBillId}/installments`

### 3.6 Saldo Devedor Presente do Cliente — Total

- `GET /total-current-debit-balance`

### 3.7 Saldo Devedor Presente por e-mail

- `POST /email-current-debit-balance`
- Não utilizar na integração de leitura, pois serve para envio de relatório por e-mail e não para consulta estruturada.

### 3.8 Comissões

- `GET /commissions`
- `GET /commissions/{id}`
- `GET /commissions/countFilters`
- `GET /commissions/configurations/brokers`
- `GET /commissions/configurations/enterprises/{id}`

### Endpoints complementares a avaliar ao final

- contratos de vendas
- unidades
- pagamentos
- reparcelamentos
- distratos
- acordos
- retomadas
- títulos inadimplentes
- histórico de cobranças

---

## 4. Parâmetros dos endpoints

### 4.1 `GET /companies`

| Parâmetro | Obrigatório | Regra |
|---|---:|---|
| `limit` | Não | Padrão `100`; máximo `200` |
| `offset` | Não | Padrão `0` |

### 4.2 `GET /enterprises`

| Parâmetro | Obrigatório | Regra |
|---|---:|---|
| `limit` | Não | Testado com `200` |
| `offset` | Não | Testado com `0` e `200` |

### 4.3 `GET /customers`

| Parâmetro | Obrigatório | Regra |
|---|---:|---|
| `cpf` | Não | CPF sem máscara |
| `cnpj` | Não | CNPJ sem máscara |
| `internationalId` | Não | Identificação internacional |
| `onlyActive` | Não | `true` retorna somente ativos |
| `enterpriseId` | Não | Código do empreendimento |
| `createdAfter` | Não | Data inicial de criação, `yyyy-MM-dd` |
| `createdBefore` | Não | Data final de criação, `yyyy-MM-dd` |
| `modifiedAfter` | Não | Data inicial da última alteração, `yyyy-MM-dd` |
| `modifiedBefore` | Não | Data final da última alteração, `yyyy-MM-dd` |
| `limit` | Não | Padrão `100`; máximo `200` |
| `offset` | Não | Padrão `0` |

**Carga incremental:** disponível por `modifiedAfter` e `modifiedBefore`.

### 4.4 `GET /accounts-receivable/receivable-bills`

| Parâmetro | Obrigatório | Regra |
|---|---:|---|
| `customerId` | Não | Código do cliente — recorta por cliente quando informado |
| `companyId` | Não | Código da empresa |
| `costCenterId` | Não | Código do centro de custo |
| `paidOff` | Não | Padrão `false` |
| `limit` | Não | Padrão `100`; máximo `200` |
| `offset` | Não | Padrão `0` |

> **Correção de 06/08/2026 (homologação):** este documento originalmente
> registrava `customerId` como obrigatório e a listagem geral como
> impossível. A sonda real da homologação testou uma consulta **sem**
> `customerId` e recebeu `200` com `resultSetMetadata.count = 5149` — a
> listagem geral existe. Isso muda a carga de ~3.257 requisições (uma por
> cliente ativo) para ~26 (uma por página de 200). Evidência em
> `docs/evidencias/homologacao-sienge.md`. Mantido aqui como correção
> registrada, não como edição silenciosa do levantamento original.

### 4.5 `GET /accounts-receivable/receivable-bills/{receivableBillId}/installments`

| Parâmetro | Obrigatório | Regra |
|---|---:|---|
| `receivableBillId` | Sim | Identificador do título no caminho |

### 4.6 `GET /total-current-debit-balance`

| Parâmetro | Obrigatório | Regra |
|---|---:|---|
| `cpf` | Condicional | CPF sem máscara |
| `cnpj` | Condicional | CNPJ sem máscara |
| `correctionDate` | Não | Data de correção, `yyyy-MM-dd`; se omitida, usa a data atual |
| `conditionIdIn` | Não | Lista de condições a incluir |
| `conditionIdNotIn` | Não | Lista de condições a excluir |
| `receivableBillsIds` | Não | Lista de títulos considerados no cálculo |

**Regras:**

- CPF e CNPJ são mutuamente excludentes.
- `conditionIdIn` tem prioridade sobre `conditionIdNotIn`.

### 4.7 `GET /commissions`

| Parâmetro | Obrigatório | Regra |
|---|---:|---|
| `unitId` | Não | Código da unidade |
| `contractId` | Não | Número do contrato |
| `brokerId` | Não | Código do corretor |
| `companyId` | Não | Código da empresa |
| `enterpriseId` | Não | Código do empreendimento |
| `startingDueDate` | Não | Data inicial, `yyyy-MM-dd` |
| `endingDueDate` | Não | Data final, `yyyy-MM-dd` |
| `offset` | Sim | Quantidade a pular |
| `limit` | Sim | Quantidade a retornar |
| `commissionFilterType` | Não | Situação da comissão |

Valores aceitos em `commissionFilterType`:

- `ALL`
- `PAID`
- `CANCELLED`
- `AWAITING_AUTHORIZATION`
- `AWAITING_RELEASE`
- `RELEASED`

---

## 5. Paginação

Padrão confirmado nos endpoints de listagem:

```json
{
  "resultSetMetadata": {
    "count": 0,
    "offset": 0,
    "limit": 0
  },
  "results": []
}
```

### Regra recomendada

1. iniciar com `offset=0`;
2. somar a quantidade recebida ao `offset`;
3. repetir enquanto `offset + quantidade_recebida < count`.

### Resumo por endpoint

| Endpoint | Paginação | Limite padrão | Limite máximo |
|---|---|---:|---:|
| `/companies` | `limit` + `offset` | 100 | 200 |
| `/enterprises` | `limit` + `offset` | não registrado | 200 confirmado |
| `/customers` | `limit` + `offset` | 100 | 200 |
| `/accounts-receivable/receivable-bills` | `limit` + `offset` | 100 | 200 |
| Parcelas do título | resposta paginada | 100 observado | não confirmado |
| `/commissions` | `limit` + `offset` obrigatórios | não informado | não informado |
| `/total-current-debit-balance` | retorno pontual com metadados | 1 no teste | não se aplica |

### Teste real de empreendimentos

- total: 285
- página 1: `offset=0`, `limit=200`
- página 2: `offset=200`, `limit=200`

---

## 6. Limites de requisição

| Informação | Resposta |
|---|---|
| Plano contratado | Start |
| Limite REST por minuto | 200 requisições |
| Limite Bulk Data por minuto | 20 requisições |
| Franquia diária REST do Start | 1.000 requisições |
| Pode exceder a franquia | Sim |
| Tratamento do excedente | Deve ser monitorado e validado contratualmente |
| Erro de bloqueio | HTTP `429` |

### Pendências contratuais

- custo das chamadas excedentes;
- eventual teto de consumo;
- forma de consulta do consumo;
- regras específicas para REST e Bulk Data.

---

## 7. Empresas e empreendimentos

### 7.1 Empresas

- Total: 43
- Incluir todas as 43 empresas.
- Identificador principal: `id`.
- Não deduplicar por nome ou CNPJ.

Campos confirmados:

- `id`
- `name`
- `cnpj`
- `tradeName`

### 7.2 Empreendimentos

- Total: 285
- Incluir todos os 285 registros.
- Identificador principal: `id`.
- Não excluir previamente por tipo, finalidade, ambiente, nome ou natureza auxiliar.

Campos confirmados:

- `id`
- `name`
- `commercialName`
- `cnpj`
- `type`
- `adress`
- `creationDate`
- `modificationDate`
- `createdBy`
- `modifiedBy`
- `companyId`
- `companyName`
- `costDatabaseId`
- `costDatabaseDescription`
- `buildingTypeId`
- `buildingTypeDescription`
- `enterpriseObservation`

---

## 8. Exemplos reais validados

### 8.1 Empresa

```json
{
  "id": 1,
  "name": "TETUS - CONSTRUTORA E INCORPORADORA LTDA",
  "cnpj": "13.852.255/0001-24",
  "tradeName": "COEVO CONSTRUTORA E INCORPORADORA"
}
```

### 8.2 Empreendimento

```json
{
  "id": 1,
  "name": "COEVO CONSTRUTORA E INCORPORADORA",
  "commercialName": null,
  "cnpj": "13.852.255/0001-24",
  "type": "1",
  "creationDate": "2021-08-11",
  "modificationDate": "2026-01-26",
  "companyId": 1,
  "companyName": "TETUS - CONSTRUTORA E INCORPORADORA LTDA"
}
```

### 8.3 Cliente usado no teste

- `customerId`: `3431`
- total de clientes ativos consultados: 3.257

### 8.4 Título do Contas a Receber

```json
{
  "customerId": 3431,
  "receivableBillId": 5600,
  "documentId": "CT  ",
  "documentNumber": "304",
  "issueDate": "2026-08-04",
  "receivableBillValue": 341233.77,
  "companyId": 17,
  "defaulting": false,
  "subjudice": false,
  "note": null,
  "payOffDate": null,
  "unityName": "304"
}
```

### 8.5 Parcela

```json
{
  "receivableBillId": 5600,
  "installmentId": 1,
  "carrierId": 1,
  "conditionTypeId": "AT",
  "dueDate": "2026-08-06",
  "balanceDue": 7000.0,
  "generatedBoleto": true
}
```

### 8.6 Saldo devedor total

```json
{
  "resultSetMetadata": {
    "count": 1,
    "offset": 0,
    "limit": 1
  },
  "results": [
    {
      "totalOriginalValue": 341233.7699999997,
      "totalAdjustedValue": 341233.7699999997,
      "totalAdditionalValue": 0.0,
      "totalCurrentDebitBalanceValue": 341233.7699999997
    }
  ]
}
```

**Tratamento obrigatório:** usar tipo decimal ou arredondar valores monetários para duas casas.

### 8.7 Comissão

```json
{
  "commissionID": 10186,
  "companyId": 16,
  "companyName": "COEVO & CONELESTE EMPREENDIMENTO IMOBILIARIO SPE LTDA",
  "enterpriseID": 144,
  "enterpriseName": "ALAMEDA DAS CASTANHEIRAS -  VENDAS",
  "billNumber": 115311,
  "customerID": 3369,
  "customerName": "*** (nome de cliente removido)",
  "customerSituationType": "noDebts",
  "unitName": "1010B",
  "brokerID": 4101,
  "brokerName": "*** (nome e CPF de corretor removidos)",
  "billingBrokerId": null,
  "billingBrokerName": null,
  "blockEdit": false,
  "value": 1485.13,
  "installmentPercentage": 0.8,
  "installmentStatus": "RELEASED",
  "paymentOperationType": null,
  "salesContractNumber": "CVCOEVOCONST53294095",
  "contractBillNumber": 5447,
  "contractPercentagePaid": 0.48,
  "considerEmbeddedInterest": true,
  "commissionReleasedToBePaid": true,
  "commissionReleasedAutomatically": false,
  "dueDate": "2026-08-15",
  "installmentNumber": 1,
  "totalInstallmentsNumber": 1
}
```

---

## 9. Tipos de condição de pagamento

O campo `conditionTypeId` utiliza códigos internos do Sienge.

| Código | Descrição |
|---|---|
| PI | Parcelas Iniciais |
| PS | Parcelas Semestrais |
| PB | Parcelas Bimestrais |
| CH | Entrega das chaves |
| AN | Parcela anual |
| RE | Resíduo |
| RN | Renegociação |
| CS | CUSTAS |
| PN | PERSONALIZAÇÃO |
| CC | Cartão de Crédito |
| AU | AUTOMOVEL |
| IM | IMÓVEIS |
| TE | TERRENOS |
| AL | ALUGUEL |
| T | TRIMESTRAIS |
| 10 | Diferença de Financiamento |
| DF | Diferença de financiamento |
| RJ | Renegociação jurídico |
| CP | CASA PAULISTA |
| FI | Financiamento |
| FF | Financiamento F |
| SB | Subsídio |
| FG | FGTS |
| AT | Ato |
| S | SINAL |
| UN | Parcela única |
| PA | Mensal Correção Anual |
| TX | Nova Taxa Evolução |
| PM | Parcelas Mensais |
| MD | Parcelas Mensais Dois |
| A2 | Ato 2 |

Esses códigos também podem ser usados em:

- `conditionIdIn`
- `conditionIdNotIn`

no endpoint `GET /total-current-debit-balance`.

---

## 10. Dados disponíveis pela API

| Dado | Disponível | Endpoint/campo | Observação |
|---|---:|---|---|
| Empresa | Sim | `/companies` | Confirmado |
| Empreendimento | Sim | `/enterprises` | Confirmado |
| Cliente | Sim | `/customers` | Confirmado |
| CPF/CNPJ | Sim | `/customers` | Confirmado |
| Contrato | Parcial | `/commissions` | Endpoint próprio ainda deve ser avaliado |
| Unidade | Sim, parcialmente | `unityName`, `unitName` | Código estruturado ainda não confirmado |
| Título a receber | Sim | `receivableBillId` | Confirmado |
| Parcela | Sim | `installmentId` | Confirmado |
| Vencimento | Sim | `dueDate` | Confirmado |
| Valor original | Sim | `receivableBillValue`, `totalOriginalValue` | Confirmado |
| Saldo da parcela | Sim | `balanceDue` | Confirmado |
| Saldo ajustado | Sim | `totalAdjustedValue` | Confirmado |
| Acréscimos | Sim, agregado | `totalAdditionalValue` | Não separa juros e multa |
| Saldo devedor presente | Sim | `totalCurrentDebitBalanceValue` | Confirmado |
| Juros separados | Não confirmado | — | Pendente |
| Multa separada | Não confirmado | — | Pendente |
| Correção separada | Não confirmado | — | Pendente |
| Dias de atraso | Calculável | `dueDate` | Depende de regra de negócio |
| Inadimplência | Sim | `defaulting` | Confirmado |
| Sub judice | Sim | `subjudice` | Confirmado |
| Data de quitação | Sim | `payOffDate` | Pode ser nula |
| Boleto gerado | Sim | `generatedBoleto` | Confirmado |
| Pagamentos | Não confirmado | — | Pendente |
| Comissão | Sim | `/commissions` | Confirmado |
| Situação da comissão | Sim | `installmentStatus` | Confirmado |
| Corretor | Sim | `brokerID`, `brokerName` | Confirmado |
| Beneficiário | Sim | `billingBrokerId`, `billingBrokerName` | Pode ser nulo |

---

## 11. Datas e atualização

| Item | Resposta |
|---|---|
| Data de referência do saldo | Data atual quando `correctionDate` não é informada |
| Consulta retroativa | Sim, por `correctionDate` |
| Formato de data | `yyyy-MM-dd` |
| Frequência de atualização | Pendente |
| Horário de fechamento | Pendente |
| Fuso horário | Pendente |
| Juros/multa/correção | Agregados em `totalAdditionalValue`; separação não confirmada |

Datas observadas:

- clientes: `createdAt`, `modifiedAt`, `modifiedAtDateTime`;
- empreendimentos: `creationDate`, `modificationDate`;
- títulos: `issueDate`, `payOffDate`;
- parcelas e comissões: `dueDate`.

---

## 12. Pontos ainda pendentes

### Pendências técnicas

- bloqueio por tentativas incorretas;
- custo e regra do excedente do plano Start;
- limite máximo de `limit` em `/commissions`;
- endpoint estruturado de pagamentos;
- endpoint próprio de contratos;
- endpoint próprio de unidades;
- separação de juros, multa e correção;
- frequência de atualização;
- horário de fechamento;
- fuso horário.

### Regras de negócio pendentes

- carteira ativa exigível;
- tratamento de renegociação;
- reparcelamento;
- acordo;
- distrato;
- retomada;
- recompra;
- cessão de direitos;
- transferência de titularidade;
- contrato suspenso;
- contrato encerrado;
- cobrança judicial.

---

## 13. Recomendação para a próxima etapa

Com as informações atuais, já é possível encaminhar este documento ao responsável pelo sistema e solicitar:

1. configuração do cliente Sienge com Basic Auth;
2. implementação dos endpoints confirmados;
3. paginação por `limit` e `offset`;
4. tratamento decimal de valores monetários;
5. homologação endpoint por endpoint;
6. registro das lacunas restantes como pendências de regra de negócio, sem bloquear o início da integração.

A integração principal já pode avançar. Os itens restantes devem ser tratados como refinamentos e validações adicionais, especialmente contratos, unidades, pagamentos e regras de carteira.
