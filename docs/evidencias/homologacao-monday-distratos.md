# Homologação controlada do Monday

**Quadro:** Distratos e Desistências — board `18404493605`  
**Ambiente:** development  
**Competência:** todas  
**Executado em:** 2026-08-06T14:08:47.220Z  
**Versão da API do Monday:** 2024-10

> Nenhum dado foi alterado no Monday. O proxy recusa `mutation` e
> `subscription` antes de qualquer chamada — ver prova 7.

## Pré-confirmação

| Item | Resultado |
| --- | --- |
| `token_configurado: true` | ✅ MONDAY_TOKEN presente no ambiente (valor nunca exibido) |
| integração em modo somente leitura | ✅ trava no transporte (`consultar`), antes de qualquer requisição |
| quadro configurado = 18404493605 | ✅ (JUR) DISTRATOS E DESISTÊNCIAS — `18404493605` |
| nenhuma mutation ou subscription no pipeline | ✅ 4 consulta(s) do pipeline, todas aceitas pela trava |
| credencial autenticada | ✅ conta: Cristiane C. Rabelo |

## Primeira execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `92834367-4486-4399-9785-56d082ef1e12` |
| Quadro | Distratos e Desistências — board `18404493605` |
| Início | 2026-08-06T14:08:47.304Z |
| Conclusão | 2026-08-06T14:08:49.557Z |
| Duração | 2.25 s |
| **Quantidade recebida** (lidos da origem) | **38** |
| **Páginas consultadas** | **1** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **38** |
| **Incluída** | **38** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **0** |
| **Ignorada** | **0** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | — |
| **Último dado válido (antes desta execução)** | nenhum — primeira carga |
| Status | sucesso |
| Contabilidade fecha | sim |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 38 |
| Vivos / marcados ausentes | 38 / 0 |
| `id_origem` distintos | 38 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Rótulos reais encontrados

Levantados de 38 item(ns) da primeira leitura, a partir do payload
original — não do dado já interpretado.

> **Colunas do mapa não encontradas no quadro:** cpf_cnpj, unidade, contrato, data_conclusao, tempo_dias. Gravadas como nulas, nunca presumidas.

> **Títulos repetidos no quadro.** A resolução por título pressupõe que o
> título identifique a coluna. Aqui ele não identifica, e o desempate
> — a primeira coluna que não for espelho — decidiu. A escolha está
> declarada abaixo para conferência, não para ser aceita em silêncio.

| Título | Colunas com esse título | Escolhida hoje |
| --- | --- | --- |
| `EMPREENDIMENTO` | `lookup_mm1re8j8` (mirror) · `color_mm28cam9` (status) | `color_mm28cam9` |
| `SETOR` | `lookup_mm1rpssd` (mirror) · `color_mm2knzbk` (status) | `color_mm2knzbk` |

### Grupos

| Grupo | Itens |
| --- | --- |
| DISTRATOS | 26 |
| DESISTÊNCIAS | 12 |

### Colunas

#### (JUR) CONTRATOS PARA CLIENTES _(não mapeada)_

`board_relation_mm1r9a8w` · tipo `board_relation` · 26 preenchido(s), 12 vazio(s) · 26 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ALAMEDA 003B | 1 |
| ALAMEDA 1103B | 1 |
| ALAMEDA 1205B | 1 |
| ALAMEDA 1406A | 1 |
| ALAMEDA 307A | 1 |
| CARPE DIEM 71 | 1 |
| CARPE DIEM 72 | 1 |
| GRAN PARK 001 | 1 |
| GRAN PARK 006 | 1 |
| GRAN PARK 1402 | 1 |
| GRAN PARK 907 | 1 |
| MORATTA 001B | 1 |
| MORATTA 002A | 1 |
| MORATTA 007B | 1 |
| MORATTA 1202B | 1 |
| _… mais 11 valor(es)_ | |

#### CLIENTE → `cliente`

`text_mm1tkbna` · tipo `text` · 38 preenchido(s), 0 vazio(s) · 37 valor(es) distinto(s)

_Valores não listados: texto livre pode conter nome ou documento
digitado à mão, e este relatório é evidência versionada._

#### COMISSÃO DESCONTADA _(não mapeada)_

`numeric_mm1kt5dm` · tipo `numbers` · 27 preenchido(s), 11 vazio(s) · 5 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 23 |
| 2024.1 | 1 |
| 3002.21 | 1 |
| 3296.8 | 1 |
| 4143.75 | 1 |

#### COMISSÃO PAGA _(não mapeada)_

