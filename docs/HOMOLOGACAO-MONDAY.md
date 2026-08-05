# Homologação controlada do Monday — Processos Judiciais

**Quadro autorizado:** `(JUR) PROCESSOS JUDICIAIS` — board **5959705266**
**Demais quadros:** desligados até a aprovação desta homologação.
**Sienge:** desligado. Checklist em `docs/SIENGE-INFORMACOES-NECESSARIAS.md`.

---

## 1. Estado desta entrega

**Execução real: 2026-08-05, contra o board `5959705266` da conta
Coevoconstrutora.** A rede foi liberada, o token autenticou, e as duas
execuções consecutivas rodaram até o fim. **Relatório completo, com os números
reais, em `docs/evidencias/homologacao-monday.md`.**

| Item | Situação |
| --- | --- |
| Conectividade com `api.monday.com` | ✅ **liberada** — `HTTP 200` no endpoint oficial |
| **Pré-confirmação dos 4 itens** | ✅ **os 4 passaram** antes de qualquer leitura (seção 2) |
| Credencial autenticada (`query { me }`) | ✅ conta Coevoconstrutora |
| **Primeira execução** — 14 métricas | ✅ **273 lidos, 250 incluídos, 23 ignorados com motivo, 0 erros** |
| **Segunda execução** — 7 provas | ✅ **7 de 7** — idempotência provada sobre o board real |
| Rótulos reais do board | ✅ **levantados** — 31 colunas, todos os valores distintos |
| Cobertura das regras de judicialização | ⚠️ decisão tomada (premissa de escopo); política **proposta**, aguardando aprovação — seção 5 e `docs/REGRA-JUDICIALIZACAO.md` |
| Propostas de regra | ✅ emitidas — **nenhuma aplicada**, aguardando aprovação |
| Amostra anonimizada com dados reais | ✅ emitida; varredura final: **nenhum CPF/CNPJ presente** |
| Suíte contra PostgreSQL real | **336 testes passando**, dos quais **39** de Monday |
| Ensaio ponta a ponta do runner | **7 de 7 provas** (`scripts/ensaiar-homologacao.ts`) |

### Resumo da primeira execução (dados reais)

| Métrica | Valor |
| --- | --- |
| Quantidade recebida (lidos da origem) | 273 |
| Páginas consultadas | 2 |
| Último cursor | `null` — leitura chegou ao fim |
| Quantidade normalizada | 250 |
| Incluída | 250 |
| Atualizada / Inalterada | 0 / 0 (primeira carga) |
| Ignorada | 23 — todas por grupo excluído do comitê, com motivo |
| Duplicada / Com erro | 0 / 0 |
| Duração | 5,6 s |
| Contabilidade fecha | sim |

Na segunda execução, os mesmos 273 lidos saem como **0 incluídos,
0 atualizados, 250 inalterados** — a prova direta de que rodar de novo não
duplica nem reescreve. As sete provas, com evidência por prova, estão no
relatório.

**Nota de leitura do relatório:** a inconsistência `falha_importacao` que
aparece ao final é a **falha simulada da prova 6** (sincronização apontada de
propósito para um quadro inexistente, para provar que o último dado válido
sobrevive). Não é falha da carga real — as duas execuções reais terminaram com
status `sucesso`.

### O defeito que só a execução real revelou

O título real da coluna de situação no board é **`'MEU TRABALHO'` — com os
apóstrofos digitados dentro do título**. A resolução por comparação exata não a
encontrava: `situacao` ficou nula nos 250 registros na primeira rodada, e 100%
dos processos caíram em `revisao_necessaria` sem nenhum erro aparente. O ensaio
nunca pegaria isso — o dublê usava o título sem aspas, como toda a documentação.

Correção em `montarMapaColunas`/`resolverColuna`: aspas em volta do título são
tratadas como decoração de quem digitou, não como identidade da coluna — e
título exato continua vencendo o que só casa depois de remover aspas. O mesmo
defeito escondia `STATUS (para comitê)` (caixa mista) da lista de colunas de
classificação do relatório. Oito testes novos fixam o caso
(`test/monday-titulo-coluna.test.ts`), e a homologação foi **reexecutada do
zero** — banco recriado — após a correção. O relatório da primeira rodada, com
o defeito visível, está preservado em
`docs/evidencias/homologacao-monday-antes-da-correcao.md`.

### O bloqueio de rede anterior

A tentativa de 2026-08-05T01:45Z (mesma data, horas antes) encontrou a política
de egresso recusando `api.monday.com:443` com `403` no `CONNECT` — evidência em
`docs/evidencias/bloqueio-rede-monday.txt`, mantida como histórico. A liberação
do host resolveu, como previsto: **nenhuma alteração de código foi necessária
para a rede**.

Para repetir a homologação:

```bash
MONDAY_TOKEN=<token> \
DATABASE_URL=<url> \
npx tsx scripts/homologar-monday.ts --saida docs/evidencias/homologacao-monday.md
```

O script recusa rodar se o quadro configurado não for o 5959705266, recusa rodar
sem token, e **interrompe antes de qualquer leitura** se a pré-confirmação
falhar.

**Nota sobre o ambiente:** o processo herda as variáveis no momento em que sobe.
Uma variável configurada depois só será vista por uma **sessão nova** —
reiniciar o backend não basta se o processo do agente continuar o mesmo. Valeu
para o token e valeu para a liberação da rede.

### Ensaio do runner — o que ele prova e o que não prova

`scripts/ensaiar-homologacao.ts` sobe um servidor local que responde no formato
da API do Monday, e roda o runner **inteiro** contra ele: pré-confirmação,
duas execuções, rótulos, propostas, provas e amostra.

Prova que o relatório sai íntegro e que as sete provas passam sobre PostgreSQL
real. **Não prova** nada sobre o board da Coevo. O relatório de ensaio nasce com
um aviso em destaque dizendo que os dados são simulados — sem ele, em duas
semanas alguém chamaria aquilo de "o relatório da homologação".

O dublê só conhece o board 5959705266: qualquer outro id recebe erro. Isso
tornou o ensaio fiel em dois pontos — prova que a sincronização aponta para o
quadro certo, e permite exercitar de verdade a prova 6, que simula falha da
origem apontando para um quadro inexistente.

A execução real confirmou o limite do ensaio: o defeito do título com
apóstrofos (seção 1) passou ileso pelo dublê, porque o dublê usava o título
como a documentação o descrevia — sem aspas. O que só o dado real tem é
exatamente o que o ensaio não consegue prever.

---

## 2. Pré-confirmação — os quatro itens

Verificados **antes** de qualquer leitura. Falha em um só interrompe: a carga
não começa. Uma verificação que acontece depois da carga não é verificação, é
constatação.

| Item | Como é verificado |
| --- | --- |
| `token_configurado: true` | presença de `MONDAY_TOKEN`; o valor nunca é exibido |
| integração em modo somente leitura | três consultas de escrita submetidas à trava; uma de leitura confirmada como aceita |
| quadro configurado = 5959705266 | comparação com a constante do runner |
| nenhuma `mutation` ou `subscription` no pipeline | cada consulta do cliente é submetida à **própria trava** |

O quarto item merece nota: ele não usa um regex paralelo, submete as consultas
reais do pipeline à mesma função que protege o transporte. Uma segunda
implementação da regra poderia divergir da primeira, e a divergência passaria
despercebida justamente aqui, onde importa.

Só depois dos quatro a credencial é exercitada, com `query { me }`.

### Resultado real — 2026-08-05T02:05Z

Os quatro itens são **locais**: presença da variável, comportamento da trava, id
do quadro e as consultas do próprio pipeline. Os quatro passaram, e desta vez a
execução **seguiu adiante**: a credencial foi exercitada com `query { me }`,
autenticou na conta Coevoconstrutora, e as duas execuções rodaram.

| Item | Resultado |
| --- | --- |
| `token_configurado: true` | ✅ MONDAY_TOKEN presente no ambiente (valor nunca exibido) |
| integração em modo somente leitura | ✅ trava no transporte (`consultar`), antes de qualquer requisição |
| quadro configurado = 5959705266 | ✅ (JUR) PROCESSOS JUDICIAIS — `5959705266` |
| nenhuma `mutation` ou `subscription` no pipeline | ✅ 4 consultas do pipeline, todas aceitas pela trava |
| credencial autenticada | ✅ conta Coevoconstrutora |

Relatório da pré-confirmação isolada em
`docs/evidencias/preconfirmacao-monday.md`, gerado por:

```bash
npx tsx scripts/homologar-monday.ts --pre-confirmacao \
  --saida docs/evidencias/preconfirmacao-monday.md
```

**Sobre `--pre-confirmacao`.** A opção roda os quatro itens e para **antes de
qualquer tráfego de rede**. Ela separa dois diagnósticos que a falha de rede
confunde com facilidade: "a pré-confirmação não passou" e "a pré-confirmação
passou, mas não foi possível chegar ao Monday". Ela **não** substitui a
homologação: não lê, não grava e não emite prova nenhuma.

---

## 2b. O que o runner produz

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

A comparação ignora caixa, espaços nas pontas e **aspas em volta do título** —
o board real tem a coluna `'MEU TRABALHO'` com apóstrofos digitados no título,
e a comparação exata não a encontrava (seção 1). Título exato continua vencendo
o que só casa depois de remover aspas.

