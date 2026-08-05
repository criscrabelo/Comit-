# Homologação controlada do Monday — RODADA DESCARTADA (antes da correção)

> **Este NÃO é o relatório da homologação.** É o snapshot da primeira rodada
> real, preservado como evidência do defeito descrito em B16.3: o título real
> da coluna de situação é `'MEU TRABALHO'` — com apóstrofos — e a resolução
> por comparação exata não a encontrava. Repare abaixo: `situacao` nula na
> amostra, a coluna listada como "não mapeada" e o aviso de "coluna MEU
> TRABALHO não encontrada". O relatório válido, gerado após a correção e com o
> banco recriado, é `homologacao-monday.md`.

**Quadro:** Processos Judiciais — board `5959705266`  
**Ambiente:** development  
**Competência:** todas  
**Executado em:** 2026-08-05T01:58:27.749Z  
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
| credencial autenticada | ✅ conta: Cristiane C. Rabelo |

## Primeira execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `084bb3b0-13c1-411d-a591-21932207e098` |
| Quadro | Processos Judiciais — board `5959705266` |
| Início | 2026-08-05T01:58:27.818Z |
| Conclusão | 2026-08-05T01:58:34.017Z |
| Duração | 6.20 s |
| **Quantidade recebida** (lidos da origem) | **273** |
| **Páginas consultadas** | **2** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **250** |
| **Incluída** | **250** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **0** |
| **Ignorada** | **23** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | 2026-08-17 |
| **Último dado válido (antes desta execução)** | nenhum — primeira carga |
| Status | sucesso |
| Contabilidade fecha | sim |

**Ignorados, por motivo** — nenhum descarte é silencioso:

| Motivo | Quantidade |
| --- | --- |
| grupo excluido do comite: CJ (REGRESSO) | 1 |
| grupo excluido do comite: TETUS LOCAÇÃO | 2 |
| grupo excluido do comite: CREDENTE | 3 |
| grupo excluido do comite: LEONICE | 5 |
| grupo excluido do comite: GILMAR | 10 |
| grupo excluido do comite: DANILO | 1 |
| grupo excluido do comite: FGLASS/GRADFIBRA | 1 |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 250 |
| Vivos / marcados ausentes | 250 / 0 |
| `id_origem` distintos | 250 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Rótulos reais encontrados

Levantados de 273 item(ns) da primeira leitura, a partir do payload
original — não do dado já interpretado.

> **Colunas do mapa não encontradas no quadro:** situacao, cliente, cpf_cnpj, contrato, numero. Gravadas como nulas, nunca presumidas.

### Grupos

| Grupo | Itens |
| --- | --- |
| SAN MARINO | 50 |
| COEVO | 49 |
| PADRE EUGENIO | 47 |
| IPE | 34 |
| A6D | 17 |
| FGV | 16 |
| ALENCAR MAZZEO | 14 |
| GILMAR | 10 |
| COEVO E CONELESTE I | 5 |
| LEONICE | 5 |
| VSR | 5 |
| CREDENTE | 3 |
| IPÊ 2 | 3 |
| JS | 3 |
| SIETE | 3 |
| TETUS LOCAÇÃO | 2 |
| CASABELA | 1 |
| CJ (REGRESSO) | 1 |
| DANILO | 1 |
| FGLASS/GRADFIBRA | 1 |
| GRAN PARK | 1 |
| JARDIM ANA MARIA | 1 |
| JARDIM PAULISTA | 1 |

### Colunas

#### 'MEU TRABALHO' _(não mapeada)_

`status5` · tipo `status` · 273 preenchido(s), 0 vazio(s) · 6 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| ACOMPANHANDO | 150 |
| FINALIZADO | 69 |
| ACORDO | 47 |
| BAIXA DEFINITIVA | 3 |
| RECOMPRA/ACORDO | 3 |
| ARQUIVADO PROVISORIAMENTE | 1 |

#### CIÊNCIA _(não mapeada)_

