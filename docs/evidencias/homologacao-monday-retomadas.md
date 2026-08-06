# Homologação controlada do Monday

**Quadro:** Retomadas — board `18413057491`  
**Ambiente:** development  
**Competência:** todas  
**Executado em:** 2026-08-06T15:10:31.532Z  
**Versão da API do Monday:** 2024-10

> Nenhum dado foi alterado no Monday. O proxy recusa `mutation` e
> `subscription` antes de qualquer chamada — ver prova 7.

## Pré-confirmação

| Item | Resultado |
| --- | --- |
| `token_configurado: true` | ✅ MONDAY_TOKEN presente no ambiente (valor nunca exibido) |
| integração em modo somente leitura | ✅ trava no transporte (`consultar`), antes de qualquer requisição |
| quadro configurado = 18413057491 | ✅ (JUR) RETOMADAS — `18413057491` |
| nenhuma mutation ou subscription no pipeline | ✅ 4 consulta(s) do pipeline, todas aceitas pela trava |
| credencial autenticada | ✅ conta: Cristiane C. Rabelo |

## Primeira execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `64a9c1a8-b652-4643-a4e0-4053808c2b69` |
| Quadro | Retomadas — board `18413057491` |
| Início | 2026-08-06T15:10:31.558Z |
| Conclusão | 2026-08-06T15:10:33.272Z |
| Duração | 1.71 s |
| **Quantidade recebida** (lidos da origem) | **23** |
| **Páginas consultadas** | **1** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **23** |
| **Incluída** | **23** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **0** |
| **Ignorada** | **0** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | — |
| **Último dado válido (antes desta execução)** | 2026-08-06T15:10:30.082Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 23 |
| Vivos / marcados ausentes | 23 / 0 |
| `id_origem` distintos | 23 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Rótulos reais encontrados

Levantados de 23 item(ns) da primeira leitura, a partir do payload
original — não do dado já interpretado.

> **Colunas do mapa não encontradas no quadro:** cpf_cnpj, unidade, contrato, data_conclusao, data_venda, tempo_dias, contratos. Gravadas como nulas, nunca presumidas.

### Grupos

| Grupo | Itens |
| --- | --- |
| RETOMADAS | 23 |

### Colunas

#### (JUR) NOTIFICAÇÕES CLIENTES → `notificacoes`

`board_relation_mm3an1k0` · tipo `board_relation` · 23 preenchido(s), 0 vazio(s) · 23 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ALAMEDAS 1408A | 1 |
| ALAMEDAS 905B | 1 |
| CARPE DIEM 131 | 1 |
| GRAN PARK 1108 | 1 |
| GRAN PARK 505 | 1 |
| MORATTA 006A | 1 |
| MORATTA 1002B | 1 |
| MORATTA 1002C | 1 |
| MORATTA 1004C | 1 |
| MORATTA 106A | 1 |
| MORATTA 1401C | 1 |
| MORATTA 205A | 1 |
| MORATTA 206B | 1 |
| MORATTA 503A | 1 |
| MORATTA 701B | 1 |
| _… mais 8 valor(es)_ | |

#### CLIENTE → `cliente`

`lookup_mm3arq12` · tipo `mirror` · 23 preenchido(s), 0 vazio(s) · 23 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ALEXSANDRO BUENO | 1 |
| Elissara Cristina Dias | 1 |
| FERNANDO GUSTAVO DOS SANTOS FUZIGER | 1 |
| GABRIEL HENRIQUE SILVA | 1 |
| Gabriela Gonçalves Balbino | 1 |
| GUILHERME DE SIQUEIRA ROSA | 1 |
| HENRIQUE CLARO DOS SANTOS | 1 |
| JADISON PEREIRA DA SILVA | 1 |
| JEFERSON VERAS DE OLIVEIRA | 1 |
| JOAO PAULO SANTOS BARBOSA | 1 |
| JOÃO VITOR DOS SANTOS GOMES | 1 |
| Jonathan Arantes Monteiro | 1 |
| JOSE ADILSON ARAGAO DOS SANTOS | 1 |
| LUCAS GONÇALVES REIS | 1 |
| MARCUS VINICIUS DA SILVA BRITO | 1 |
| _… mais 8 valor(es)_ | |

#### COMISSÃO DESCONTADA _(não mapeada)_

