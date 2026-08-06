# Homologação controlada do Monday

**Quadro:** Cessão de Direitos de Recompra — board `6149480325`  
**Ambiente:** development  
**Competência:** todas  
**Executado em:** 2026-08-06T15:10:38.000Z  
**Versão da API do Monday:** 2024-10

> Nenhum dado foi alterado no Monday. O proxy recusa `mutation` e
> `subscription` antes de qualquer chamada — ver prova 7.

## Pré-confirmação

| Item | Resultado |
| --- | --- |
| `token_configurado: true` | ✅ MONDAY_TOKEN presente no ambiente (valor nunca exibido) |
| integração em modo somente leitura | ✅ trava no transporte (`consultar`), antes de qualquer requisição |
| quadro configurado = 6149480325 | ✅ (JUR) CESSÃO DE DIREITOS DE RECOMPRA — `6149480325` |
| nenhuma mutation ou subscription no pipeline | ✅ 4 consulta(s) do pipeline, todas aceitas pela trava |
| credencial autenticada | ✅ conta: Cristiane C. Rabelo |

## Primeira execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `f2783f3f-43d9-4736-ad08-31d848ea4087` |
| Quadro | Cessão de Direitos de Recompra — board `6149480325` |
| Início | 2026-08-06T15:10:38.025Z |
| Conclusão | 2026-08-06T15:10:39.038Z |
| Duração | 1.01 s |
| **Quantidade recebida** (lidos da origem) | **25** |
| **Páginas consultadas** | **1** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **16** |
| **Incluída** | **16** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **0** |
| **Ignorada** | **9** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | 2026-07-30 |
| **Último dado válido (antes desta execução)** | 2026-08-06T15:10:36.619Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Ignorados, por motivo** — nenhum descarte é silencioso:

| Motivo | Quantidade |
| --- | --- |
| recompra recusada pelo cliente (STATUS = RECUSADO PELO CLIENTE) | 9 |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 16 |
| Vivos / marcados ausentes | 16 / 0 |
| `id_origem` distintos | 16 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Rótulos reais encontrados

Levantados de 25 item(ns) da primeira leitura, a partir do payload
original — não do dado já interpretado.

### Grupos

| Grupo | Itens |
| --- | --- |
| AURORA | 7 |
| VERANO | 7 |
| HORIZONTES | 3 |
| MORATTA | 3 |
| VITA VILLAGE | 3 |
| BELLA VIDA | 2 |

### Colunas

#### ASS. NOVO FINANCIAMENTO → `data_venda`

`date_mm5zm11v` · tipo `date` · 5 preenchido(s), 20 vazio(s) · 5 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2024-08-16 | 1 |
| 2025-05-09 | 1 |
| 2025-11-21 | 1 |
| 2026-02-27 | 1 |
| 2026-07-30 | 1 |

#### CAIXA _(não mapeada)_

`status3` · tipo `status` · 20 preenchido(s), 5 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Inadimplente | 18 |
| Adimplente | 2 |

#### CONCLUSÃO → `motivo`

`status0` · tipo `status` · 21 preenchido(s), 4 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Concluído | 11 |
| Em andamento | 5 |
| ENVIADO MICHELLE | 5 |

#### CORRETAGEM _(não mapeada)_

`n_meros20` · tipo `numbers` · 17 preenchido(s), 8 vazio(s) · 17 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 10447.47 | 1 |
| 10558.72 | 1 |
| 11023.92 | 1 |
| 19276 | 1 |
| 4110 | 1 |
| 5997.40 | 1 |
| 6712.18 | 1 |
| 6924.29 | 1 |
| 7359.67 | 1 |
| 8005.84 | 1 |
| 8086.41 | 1 |
| 8279.62 | 1 |
| 8530.25 | 1 |
| 8904.29 | 1 |
| 9209.89 | 1 |
| _… mais 2 valor(es)_ | |

#### DATA DA VENDA _(não mapeada)_

`data` · tipo `date` · 24 preenchido(s), 1 vazio(s) · 24 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2020-03-30 | 1 |
| 2020-05-21 | 1 |
| 2020-09-18 | 1 |
| 2020-09-29 | 1 |
| 2020-12-13 | 1 |
| 2021-04-29 | 1 |
| 2021-05-04 | 1 |
| 2021-07-01 | 1 |
| 2022-03-11 | 1 |
| 2022-03-31 | 1 |
| 2022-05-05 | 1 |
| 2023-01-04 | 1 |
| 2023-02-13 | 1 |
| 2023-05-27 | 1 |
| 2023-06-06 | 1 |
| _… mais 9 valor(es)_ | |

