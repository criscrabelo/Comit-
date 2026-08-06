# Homologação controlada do Monday

**Quadro:** Honorários Extrajudiciais — board `7231876117`  
**Ambiente:** development  
**Competência:** todas  
**Executado em:** 2026-08-06T15:43:14.694Z  
**Versão da API do Monday:** 2024-10

> Nenhum dado foi alterado no Monday. O proxy recusa `mutation` e
> `subscription` antes de qualquer chamada — ver prova 7.

## Pré-confirmação

| Item | Resultado |
| --- | --- |
| `token_configurado: true` | ✅ MONDAY_TOKEN presente no ambiente (valor nunca exibido) |
| integração em modo somente leitura | ✅ trava no transporte (`consultar`), antes de qualquer requisição |
| quadro configurado = 7231876117 | ✅ (JUR) HONORÁRIOS EXTRAJUDICIAIS — `7231876117` |
| nenhuma mutation ou subscription no pipeline | ✅ 4 consulta(s) do pipeline, todas aceitas pela trava |
| credencial autenticada | ✅ conta: Cristiane C. Rabelo |

## Primeira execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `cccc50ba-8aef-4fce-b565-29dfefca7481` |
| Quadro | Honorários Extrajudiciais — board `7231876117` |
| Início | 2026-08-06T15:43:14.720Z |
| Conclusão | 2026-08-06T15:43:28.211Z |
| Duração | 13.49 s |
| **Quantidade recebida** (lidos da origem) | **890** |
| **Páginas consultadas** | **5** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **890** |
| **Incluída** | **890** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **0** |
| **Ignorada** | **0** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | 2026-08-20 |
| **Último dado válido (antes desta execução)** | nenhum — primeira carga |
| Status | sucesso |
| Contabilidade fecha | sim |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 890 |
| Vivos / marcados ausentes | 890 / 0 |
| `id_origem` distintos | 890 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Rótulos reais encontrados

Levantados de 890 item(ns) da primeira leitura, a partir do payload
original — não do dado já interpretado.

> **Colunas do mapa não encontradas no quadro:** cliente, cpf_cnpj, valor_principal. Gravadas como nulas, nunca presumidas.

### Grupos

| Grupo | Itens |
| --- | --- |
| MAIO/2026 | 45 |
| JULHO / 2025 | 42 |
| MARÇO/2026 | 42 |
| NOV/24 | 42 |
| OUT/24 | 42 |
| ABRIL / 25 | 40 |
| MAIO / 2025 | 40 |
| AGOSTO / 2025 | 36 |
| JUNHO/2026 | 36 |
| ABRIL/2026 | 35 |
| OUTUBRO / 2025 | 33 |
| SETEMBRO / 2025 | 33 |
| AGO/24 | 32 |
| MARÇO / 25 | 31 |
| ABR/24 | 30 |
| JUL/24 | 28 |
| MAI/24 | 28 |
| JULHO/2026 | 26 |
| JUNHO / 2025 | 26 |
| FEV / 25 | 23 |
| SET/24 | 23 |
| DISTRATO/ RETOMADA | 21 |
| JUN/24 | 21 |
| DEZ/24 | 18 |
| NOVEMBRO/2025 | 18 |
| JANEIRO 2026 | 14 |
| MAR/24 | 14 |
| FEV/24 | 13 |
| AGOSTO/2026 | 11 |
| DEZEMBRO/2025 | 11 |
| JAN/24 | 10 |
| JAN/25 | 10 |
| FEVEREIRO 2026 | 7 |
| JUL/23 | 2 |
| AGO/23 | 1 |
| DEZ/23 | 1 |
| JUN/23 | 1 |
| MAIO23 | 1 |
| NOV/23 | 1 |
| OUT/23 | 1 |
| SET/23 | 1 |

### Colunas

#### (JUR) NOTIFICAÇÕES CLIENTES → `notificacoes`

`board_relation_mm2ps948` · tipo `board_relation` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### ⏱️ Prazo SLA (dias) _(não mapeada)_

`numeric_mm35fmz7` · tipo `numbers` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### ✅ Data Pagamento Efetivo → `data_pagamento`

`date_mm35qvqv` · tipo `date` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### 🏗️ Torre/Bloco _(não mapeada)_

`color_mm35a6aw` · tipo `status` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### 🏢 Empreendimento Consolidado _(não mapeada)_

`color_mm35yh8h` · tipo `status` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### 💰 Honorário Total _(não mapeada)_