`numeric_mm1kt5dm` · tipo `numbers` · 21 preenchido(s), 2 vazio(s) · 9 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 12 |
| 1142.26 | 2 |
| 1251.16 | 1 |
| 2375.11 | 1 |
| 2947.76 | 1 |
| 3259.68 | 1 |
| 3283.07 | 1 |
| 3446.31 | 1 |
| 3906.84 | 1 |

#### COMISSÃO PAGA _(não mapeada)_

`numeric_mm1kbjze` · tipo `numbers` · 20 preenchido(s), 3 vazio(s) · 19 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 2 |
| 11637.37 | 1 |
| 14611.54 | 1 |
| 15836.69 | 1 |
| 21079.93 | 1 |
| 26302.63 | 1 |
| 2827.43 | 1 |
| 3376 | 1 |
| 3594.25 | 1 |
| 3659.76 | 1 |
| 4083.23 | 1 |
| 4307.14 | 1 |
| 5140.11 | 1 |
| 5207.71 | 1 |
| 5844.97 | 1 |
| _… mais 4 valor(es)_ | |

#### CORRETAGEM _(não mapeada)_

`numeric_mm20nxwj` · tipo `numbers` · 22 preenchido(s), 1 vazio(s) · 21 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 9983.60 | 2 |
| 0 | 1 |
| 10009.31 | 1 |
| 10111.60 | 1 |
| 10177.68 | 1 |
| 10242.49 | 1 |
| 11422.50 | 1 |
| 12245.78 | 1 |
| 12406.2 | 1 |
| 12499.50 | 1 |
| 12543.95 | 1 |
| 12650.62 | 1 |
| 13546.34 | 1 |
| 13952.99 | 1 |
| 15339.60 | 1 |
| _… mais 6 valor(es)_ | |

#### DATA DA SOLICITAÇÃO → `data_solicitacao`

`data` · tipo `date` · 23 preenchido(s), 0 vazio(s) · 14 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2026-04-27 | 4 |
| 2026-05-25 | 3 |
| 2026-08-03 | 3 |
| 2026-04-01 | 2 |
| 2026-05-15 | 2 |
| 2026-03-05 | 1 |
| 2026-03-19 | 1 |
| 2026-03-25 | 1 |
| 2026-05-05 | 1 |
| 2026-06-01 | 1 |
| 2026-06-24 | 1 |
| 2026-07-09 | 1 |
| 2026-07-15 | 1 |
| 2026-07-21 | 1 |

#### DATA DA VENDA _(não mapeada)_

`date_mm1zzqfm` · tipo `date` · 22 preenchido(s), 1 vazio(s) · 20 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2024-11-02 | 2 |
| 2024-11-18 | 2 |
| 2022-11-19 | 1 |
| 2023-05-04 | 1 |
| 2024-04-24 | 1 |
| 2024-08-27 | 1 |
| 2024-11-04 | 1 |
| 2024-12-20 | 1 |
| 2024-12-26 | 1 |
| 2025-06-05 | 1 |
| 2025-06-13 | 1 |
| 2025-08-02 | 1 |
| 2025-09-13 | 1 |
| 2025-09-25 | 1 |
| 2025-10-14 | 1 |
| _… mais 5 valor(es)_ | |

#### DISTRATO SIENGE _(não mapeada)_

`multiple_person_mm2ms5a2` · tipo `people` · 18 preenchido(s), 5 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Aline Silva | 18 |

#### DISTRATO SIENGE/FINANCEIRO _(não mapeada)_

`color_mm33px94` · tipo `status` · 18 preenchido(s), 5 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Concluído | 18 |

#### EMPREENDIMENTO → `empreendimento`

`lookup_mm3a37j5` · tipo `mirror` · 23 preenchido(s), 0 vazio(s) · 10 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| MORATTA TORRE B | 5 |
| MORATTA TORRE C | 4 |
| MORATTA TORRE A | 3 |
| ALAMEDA | 2 |
| GRAN PARK | 2 |
| MORATTA | 2 |
| VERANO TORRE A | 2 |
| CARPE DIEM | 1 |
| SIETE | 1 |
| VERANO TORRE B | 1 |

#### EQUIPE → `equipe`

`color_mm1kctx7` · tipo `status` · 23 preenchido(s), 0 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| HOUSE | 12 |
| IMOB | 11 |

#### HONORÁRIOS _(não mapeada)_

`numeric_mm20stq6` · tipo `numbers` · 15 preenchido(s), 8 vazio(s) · 9 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 7 |
| 156.11 | 1 |
| 234.36 | 1 |
| 234.54 | 1 |
| 263.23 | 1 |
| 2734.11 | 1 |
| 374.87 | 1 |
| 3846.42 | 1 |
| 683.80 | 1 |