`data__1` · tipo `date` · 189 preenchido(s), 84 vazio(s) · 142 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2025-02-06 | 7 |
| 2026-05-22 | 5 |
| 2026-03-04 | 4 |
| 2026-07-31 | 4 |
| 2017-08-26 | 3 |
| 2018-08-26 | 3 |
| 2023-12-05 | 3 |
| 2025-05-29 | 3 |
| 2025-07-04 | 3 |
| 2026-06-03 | 3 |
| 2018-01-05 | 2 |
| 2022-06-01 | 2 |
| 2024-01-22 | 2 |
| 2024-03-06 | 2 |
| 2024-06-21 | 2 |
| _… mais 127 valor(es)_ | |

#### CITAÇÃO/PROTOCOLO → `data_citacao`

`data8` · tipo `date` · 260 preenchido(s), 13 vazio(s) · 193 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2025-02-24 | 5 |
| 2026-05-22 | 5 |
| 2024-06-17 | 4 |
| 2025-05-28 | 4 |
| 2025-07-18 | 4 |
| 2025-11-06 | 4 |
| 2026-03-04 | 4 |
| 2026-07-31 | 4 |
| 2023-12-05 | 3 |
| 2024-02-26 | 3 |
| 2025-02-06 | 3 |
| 2025-02-27 | 3 |
| 2025-05-16 | 3 |
| 2025-05-29 | 3 |
| 2025-06-23 | 3 |
| _… mais 178 valor(es)_ | |

#### COMARCA → `comarca`

`status44` · tipo `status` · 257 preenchido(s), 16 vazio(s) · 13 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| TAUBATÉ | 91 |
| JACAREÍ | 89 |
| PINDA | 50 |
| SJC | 11 |
| LAMBARI | 5 |
| JUIZ DE FORA | 3 |
| SANTA ISABEL | 2 |
| CRISTALINA | 1 |
| NAVEGANTES | 1 |
| RN | 1 |
| SÃO PAULO | 1 |
| SOROCABA | 1 |
| VIÇOSA | 1 |

#### CONDENAÇÃO _(não mapeada)_

`n_meros__1` · tipo `numbers` · 10 preenchido(s), 263 vazio(s) · 6 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 3 |
| 35000 | 2 |
| 9000 | 2 |
| 14000 | 1 |
| 200 | 1 |
| 80000 | 1 |

#### CRÉDITO CONSTRUTORA _(não mapeada)_

`formula_mky1btd4` · tipo `formula` · 273 preenchido(s), 0 vazio(s) · 35 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 238 |
| 36175.2 | 2 |
| 10912.5 | 1 |
| 10929.2 | 1 |
| 111887.6 | 1 |
| 13408.9 | 1 |
| 136447.8 | 1 |
| 158120.7 | 1 |
| 22000 | 1 |
| 240652.1 | 1 |
| 24368.1 | 1 |
| 25492.6 | 1 |
| 26391.4 | 1 |
| 33942.2 | 1 |
| 35000 | 1 |
| _… mais 20 valor(es)_ | |

#### CUSTAS MÉDIA _(não mapeada)_

`formula_mky1z0e9` · tipo `formula` · 273 preenchido(s), 0 vazio(s) · 210 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 120 | 14 |
| 300 | 11 |
| 1100 | 6 |
| 100 | 5 |
| 2100 | 4 |
| 760 | 4 |
| 1028.0594 | 3 |
| 1000 | 2 |
| 1200 | 2 |
| 130.36 | 2 |
| 1390 | 2 |
| 1568 | 2 |
| 170 | 2 |
| 1780 | 2 |
| 200 | 2 |
| _… mais 195 valor(es)_ | |

#### DATA _(não mapeada)_

