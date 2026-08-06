# Homologação controlada do Monday

**Quadro:** Controle de Entrega Carpe Diem — board `18410779605`  
**Ambiente:** development  
**Competência:** todas  
**Executado em:** 2026-08-06T15:43:57.027Z  
**Versão da API do Monday:** 2024-10

> Nenhum dado foi alterado no Monday. O proxy recusa `mutation` e
> `subscription` antes de qualquer chamada — ver prova 7.

## Pré-confirmação

| Item | Resultado |
| --- | --- |
| `token_configurado: true` | ✅ MONDAY_TOKEN presente no ambiente (valor nunca exibido) |
| integração em modo somente leitura | ✅ trava no transporte (`consultar`), antes de qualquer requisição |
| quadro configurado = 18410779605 | ✅ CONTROLE DE ENTREGA CARPE DIEM — `18410779605` |
| nenhuma mutation ou subscription no pipeline | ✅ 4 consulta(s) do pipeline, todas aceitas pela trava |
| credencial autenticada | ✅ conta: Cristiane C. Rabelo |

## Primeira execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `2dce7c4d-444a-458d-9058-42c446635c8e` |
| Quadro | Controle de Entrega Carpe Diem — board `18410779605` |
| Início | 2026-08-06T15:43:57.055Z |
| Conclusão | 2026-08-06T15:43:59.490Z |
| Duração | 2.44 s |
| **Quantidade recebida** (lidos da origem) | **112** |
| **Páginas consultadas** | **1** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **112** |
| **Incluída** | **112** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **0** |
| **Ignorada** | **0** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | — |
| **Último dado válido (antes desta execução)** | 2026-08-06T15:43:55.289Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 112 |
| Vivos / marcados ausentes | 112 / 0 |
| `id_origem` distintos | 112 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Rótulos reais encontrados

Levantados de 112 item(ns) da primeira leitura, a partir do payload
original — não do dado já interpretado.

> **Colunas do mapa não encontradas no quadro:** empreendimento, unidade, torre, bloco, situacao, prazo_180, previsao_entrega. Gravadas como nulas, nunca presumidas.

> **Títulos repetidos no quadro.** A resolução por título pressupõe que o
> título identifique a coluna. Aqui ele não identifica, e o desempate
> — a primeira coluna que não for espelho — decidiu. A escolha está
> declarada abaixo para conferência, não para ser aceita em silêncio.

| Título | Colunas com esse título | Escolhida hoje |
| --- | --- | --- |
| `RESPONSÁVEL` | `pessoas__1` (people) · `pessoas5__1` (people) · `multiple_person_mm3x3bge` (people) | `pessoas__1` |

### Grupos

| Grupo | Itens |
| --- | --- |
| CARPE DIEM | 112 |

### Colunas

#### AGI _(não mapeada)_

`data__1` · tipo `date` · 0 preenchido(s), 112 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### ÁGUA _(não mapeada)_

`status55__1` · tipo `status` · 10 preenchido(s), 102 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |

#### CARÊNCIA (180 DIAS) _(não mapeada)_

`color_mm2wa10k` · tipo `status` · 112 preenchido(s), 0 vazio(s) · 5 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| DEZEMBRO 2025 | 49 |
| JUNHO 2026 | 36 |
| JANEIRO 2025 | 16 |
| ESTOQUE | 10 |
| VENDA NOVA | 1 |

#### CLIENTE → `cliente`

`texto__1` · tipo `text` · 112 preenchido(s), 0 vazio(s) · 92 valor(es) distinto(s)

_Valores não listados: texto livre pode conter nome ou documento
digitado à mão, e este relatório é evidência versionada._

#### CONDOMINIO _(não mapeada)_

`status69__1` · tipo `status` · 10 preenchido(s), 102 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |

#### ENERGIA _(não mapeada)_

`status84__1` · tipo `status` · 10 preenchido(s), 102 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |

#### ENGENHARIA _(não mapeada)_

`status_mknbgf8x` · tipo `status` · 111 preenchido(s), 1 vazio(s) · 7 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| APROVADA CLIENTE | 70 |
| LIBERADA PARA VISTORIA | 19 |
| LIBERADA REVISTORIA | 6 |
| VISTORIA AGENDADA | 5 |
| APROVADA REVISTORIA | 4 |
| REPROVADO | 4 |
| AGENDADO REVISTORIA | 3 |