#### INTEGRAÇÃO _(não mapeada)_

`color_mm1v51xb` · tipo `status` · 23 preenchido(s), 0 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| PREENCHIDO | 23 |

#### MOTIVO → `motivo`

`color_mm1km2gz` · tipo `status` · 23 preenchido(s), 0 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| FINANCIAMENTO REPROVADO | 7 |
| INADIMPLÊNCIA | 7 |
| FINANCIAMENTO PENDENTE | 6 |
| DOCUMENTAÇÃO PENDENTE | 3 |

#### MULTA 50% _(não mapeada)_

`formula_mm1r7zt` · tipo `formula` · 23 preenchido(s), 0 vazio(s) · 23 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 11201.81 | 1 |
| 1178.48 | 1 |
| 1266.65 | 1 |
| 13143.995 | 1 |
| 13401.535 | 1 |
| 13567.45 | 1 |
| 18284.28 | 1 |
| 2107.1 | 1 |
| 251.8 | 1 |
| 252.33 | 1 |
| 25267.375 | 1 |
| 259.635 | 1 |
| 2862.35 | 1 |
| 2867.09 | 1 |
| 4212.54 | 1 |
| _… mais 8 valor(es)_ | |

#### PERÍODO (DIAS) _(não mapeada)_

`formula_mm1tmz3a` · tipo `formula` · 23 preenchido(s), 0 vazio(s) · 22 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 109 | 2 |
| 1089 | 1 |
| 1216 | 1 |
| 151 | 1 |
| 169 | 1 |
| 188 | 1 |
| 233 | 1 |
| 234 | 1 |
| 244 | 1 |
| 296 | 1 |
| 326 | 1 |
| 346 | 1 |
| 487 | 1 |
| 525 | 1 |
| 553 | 1 |
| _… mais 7 valor(es)_ | |

#### SETOR _(não mapeada)_

`color_mm2knzbk` · tipo `status` · 23 preenchido(s), 0 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| COMERCIAL | 15 |
| FINANCEIRO | 8 |

#### VALOR A RECEBER _(não mapeada)_

`numeric_mm21p1ft` · tipo `numbers` · 22 preenchido(s), 1 vazio(s) · 18 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 5 |
| 10294.79 | 1 |
| 11854.96 | 1 |
| 12144.53 | 1 |
| 1290.69 | 1 |
| 14076.06 | 1 |
| 15087.26 | 1 |
| 15377.55 | 1 |
| 18385.09 | 1 |
| 2071.16 | 1 |
| 4193.94 | 1 |
| 4975.10 | 1 |
| 5901.52 | 1 |
| 7355.61 | 1 |
| 8048.47 | 1 |
| _… mais 3 valor(es)_ | |

#### VALOR DA VENDA _(não mapeada)_

`numeric_mm1t1rbx` · tipo `numbers` · 23 preenchido(s), 0 vazio(s) · 22 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 249590 | 2 |
| 177000 | 1 |
| 227699.67 | 1 |
| 228451.32 | 1 |
| 231323.93 | 1 |
| 236878.00 | 1 |
| 244915.65 | 1 |
| 248124.31 | 1 |
| 249990.00 | 1 |
| 250232.98 | 1 |
| 250879.07 | 1 |
| 252790 | 1 |
| 253012.31 | 1 |
| 254442.2 | 1 |
| 256062.28 | 1 |
| _… mais 7 valor(es)_ | |

#### VALOR DEVOLVIDO _(não mapeada)_

`numeric_mm20mw2d` · tipo `numbers` · 16 preenchido(s), 7 vazio(s) · 6 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 11 |
| 10127.06 | 1 |
| 3160.39 | 1 |
| 4459.47 | 1 |
| 4737.94 | 1 |
| 8164.46 | 1 |

#### VALOR PAGO _(não mapeada)_

`numeric_mm1knmwx` · tipo `numbers` · 23 preenchido(s), 0 vazio(s) · 23 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 1012.16 | 1 |
| 10405.16 | 1 |
| 11308.87 | 1 |
| 1377.98 | 1 |
| 15924.52 | 1 |
| 16328.92 | 1 |
| 16342.67 | 1 |
| 22403.62 | 1 |
| 2356.96 | 1 |
| 2533.30 | 1 |
| 26287.99 | 1 |
| 26803.07 | 1 |
| 27134.90 | 1 |
| 36568.56 | 1 |
| 4214.20 | 1 |
| _… mais 8 valor(es)_ | |