`data6` · tipo `date` · 214 preenchido(s), 59 vazio(s) · 41 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2026-08-05 | 24 |
| 2026-08-10 | 23 |
| 2026-07-30 | 21 |
| 2026-08-07 | 19 |
| 2026-08-06 | 17 |
| 2026-07-29 | 15 |
| 2025-12-09 | 14 |
| 2026-08-14 | 12 |
| 2026-08-17 | 12 |
| 2026-08-11 | 10 |
| 2025-12-10 | 5 |
| 2026-08-12 | 4 |
| 2026-08-28 | 3 |
| 2025-11-19 | 2 |
| 2026-07-10 | 2 |
| _… mais 26 valor(es)_ | |

#### DATA DE FINALIZAÇÃO → `data_finalizacao`

`date_mky1jzs1` · tipo `date` · 113 preenchido(s), 160 vazio(s) · 81 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 2021-09-09 | 3 |
| 2024-04-04 | 3 |
| 2024-09-09 | 3 |
| 2025-07-01 | 3 |
| 2019-10-10 | 2 |
| 2020-08-08 | 2 |
| 2020-09-09 | 2 |
| 2021-05-05 | 2 |
| 2023-03-03 | 2 |
| 2023-05-05 | 2 |
| 2023-07-07 | 2 |
| 2023-10-10 | 2 |
| 2024-05-05 | 2 |
| 2024-06-06 | 2 |
| 2024-11-11 | 2 |
| _… mais 66 valor(es)_ | |

#### DECISÃO _(não mapeada)_

`status9` · tipo `status` · 268 preenchido(s), 5 vazio(s) · 25 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| AGUARDANDO JUDICIARIO / DECISÃO | 106 |
| ACORDO | 49 |
| AGUARDANDO CITAÇÃO | 24 |
| ARQUIVADO | 15 |
| PROCEDENTE | 14 |
| SOBRESTADO | 10 |
| IMPROCEDENTE | 7 |
| AGUARDANDO AUDIÊNCIA | 6 |
| DEFERIDO PARCIALMENTE | 6 |
| ENCERRADO | 5 |
| AG PRAZO RECURSAL | 3 |
| DEFERIDO / ENCERRADO | 3 |
| REDIRECIONAMENTO DE COMPETÊNCIA | 3 |
| DEFERIDO PARCIALMENTE / ENCERRADO | 2 |
| PEDIDO DE PENHORA | 2 |
| _… mais 10 valor(es)_ | |

#### DIAS DO PROCESSO → `dias_processo`

`formula_mky3p68r` · tipo `formula` · 273 preenchido(s), 0 vazio(s) · 102 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| null | 160 |
| 10 | 2 |
| 119 | 2 |
| 138 | 2 |
| 14 | 2 |
| 152 | 2 |
| 205 | 2 |
| 22 | 2 |
| 333 | 2 |
| 42 | 2 |
| 50 | 2 |
| 55 | 2 |
| 76 | 2 |
| -100 | 1 |
| -397 | 1 |
| _… mais 87 valor(es)_ | |

#### Dup. of MOTIVO _(não mapeada)_

`color_mky8x4b1` · tipo `status` · 272 preenchido(s), 1 vazio(s) · 28 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| EXECUÇÃO | 119 |
| RESCISÃO CONTRATUAL | 36 |
| COBRANÇA | 22 |
| ILEGITIMIDADE | 16 |
| VERBAS RESCISÓRIAS | 13 |
| ATRASO NA ENTREGA | 8 |
| CONHECIMENTO | 8 |
| TRIBUTO | 8 |
| RESSARCIMENTO | 6 |
| COBRANÇA ALUGUÉIS | 4 |
| DANOS | 4 |
| BAIXA DE GRAVAME | 3 |
| EMBARGOS A EXECUÇÃO | 3 |
| REVISÃO CONTRATUAL | 3 |
| APRESENTAÇÃO DE DOCUMENTOS | 2 |
| _… mais 13 valor(es)_ | |

#### EMPREENDIMENTO → `empreendimento`