#### ENTREGA DAS CHAVES → `entrega_chaves`

`date_mktrn5b4` · tipo `date` · 0 preenchido(s), 112 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### FINANCEIRO COEVO _(não mapeada)_

`status` · tipo `status` · 21 preenchido(s), 91 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |
| QUITADO Rec. Próprios | 7 |
| REGULAR | 4 |

#### FINANCIAMENTO → `tipo_financiamento`

`status44__1` · tipo `status` · 15 preenchido(s), 97 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |
| EM PROCESSO | 4 |
| REGISTRO | 1 |

#### HABITE-SE → `prazo_habite_se`

`data` · tipo `date` · 0 preenchido(s), 112 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### INFORMOU ADM? _(não mapeada)_

`status49__1` · tipo `status` · 10 preenchido(s), 102 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |

#### IPTU _(não mapeada)_

`status7__1` · tipo `status` · 10 preenchido(s), 102 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |

#### LIBERAÇÃO FINANCEIRO _(não mapeada)_

`status6__1` · tipo `status` · 17 preenchido(s), 95 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |
| LIBERADO | 7 |

#### LIBERAÇÃO JURÍDICO → `status_juridico`

`status38__1` · tipo `status` · 12 preenchido(s), 100 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |
| NÃO LIBERADO | 2 |

#### MOTIVO _(não mapeada)_

`status66__1` · tipo `status` · 12 preenchido(s), 100 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |
| PENDENTE ASSINAR DOCUMENTO | 2 |

#### Observações _(não mapeada)_

`text_mm451416` · tipo `text` · 46 preenchido(s), 66 vazio(s) · 7 valor(es) distinto(s)

_Valores não listados: texto livre pode conter nome ou documento
digitado à mão, e este relatório é evidência versionada._

#### PEDIR FIADOR/GARANTIA _(não mapeada)_

`status80__1` · tipo `status` · 14 preenchido(s), 98 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |
| AVALIAR/VALOR DO SALDO | 4 |

#### Pessoas _(não mapeada)_

`multiple_person_mm3xst4` · tipo `people` · 112 preenchido(s), 0 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Gabriela Aires | 112 |

#### POSSUI FIADOR/GARANTIA _(não mapeada)_

`status48__1` · tipo `status` · 12 preenchido(s), 100 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |
| NÃO POSSUI | 2 |

#### PRIORIDADE DE ENTREGA _(não mapeada)_

`color_mknx2033` · tipo `status` · 10 preenchido(s), 102 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |

#### PRO SOLUTO _(não mapeada)_

`n_meros__1` · tipo `numbers` · 0 preenchido(s), 112 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### RESPONSÁVEL _(não mapeada)_

`pessoas__1` · tipo `people` · 112 preenchido(s), 0 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Aline Silva | 112 |

#### RESPONSÁVEL _(não mapeada)_

`pessoas5__1` · tipo `people` · 112 preenchido(s), 0 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Thamar Victória | 112 |

#### RESPONSÁVEL _(não mapeada)_

`multiple_person_mm3x3bge` · tipo `people` · 112 preenchido(s), 0 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| EDER XAVIER DA SILVA | 112 |

#### RESPONSÁVEL1 _(não mapeada)_

`multiple_person_mm3x1gtk` · tipo `people` · 112 preenchido(s), 0 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Larissa Aguiar | 112 |

#### Subelementos _(não mapeada)_

`subelementos__1` · tipo `subtasks` · 0 preenchido(s), 112 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### TERMO DE CONFISSÃO _(não mapeada)_

`status_1__1` · tipo `status` · 12 preenchido(s), 100 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |
| ASSINADO | 2 |

#### TERMO DE RECEBIMENTO DE CHAVES _(não mapeada)_

`file_mkntd57v` · tipo `file` · 0 preenchido(s), 112 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### TERMOS ADITIVOS _(não mapeada)_

`status42__1` · tipo `status` · 12 preenchido(s), 100 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |
| NÃO SE APLICA | 2 |

#### TIPO DE VENDA _(não mapeada)_

`status8__1` · tipo `status` · 15 preenchido(s), 97 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ESTOQUE | 10 |
| ASSOCIATIVO | 4 |
| BANCÁRIO | 1 |

#### VISTORIA/ENG _(não mapeada)_