`formula_mm35swvv` · tipo `formula` · 890 preenchido(s), 0 vazio(s) · 853 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 793.9 | 20 |
| 0 | 8 |
| 1253.56 | 3 |
| 1032.25 | 2 |
| 1176.7 | 2 |
| 1244.16 | 2 |
| 1281.92 | 2 |
| 1782.21 | 2 |
| 3609.27 | 2 |
| 843.9 | 2 |
| 904.76 | 2 |
| 952.5 | 2 |
| 1000.74 | 1 |
| 1001.37 | 1 |
| 1001.57 | 1 |
| _… mais 838 valor(es)_ | |

#### 💳 Forma de Pagamento _(não mapeada)_

`color_mm35w8j9` · tipo `status` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### 📄 Nº Nota Fiscal _(não mapeada)_

`text_mm35sant` · tipo `text` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### 📅 Data Solicitação _(não mapeada)_

`date_mm3512fb` · tipo `date` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### 📋 Tipo de Honorário → `categoria`

`color_mm35trwq` · tipo `status` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### 📎 Documentos _(não mapeada)_

`file_mm35r0qf` · tipo `file` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### 📝 Observações _(não mapeada)_

`long_text_mm35bjkq` · tipo `long_text` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### CLIENTE NOVO → `cliente_novo`

`status_16__1` · tipo `status` · 651 preenchido(s), 239 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| NÃO | 426 |
| SIM | 225 |

#### Data → `data_evento`

`data` · tipo `date` · 849 preenchido(s), 41 vazio(s) · 410 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2024-10-31 | 8 |
| 2026-03-10 | 8 |
| 2025-04-30 | 7 |
| 2026-05-25 | 7 |
| 2024-10-08 | 6 |
| 2024-11-14 | 6 |
| 2024-11-22 | 6 |
| 2025-05-09 | 6 |
| 2026-01-28 | 6 |
| 2026-03-25 | 6 |
| 2026-05-15 | 6 |
| 2026-06-15 | 6 |
| 2026-06-30 | 6 |
| 2024-05-15 | 5 |
| 2024-08-01 | 5 |
| _… mais 395 valor(es)_ | |

#### EMPREENDIMENTO → `empreendimento`

`status_1__1` · tipo `status` · 873 preenchido(s), 17 vazio(s) · 21 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| AURORA | 183 |
| VERANO | 163 |
| CARPE DIEM | 90 |
| BELLA VIDA | 72 |
| VITA VILLAGE | 54 |
| AURORA - Torre B | 39 |
| MORATTA | 35 |
| HORIZONTES | 32 |
| MORATTA - Torre B | 26 |
| VERANO - Torre A | 26 |
| MORATTA - Torre C | 25 |
| VERANO - Torre C | 21 |
| AURORA - Torre A | 20 |
| ALAMEDA | 18 |
| CONTEMPORÂNEO | 18 |
| _… mais 6 valor(es)_ | |

#### Espelho _(não mapeada)_

`lookup_mm2pqjhx` · tipo `mirror` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### HONORÁRIOS → `valor_honorarios`

`n_meros7__1` · tipo `numbers` · 872 preenchido(s), 18 vazio(s) · 850 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 11 |
| 105.33 | 2 |
| 136.43 | 2 |
| 210.63 | 2 |
| 2815.37 | 2 |
| 343.09 | 2 |
| 344.45 | 2 |
| 421.31 | 2 |
| 450.26 | 2 |
| 488.02 | 2 |
| 72.51 | 2 |
| 75.81 | 2 |
| 988.31 | 2 |
| 10.04 | 1 |
| 100 | 1 |
| _… mais 835 valor(es)_ | |

#### ID Notificação _(não mapeada)_

`text_mm3tp1mh` · tipo `text` · 65 preenchido(s), 825 vazio(s) · 65 valor(es) distinto(s)

_Valores não listados: texto livre pode conter nome ou documento
digitado à mão, e este relatório é evidência versionada._

#### OAB → `valor_oab`

`n_meros__1` · tipo `numbers` · 871 preenchido(s), 19 vazio(s) · 7 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 832.25 | 549 |
| 793.9 | 307 |
| 793.90 | 8 |
| 765.52 | 3 |
| 796.9 | 2 |
| 79.9 | 1 |
| 932.25 | 1 |

#### Pessoa _(não mapeada)_

`person` · tipo `people` · 867 preenchido(s), 23 vazio(s) · 5 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Thamar Victória | 456 |
| Miguel | 255 |
| Geovana Cavalcanti | 154 |
| Miguel, Geovana Cavalcanti | 1 |
| Thamar Victória, Miguel | 1 |

#### Status → `status`