> Este quadro não alimenta a classificação de judicialização.
> A análise de cobertura não se aplica.

## Segunda execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `c5eb19de-726c-491e-9fb7-3455bd5a7825` |
| Quadro | Retomadas — board `18413057491` |
| Início | 2026-08-06T15:10:33.292Z |
| Conclusão | 2026-08-06T15:10:34.977Z |
| Duração | 1.69 s |
| **Quantidade recebida** (lidos da origem) | **23** |
| **Páginas consultadas** | **1** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **23** |
| **Incluída** | **0** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **23** |
| **Ignorada** | **0** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | — |
| **Último dado válido (antes desta execução)** | 2026-08-06T15:10:33.271Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 23 |
| Vivos / marcados ausentes | 23 / 0 |
| `id_origem` distintos | 23 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Provas da segunda execução

| # | Prova | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | Ausência de duplicação | ✅ | 23 → 23 registros; 23 `id_origem` distintos |
| 2 | Upsert idempotente | ✅ | 2ª execução: 0 incluídos, 0 atualizados, 23 inalterados sobre 23 lidos |
| 3 | Preservação de `fonte` e `id_origem` | ✅ | 0 sem fonte correta, 0 sem `id_origem` |
| 4 | Registros inalterados não geram versões indevidas | ✅ | histórico 0 → 0; versão máxima 1 → 1 |
| 5 | Registros alterados são atualizados corretamente | ✅ | `motivo` alterado no banco e devolvido pela origem (`FINANCIAMENTO REPROVADO`); versão 1 → 3; 1 atualizado(s) |
| 6 | Falha posterior não apaga o último dado válido | ✅ | após falha: 23 vivos (era 23); `ultima_carga_valida_em` não avançou; status `erro` |
| 7 | Mutation e subscription continuam bloqueadas | ✅ | 4 tentativas de escrita recusadas; consulta de leitura aceita |

## Amostra anonimizada

Sem CPF, CNPJ ou nome completo. Número do processo reduzido aos quatro
últimos dígitos, valor da causa substituído, `id_origem` reduzido, e os
campos de texto livre passam por uma varredura de documento — `MOTIVO` é
digitado à mão e pode conter um CPF que ninguém previu.

```json
[
  {
    "id_origem": "***0446",
    "categoria": "retomada",
    "motivo": "DOCUMENTAÇÃO PENDENTE",
    "equipe": "HOUSE",
    "unidade": "110A",
    "data_solicitacao": "2026-03-19",
    "data_venda": null,
    "data_conclusao": null,
    "tempo_dias": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T15:10:36.577Z"
  },
  {
    "id_origem": "***8240",
    "categoria": "retomada",
    "motivo": "FINANCIAMENTO REPROVADO",
    "equipe": "HOUSE",
    "unidade": "44-C",
    "data_solicitacao": "2026-03-25",
    "data_venda": null,
    "data_conclusao": null,
    "tempo_dias": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T15:10:36.579Z"
  },
  {
    "id_origem": "***0363",
    "categoria": "retomada",
    "motivo": "FINANCIAMENTO REPROVADO",
    "equipe": "HOUSE",
    "unidade": "503C",
    "data_solicitacao": "2026-03-05",
    "data_venda": null,
    "data_conclusao": null,
    "tempo_dias": null,
    "fonte": "monday",
    "versao": 3,
    "data_referencia": null,
    "extraido_em": "2026-08-06T15:10:36.575Z"
  }
]
```

_Varredura da amostra publicada: nenhum CPF ou CNPJ presente._

> 3 CPF foram encontrados nos campos de texto livre da ORIGEM e removidos da amostra. Vale avisar o jurídico: documento digitado em campo livre não é protegido por nenhum mascaramento de coluna.

## Inconsistências encontradas

| Tipo | Gravidade | Ocorrências | Descrição |
| --- | --- | --- | --- |
| falha_importacao | alta | 1 | Falha ao sincronizar (JUR) RETOMADAS: Quadro 1 nao encontrado ou sem acesso.. O ultimo dado valido foi preservado. |
| falha_importacao | alta | 1 | Falha ao sincronizar (JUR) DISTRATOS E DESISTÊNCIAS: Quadro 1 nao encontrado ou sem acesso.. O ultimo dado valido foi preservado. |

---

**As sete provas passaram.** A homologação do quadro Retomadas está pronta para aprovação.