#### DATA DE RECOMPRA → `data_solicitacao`

`date_mky1rrnr` · tipo `date` · 16 preenchido(s), 9 vazio(s) · 14 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2026-06-01 | 2 |
| 2026-07-08 | 2 |
| 2024-02-02 | 1 |
| 2024-03-01 | 1 |
| 2024-04-01 | 1 |
| 2024-05-01 | 1 |
| 2024-07-08 | 1 |
| 2024-12-02 | 1 |
| 2025-08-01 | 1 |
| 2025-09-01 | 1 |
| 2025-10-01 | 1 |
| 2026-06-18 | 1 |
| 2026-07-03 | 1 |
| 2026-07-07 | 1 |

#### DEBITO ATUAL _(não mapeada)_

`n_meros9` · tipo `numbers` · 20 preenchido(s), 5 vazio(s) · 14 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 7 |
| 10182.48 | 1 |
| 13037.30 | 1 |
| 15501.48 | 1 |
| 26355.80 | 1 |
| 31138.80 | 1 |
| 3273.69 | 1 |
| 350.45 | 1 |
| 3744 | 1 |
| 40561 | 1 |
| 4880.20 | 1 |
| 49630 | 1 |
| 5597.01 | 1 |
| 7588.96 | 1 |

#### DESCONTO TOTAL _(não mapeada)_

`n_meros60` · tipo `numbers` · 5 preenchido(s), 20 vazio(s) · 5 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 13223.88 | 1 |
| 18425.49 | 1 |
| 21362.76 | 1 |
| 24731.88 | 1 |
| 26977.94 | 1 |

#### DEVOLUÇÃO AO CLIENTE _(não mapeada)_

`n_meros07` · tipo `numbers` · 17 preenchido(s), 8 vazio(s) · 12 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 3 |
| 2000 | 2 |
| 3000 | 2 |
| 4000 | 2 |
| 21971.13 | 1 |
| 22444.35 | 1 |
| 3156.60 | 1 |
| 4319.01 | 1 |
| 5000 | 1 |
| 5143 | 1 |
| 7000 | 1 |
| 8335 | 1 |

#### EXECUTOR → `equipe`

`pessoas` · tipo `people` · 24 preenchido(s), 1 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Miguel | 24 |

#### FINANCIAMENTO _(não mapeada)_

`n_meros88` · tipo `numbers` · 19 preenchido(s), 6 vazio(s) · 19 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 1 |
| 107215.11 | 1 |
| 107907.58 | 1 |
| 110372.15 | 1 |
| 129942.72 | 1 |
| 132240.58 | 1 |
| 134846.48 | 1 |
| 140770.58 | 1 |
| 140794 | 1 |
| 145226.14 | 1 |
| 146560.49 | 1 |
| 155775 | 1 |
| 157882 | 1 |
| 157918.63 | 1 |
| 165053.60 | 1 |
| _… mais 4 valor(es)_ | |

#### HONORÁRIOS _(não mapeada)_

`n_meros13` · tipo `numbers` · 11 preenchido(s), 14 vazio(s) · 6 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 6 |
| 1303.73 | 1 |
| 2549.26 | 1 |
| 3113.88 | 1 |
| 416 | 1 |
| 488.02 | 1 |

#### ITBI _(não mapeada)_

`n_meros89` · tipo `numbers` · 10 preenchido(s), 15 vazio(s) · 8 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 9000 | 3 |
| 0 | 1 |
| 3196.48 | 1 |
| 3480.68 | 1 |
| 3800.00 | 1 |
| 5775.62 | 1 |
| 6000 | 1 |
| 6986.36 | 1 |

#### LANÇ. SIENGE _(não mapeada)_

`pessoas8` · tipo `people` · 2 preenchido(s), 23 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Aline Silva | 2 |

#### LUCRO ATUALIZADO _(não mapeada)_

`n_meros__1` · tipo `numbers` · 16 preenchido(s), 9 vazio(s) · 16 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 47398.04 | 1 |
| 51156.81 | 1 |
| 51703.70 | 1 |
| 52932.04 | 1 |
| 55358.18 | 1 |
| 57816.22 | 1 |
| 60853.13 | 1 |
| 62432.45 | 1 |
| 63684.15 | 1 |
| 63742.58 | 1 |
| 64732.12 | 1 |
| 66801.54 | 1 |
| 74352.85 | 1 |
| 76367.05 | 1 |
| 90275.89 | 1 |
| _… mais 1 valor(es)_ | |