`status__1` · tipo `status` · 272 preenchido(s), 1 vazio(s) · 23 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| SAN MARINO | 50 |
| PADRE EUGÊNIO | 48 |
| COEVO | 42 |
| IPÊ | 34 |
| A6D | 17 |
| FGV | 16 |
| ALENCAR MAZZEO | 15 |
| GILMAR | 10 |
| COEVO E CONELESTE | 6 |
| JS | 5 |
| LEONICE | 5 |
| VSR | 5 |
| CREDENTE | 3 |
| IPÊ 2 | 3 |
| SIETE | 3 |
| _… mais 8 valor(es)_ | |

#### Fórmula _(não mapeada)_

`formula_mky3j4k8` · tipo `formula` · 273 preenchido(s), 0 vazio(s) · 210 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 700 | 14 |
| 7000 | 11 |
| 35000 | 6 |
| 0 | 5 |
| 23100 | 4 |
| 70000 | 4 |
| 32482.079 | 3 |
| 100413.929 | 2 |
| 102200 | 2 |
| 1062.6 | 2 |
| 126099.456 | 2 |
| 137857.937 | 2 |
| 14000 | 2 |
| 142100 | 2 |
| 16872.527 | 2 |
| _… mais 195 valor(es)_ | |

#### HONORÁRIOS EFETIVADOS → `honorarios_efetivados`

`numeric_mky1m9me` · tipo `numbers` · 35 preenchido(s), 238 vazio(s) · 34 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 3617.52 | 2 |
| 1091.25 | 1 |
| 1092.92 | 1 |
| 11188.76 | 1 |
| 1340.89 | 1 |
| 13644.78 | 1 |
| 15812.07 | 1 |
| 2200 | 1 |
| 24065.21 | 1 |
| 2436.81 | 1 |
| 2549.26 | 1 |
| 2639.14 | 1 |
| 3394.22 | 1 |
| 3500 | 1 |
| 3680.21 | 1 |
| _… mais 19 valor(es)_ | |

#### INSTÂNCIA _(não mapeada)_

`status446` · tipo `status` · 256 preenchido(s), 17 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 1º INSTÂNCIA | 233 |
| 2º INSTÂNCIA | 20 |
| STJ | 2 |
| STF | 1 |

#### LOCAL → `atuacao`

`status3` · tipo `status` · 272 preenchido(s), 1 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| INTERNO | 134 |
| EXTERNO MICHELE | 131 |
| EXTERNO GABRIEL | 6 |
| EXTERNO EMANUELLE | 1 |

#### MOTIVO → `motivo`

`status4` · tipo `status` · 273 preenchido(s), 0 vazio(s) · 29 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| EXECUÇÃO | 139 |
| RESCISÃO CONTRATUAL | 36 |
| ILEGITIMIDADE | 16 |
| VERBAS RESCISÓRIAS | 13 |
| ATRASO NA ENTREGA | 8 |
| TRIBUTO | 8 |
| CONHECIMENTO | 7 |
| RESSARCIMENTO | 6 |
| DANOS | 5 |
| COBRANÇA ALUGUÉIS | 4 |
| BAIXA DE GRAVAME | 3 |
| EMBARGOS A EXECUÇÃO | 3 |
| REVISÃO CONTRATUAL | 3 |
| APRESENTAÇÃO DE DOCUMENTOS | 2 |
| COBRANÇA | 2 |
| _… mais 14 valor(es)_ | |

#### NOME DA PARTE / REFERÊNCIA _(não mapeada)_

`texto` · tipo `text` · 272 preenchido(s), 1 vazio(s) · 219 valor(es) distinto(s)

_Valores removidos desta cópia: a coluna contém nomes de partes, e a regra
"sem nome completo" vale para evidência versionada. O runner corrigido não
lista mais valores de coluna de texto livre._

#### ÓRGÃO _(não mapeada)_

`status50` · tipo `status` · 261 preenchido(s), 12 vazio(s) · 7 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| TJ SP | 225 |
| TRT 15 | 20 |
| TJ MG | 9 |
| TRF 3 | 4 |
| TJ GO | 1 |
| TJ PA | 1 |
| TJ SC | 1 |

