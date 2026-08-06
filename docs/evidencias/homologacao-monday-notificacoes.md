# Homologação controlada do Monday

**Quadro:** Notificações a Clientes — board `5630368737`  
**Ambiente:** development  
**Competência:** todas  
**Executado em:** 2026-08-06T11:34:05.397Z  
**Versão da API do Monday:** 2024-10

> Nenhum dado foi alterado no Monday. O proxy recusa `mutation` e
> `subscription` antes de qualquer chamada — ver prova 7.

## Pré-confirmação

| Item | Resultado |
| --- | --- |
| `token_configurado: true` | ✅ MONDAY_TOKEN presente no ambiente (valor nunca exibido) |
| integração em modo somente leitura | ✅ trava no transporte (`consultar`), antes de qualquer requisição |
| quadro configurado = 5630368737 | ✅ (JUR) NOTIFICAÇÕES CLIENTES — `5630368737` |
| nenhuma mutation ou subscription no pipeline | ✅ 4 consulta(s) do pipeline, todas aceitas pela trava |
| credencial autenticada | ✅ conta: Cristiane C. Rabelo |

## Primeira execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `70bfca1d-016c-4654-9e83-ae6015ddf0a8` |
| Quadro | Notificações a Clientes — board `5630368737` |
| Início | 2026-08-06T11:34:05.422Z |
| Conclusão | 2026-08-06T11:34:25.179Z |
| Duração | 19.76 s |
| **Quantidade recebida** (lidos da origem) | **1072** |
| **Páginas consultadas** | **6** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **1072** |
| **Incluída** | **1072** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **0** |
| **Ignorada** | **0** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | 2026-08-05 |
| **Último dado válido (antes desta execução)** | nenhum — primeira carga |
| Status | sucesso |
| Contabilidade fecha | sim |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 1072 |
| Vivos / marcados ausentes | 1072 / 0 |
| `id_origem` distintos | 1072 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Rótulos reais encontrados

Levantados de 1072 item(ns) da primeira leitura, a partir do payload
original — não do dado já interpretado.

> **Colunas do mapa não encontradas no quadro:** cpf_cnpj, contrato, unidade, torre, situacao, acordo, saldo_vencido, saldo_atualizado, dias_atraso. Gravadas como nulas, nunca presumidas.

> **Títulos repetidos no quadro.** A resolução por título pressupõe que o
> título identifique a coluna. Aqui ele não identifica, e o desempate
> — a primeira coluna que não for espelho — decidiu. A escolha está
> declarada abaixo para conferência, não para ser aceita em silêncio.

| Título | Colunas com esse título | Escolhida hoje |
| --- | --- | --- |
| `'MEU TRABALHO'` | `nome_m_s` (date) · `status68` (status) | `nome_m_s` |
| `link to (JUR) RETOMADAS` | `board_relation_mm3an3ey` (board_relation) · `board_relation_mm3ajk8r` (board_relation) · `board_relation_mm3avsff` (board_relation) | `board_relation_mm3an3ey` |

### Grupos