`status_mkn8cwgk` · tipo `status` · 111 preenchido(s), 1 vazio(s) · 1 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| APROVADA PELA QUALIDADE | 111 |

> Este quadro não alimenta a classificação de judicialização.
> A análise de cobertura não se aplica.

## Segunda execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `3f6be254-1d71-452e-9d68-82b68aaa2001` |
| Quadro | Controle de Entrega Carpe Diem — board `18410779605` |
| Início | 2026-08-06T15:43:59.513Z |
| Conclusão | 2026-08-06T15:44:01.925Z |
| Duração | 2.41 s |
| **Quantidade recebida** (lidos da origem) | **112** |
| **Páginas consultadas** | **1** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **112** |
| **Incluída** | **0** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **112** |
| **Ignorada** | **0** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | — |
| **Último dado válido (antes desta execução)** | 2026-08-06T15:43:59.489Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 112 |
| Vivos / marcados ausentes | 112 / 0 |
| `id_origem` distintos | 112 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Provas da segunda execução

| # | Prova | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | Ausência de duplicação | ✅ | 112 → 112 registros; 112 `id_origem` distintos |
| 2 | Upsert idempotente | ✅ | 2ª execução: 0 incluídos, 0 atualizados, 112 inalterados sobre 112 lidos |
| 3 | Preservação de `fonte` e `id_origem` | ✅ | 0 sem fonte correta, 0 sem `id_origem` |
| 4 | Registros inalterados não geram versões indevidas | ✅ | histórico 0 → 0; versão máxima 1 → 1 |
| 5 | Registros alterados são atualizados corretamente | ✅ | `unidade` alterado no banco e devolvido pela origem (`76`); versão 1 → 3; 1 atualizado(s) |
| 6 | Falha posterior não apaga o último dado válido | ✅ | após falha: 112 vivos (era 112); `ultima_carga_valida_em` não avançou; status `erro` |
| 7 | Mutation e subscription continuam bloqueadas | ✅ | 4 tentativas de escrita recusadas; consulta de leitura aceita |

## Amostra anonimizada

Sem CPF, CNPJ ou nome completo. Número do processo reduzido aos quatro
últimos dígitos, valor da causa substituído, `id_origem` reduzido, e os
campos de texto livre passam por uma varredura de documento — `MOTIVO` é
digitado à mão e pode conter um CPF que ninguém previu.

```json
[
  {
    "id_origem": "***4796",
    "unidade": "27",
    "torre": null,
    "bloco": null,
    "situacao": null,
    "status_juridico": null,
    "tipo_financiamento": null,
    "prazo_habite_se": null,
    "prazo_180": null,
    "previsao_entrega": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T15:44:04.055Z"
  },
  {
    "id_origem": "***6920",
    "unidade": "84",
    "torre": null,
    "bloco": null,
    "situacao": null,
    "status_juridico": null,
    "tipo_financiamento": null,
    "prazo_habite_se": null,
    "prazo_180": null,
    "previsao_entrega": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T15:44:04.102Z"
  },
  {
    "id_origem": "***0078",
    "unidade": "26",
    "torre": null,
    "bloco": null,
    "situacao": null,
    "status_juridico": null,
    "tipo_financiamento": null,
    "prazo_habite_se": null,
    "prazo_180": null,
    "previsao_entrega": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T15:44:04.054Z"
  }
]
```

_Varredura da amostra publicada: nenhum CPF ou CNPJ presente._

> 3 CPF foram encontrados nos campos de texto livre da ORIGEM e removidos da amostra. Vale avisar o jurídico: documento digitado em campo livre não é protegido por nenhum mascaramento de coluna.

## Inconsistências encontradas

| Tipo | Gravidade | Ocorrências | Descrição |
| --- | --- | --- | --- |
| falha_importacao | alta | 1 | Falha ao sincronizar CONTROLE DE ENTREGA CARPE DIEM: Quadro 1 nao encontrado ou sem acesso.. O ultimo dado valido foi preservado. |
| falha_importacao | alta | 1 | Falha ao sincronizar (JUR) HONORÁRIOS EXTRAJUDICIAIS: Quadro 1 nao encontrado ou sem acesso.. O ultimo dado valido foi preservado. |

---

**As sete provas passaram.** A homologação do quadro Controle de Entrega Carpe Diem está pronta para aprovação.
