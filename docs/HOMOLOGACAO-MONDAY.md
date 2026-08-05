# Homologação controlada do Monday — Processos Judiciais

**Quadro autorizado:** `(JUR) PROCESSOS JUDICIAIS` — board **5959705266**
**Demais quadros:** desligados até a aprovação desta homologação.
**Sienge:** desligado. Checklist em `docs/SIENGE-INFORMACOES-NECESSARIAS.md`.

---

## 1. Estado desta entrega

| Item | Situação |
| --- | --- |
| Instrumentação das 14 métricas exigidas | **pronta** |
| Runner das duas execuções consecutivas | **pronto** (`scripts/homologar-monday.ts`) |
| Mapa de colunas Monday → Patrono | **pronto** (seção 4) |
| As sete provas, contra PostgreSQL real | **19 testes passando** |
| Bloqueio de `mutation` e `subscription` | **provado** |
| **As duas execuções contra o board real** | **BLOQUEADO — falta `MONDAY_TOKEN`** |

**O que falta, e por quê.** O `MONDAY_TOKEN` não está no ambiente e não deve ser
enviado por mensagem. Sem ele não é possível ler o board 5959705266, e portanto
não é possível preencher as métricas com números reais. Preencher com números
de um dublê e apresentá-los como homologação seria exatamente o que a regra
"nenhum dado demonstrativo apresentado como real" proíbe.

Tudo o que não depende do token está feito e provado. Assim que a variável
existir no ambiente, **um comando** produz o relatório completo:

```bash
MONDAY_TOKEN=<token> \
DATABASE_URL=<url> \
npx tsx scripts/homologar-monday.ts --saida docs/evidencias/homologacao-monday.md
```

O script recusa rodar se o quadro configurado não for o 5959705266, e recusa
rodar sem token — com a mensagem dizendo exatamente o que falta.

---

## 2. O que o runner produz

### Primeira execução — as métricas exigidas

| Métrica | Origem |
| --- | --- |
| Quantidade recebida | `execucoes_importacao.lidos` |
| Páginas consultadas | `paginas` — novo |
| Quantidade normalizada | `normalizados` — novo |
| Incluída | `incluidos` |
| Atualizada | `atualizados` — passou a contar só o que **mudou** |
| Inalterada | `inalterados` — novo, ver seção 6 |
| Ignorada | `ignorados`, **com o motivo de cada uma** |
| Duplicada | `duplicados` |
| Com erro | `com_erro` |
| Duração | `duracao_ms` |
| Início e conclusão | `iniciada_em` / `finalizada_em` |
| Último cursor | `ultimo_cursor` — novo; `null` significa "leu até o fim" |
| Data de referência | `data_referencia` — novo; a mais recente do conjunto |
| Último dado válido | `ultimo_dado_valido_em` — novo; o carimbo **anterior** a esta execução |

A contabilidade é conferida ao fechar a execução:

```
lidos = incluídos + atualizados + inalterados + ignorados + duplicados + com_erro
```

Divergência é registrada como erro no log — é o tipo de falha que faz um painel
mentir sem alarme.

### Segunda execução — as sete provas

| # | Prova | Como é verificada |
| --- | --- | --- |
| 1 | Ausência de duplicação | total de registros e `id_origem` distintos não mudam |
| 2 | Upsert idempotente | 2ª execução: `incluidos = 0` e `atualizados = 0` sobre o mesmo `lidos` |
| 3 | `fonte` e `id_origem` preservados | nenhum registro sem fonte `monday` ou sem `id_origem` |
| 4 | Inalterados não geram versão indevida | `max(versao)` e soma do histórico **idênticos** antes e depois |
| 5 | Alterados são atualizados | campo divergente volta ao valor da origem, versão sobe 1, histórico ganha 1 entrada |
| 6 | Falha não apaga o último dado válido | após falha simulada: mesmos vivos, `ultima_carga_valida_em` **não avança**, status `erro` |
| 7 | `mutation`/`subscription` bloqueadas | 5 tentativas recusadas; leitura legítima aceita; nenhuma consulta enviada contém `mutation` |

---

## 3. Confirmação: nenhum dado é alterado no Monday

Três camadas, e a mais importante é a primeira:

1. **A trava vive no transporte.** `recusarEscrita` foi movida da rota do proxy
   para `cliente.ts`, e roda dentro de `consultar()` — a única função que fala
   com a API. Qualquer caminho que chegue ao Monday passa por ali, inclusive
   código interno futuro que não use a rota do proxy.
2. **A rota do proxy também recusa**, antes de repassar.
3. **Nenhuma consulta do pipeline contém escrita**: o sync usa três consultas —
   `me`, `boards { columns }` e `boards { items_page }`. Todas `query`.