| Grupo | Itens |
| --- | --- |
| AGOSTO/ 2025 | 133 |
| MARÇO/ 2025 | 71 |
| JUNHO/2026 | 67 |
| FEVEREIRO/ 2026 | 65 |
| MAIO/ 2025 | 59 |
| MAIO/ 2026 | 58 |
| JULHO/ 2026 | 54 |
| ABRIL/ 2025 | 53 |
| ABRIL/ 2026 | 52 |
| JANEIRO/ 2025 | 51 |
| JANEIRO/ 2026 | 51 |
| JULHO/ 2025 | 44 |
| JUNHO/ 2025 | 42 |
| FEVEREIRO/ 2025 | 40 |
| NOVEMBRO/ 2025 | 37 |
| SETEMBRO/ 2025 | 35 |
| DEZEMBRO/  2025 | 31 |
| OUTUBRO/ 2025 | 28 |
| MARÇO/ 2026 | 23 |
| DEZEMBRO/ 2023 | 18 |
| AGOSTO/ 2026 | 13 |
| SETEMBRO/ 2024 | 10 |
| NOVEMBRO/ 2024 | 7 |
| OUTUBRO/ 2024 | 5 |
| JULHO/ 2024 | 4 |
| NOVEMBRO/ 2023 | 4 |
| AGOSTO/ 2022 | 3 |
| AGOSTO/ 2024 | 3 |
| JUNHO/ 2024 | 2 |
| ABRIL/ 2023 | 1 |
| ABRIL/ 2024 | 1 |
| AGOSTO/ 2023 | 1 |
| FEVEREIRO/ 2024 | 1 |
| JANEIRO/ 2024 | 1 |
| JULHO/ 2023 | 1 |
| JUNHO/ 2023 | 1 |
| MARÇO/ 2023 | 1 |
| SETEMBRO/ 2023 | 1 |

### Colunas

#### 'MEU TRABALHO' _(não mapeada)_

`nome_m_s` · tipo `date` · 21 preenchido(s), 1051 vazio(s) · 11 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2025-09-04 | 7 |
| 2025-08-18 | 4 |
| 2025-08-29 | 2 |
| 2024-05-09 | 1 |
| 2025-08-19 | 1 |
| 2025-09-08 | 1 |
| 2025-10-01 | 1 |
| 2025-10-29 | 1 |
| 2025-12-15 | 1 |
| 2026-07-13 | 1 |
| 2026-07-31 | 1 |

#### 'MEU TRABALHO' _(não mapeada)_

`status68` · tipo `status` · 1072 preenchido(s), 0 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| FEITO | 743 |
| ACOMPANHANDO | 329 |

#### AR _(não mapeada)_

`status05` · tipo `status` · 785 preenchido(s), 287 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Não foi necessário | 704 |
| Enviar AR | 42 |
| AR enviado | 38 |
| AR retornou negativo | 1 |

#### CLIENTE → `cliente`

`texto` · tipo `text` · 1047 preenchido(s), 25 vazio(s) · 599 valor(es) distinto(s)

_Valores não listados: texto livre pode conter nome ou documento
digitado à mão, e este relatório é evidência versionada._

#### DATA DA NOTIFICAÇÃO → `data_notificacao`

`date0` · tipo `date` · 1019 preenchido(s), 53 vazio(s) · 199 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2025-08-14 | 52 |
| 2025-08-15 | 26 |
| 2025-04-23 | 23 |
| 2025-05-15 | 22 |
| 2026-04-22 | 20 |
| 2025-01-13 | 19 |
| 2025-03-10 | 19 |
| 2025-12-12 | 17 |
| 2026-05-14 | 17 |
| 2025-04-01 | 16 |
| 2026-06-11 | 15 |
| 2025-07-04 | 14 |
| 2025-02-26 | 13 |
| 2025-04-28 | 13 |
| 2025-06-16 | 13 |
| _… mais 184 valor(es)_ | |

#### DIAS PARA O ENVIO DA NOTIFICAÇÃO _(não mapeada)_

`formula_mky08gej` · tipo `formula` · 1072 preenchido(s), 0 vazio(s) · 37 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 1 | 239 |
| 0 | 200 |
| 2 | 170 |
| 3 | 127 |
| 4 | 91 |
| null | 61 |
| 5 | 41 |
| 7 | 29 |
| 6 | 28 |
| 8 | 15 |
| 15 | 11 |
| 14 | 9 |
| 29 | 9 |
| 9 | 8 |
| 11 | 3 |
| _… mais 22 valor(es)_ | |

#### ELEMENTO _(não mapeada)_

`text_mm3zs6z` · tipo `text` · 6 preenchido(s), 1066 vazio(s) · 6 valor(es) distinto(s)

_Valores não listados: texto livre pode conter nome ou documento
digitado à mão, e este relatório é evidência versionada._

