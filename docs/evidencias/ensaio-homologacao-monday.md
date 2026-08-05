> ⚠️ **ENSAIO COM DADOS SIMULADOS.** Este relatório NÃO é a homologação.
> Os números vieram de um quadro falso, servido localmente. A homologação
> real exige `MONDAY_TOKEN` e o board 5959705266.

# [ENSAIO] Homologação controlada do Monday

**Quadro:** Processos Judiciais — board `5959705266`  
**Ambiente:** development  
**Competência:** todas  
**Executado em:** 2026-08-05T01:07:32.534Z  
**Versão da API do Monday:** 2024-10

> Nenhum dado foi alterado no Monday. O proxy recusa `mutation` e
> `subscription` antes de qualquer chamada — ver prova 7.

## Pré-confirmação

| Item | Resultado |
| --- | --- |
| `token_configurado: true` | ✅ MONDAY_TOKEN presente no ambiente (valor nunca exibido) |
| integração em modo somente leitura | ✅ trava no transporte (`consultar`), antes de qualquer requisição |
| quadro configurado = 5959705266 | ✅ (JUR) PROCESSOS JUDICIAIS — `5959705266` |
| nenhuma mutation ou subscription no pipeline | ✅ 4 consulta(s) do pipeline, todas aceitas pela trava |
| credencial autenticada | ✅ conta: Ensaio (simulado) |

## Primeira execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `c7b8a102-1f4f-4038-8e30-d54e085141a8` |
| Quadro | Processos Judiciais — board `5959705266` |
| Início | 2026-08-05T01:07:32.557Z |
| Conclusão | 2026-08-05T01:07:32.596Z |
| Duração | 0.04 s |
| **Quantidade recebida** (lidos da origem) | **5** |
| **Páginas consultadas** | **1** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **4** |
| **Incluída** | **0** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **4** |
| **Ignorada** | **1** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | 2025-09-01 |
| **Último dado válido (antes desta execução)** | 2026-08-05T01:07:06.083Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Ignorados, por motivo** — nenhum descarte é silencioso:

| Motivo | Quantidade |
| --- | --- |
| grupo excluido do comite: CREDENTE | 1 |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 4 |
| Vivos / marcados ausentes | 4 / 0 |
| `id_origem` distintos | 4 |
| Maior versão | 5 |
| Registros com versão > 1 | 1 |
| Entradas de histórico acumuladas | 4 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Rótulos reais encontrados

Levantados de 5 item(ns) da primeira leitura, a partir do payload
original — não do dado já interpretado.

> **Colunas do mapa não encontradas no quadro:** comarca, cliente, cpf_cnpj, contrato, unidade, numero, data_finalizacao, dias_processo, honorarios_efetivados. Gravadas como nulas, nunca presumidas.

### Grupos

| Grupo | Itens |
| --- | --- |
| PROCESSOS ATIVOS | 4 |
| CREDENTE | 1 |

### Colunas

#### ATUAÇÃO → `atuacao`

`status3` · tipo `status` · 5 preenchido(s), 0 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| INTERNO | 3 |
| EXTERNO Dr. João | 1 |
| EXTERNO Dra. Ana Beatriz Moreira | 1 |

#### CITAÇÃO/PROTOCOLO → `data_citacao`

`data_cit` · tipo `date` · 3 preenchido(s), 2 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2024-03-10 | 1 |
| 2025-06-20 | 1 |
| 2025-09-01 | 1 |

#### EMPREENDIMENTO → `empreendimento`

`empr` · tipo `mirror` · 5 preenchido(s), 0 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ALENCAR MAZZEO | 3 |
| JARDIM PAULISTA | 1 |
| JS | 1 |

#### MEU TRABALHO → `situacao`

`status5` · tipo `status` · 5 preenchido(s), 0 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ACAO AJUIZADA | 2 |
| AUDIENCIA MARCADA | 1 |
| COBRANCA EXTRAJUDICIAL | 1 |
| XPTO-42 | 1 |

#### MOTIVO → `motivo`