#### LUCRO TOTAL _(não mapeada)_

`n_meros64` · tipo `numbers` · 10 preenchido(s), 15 vazio(s) · 10 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 12149.60 | 1 |
| 20826.89 | 1 |
| 30971.97 | 1 |
| 48849 | 1 |
| 51165.48 | 1 |
| 52322.49 | 1 |
| 52674.55 | 1 |
| 55406.14 | 1 |
| 60993.14 | 1 |
| 78925.25 | 1 |

#### PAGO PELO CLIENTE _(não mapeada)_

`n_meros69` · tipo `numbers` · 24 preenchido(s), 1 vazio(s) · 24 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 10231.24 | 1 |
| 14506.13 | 1 |
| 14904.45 | 1 |
| 15811.41 | 1 |
| 16503.28 | 1 |
| 17150.58 | 1 |
| 20236.99 | 1 |
| 21322.71 | 1 |
| 25750.55 | 1 |
| 26143.23 | 1 |
| 2983.04 | 1 |
| 31557.88 | 1 |
| 3156.60 | 1 |
| 3215.04 | 1 |
| 3518.67 | 1 |
| _… mais 9 valor(es)_ | |

#### RENEGOCIAÇÃO FINANCEIRO _(não mapeada)_

`status_11__1` · tipo `status` · 1 preenchido(s), 24 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| FEITO | 1 |

#### REVENDA _(não mapeada)_

`n_meros18` · tipo `numbers` · 1 preenchido(s), 24 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 273900 | 1 |

#### Status → `situacao`

`status2` · tipo `status` · 25 preenchido(s), 0 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| SUCESSO | 16 |
| RECUSADO PELO CLIENTE | 9 |

#### TAXA DE EVOLUCAO _(não mapeada)_

`n_meros8` · tipo `numbers` · 23 preenchido(s), 2 vazio(s) · 9 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 13 |
| 1000 | 3 |
| 12620.86 | 1 |
| 18478.97 | 1 |
| 28947.50 | 1 |
| 3015.00 | 1 |
| 3500 | 1 |
| 4000 | 1 |
| 4680 | 1 |

#### VALOR ATUAL DO IMÓVEL _(não mapeada)_

`n_meros6` · tipo `numbers` · 24 preenchido(s), 1 vazio(s) · 11 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 240000 | 6 |
| 250000 | 5 |
| 225000 | 3 |
| 270000 | 2 |
| 285000 | 2 |
| 265000 | 1 |
| 282000 | 1 |
| 347500 | 1 |
| 759000 | 1 |
| 759000.00 | 1 |
| 780000.00 | 1 |

#### VALOR DA VENDA _(não mapeada)_

`n_meros` · tipo `numbers` · 24 preenchido(s), 1 vazio(s) · 24 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 149935 | 1 |
| 167804.31 | 1 |
| 172820.80 | 1 |
| 173107.41 | 1 |
| 177900 | 1 |
| 179900 | 1 |
| 183991.67 | 1 |
| 197218.52 | 1 |
| 197657.43 | 1 |
| 200145.79 | 1 |
| 206990.40 | 1 |
| 213256.17 | 1 |
| 221000.00 | 1 |
| 222607.20 | 1 |
| 230247.14 | 1 |
| _… mais 9 valor(es)_ | |

#### VALOR PAGO PARA CAIXA _(não mapeada)_

`n_meros0` · tipo `numbers` · 4 preenchido(s), 21 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 1 |
| 3699.55 | 1 |
| 3942.49 | 1 |
| 9311.96 | 1 |

#### VALORIZAÇÃO _(não mapeada)_

`n_meros95` · tipo `numbers` · 5 preenchido(s), 20 vazio(s) · 5 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 109179.2 | 1 |
| 33009.60 | 1 |
| 56008.33 | 1 |
| 66892.59 | 1 |
| 72195.69 | 1 |

> Este quadro não alimenta a classificação de judicialização.
> A análise de cobertura não se aplica.