#### EMPREENDIMENTO → `empreendimento`

`color_mky02302` · tipo `status` · 1072 preenchido(s), 0 vazio(s) · 21 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| AURORA | 294 |
| VERANO | 142 |
| CARPE DIEM | 88 |
| BELLA VIDA | 66 |
| MORATTA | 65 |
| AURORA TORRE B | 41 |
| MORATTA TORRE B | 41 |
| AURORA TORRE A | 40 |
| VERANO TORRE B | 40 |
| VERANO TORRE A | 37 |
| VERANO TORRE C | 37 |
| ALAMEDAS | 33 |
| MORATTA TORRE C | 32 |
| VITA VILLAGE | 27 |
| HORIZONTES | 21 |
| _… mais 6 valor(es)_ | |

#### ESTÁGIOS → `estagio`

`color_mky1txdp` · tipo `status` · 1072 preenchido(s), 0 vazio(s) · 16 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Resolvido | 777 |
| Processo Judicial Dra. Michele | 60 |
| Processo judicial interno | 52 |
| Unidade retomada | 47 |
| Enviado para Protesto | 32 |
| Distratado | 27 |
| Aguardando prazo | 25 |
| Enviar Notificação | 12 |
| Aguardando pagamento | 11 |
| Recompra | 7 |
| Processo judicial a definir | 6 |
| Sem retorno do cliente até o momento | 5 |
| Processo judicial | 4 |
| A Retomar | 3 |
| Em tratativa com o cliente | 3 |
| _… mais 1 valor(es)_ | |

#### EXECUTOR _(não mapeada)_

`dup__of_respens_vel9` · tipo `people` · 1065 preenchido(s), 7 vazio(s) · 13 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Geovana Cavalcanti | 757 |
| Thamar Victória | 232 |
| Thamar Victória, Miguel | 31 |
| Miguel, Thamar Victória | 9 |
| anapaula132554@gmail.com | 8 |
| Geovana Cavalcanti, Vinícius Heitor | 8 |
| Nathália Moreira | 6 |
| Aline Silva | 4 |
| Thamar Victória, Geovana Cavalcanti | 3 |
| Vinícius Heitor, Geovana Cavalcanti | 3 |
| Miguel | 2 |
| Aline Silva, Geovana Cavalcanti | 1 |
| MIGUEL CLEPF | 1 |

#### FINANCEIRO/RENEGOCIAÇÃO _(não mapeada)_

`status6__1` · tipo `status` · 1072 preenchido(s), 0 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| FEITO | 713 |
| NÃO É NECESSÁRIO | 351 |
| SOLICITADO | 6 |
| EM PROCESSO | 2 |

#### FINANCIAMENTO _(não mapeada)_

`status16` · tipo `status` · 1037 preenchido(s), 35 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| FINANCIADO | 673 |
| NÃO FINANCIADO | 319 |
| NÃO SE APLICA | 43 |
| DIRETA | 2 |

#### ID Honorários _(não mapeada)_

`text_mm3tt7ek` · tipo `text` · 72 preenchido(s), 1000 vazio(s) · 72 valor(es) distinto(s)

_Valores não listados: texto livre pode conter nome ou documento
digitado à mão, e este relatório é evidência versionada._

#### link to (JUR) HONORÁRIOS EXTRAJUDICIAIS _(não mapeada)_

`board_relation_mm2pspxz` · tipo `board_relation` · 0 preenchido(s), 1072 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### link to (JUR) RETOMADAS _(não mapeada)_

`board_relation_mm3an3ey` · tipo `board_relation` · 0 preenchido(s), 1072 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### link to (JUR) RETOMADAS _(não mapeada)_