**Conferido contra o board real (2026-08-05):** das colunas do mapa, o quadro
tem `situacao`, `situacao_comite`, `tipo`, `atuacao`, `comarca`,
`empreendimento`, `unidade`, `valor_causa`, `data_citacao`, `data_finalizacao`,
`honorarios_efetivados`, `motivo` e `posicao`. **Não existem no quadro:**
`cliente`, `cpf_cnpj`, `contrato` e `numero` — gravados como nulos, nunca
presumidos (`numero` cai para o nome do item, e por isso vem preenchido).

| Campo no Patrono | Coluna no Monday (títulos aceitos) | Coluna no banco | Observação |
| --- | --- | --- | --- |
| `situacao` | **MEU TRABALHO** | `processos_judiciais.situacao` | **Não** vem de STATUS (PARA COMITÊ) |
| `situacao_comite` | STATUS (PARA COMITÊ) · STATUS PARA COMITÊ · STATUS COMITÊ | `situacao_comite` | preservado para conferência |
| `tipo` | TIPO DE AÇÃO · TIPO DE ACAO · NATUREZA | `tipo` | natureza da ação |
| `atuacao` | LOCAL · ATUAÇÃO · ATUACAO | `atuacao` + `interno` | **não é comarca** — ver abaixo |
| `comarca` | COMARCA | `comarca` | **existe no board real** — 13 valores distintos, 257 preenchidos |
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
`EXTERNO <nome do escritório>` — confirmado no board real: `INTERNO` (134),
`EXTERNO MICHELE` (131), `EXTERNO GABRIEL` (6), `EXTERNO EMANUELLE` (1).
Reaproveitá-la como comarca produziria um indicador geográfico inteiramente
falso. Ela alimenta `atuacao` e o booleano `interno`. A execução real mostrou
que o quadro **tem** coluna `COMARCA` própria (TAUBATÉ, JACAREÍ, PINDA, SJC…),
e ela alimenta `comarca` — 244 dos 250 registros vieram preenchidos.

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

**Limitação confirmada pela execução real — e é o principal item aberto:** os
rótulos reais de `'MEU TRABALHO'` são seis, e **nenhum casa com as listas
atuais**. Resultado: os **250 processos** estão gravados com
`judicializado = false` e `revisao_necessaria = true`. A taxa de judicialização
fica **indisponível** até a equipe do jurídico aprovar as regras.

| Rótulo real | Registros | Proposta emitida |
| --- | --- | --- |
| ACOMPANHANDO | 150 | indefinida — a equipe precisa dizer o que significa |
| FINALIZADO | 69 | `finalizad` → `TERMOS_NAO_JUDICIAL`, se confirmado |
| ACORDO | 47 | `acordo` → `TERMOS_NAO_JUDICIAL`, se confirmado |
| BAIXA DEFINITIVA | 3 | `baixa` → `TERMOS_NAO_JUDICIAL`, se confirmado |
| RECOMPRA/ACORDO | 3 | `acordo` → `TERMOS_NAO_JUDICIAL`, se confirmado |
| ARQUIVADO PROVISORIAMENTE | 1 | `arquivad` → `TERMOS_NAO_JUDICIAL`, se confirmado |

Nenhuma proposta foi aplicada. Duas observações para a decisão: (1) o rótulo
mais frequente, `ACOMPANHANDO`, não diz por si só se o processo está
judicializado — todos os 250 itens são do quadro de **processos judiciais**, e
talvez a resposta certa seja outra coluna (`DECISÃO` tem `AGUARDANDO
JUDICIARIO / DECISÃO`, `AGUARDANDO CITAÇÃO`…) ou a premissa de que tudo neste
quadro é judicializado; (2) essa é exatamente a decisão que muda indicador de
comitê, e por isso fica com quem conhece o fluxo, não com a heurística.

> **Atualização (05/08/2026):** a decisão foi tomada. Hoje o Monday é a fonte
> oficial e **estar no quadro Processos Judiciais é o próprio critério**
> (premissa de escopo) — com a regra configurável por fonte e vigência, para o
> Sienge assumir no futuro sem reescrita. A política está cadastrada como
> **proposta**, pendente de aprovação formal; até lá os 250 registros seguem em
> `revisao_necessaria`. Ver `docs/REGRA-JUDICIALIZACAO.md` e o registro B16.4
> em `DECISOES.md`. A tabela acima permanece como evidência do levantamento.

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

## 6b. Rótulos reais e cobertura das regras

O runner levanta os valores distintos de **todas** as colunas, a partir de
`registros_brutos` — o payload original. Não do dado já interpretado: levantar
rótulo do que a transformação deixou passar mostraria apenas o que já se sabe.

Isso cobre, sem precisar prever: situação (`MEU TRABALHO`), estágio, status
(`STATUS (PARA COMITÊ)`), grupo, **responsável** e qualquer coluna que a equipe
tenha criado e ninguém tenha mapeado. Colunas espelho e fórmula são lidas por
`display_value` — pelo `text` elas apareceriam vazias.

