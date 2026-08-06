# Primeira carga controlada do Sienge

**Executado em:** 2026-08-06T20:04:51.924Z  
**Fonte:** API REST do Sienge, somente leitura  
**Rito:** duas passagens completas; a segunda prova a idempotência.

## Pré-verificação

| Item | Resultado |
| --- | --- |
| credenciais | ✅ presentes (valores nunca exibidos) |
| endpoints homologados | ✅ 7 de 7 |
| orçamento diário disponível | ✅ 900 requisições |
| parcelas nesta carga | ❌ deliberadamente fora (estratégia B19.2) |

## Passagem 1 — carga

### Empresas — 43 de 43 (1 página[s])

### Empreendimentos — 285 de 285 (2 página[s]) · só registro bruto

> 285 registros do Sienge incluem SPEs e bases auxiliares. Criar entidades
> agora despejaria tudo isso nas telas; o casamento com os empreendimentos
> do Monday é a próxima etapa, com regra explícita.

### Clientes — 3257 de 3257 (17 página[s])

- 3257 incluídos · 0 atualizados · 0 inalterados · 0 documento(s) duplicado(s) → inconsistência
- com documento válido: 3243 de 3257

### Títulos a receber — 5142 de 5142 (26 página[s])

- 5142 incluídos · 0 atualizados · 0 inalterados
- inadimplentes (flag da API): 1022 · sub judice: 0
- ligados a cliente por id do Sienge: 5142 · sem cliente na base: 0

## Passagem 2 — prova de idempotência

### Empresas — 43 de 43 (1 página[s])

### Empreendimentos — 285 de 285 (2 página[s]) · só registro bruto

> 285 registros do Sienge incluem SPEs e bases auxiliares. Criar entidades
> agora despejaria tudo isso nas telas; o casamento com os empreendimentos
> do Monday é a próxima etapa, com regra explícita.

### Clientes — 3257 de 3257 (17 página[s])

- 0 incluídos · 0 atualizados · 3257 inalterados · 0 documento(s) duplicado(s) → inconsistência
- com documento válido: 3243 de 3257

### Títulos a receber — 5142 de 5142 (26 página[s])

- 0 incluídos · 0 atualizados · 5142 inalterados
- inadimplentes (flag da API): 1022 · sub judice: 0
- ligados a cliente por id do Sienge: 5142 · sem cliente na base: 0

## Orçamento diário — prestação de contas

| Item | Valor |
| --- | --- |
| Saldo ao iniciar | 900 |
| Requisições das duas passagens | 92 |
| Saldo ao terminar | 808 |