`status` · tipo `status` · 881 preenchido(s), 9 vazio(s) · 8 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| PAGO | 790 |
| RETIDO EM RETOMADA | 36 |
| AGUARDANDO PAGAMENTO | 17 |
| RETIDO EM DISTRATO | 16 |
| DISTRATO | 8 |
| RETOMADA | 8 |
| DISTRATO SEM HONORÁRIOS | 5 |
| RETIDO EM FINANCIAMENTO | 1 |

#### Subelementos _(não mapeada)_

`subelementos__1` · tipo `subtasks` · 0 preenchido(s), 890 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### UNIDADE _(não mapeada)_

`texto__1` · tipo `text` · 873 preenchido(s), 17 vazio(s) · 368 valor(es) distinto(s)

_Valores não listados: texto livre pode conter nome ou documento
digitado à mão, e este relatório é evidência versionada._

> Este quadro não alimenta a classificação de judicialização.
> A análise de cobertura não se aplica.

## Segunda execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `fbdfca32-5aba-42e6-aa1f-bdee0241e6df` |
| Quadro | Honorários Extrajudiciais — board `7231876117` |
| Início | 2026-08-06T15:43:28.257Z |
| Conclusão | 2026-08-06T15:43:42.124Z |
| Duração | 13.87 s |
| **Quantidade recebida** (lidos da origem) | **890** |
| **Páginas consultadas** | **5** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **890** |
| **Incluída** | **0** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **890** |
| **Ignorada** | **0** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | 2026-08-20 |
| **Último dado válido (antes desta execução)** | 2026-08-06T15:43:28.210Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 890 |
| Vivos / marcados ausentes | 890 / 0 |
| `id_origem` distintos | 890 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Provas da segunda execução

| # | Prova | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | Ausência de duplicação | ✅ | 890 → 890 registros; 890 `id_origem` distintos |
| 2 | Upsert idempotente | ✅ | 2ª execução: 0 incluídos, 0 atualizados, 890 inalterados sobre 890 lidos |
| 3 | Preservação de `fonte` e `id_origem` | ✅ | 0 sem fonte correta, 0 sem `id_origem` |
| 4 | Registros inalterados não geram versões indevidas | ✅ | histórico 0 → 0; versão máxima 1 → 1 |
| 5 | Registros alterados são atualizados corretamente | ✅ | `status` alterado no banco e devolvido pela origem (`DISTRATO`); versão 1 → 3; 1 atualizado(s) |
| 6 | Falha posterior não apaga o último dado válido | ✅ | após falha: 890 vivos (era 890); `ultima_carga_valida_em` não avançou; status `erro` |
| 7 | Mutation e subscription continuam bloqueadas | ✅ | 4 tentativas de escrita recusadas; consulta de leitura aceita |

## Amostra anonimizada

Sem CPF, CNPJ ou nome completo. Número do processo reduzido aos quatro
últimos dígitos, valor da causa substituído, `id_origem` reduzido, e os
campos de texto livre passam por uma varredura de documento — `MOTIVO` é
digitado à mão e pode conter um CPF que ninguém previu.

```json
[
  {
    "id_origem": "***6615",
    "especie": "extrajudicial",
    "categoria": null,
    "status": "DISTRATO SEM HONORÁRIOS",
    "cliente_novo": null,
    "valor_principal": null,
    "valor_honorarios": null,
    "valor_oab": "793.90",
    "data_evento": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T15:43:54.446Z"
  },
  {
    "id_origem": "***2051",
    "especie": "extrajudicial",
    "categoria": null,
    "status": "RETOMADA",
    "cliente_novo": null,
    "valor_principal": null,
    "valor_honorarios": "0.00",
    "valor_oab": "793.90",
    "data_evento": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T15:43:54.447Z"
  },
  {
    "id_origem": "***3050",
    "especie": "extrajudicial",
    "categoria": null,
    "status": "DISTRATO",
    "cliente_novo": null,
    "valor_principal": null,
    "valor_honorarios": null,
    "valor_oab": "765.52",
    "data_evento": null,
    "fonte": "monday",
    "versao": 3,
    "data_referencia": null,
    "extraido_em": "2026-08-06T15:43:54.444Z"
  }
]
```

_Varredura da amostra publicada: nenhum CPF ou CNPJ presente._

## Inconsistências encontradas

| Tipo | Gravidade | Ocorrências | Descrição |
| --- | --- | --- | --- |
| falha_importacao | alta | 1 | Falha ao sincronizar (JUR) HONORÁRIOS EXTRAJUDICIAIS: Quadro 1 nao encontrado ou sem acesso.. O ultimo dado valido foi preservado. |

---

**As sete provas passaram.** A homologação do quadro Honorários Extrajudiciais está pronta para aprovação.