O parser remove comentários e literais de texto antes de procurar as palavras,
para que `query { items(rule: "mutation") }` não seja recusado por engano — e
esse caso tem teste.

**Consequência:** o token pode ter permissão de escrita na conta do Monday; a
plataforma não a usa, e não consegue usar.

---

## 4. Mapa de colunas — Monday → Patrono

As colunas são resolvidas por **TÍTULO**, não por id. Ids mudam quando alguém
recria a coluna no Monday; o título é o que a equipe reconhece e mantém. Quando
há mais de um título aceito, o primeiro encontrado vence.

| Campo no Patrono | Coluna no Monday (títulos aceitos) | Coluna no banco | Observação |
| --- | --- | --- | --- |
| `situacao` | **MEU TRABALHO** | `processos_judiciais.situacao` | **Não** vem de STATUS (PARA COMITÊ) |
| `situacao_comite` | STATUS (PARA COMITÊ) · STATUS PARA COMITÊ · STATUS COMITÊ | `situacao_comite` | preservado para conferência |
| `tipo` | TIPO DE AÇÃO · TIPO DE ACAO · NATUREZA | `tipo` | natureza da ação |
| `atuacao` | LOCAL · ATUAÇÃO · ATUACAO | `atuacao` + `interno` | **não é comarca** — ver abaixo |
| `comarca` | COMARCA | `comarca` | só se existir coluna própria; hoje não existe |
| `empreendimento` | EMPREENDIMENTO · OBRA · PROJETO | `empreendimento_id` | resolvido por nome normalizado |
| `cliente` | CLIENTE · NOME DO CLIENTE · NOME | — | usado para inconsistência de documento |
| `cpf_cnpj` | CPF/CNPJ · CPF-CNPJ · CPF · CNPJ · DOCUMENTO | — | validado por dígito verificador |
| `contrato` | CONTRATO · NÚMERO DO CONTRATO | — | normalizado |
| `unidade` | UNIDADE · APARTAMENTO · LOTE | — | |
| `numero` | NÚMERO DO PROCESSO · PROCESSO · Nº PROCESSO | `numero` | cai para `item.name` se ausente |
| `valor_causa` | VALOR DA CAUSA · VALOR CAUSA | `valor_causa` | `numeric(18,2)` |
| `data_citacao` | CITAÇÃO/PROTOCOLO · CITAÇÃO · PROTOCOLO | `data_citacao` | também vira `data_referencia` e `data_fato` |
| `data_finalizacao` | DATA DE FINALIZAÇÃO · FINALIZAÇÃO | `data_finalizacao` | |
| `honorarios_efetivados` | HONORÁRIOS EFETIVADOS | `honorarios_efetivados` | |
| `motivo` | MOTIVO · OBJETO | `motivo` | |
| `posicao` | POSIÇÃO · POSICAO · POLO | `posicao` | Réu / Autor / Terceiro |
| — | título do grupo | `competencia_ref` | competência vem do **grupo**, não de coluna de data |
| — | derivado de `situacao` | `judicializado`, `revisao_necessaria` | ver seção 5 |

### Campos que não são o que parecem

**`LOCAL` é ATUAÇÃO, não comarca.** A coluna contém `INTERNO` ou
`EXTERNO <nome do escritório>`. Reaproveitá-la como comarca produziria um
indicador geográfico inteiramente falso. Ela alimenta `atuacao` e o booleano
`interno`; `comarca` fica **nulo** enquanto não houver coluna própria mapeada.

**Campo ausente vira nulo, nunca valor presumido.** Se um título não for
encontrado no quadro, o log avisa e a coluna fica nula. O item original inteiro
continua em `valor_original` — nada do que chegou é descartado.

### Grupos excluídos do comitê

`CJ (REGRESSO)`, `TETUS LOCAÇÃO`, `CREDENTE`, `LEONICE` e demais listados em
`PROCESSOS_GRUPOS_EXCLUIDOS`. Cada item descartado é contado como **ignorado
com motivo** — nenhum descarte é silencioso.

---

## 5. Classificação de judicialização

Regra conservadora, por decisão de produto: **o que não se reconhece não é
presumido.**

| Situação | Resultado |
| --- | --- |
| casa com termo judicial (`ajuizad`, `processo judicial`, `citac`, …) | `judicializado = true` |
| casa com termo não-judicial (`enviar para advogado`, `encaminh`, …) | `judicializado = false`, sem revisão |
| **não casa com nada** | `judicializado = false`, **`revisao_necessaria = true`** |
| vazio | `judicializado = false`, `revisao_necessaria = true` |

**"extrajudicial" contém "judicial".** Sem neutralizar, toda cobrança
extrajudicial entraria na taxa de judicialização. O texto é preparado trocando
`extrajudicial` por `extraj` antes de classificar — e há teste para isso.