### O que acontece com rótulo não coberto

Nada é alterado automaticamente. O registro é gravado com
`judicializado = false` e `revisao_necessaria = true`, e o relatório traz:

- a **quantidade de registros** afetados por cada rótulo — não a de rótulos;
- até 5 **`id_origem`** de exemplo, para localizar os casos;
- uma **proposta de regra**, com a lista sugerida e a justificativa.

A proposta é texto para decisão humana. As palavras que a orientam
(`INDICIOS_JUDICIAL`, `INDICIOS_NAO_JUDICIAL`) **não classificam nada** — servem
só para montar a sugestão. Rótulo com indícios dos dois lados sai como
`indefinida`, com a ambiguidade declarada; rótulo sem nenhum termo reconhecível
sai pedindo que a equipe explique o que ele significa.

Alterar a metodologia muda a taxa de judicialização, que é indicador de comitê.
Isso depende de aprovação, nunca de inferência.

---

## 7. Amostra anonimizada

O runner emitiu a amostra com **dados reais do board**, já mascarados. A
varredura final sobre a amostra publicada não encontrou CPF nem CNPJ. Um dos
itens, como saiu no relatório:

```json
{
  "id_origem": "***6533",
  "numero": "**********0292",
  "ano": null,
  "tipo": "ISENÇÃO ITBI",
  "motivo": "TRIBUTO",
  "posicao": "REQUERENTE",
  "situacao": "ACOMPANHANDO",
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
  "data_referencia": "2025-06-11"
}
```

A amostra completa está no relatório
(`docs/evidencias/homologacao-monday.md`).

### Mascaramento

| Campo | Tratamento |
| --- | --- |
| `id_origem` | reduzido aos 4 últimos caracteres |
| `numero` | 4 últimos dígitos do processo |
| `valor_causa` | substituído por `***` |
| `atuacao` | `EXTERNO Dra. Fulana de Tal` → `EXTERNO Dra. F.` |
| `motivo`, `tipo`, `situacao`, `situacao_comite` | varredura de CPF/CNPJ no **valor** |
| nome de cliente | não existe no destino de processos |

A varredura dos campos livres é sobre o **valor**, não sobre o nome do campo.
`MOTIVO` é digitado à mão; alguém pode ter escrito "cobrança do CPF
123.456.789-00" e nenhum mapeamento previu isso. O ensaio inclui exatamente esse
caso, e a máscara o remove.

Ao fim, o runner varre a amostra **publicada** e declara se sobrou algum
documento. Se a origem tinha documento em campo livre, ele avisa separadamente —
é informação para o jurídico: documento digitado em campo livre não é protegido
por nenhum mascaramento de coluna.

---

## 8. Limitações

1. **A taxa de judicialização está indisponível até aprovação das regras.**
   Nenhum dos 6 rótulos reais de `'MEU TRABALHO'` é coberto pelas listas
   atuais; os 250 processos estão em `revisao_necessaria`. As propostas estão
   emitidas (seção 5) e **nada foi aplicado** — a decisão é da equipe do
   jurídico.
2. **Colunas que o quadro não tem:** `cliente`, `cpf_cnpj` e `contrato` não
   existem no board — as inconsistências de documento inválido dependem delas e
   não são geradas para processos. `numero` também não existe como coluna e cai
   para o nome do item. O vínculo com cliente depende do motor de
   relacionamento.
3. **Teto de 200 páginas** na leitura. Acima disso a carga é marcada
   **truncada**, o cursor é preservado, e **nenhum registro é marcado ausente** —
   marcar ausência com base em leitura incompleta apagaria da tela o que apenas
   não foi lido. O board real tem 273 itens em 2 páginas — folga ampla.
4. **A proposta de regra é heurística.** Ela sugere uma direção a partir de
   palavras contidas no rótulo. Não substitui quem conhece o fluxo do jurídico,
   e por isso a classificação permanece em revisão até a aprovação.
5. **`MONDAY_ENDPOINT` existe como variável.** Ela só é usada pelo ensaio, que
   sobe um servidor local. Em produção a variável não é definida e o endereço é
   o oficial — mas vale saber que ela existe, porque quem controla o ambiente do
   servidor pode redirecionar a integração.
6. **A execução real rodou em banco local de homologação**, recriado do zero
   pelas 17 migrações (`patrono_homolog`), não no banco de produção. As provas
   valem para o esquema — que é o mesmo —, e a primeira carga em produção
   repete o mesmo runner.
7. **O board é vivo.** Os números deste relatório valem para 2026-08-05. Os 23
   ignorados, os 6 rótulos e as contagens por coluna mudam conforme a equipe
   trabalha no quadro — o runner pode ser reexecutado a qualquer momento, e a
   idempotência provada garante que reexecutar não duplica nada.

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