`board_relation_mm3ajk8r` · tipo `board_relation` · 13 preenchido(s), 1059 vazio(s) · 13 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ALAMEDAS 1408A | 1 |
| CARPE DIEM 131 | 1 |
| GRAN PARK 1108 | 1 |
| GRAN PARK 505 | 1 |
| MORATTA 006A | 1 |
| MORATTA 1002B | 1 |
| MORATTA 1002C | 1 |
| MORATTA 1004C | 1 |
| MORATTA 106A | 1 |
| MORATTA 1401C | 1 |
| MORATTA 204C | 1 |
| MORATTA 205A | 1 |
| MORATTA 901B | 1 |

#### link to (JUR) RETOMADAS _(não mapeada)_

`board_relation_mm3avsff` · tipo `board_relation` · 23 preenchido(s), 1049 vazio(s) · 23 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ALAMEDA 905B | 1 |
| ALAMEDAS 1408A | 1 |
| CARPE DIEM 131 | 1 |
| GRAN PARK 1108 | 1 |
| GRAN PARK 505 | 1 |
| MORATTA 006A | 1 |
| MORATTA 1002B | 1 |
| MORATTA 1002C | 1 |
| MORATTA 1004C | 1 |
| MORATTA 106A | 1 |
| MORATTA 1401C | 1 |
| MORATTA 204C | 1 |
| MORATTA 205A | 1 |
| MORATTA 206B | 1 |
| MORATTA 503A | 1 |
| _… mais 8 valor(es)_ | |

#### MEIOS DA NOTIFICAÇÃO _(não mapeada)_

`status5` · tipo `status` · 788 preenchido(s), 284 vazio(s) · 2 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| E-MAIL E WHATSAPP | 784 |
| E-MAIL | 4 |

#### MODELOS DE NOTIFICAÇÃO → `modelo`

`status6` · tipo `status` · 1071 preenchido(s), 1 vazio(s) · 16 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| PARCELAS REGULARES EM ATRASO | 761 |
| ALTERAÇÃO DE TITULARIDADE DE IPTU | 99 |
| FINANCIAMENTO EM ATRASO | 44 |
| REALIZAÇÃO DE VISTORIA | 43 |
| PARCELA DE DISTRATO | 39 |
| RETOMADA DE UNIDADE | 21 |
| PENDENTE ENVIO DE DOCUMENTAÇÃO | 16 |
| REEMBOLSO DE TAXA CONDOMINIAL | 14 |
| FINANCIAMENTO EM ATRASO RETOMADA | 12 |
| ASSINATURA DE DOCUMENTO | 8 |
| APRESENTAÇÃO DE FIADOR | 7 |
| ALTERAÇÃO DE TITULARIDADE DA MATRÍCULA | 2 |
| BUSCA DE CHAVES | 2 |
| DESOCUPAÇÃO DO IMÓVEL | 1 |
| DISTRATO CONTRATUAL | 1 |
| _… mais 1 valor(es)_ | |

#### NEGATIVAÇÃO _(não mapeada)_

`status3` · tipo `status` · 1072 preenchido(s), 0 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| NÃO NEGATIVADO | 1054 |
| PROTESTO | 11 |
| NEGATIVADO | 6 |
| PROTESTADO E NEGATIVADO | 1 |

#### PRAZO FINAL _(não mapeada)_

`data9` · tipo `date` · 989 preenchido(s), 83 vazio(s) · 183 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2025-08-29 | 52 |
| 2025-09-01 | 26 |
| 2025-05-08 | 23 |
| 2025-05-30 | 22 |
| 2026-05-07 | 22 |
| 2025-01-28 | 19 |
| 2025-03-25 | 19 |
| 2025-12-27 | 17 |
| 2026-05-29 | 17 |
| 2025-04-16 | 16 |
| 2026-06-26 | 15 |
| 2025-07-19 | 14 |
| 2025-05-13 | 13 |
| 2025-10-10 | 13 |
| 2026-03-14 | 13 |
| _… mais 168 valor(es)_ | |

#### REQUERENTE _(não mapeada)_