`numeric_mm1kbjze` · tipo `numbers` · 0 preenchido(s), 38 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### CORRETAGEM _(não mapeada)_

`numeric_mm20nxwj` · tipo `numbers` · 28 preenchido(s), 10 vazio(s) · 18 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 10 |
| 13519.28 | 2 |
| 10120.49 | 1 |
| 10641.63 | 1 |
| 11941.17 | 1 |
| 12511.12 | 1 |
| 12528.48 | 1 |
| 14330.85 | 1 |
| 15182.28 | 1 |
| 15499.91 | 1 |
| 17480.03 | 1 |
| 17595.87 | 1 |
| 29964.26 | 1 |
| 7595.01 | 1 |
| 8640.41 | 1 |
| _… mais 3 valor(es)_ | |

#### DATA DA SOLICITAÇÃO → `data_solicitacao`

`data` · tipo `date` · 38 preenchido(s), 0 vazio(s) · 32 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2026-03-24 | 3 |
| 2026-01-29 | 2 |
| 2026-02-25 | 2 |
| 2026-03-30 | 2 |
| 2026-04-08 | 2 |
| 2026-01-06 | 1 |
| 2026-01-27 | 1 |
| 2026-02-04 | 1 |
| 2026-02-06 | 1 |
| 2026-02-10 | 1 |
| 2026-02-12 | 1 |
| 2026-03-05 | 1 |
| 2026-03-10 | 1 |
| 2026-03-16 | 1 |
| 2026-03-23 | 1 |
| _… mais 17 valor(es)_ | |

#### DATA DA VENDA → `data_venda`

`date_mm1zzqfm` · tipo `date` · 38 preenchido(s), 0 vazio(s) · 36 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2026-03-21 | 2 |
| 2026-03-24 | 2 |
| 2022-11-29 | 1 |
| 2023-06-12 | 1 |
| 2023-07-08 | 1 |
| 2023-08-08 | 1 |
| 2023-08-10 | 1 |
| 2023-09-11 | 1 |
| 2023-12-07 | 1 |
| 2024-01-15 | 1 |
| 2024-09-13 | 1 |
| 2024-10-02 | 1 |
| 2025-02-19 | 1 |
| 2025-05-19 | 1 |
| 2025-05-31 | 1 |
| _… mais 21 valor(es)_ | |

#### DISTRATO SIENGE _(não mapeada)_

`multiple_person_mm2ms5a2` · tipo `people` · 32 preenchido(s), 6 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Aline Silva | 32 |

#### DISTRATO SIENGE/FINANCEIRO _(não mapeada)_

`color_mm33px94` · tipo `status` · 30 preenchido(s), 8 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Concluído | 24 |
| Em andamento | 6 |

#### EMPREENDIMENTO _(não mapeada)_

`lookup_mm1re8j8` · tipo `mirror` · 26 preenchido(s), 12 vazio(s) · 7 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ALENCAR MAZZEO | 7 |
| SAN MARINO | 6 |
| COEVO E CONELESTE | 5 |
| GRAN PARK | 4 |
| JARDIM PAULISTA | 2 |
| FGV | 1 |
| SIETE | 1 |

#### EMPREENDIMENTO → `empreendimento`

`color_mm28cam9` · tipo `status` · 38 preenchido(s), 0 vazio(s) · 7 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| VERANO | 10 |
| ALAMEDA | 8 |
| MORATTA | 8 |
| GRAN PARK | 5 |
| CARPE DIEM | 3 |
| SIETE | 3 |
| VITA VILLAGE | 1 |

#### EQUIPE → `equipe`

`color_mm1kctx7` · tipo `status` · 38 preenchido(s), 0 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| IMOB | 25 |
| HOUSE | 13 |

#### Espelho _(não mapeada)_

`lookup_mm2n4xhe` · tipo `mirror` · 22 preenchido(s), 16 vazio(s) · 22 valor(es) distinto(s)

_Valores não listados: a coluna contém endereços de acesso, e este_
_relatório é evidência versionada. Só a contagem é publicada._

#### HONORÁRIOS _(não mapeada)_

`numeric_mm20stq6` · tipo `numbers` · 20 preenchido(s), 18 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 18 |
| 627.57 | 1 |
| 828.44 | 1 |

#### INTEGRAÇÃO _(não mapeada)_

`color_mm1v51xb` · tipo `status` · 38 preenchido(s), 0 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| PREENCHIDO | 38 |

#### MOTIVO → `motivo`