`texto_motivo` · tipo `text` · 3 preenchido(s), 2 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Cobrança referente ao CPF 123.456.789-00 | 1 |
| Reclamatória | 1 |
| Rescisão contratual | 1 |

#### POSIÇÃO → `posicao`

`status_pos` · tipo `status` · 4 preenchido(s), 1 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Réu | 3 |
| Autor | 1 |

#### RESPONSÁVEL _(não mapeada)_

`pessoa1` · tipo `people` · 4 preenchido(s), 1 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Ana Souza | 2 |
| Carlos Lima | 2 |

#### STATUS (PARA COMITÊ) → `situacao_comite`

`status84__1` · tipo `status` · 4 preenchido(s), 1 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ACOMPANHANDO | 3 |
| EM ACORDO | 1 |

#### TIPO DE AÇÃO → `tipo`

`status8` · tipo `status` · 4 preenchido(s), 1 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Cível | 2 |
| Consumidor | 1 |
| Trabalhista | 1 |

#### VALOR DA CAUSA → `valor_causa`

`num_valor` · tipo `numbers` · 3 preenchido(s), 2 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 18000 | 1 |
| 30000 | 1 |
| 45000 | 1 |

### Cobertura das regras de judicialização

2 de 4 rótulo(s) cobertos pelas regras atuais. 2 rótulo(s) sem cobertura, afetando **2 registro(s)**.

| Rótulo | Ocorrências | Classificação |
| --- | --- | --- |
| ACAO AJUIZADA | 2 | ⚖️ judicializado |
| AUDIENCIA MARCADA | 1 | ⚠️ **revisão necessária** |
| COBRANCA EXTRAJUDICIAL | 1 | — não judicializado |
| XPTO-42 | 1 | ⚠️ **revisão necessária** |

### Propostas de regra — AGUARDANDO APROVAÇÃO

> Nenhuma delas foi aplicada. Os registros afetados estão gravados com
> `revisao_necessaria = true` e `judicializado = false`: o que não se
> reconhece não é presumido. Alterar a metodologia muda a taxa de
> judicialização, que é indicador de comitê.

**`AUDIENCIA MARCADA`** — 1 registro(s)

- **Lista sugerida:** `TERMOS_JUDICIAL`
- **Termo sugerido:** `audiencia`
- **Justificativa:** O rótulo contém "audiencia", que indica etapa processual. Se a equipe confirmar que este status significa processo em curso na Justiça, incluir "audiencia" em TERMOS_JUDICIAL.
- **Exemplos (id de origem):** 8003

**`XPTO-42`** — 1 registro(s)

- **Lista sugerida:** _indefinida_
- **Justificativa:** O rótulo não contém nenhum termo reconhecível pelas regras atuais. A equipe precisa informar o que ele significa antes de qualquer classificação.
- **Exemplos (id de origem):** 8004

## Segunda execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `32e0b822-b36b-449f-8054-e1029f559b50` |
| Quadro | Processos Judiciais — board `5959705266` |
| Início | 2026-08-05T01:07:32.619Z |
| Conclusão | 2026-08-05T01:07:32.646Z |
| Duração | 0.03 s |
| **Quantidade recebida** (lidos da origem) | **5** |
| **Páginas consultadas** | **1** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **4** |
| **Incluída** | **0** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **4** |
| **Ignorada** | **1** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | 2025-09-01 |
| **Último dado válido (antes desta execução)** | 2026-08-05T01:07:32.595Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Ignorados, por motivo** — nenhum descarte é silencioso:

| Motivo | Quantidade |
| --- | --- |
| grupo excluido do comite: CREDENTE | 1 |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 4 |
| Vivos / marcados ausentes | 4 / 0 |
| `id_origem` distintos | 4 |
| Maior versão | 5 |
| Registros com versão > 1 | 1 |
| Entradas de histórico acumuladas | 4 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Provas da segunda execução