`dup__of_respens_vel` · tipo `people` · 1072 preenchido(s), 0 vazio(s) · 12 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Aline Silva | 816 |
| Paula Forli | 155 |
| Gabriela Aires | 66 |
| Thamar Victória | 24 |
| Flávia | 2 |
| Kaillany Leticia Marcelo Da Silva | 2 |
| Vinícius Heitor | 2 |
| Cristiane C. Rabelo | 1 |
| Gabriela Aires, Aline Silva | 1 |
| Gabriela Inacio | 1 |
| Miguel | 1 |
| Paula Forli, Aline Silva | 1 |

#### REQUERIMENTO _(não mapeada)_

`data` · tipo `date` · 1063 preenchido(s), 9 vazio(s) · 219 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2025-08-12 | 92 |
| 2026-02-23 | 43 |
| 2025-12-10 | 27 |
| 2026-06-09 | 27 |
| 2025-04-23 | 21 |
| 2026-01-13 | 21 |
| 2026-04-20 | 19 |
| 2025-01-09 | 18 |
| 2025-11-11 | 18 |
| 2026-05-05 | 18 |
| 2025-03-31 | 17 |
| 2026-05-14 | 17 |
| 2026-02-26 | 16 |
| 2025-05-13 | 14 |
| 2026-04-10 | 14 |
| _… mais 204 valor(es)_ | |

#### RESOLUÇÃO → `resolucao`

`date_mm2v7zz4` · tipo `date` · 182 preenchido(s), 890 vazio(s) · 66 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2026-05-18 | 8 |
| 2026-06-30 | 7 |
| 2026-08-03 | 7 |
| 2026-04-22 | 6 |
| 2026-05-07 | 6 |
| 2026-06-01 | 6 |
| 2026-06-24 | 6 |
| 2026-07-29 | 6 |
| 2026-05-11 | 5 |
| 2026-05-15 | 5 |
| 2026-05-25 | 5 |
| 2026-04-27 | 4 |
| 2026-05-04 | 4 |
| 2026-05-29 | 4 |
| 2026-06-09 | 4 |
| _… mais 51 valor(es)_ | |

#### RESPONSÁVEL _(não mapeada)_

`pessoas` · tipo `people` · 1066 preenchido(s), 6 vazio(s) · 10 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Thamar Victória | 606 |
| Geovana Cavalcanti | 223 |
| Miguel | 188 |
| Thamar Victória, Miguel | 17 |
| Thamar Victória, Flávia, Aline Silva | 13 |
| MIGUEL CLEPF | 9 |
| Miguel, Geovana Cavalcanti | 4 |
| Geovana Cavalcanti, Miguel | 2 |
| Miguel, Thamar Victória | 2 |
| Nathália Moreira | 2 |

#### Subelementos _(não mapeada)_

`subelementos` · tipo `subtasks` · 0 preenchido(s), 1072 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### TOTAL DIAS → `total_dias`

`formula_mm31vn5h` · tipo `formula` · 1072 preenchido(s), 0 vazio(s) · 56 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| null | 891 |
| 0 | 12 |
| 21 | 10 |
| 1 | 9 |
| 13 | 8 |
| 15 | 8 |
| 8 | 8 |
| 18 | 6 |
| 27 | 6 |
| 34 | 6 |
| 6 | 6 |
| 7 | 6 |
| 2 | 5 |
| 20 | 5 |
| 3 | 5 |
| _… mais 41 valor(es)_ | |

> Este quadro não alimenta a classificação de judicialização.
> A análise de cobertura não se aplica.

## Segunda execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `f60fe48d-4fec-4c48-9073-4807c74af6c7` |
| Quadro | Notificações a Clientes — board `5630368737` |
| Início | 2026-08-06T11:34:25.226Z |
| Conclusão | 2026-08-06T11:34:46.035Z |
| Duração | 20.81 s |
| **Quantidade recebida** (lidos da origem) | **1072** |
| **Páginas consultadas** | **6** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **1072** |
| **Incluída** | **0** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **1072** |
| **Ignorada** | **0** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | 2026-08-05 |
| **Último dado válido (antes desta execução)** | 2026-08-06T11:34:25.178Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 1072 |
| Vivos / marcados ausentes | 1072 / 0 |
| `id_origem` distintos | 1072 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Provas da segunda execução