`color_mm1km2gz` · tipo `status` · 38 preenchido(s), 0 vazio(s) · 7 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| PROBLEMAS FINANCEIROS | 11 |
| FINANCIAMENTO REPROVADO | 9 |
| SEM MOTIVO | 9 |
| INADIMPLÊNCIA | 6 |
| CONTRATO CANCELADO | 1 |
| FINANCIAMENTO PENDENTE | 1 |
| NÃO RECEBEU CONTRATO | 1 |

#### MULTA 50% _(não mapeada)_

`formula_mm1r7zt` · tipo `formula` · 38 preenchido(s), 0 vazio(s) · 28 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 9 |
| 250 | 3 |
| 1000.07 | 1 |
| 11051 | 1 |
| 1201.155 | 1 |
| 12094.075 | 1 |
| 125 | 1 |
| 1259.355 | 1 |
| 12942.49 | 1 |
| 13859.355 | 1 |
| 15466.91 | 1 |
| 15593.725 | 1 |
| 18140.54 | 1 |
| 1830.83 | 1 |
| 18447.66 | 1 |
| _… mais 13 valor(es)_ | |

#### PERÍODO (DIAS) _(não mapeada)_

`formula_mm1tmz3a` · tipo `formula` · 38 preenchido(s), 0 vazio(s) · 36 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2 | 2 |
| 6 | 2 |
| -46 | 1 |
| 0 | 1 |
| 100 | 1 |
| 1008 | 1 |
| 1057 | 1 |
| 11 | 1 |
| 1312 | 1 |
| 142 | 1 |
| 15 | 1 |
| 150 | 1 |
| 18 | 1 |
| 194 | 1 |
| 20 | 1 |
| _… mais 21 valor(es)_ | |

#### SETOR _(não mapeada)_

`lookup_mm1rpssd` · tipo `mirror` · 26 preenchido(s), 12 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| JURIDICO | 9 |
| RELACIONAMENTO | 9 |
| COMERCIAL | 5 |
| CRÉDITO | 3 |

#### SETOR _(não mapeada)_

`color_mm2knzbk` · tipo `status` · 38 preenchido(s), 0 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| PÓS VENDAS | 15 |
| JURÍDICO | 13 |
| COMERCIAL | 10 |

#### SOLICITANTE _(não mapeada)_

`lookup_mm1rb90z` · tipo `mirror` · 26 preenchido(s), 12 vazio(s) · 7 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Thamar Victória | 9 |
| Gabriela Aires | 7 |
| Paula Forli | 4 |
| EDER XAVIER DA SILVA | 2 |
| Kaillany Leticia Marcelo Da Silva | 2 |
| Gabriela Inacio | 1 |
| Paula Forli, EDER XAVIER DA SILVA | 1 |

#### VALOR A RECEBER _(não mapeada)_

`numeric_mm21p1ft` · tipo `numbers` · 30 preenchido(s), 8 vazio(s) · 10 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 21 |
| 11158.79 | 1 |
| 11251.70 | 1 |
| 14682.21 | 1 |
| 16278.87 | 1 |
| 2367.05 | 1 |
| 3888.22 | 1 |
| 5412.07 | 1 |
| 6085.06 | 1 |
| 9371.17 | 1 |

#### VALOR DA VENDA _(não mapeada)_

`numeric_mm1t1rbx` · tipo `numbers` · 38 preenchido(s), 0 vazio(s) · 37 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 337982 | 2 |
| 188817.5 | 1 |
| 216010.27 | 1 |
| 229640.8 | 1 |
| 230089 | 1 |
| 237000 | 1 |
| 237571.37 | 1 |
| 238823.48 | 1 |
| 250222.30 | 1 |
| 250569.52 | 1 |
| 253012.31 | 1 |
| 253987.99 | 1 |
| 254468.25 | 1 |
| 255797.8 | 1 |
| 257571.02 | 1 |
| _… mais 22 valor(es)_ | |

#### VALOR DEVOLVIDO _(não mapeada)_

`numeric_mm20mw2d` · tipo `numbers` · 36 preenchido(s), 2 vazio(s) · 18 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 17 |
| 500 | 3 |
| 1007.07 | 1 |
| 15593.72 | 1 |
| 18140.54 | 1 |
| 1830.83 | 1 |
| 18447.66 | 1 |
| 23816.49 | 1 |
| 24205.97 | 1 |
| 250 | 1 |
| 2890.54 | 1 |
| 3590.17 | 1 |
| 4356.50 | 1 |
| 500.00 | 1 |
| 5347.48 | 1 |
| _… mais 3 valor(es)_ | |

#### VALOR PAGO _(não mapeada)_