**Limitação a confirmar na homologação:** as listas de termos foram derivadas
das regras de classificação do projeto, não dos rótulos reais do board. A
primeira execução vai mostrar quantos processos caem em `revisao_necessaria`;
se esse número for alto, os rótulos reais precisam ser conferidos e as listas
ajustadas — com aprovação, não por inferência.

---

## 6. Duas correções que a preparação da homologação encontrou

As duas apareceram ao escrever a prova 4, e as duas afetariam qualquer carga
recorrente.

### `versao` e histórico inflavam a cada sincronização

`extraido_em`, `execucao_id` e `versao_regra` mudam a cada carga. O gatilho da
trilha os via como alteração e, a cada sincronização, incrementava `versao` de
**todo** registro lido e anexava uma entrada de histórico dizendo apenas que a
hora de extração mudou.

Depois de trinta dias de carga diária, todo registro estaria na versão 31 com
trinta entradas de histórico sem informação nenhuma. Pior: o controle otimista
de concorrência da interface passaria a recusar edições legítimas — a versão
teria avançado durante a noite, sem ninguém ter editado nada.

**Correção (migração 017):** `versao` e `historico` descrevem o **conteúdo**.
Metadado de carga não conta como alteração. `valor_original` continua contando:
se o payload da origem mudou, o registro de origem mudou de fato.

### `atualizados` contava releitura como atualização

O contador registrava toda linha que passasse pelo caminho de conflito do
upsert — ou seja, o conjunto inteiro a cada re-sincronização. O relatório diria
"31 atualizados" todo dia, mesmo sem nada ter mudado.

**Correção:** `atualizados` conta o que mudou de fato; **`inalterados`** conta o
que foi reconhecido e não precisou de alteração. A distinção é a evidência
direta da prova 4, e a contabilidade continua fechando.

---

## 7. Amostra anonimizada

O runner emite a amostra automaticamente. Formato, com dados do dublê de teste:

```json
[
  {
    "id_origem": "***9001",
    "numero": "**********0100",
    "ano": null,
    "tipo": "Cível",
    "motivo": "Rescisão contratual",
    "posicao": "Réu",
    "situacao": "EM ANDAMENTO",
    "situacao_comite": "ACOMPANHANDO",
    "atuacao": "EXTERNO Dra. Ana",
    "interno": false,
    "comarca": null,
    "valor_causa": "***",
    "data_citacao": "2024-03-10",
    "judicializado": false,
    "revisao_necessaria": true,
    "fonte": "monday",
    "versao": 1,
    "data_referencia": "2024-03-10"
  }
]
```

> Os valores acima vêm do **dublê de teste**, não do board real. A amostra com
> dados reais só existe depois da execução com token.

Mascaramento: número do processo reduzido aos 4 últimos dígitos, valor da causa
substituído, `id_origem` reduzido. **Nome de cliente não aparece** — o quadro de
processos não tem coluna de cliente mapeada no destino, e o que não é mapeado
não é inventado.

---

## 8. Limitações

1. **As duas execuções reais não foram feitas** — falta `MONDAY_TOKEN`.
2. **Os rótulos reais de `MEU TRABALHO` não são conhecidos.** As listas de
   classificação vieram das regras do projeto. A primeira execução mostrará
   quantos caem em revisão; ajuste só com aprovação.
3. **`comarca` fica nulo.** Não há coluna de comarca no quadro. Qualquer
   indicador geográfico de processos está indisponível, e isso é melhor do que
   preenchê-lo com a atuação.
4. **Teto de 200 páginas** na leitura. Acima disso a carga é marcada
   **truncada**, o cursor é preservado, e **nenhum registro é marcado ausente** —
   marcar ausência com base em leitura incompleta apagaria da tela o que apenas
   não foi lido.
5. **Sem cliente e sem CPF/CNPJ no destino de processos.** As colunas existem no
   mapa e são lidas para gerar inconsistência de documento inválido, mas
   `processos_judiciais` não tem `cliente_nome`. O vínculo com cliente depende
   do motor de relacionamento.
6. **O dublê de teste não prova o formato real da resposta do board.** Ele
   reproduz o formato documentado da API do Monday; divergências do board real
   só aparecem na execução com token.

---

## 9. Ordem seguinte, após aprovação

1. demais quadros do Monday, **um por vez**;
2. validação dos endpoints do Sienge;
3. primeira carga controlada do Sienge;
4. cruzamento Monday × Sienge;
5. indicadores com dados reais;
6. Comitê Estratégico;
7. Modo Diretoria;
8. relatórios e apresentações mensais.

Nenhum quadro adicional é ligado antes da aprovação de Processos Judiciais.