| # | Prova | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | Ausência de duplicação | ✅ | 1072 → 1072 registros; 1072 `id_origem` distintos |
| 2 | Upsert idempotente | ✅ | 2ª execução: 0 incluídos, 0 atualizados, 1072 inalterados sobre 1072 lidos |
| 3 | Preservação de `fonte` e `id_origem` | ✅ | 0 sem fonte correta, 0 sem `id_origem` |
| 4 | Registros inalterados não geram versões indevidas | ✅ | histórico 0 → 0; versão máxima 1 → 1 |
| 5 | Registros alterados são atualizados corretamente | ✅ | `estagio_detalhe` alterado no banco e devolvido pela origem (`Resolvido`); versão 1 → 3; 1 atualizado(s) |
| 6 | Falha posterior não apaga o último dado válido | ✅ | após falha: 1072 vivos (era 1072); `ultima_carga_valida_em` não avançou; status `erro` |
| 7 | Mutation e subscription continuam bloqueadas | ✅ | 4 tentativas de escrita recusadas; consulta de leitura aceita |

## Amostra anonimizada

Sem CPF, CNPJ ou nome completo. Número do processo reduzido aos quatro
últimos dígitos, valor da causa substituído, `id_origem` reduzido, e os
campos de texto livre passam por uma varredura de documento — `MOTIVO` é
digitado à mão e pode conter um CPF que ninguém previu.

```json
[
  {
    "id_origem": "***7123",
    "cliente_nome": "***",
    "torre": null,
    "unidade": "124",
    "grupo": "AGOSTO/ 2026",
    "modelo": "PARCELAS REGULARES EM ATRASO",
    "estagio": "Em Andamento",
    "estagio_detalhe": "Aguardando pagamento",
    "situacao": null,
    "data_notificacao": "2026-08-04",
    "data_solucao": null,
    "total_dias": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": "2026-08-04",
    "extraido_em": "2026-08-06T11:35:03.827Z"
  },
  {
    "id_origem": "***3351",
    "cliente_nome": "***",
    "torre": "TORRE A",
    "unidade": "710A",
    "grupo": "AGOSTO/ 2026",
    "modelo": "PARCELAS REGULARES EM ATRASO",
    "estagio": "Em Andamento",
    "estagio_detalhe": "Enviar Notificação",
    "situacao": null,
    "data_notificacao": null,
    "data_solucao": null,
    "total_dias": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T11:35:03.828Z"
  },
  {
    "id_origem": "***9103",
    "cliente_nome": "***",
    "torre": null,
    "unidade": "65",
    "grupo": "AGOSTO/ 2026",
    "modelo": "PARCELAS REGULARES EM ATRASO",
    "estagio": "Em Andamento",
    "estagio_detalhe": "Enviar Notificação",
    "situacao": null,
    "data_notificacao": null,
    "data_solucao": null,
    "total_dias": null,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": null,
    "extraido_em": "2026-08-06T11:35:03.825Z"
  }
]
```

_Varredura da amostra publicada: nenhum CPF ou CNPJ presente._

> 3 CPF foram encontrados nos campos de texto livre da ORIGEM e removidos da amostra. Vale avisar o jurídico: documento digitado em campo livre não é protegido por nenhum mascaramento de coluna.

## Inconsistências encontradas

| Tipo | Gravidade | Ocorrências | Descrição |
| --- | --- | --- | --- |
| falha_importacao | alta | 1 | Falha ao sincronizar (JUR) NOTIFICAÇÕES CLIENTES: Quadro 1 nao encontrado ou sem acesso.. O ultimo dado valido foi preservado. |

---

**As sete provas passaram.** A homologação do quadro Notificações a Clientes está pronta para aprovação.