`numeric_mm1knmwx` · tipo `numbers` · 38 preenchido(s), 0 vazio(s) · 28 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 9 |
| 500 | 3 |
| 1000.01 | 1 |
| 1000.15 | 1 |
| 10368.28 | 1 |
| 12414.02 | 1 |
| 1498.65 | 1 |
| 16105.90 | 1 |
| 2000.14 | 1 |
| 22102.00 | 1 |
| 2402.31 | 1 |
| 24188.15 | 1 |
| 250 | 1 |
| 2518.71 | 1 |
| 25884.98 | 1 |
| _… mais 13 valor(es)_ | |

> Este quadro não alimenta a classificação de judicialização.
> A análise de cobertura não se aplica.

## Segunda execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `d4f417cb-abd2-4b4c-b902-c13c64a81d47` |
| Quadro | Distratos e Desistências — board `18404493605` |
| Início | 2026-08-06T14:08:49.614Z |
| Conclusão | 2026-08-06T14:08:51.778Z |
| Duração | 2.16 s |
| **Quantidade recebida** (lidos da origem) | **38** |
| **Páginas consultadas** | **1** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **38** |
| **Incluída** | **0** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **38** |
| **Ignorada** | **0** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | — |
| **Último dado válido (antes desta execução)** | 2026-08-06T14:08:49.555Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 38 |
| Vivos / marcados ausentes | 38 / 0 |
| `id_origem` distintos | 38 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Provas da segunda execução

| # | Prova | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | Ausência de duplicação | ✅ | 38 → 38 registros; 38 `id_origem` distintos |
| 2 | Upsert idempotente | ✅ | 2ª execução: 0 incluídos, 0 atualizados, 38 inalterados sobre 38 lidos |
| 3 | Preservação de `fonte` e `id_origem` | ✅ | 0 sem fonte correta, 0 sem `id_origem` |
| 4 | Registros inalterados não geram versões indevidas | ✅ | histórico 0 → 0; versão máxima 1 → 1 |
| 5 | Registros alterados são atualizados corretamente | ✅ | `motivo` alterado no banco e devolvido pela origem (`PROBLEMAS FINANCEIROS`); versão 1 → 3; 1 atualizado(s) |
| 6 | Falha posterior não apaga o último dado válido | ✅ | após falha: 38 vivos (era 38); `ultima_carga_valida_em` não avançou; status `erro` |
| 7 | Mutation e subscription continuam bloqueadas | ✅ | 4 tentativas de escrita recusadas; consulta de leitura aceita |

## Amostra anonimizada

Sem CPF, CNPJ ou nome completo. Número do processo reduzido aos quatro
últimos dígitos, valor da causa substituído, `id_origem` reduzido, e os
campos de texto livre passam por uma varredura de documento — `MOTIVO` é
digitado à mão e pode conter um CPF que ninguém previu.

```json
[
  {
    "id_origem": "***3054",
    "categoria": "distrato",
    "motivo": "FINANCIAMENTO REPROVADO",
    "equipe": "IMOB",
    "unidade": "23C",
    "data_solicitacao": "2026-01-29",
    "data_venda": "2024-01-15",
    "data_conclusao": null,
    "tempo_dias": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T14:08:53.852Z"
  },
  {
    "id_origem": "***9112",
    "categoria": "desistencia",
    "motivo": "PROBLEMAS FINANCEIROS",
    "equipe": "IMOB",
    "unidade": "1003A",
    "data_solicitacao": "2026-01-29",
    "data_venda": "2026-01-29",
    "data_conclusao": null,
    "tempo_dias": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T14:08:53.891Z"
  },
  {
    "id_origem": "***5338",
    "categoria": "distrato",
    "motivo": "INADIMPLÊNCIA",
    "equipe": "HOUSE",
    "unidade": "44",
    "data_solicitacao": "2026-01-06",
    "data_venda": "2023-09-11",
    "data_conclusao": null,
    "tempo_dias": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T14:08:53.849Z"
  }
]
```

_Varredura da amostra publicada: nenhum CPF ou CNPJ presente._

> 3 CPF foram encontrados nos campos de texto livre da ORIGEM e removidos da amostra. Vale avisar o jurídico: documento digitado em campo livre não é protegido por nenhum mascaramento de coluna.

## Inconsistências encontradas

| Tipo | Gravidade | Ocorrências | Descrição |
| --- | --- | --- | --- |
| falha_importacao | alta | 1 | Falha ao sincronizar (JUR) DISTRATOS E DESISTÊNCIAS: Quadro 1 nao encontrado ou sem acesso.. O ultimo dado valido foi preservado. |

---

**As sete provas passaram.** A homologação do quadro Distratos e Desistências está pronta para aprovação.