## Segunda execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `b3e53d54-405c-48ea-8b95-8cecdbad61d2` |
| Quadro | Cessão de Direitos de Recompra — board `6149480325` |
| Início | 2026-08-06T15:10:39.061Z |
| Conclusão | 2026-08-06T15:10:39.993Z |
| Duração | 0.93 s |
| **Quantidade recebida** (lidos da origem) | **25** |
| **Páginas consultadas** | **1** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **16** |
| **Incluída** | **0** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **16** |
| **Ignorada** | **9** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | 2026-07-30 |
| **Último dado válido (antes desta execução)** | 2026-08-06T15:10:39.036Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Ignorados, por motivo** — nenhum descarte é silencioso:

| Motivo | Quantidade |
| --- | --- |
| recompra recusada pelo cliente (STATUS = RECUSADO PELO CLIENTE) | 9 |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 16 |
| Vivos / marcados ausentes | 16 / 0 |
| `id_origem` distintos | 16 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Provas da segunda execução

| # | Prova | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | Ausência de duplicação | ✅ | 16 → 16 registros; 16 `id_origem` distintos |
| 2 | Upsert idempotente | ✅ | 2ª execução: 0 incluídos, 0 atualizados, 16 inalterados sobre 25 lidos |
| 3 | Preservação de `fonte` e `id_origem` | ✅ | 0 sem fonte correta, 0 sem `id_origem` |
| 4 | Registros inalterados não geram versões indevidas | ✅ | histórico 0 → 0; versão máxima 1 → 1 |
| 5 | Registros alterados são atualizados corretamente | ✅ | `motivo` alterado no banco e devolvido pela origem (`Concluído`); versão 1 → 3; 1 atualizado(s) |
| 6 | Falha posterior não apaga o último dado válido | ✅ | após falha: 16 vivos (era 16); `ultima_carga_valida_em` não avançou; status `erro` |
| 7 | Mutation e subscription continuam bloqueadas | ✅ | 4 tentativas de escrita recusadas; consulta de leitura aceita |

## Amostra anonimizada

Sem CPF, CNPJ ou nome completo. Número do processo reduzido aos quatro
últimos dígitos, valor da causa substituído, `id_origem` reduzido, e os
campos de texto livre passam por uma varredura de documento — `MOTIVO` é
digitado à mão e pode conter um CPF que ninguém previu.

```json
[
  {
    "id_origem": "***5950",
    "categoria": "recompra",
    "motivo": "Concluído",
    "equipe": "Miguel",
    "unidade": "304 C",
    "data_solicitacao": "2025-10-01",
    "data_venda": null,
    "data_conclusao": null,
    "tempo_dias": null,
    "fonte": "monday",
    "versao": 3,
    "data_referencia": "2025-10-01",
    "extraido_em": "2026-08-06T15:10:40.787Z"
  },
  {
    "id_origem": "***1508",
    "categoria": "recompra",
    "motivo": "Concluído",
    "equipe": "Miguel",
    "unidade": "806 B",
    "data_solicitacao": "2025-08-01",
    "data_venda": null,
    "data_conclusao": null,
    "tempo_dias": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": "2025-08-01",
    "extraido_em": "2026-08-06T15:10:40.793Z"
  },
  {
    "id_origem": "***9271",
    "categoria": "recompra",
    "motivo": "Concluído",
    "equipe": "Miguel",
    "unidade": "1302 B",
    "data_solicitacao": "2025-09-01",
    "data_venda": null,
    "data_conclusao": null,
    "tempo_dias": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": "2025-09-01",
    "extraido_em": "2026-08-06T15:10:40.791Z"
  }
]
```

_Varredura da amostra publicada: nenhum CPF ou CNPJ presente._

## Inconsistências encontradas

| Tipo | Gravidade | Ocorrências | Descrição |
| --- | --- | --- | --- |
| falha_importacao | alta | 1 | Falha ao sincronizar (JUR) CESSÃO DE DIREITOS DE RECOMPRA: Quadro 1 nao encontrado ou sem acesso.. O ultimo dado valido foi preservado. |
| falha_importacao | alta | 1 | Falha ao sincronizar (JUR) RETOMADAS: Quadro 1 nao encontrado ou sem acesso.. O ultimo dado valido foi preservado. |
| falha_importacao | alta | 1 | Falha ao sincronizar (JUR) DISTRATOS E DESISTÊNCIAS: Quadro 1 nao encontrado ou sem acesso.. O ultimo dado valido foi preservado. |

---

**As sete provas passaram.** A homologação do quadro Cessão de Direitos de Recompra está pronta para aprovação.