#### PEDIDO _(não mapeada)_

`dup__of_pedido0__1` · tipo `status` · 93 preenchido(s), 180 vazio(s) · 16 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| EXECUÇÃO | 24 |
| COBRANÇA | 16 |
| RESCISÃO CONTRATUAL E DEVOLUÇÃO DE VALORES | 15 |
| Em andamento | 8 |
| ATRASO NA ENTREGA | 6 |
| VINCULO | 5 |
| INTERVALO INTRAJORNADA / FGTS E DERIVADOS / RESP SOLIDARIA E SUBSIDIARIA | 4 |
| PENSÃO VITALICIA / REFLEXOS / DANOS MORAIS | 3 |
| VERBAS RESCISÓRIAS / CESTA BÁSICA / REVERSÃO DE DEMISSÃO | 3 |
| HORAS EXTRAS /  SALÁRIO POR FORA E REFLEXOS / ADICIONAL DE INSALUBRIDADE / DANO MORAL / RESP SOLIDARIA E SUBSIDIARIA | 2 |
| REINTEGRAÇÃO / DANOS MORAIS / RETIFICAÇÃO | 2 |
| CONDENAÇÃO | 1 |
| INVENTÁRIO | 1 |
| LEILÃO CARRO | 1 |
| NOTA FISCAL | 1 |
| _… mais 1 valor(es)_ | |

#### POSIÇÃO → `posicao`

`status` · tipo `status` · 273 preenchido(s), 0 vazio(s) · 3 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| REQUERENTE | 197 |
| REQUERIDO | 59 |
| RECLAMADA | 17 |

#### RESPONSÁVEL _(não mapeada)_

`person` · tipo `people` · 263 preenchido(s), 10 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| Miguel | 156 |
| Thamar Victória | 75 |
| Thamar Victória, Miguel | 25 |
| Miguel, Thamar Victória | 7 |

#### STATUS _(não mapeada)_

`color_mky1db73` · tipo `status` · 271 preenchido(s), 2 vazio(s) · 5 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| EM ANDAMENTO | 189 |
| FINALIZADO | 56 |
| ACORDO | 20 |
| EXTINTO | 4 |
| SUSPENSO - TRT | 2 |

#### STATUS (para comitê) → `situacao_comite`

`status84__1` · tipo `status` · 271 preenchido(s), 2 vazio(s) · 4 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| EM ANDAMENTO | 168 |
| FINALIZADO | 66 |
| ACORDO | 35 |
| SUSPENSO - TRT | 2 |

#### Subelementos _(não mapeada)_

`subelementos` · tipo `subtasks` · 0 preenchido(s), 273 vazio(s) · 0 valor(es) distinto(s)

_Coluna vazia em todos os itens._

#### TIPO DE AÇÃO → `tipo`

`status8` · tipo `status` · 262 preenchido(s), 11 vazio(s) · 25 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| EXECUÇÃO CIVIL | 122 |
| RESCISÃO CONTRATUAL | 33 |
| COBRANÇA | 28 |
| TRABALHO | 20 |
| CÍVEL | 8 |
| AGRAVO DE INSTRUMENTO | 7 |
| ATRASO NA ENTREGA | 7 |
| CÁLCULO ITBI | 4 |
| EMBARGOS A EXECUÇÃO | 4 |
| RESSARCIMENTO | 4 |
| APRESENTAÇÃO DE DOCUMENTOS | 3 |
| REVISÃO CONTRATUAL | 3 |
| DESPEJO | 2 |
| HIPOTECA | 2 |
| INVENTÁRIO | 2 |
| OBRIGAÇÃO DE FAZER | 2 |
| REPETIÇÃO INDÉBITO | 2 |
| RESPONSABILIDADE CIVIL | 2 |
| APROPRIAÇÃO INDEBITA | 1 |
| DANOS MORAIS | 1 |
| FISCAL | 1 |
| ISENÇÃO ITBI | 1 |
| NEGATIVAÇÃO | 1 |
| PROVA PERICIAL | 1 |
| VERIFICAÇÃO | 1 |