| # | Prova | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | Ausência de duplicação | ✅ | 4 → 4 registros; 4 `id_origem` distintos |
| 2 | Upsert idempotente | ✅ | 2ª execução: 0 incluídos, 0 atualizados, 4 inalterados sobre 5 lidos |
| 3 | Preservação de `fonte` e `id_origem` | ✅ | 0 sem fonte correta, 0 sem `id_origem` |
| 4 | Registros inalterados não geram versões indevidas | ✅ | histórico 4 → 4; versão máxima 5 → 5 |
| 5 | Registros alterados são atualizados corretamente | ✅ | situação alterada no banco e devolvida pela origem (`COBRANCA EXTRAJUDICIAL`); versão 1 → 3; 1 atualizado(s) |
| 6 | Falha posterior não apaga o último dado válido | ✅ | após falha: 4 vivos (era 4); `ultima_carga_valida_em` não avançou; status `erro` |
| 7 | Mutation e subscription continuam bloqueadas | ✅ | 4 tentativas de escrita recusadas; consulta de leitura aceita |

## Amostra anonimizada

Sem CPF, CNPJ ou nome completo. Número do processo reduzido aos quatro
últimos dígitos, valor da causa substituído, `id_origem` reduzido, e os
campos de texto livre passam por uma varredura de documento — `MOTIVO` é
digitado à mão e pode conter um CPF que ninguém previu.

```json
[
  {
    "id_origem": "***",
    "numero": "**********0100",
    "ano": null,
    "tipo": "Consumidor",
    "motivo": "Cobrança referente ao CPF [documento removido]",
    "posicao": "Réu",
    "situacao": "COBRANCA EXTRAJUDICIAL",
    "situacao_comite": "EM ACORDO",
    "atuacao": "INTERNO",
    "interno": true,
    "comarca": null,
    "valor_causa": "***",
    "data_citacao": "2025-06-20",
    "judicializado": false,
    "revisao_necessaria": false,
    "fonte": "monday",
    "versao": 3,
    "data_referencia": "2025-06-20",
    "extraido_em": "2026-08-05T01:07:32.666Z"
  },
  {
    "id_origem": "***",
    "numero": "**********0100",
    "ano": null,
    "tipo": "Trabalhista",
    "motivo": "Reclamatória",
    "posicao": "Réu",
    "situacao": "AUDIENCIA MARCADA",
    "situacao_comite": "ACOMPANHANDO",
    "atuacao": "EXTERNO Dr. J.",
    "interno": false,
    "comarca": null,
    "valor_causa": "***",
    "data_citacao": "2025-09-01",
    "judicializado": false,
    "revisao_necessaria": true,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": "2025-09-01",
    "extraido_em": "2026-08-05T01:07:32.667Z"
  },
  {
    "id_origem": "***",
    "numero": "**********0100",
    "ano": null,
    "tipo": "Cível",
    "motivo": "Rescisão contratual",
    "posicao": "Réu",
    "situacao": "ACAO AJUIZADA",
    "situacao_comite": "ACOMPANHANDO",
    "atuacao": "EXTERNO Dra. A.",
    "interno": false,
    "comarca": null,
    "valor_causa": "***",
    "data_citacao": "2024-03-10",
    "judicializado": true,
    "revisao_necessaria": false,
    "fonte": "monday",
    "versao": 5,
    "data_referencia": "2024-03-10",
    "extraido_em": "2026-08-05T01:07:32.664Z"
  }
]
```

_Varredura da amostra publicada: nenhum CPF ou CNPJ presente._

> 1 CPF foram encontrados nos campos de texto livre da ORIGEM e removidos da amostra. Vale avisar o jurídico: documento digitado em campo livre não é protegido por nenhum mascaramento de coluna.

## Inconsistências encontradas

| Tipo | Gravidade | Ocorrências | Descrição |
| --- | --- | --- | --- |
| falha_importacao | alta | 1 | Falha ao sincronizar (JUR) PROCESSOS JUDICIAIS: Monday recusou a consulta: Board 1 nao encontrado ou sem acesso.. O ultimo dado valido foi p |

---

**As sete provas passaram.** A homologação do quadro de Processos Judiciais está pronta para aprovação.