#### UNIDADE → `unidade`

`texto7` · tipo `text` · 226 preenchido(s), 47 vazio(s) · 149 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 27 |
| 28 | 4 |
| 1009 A | 3 |
| 12 | 3 |
| 53 | 3 |
| 99 | 3 |
| 002 A | 2 |
| 002 C | 2 |
| 006 B | 2 |
| 007 B | 2 |
| 1008 B | 2 |
| 101 | 2 |
| 102 A | 2 |
| 102 B | 2 |
| 103 A | 2 |
| _… mais 134 valor(es)_ | |

#### VALOR DA CAUSA → `valor_causa`

`n_meros46` · tipo `numbers` · 268 preenchido(s), 5 vazio(s) · 209 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 1000 | 14 |
| 10000 | 11 |
| 50000 | 6 |
| 100000 | 4 |
| 33000 | 4 |
| 46402.97 | 3 |
| 11921.06 | 2 |
| 12229.58 | 2 |
| 13000 | 2 |
| 143448.47 | 2 |
| 146000 | 2 |
| 1518 | 2 |
| 180142.08 | 2 |
| 196939.91 | 2 |
| 20000 | 2 |
| _… mais 194 valor(es)_ | |

#### VALOR PAGO _(não mapeada)_

`dup__of_condena__o__1` · tipo `numbers` · 8 preenchido(s), 265 vazio(s) · 5 valor(es) distinto(s)

| Valor | Ocorrências |
| --- | --- |
| 0 | 3 |
| 5700 | 2 |
| 200 | 1 |
| 3000 | 1 |
| 40000 | 1 |

> **Coluna MEU TRABALHO não encontrada.** A classificação de
> judicialização depende dela; sem a coluna, todos os processos
> ficam em revisão necessária.

## Segunda execução

### Resultado

| Métrica | Valor |
| --- | --- |
| Identificador da execução | `b677601f-7a60-48f0-a285-0d79efe9d015` |
| Quadro | Processos Judiciais — board `5959705266` |
| Início | 2026-08-05T01:58:34.120Z |
| Conclusão | 2026-08-05T01:58:39.374Z |
| Duração | 5.25 s |
| **Quantidade recebida** (lidos da origem) | **273** |
| **Páginas consultadas** | **2** |
| **Último cursor** | `null` — leitura chegou ao fim |
| **Quantidade normalizada** | **250** |
| **Incluída** | **0** |
| **Atualizada** (conteúdo mudou) | **0** |
| **Inalterada** (reconhecida, nada a mudar) | **250** |
| **Ignorada** | **23** |
| **Duplicada** | **0** |
| **Com erro** | **0** |
| **Data de referência** | 2026-08-17 |
| **Último dado válido (antes desta execução)** | 2026-08-05T01:58:34.016Z |
| Status | sucesso |
| Contabilidade fecha | sim |

**Ignorados, por motivo** — nenhum descarte é silencioso:

| Motivo | Quantidade |
| --- | --- |
| grupo excluido do comite: CJ (REGRESSO) | 1 |
| grupo excluido do comite: TETUS LOCAÇÃO | 2 |
| grupo excluido do comite: CREDENTE | 3 |
| grupo excluido do comite: LEONICE | 5 |
| grupo excluido do comite: GILMAR | 10 |
| grupo excluido do comite: DANILO | 1 |
| grupo excluido do comite: FGLASS/GRADFIBRA | 1 |

**Estado da tabela após a execução:**

| Item | Valor |
| --- | --- |
| Registros com `fonte = 'monday'` | 250 |
| Vivos / marcados ausentes | 250 / 0 |
| `id_origem` distintos | 250 |
| Maior versão | 1 |
| Registros com versão > 1 | 0 |
| Entradas de histórico acumuladas | 0 |
| Sem `fonte` correta / sem `id_origem` | 0 / 0 |

## Provas da segunda execução

| # | Prova | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | Ausência de duplicação | ✅ | 250 → 250 registros; 250 `id_origem` distintos |
| 2 | Upsert idempotente | ✅ | 2ª execução: 0 incluídos, 0 atualizados, 250 inalterados sobre 273 lidos |
| 3 | Preservação de `fonte` e `id_origem` | ✅ | 0 sem fonte correta, 0 sem `id_origem` |
| 4 | Registros inalterados não geram versões indevidas | ✅ | histórico 0 → 0; versão máxima 1 → 1 |
| 5 | Registros alterados são atualizados corretamente | ✅ | situação alterada no banco e devolvida pela origem (`null`); versão 1 → 3; 1 atualizado(s) |
| 6 | Falha posterior não apaga o último dado válido | ✅ | após falha: 250 vivos (era 250); `ultima_carga_valida_em` não avançou; status `erro` |
| 7 | Mutation e subscription continuam bloqueadas | ✅ | 4 tentativas de escrita recusadas; consulta de leitura aceita |

## Amostra anonimizada

Sem CPF, CNPJ ou nome completo. Número do processo reduzido aos quatro
últimos dígitos, valor da causa substituído, `id_origem` reduzido, e os
campos de texto livre passam por uma varredura de documento — `MOTIVO` é
digitado à mão e pode conter um CPF que ninguém previu.

```json
[
  {
    "id_origem": "***6533",
    "numero": "**********0292",
    "ano": null,
    "tipo": "ISENÇÃO ITBI",
    "motivo": "TRIBUTO",
    "posicao": "REQUERENTE",
    "situacao": null,
    "situacao_comite": "EM ANDAMENTO",
    "atuacao": "INTERNO",
    "interno": true,
    "comarca": "JACAREÍ",
    "valor_causa": "***",
    "data_citacao": "2025-06-11",
    "judicializado": false,
    "revisao_necessaria": true,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": "2025-06-11",
    "extraido_em": "2026-08-05T01:58:44.551Z"
  },
  {
    "id_origem": "***3072",
    "numero": "**********0292",
    "ano": null,
    "tipo": "CÁLCULO ITBI",
    "motivo": "TRIBUTO",
    "posicao": "REQUERENTE",
    "situacao": null,
    "situacao_comite": "EM ANDAMENTO",
    "atuacao": "INTERNO",
    "interno": true,
    "comarca": "JACAREÍ",
    "valor_causa": "***",
    "data_citacao": "2025-06-12",
    "judicializado": false,
    "revisao_necessaria": true,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": "2025-06-12",
    "extraido_em": "2026-08-05T01:58:44.552Z"
  },
  {
    "id_origem": "***4502",
    "numero": "**********0100",
    "ano": null,
    "tipo": "EXECUÇÃO CIVIL",
    "motivo": "BAIXA DE GRAVAME",
    "posicao": "REQUERENTE",
    "situacao": null,
    "situacao_comite": "FINALIZADO",
    "atuacao": "INTERNO",
    "interno": true,
    "comarca": "SÃO PAULO",
    "valor_causa": "***",
    "data_citacao": "2023-05-18",
    "judicializado": false,
    "revisao_necessaria": true,
    "fonte": "monday",
    "versao": 3,
    "data_referencia": "2023-05-18",
    "extraido_em": "2026-08-05T01:58:44.548Z"
  }
]
```

_Varredura da amostra publicada: nenhum CPF ou CNPJ presente._

## Inconsistências encontradas

| Tipo | Gravidade | Ocorrências | Descrição |
| --- | --- | --- | --- |
| falha_importacao | alta | 1 | Falha ao sincronizar (JUR) PROCESSOS JUDICIAIS: Quadro 1 nao encontrado ou sem acesso.. O ultimo dado valido foi preservado. |

---

**As sete provas passaram.** A homologação do quadro de Processos Judiciais está pronta para aprovação.
