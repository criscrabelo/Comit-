# Homologação controlada do Monday — Processos Judiciais

**Quadro autorizado:** `(JUR) PROCESSOS JUDICIAIS` — board **5959705266**
**Demais quadros:** desligados até a aprovação desta homologação.
**Sienge:** desligado. Checklist em `docs/SIENGE-INFORMACOES-NECESSARIAS.md`.

---

## 1. Estado desta entrega

**Tentativa de execução real:** 2026-08-05, com `MONDAY_TOKEN` presente no
ambiente. Resultado abaixo.

| Item | Situação |
| --- | --- |
| **Pré-confirmação dos 4 itens** | ✅ **executada de verdade — os 4 passaram** (seção 2) |
| Instrumentação das 14 métricas exigidas | **pronta** |
| Runner das duas execuções consecutivas | **pronto** (`scripts/homologar-monday.ts`) |
| Levantamento dos rótulos reais | **pronto** (`src/integracoes/monday/rotulos.ts`) |
| Propostas de regra para rótulo não coberto | **prontas — nunca aplicadas** |
| Amostra anonimizada, sem CPF/CNPJ/nome | **pronta**, com varredura de conferência |
| Mapa de colunas Monday → Patrono | **pronto** (seção 4) |
| Suíte contra PostgreSQL real | **328 testes passando**, dos quais **31** de Monday |
| Ensaio ponta a ponta do runner | **7 de 7 provas** (`scripts/ensaiar-homologacao.ts`) |
| **As duas execuções contra o board real** | **BLOQUEADO — a rede recusa `api.monday.com`** |
| Rótulos reais do board | **pendente** — dependem da leitura |
| Amostra anonimizada com dados reais | **pendente** — depende da leitura |

### O bloqueio mudou de causa

O impedimento anterior era a ausência de `MONDAY_TOKEN`. **Esse impedimento
acabou:** o token está no ambiente, e a pré-confirmação dos quatro itens rodou
e passou. O que impede agora é outra coisa, e é externa ao produto: **a política
de egresso desta sessão recusa o host `api.monday.com`.**

```
> CONNECT api.monday.com:443 HTTP/1.1
< HTTP/1.1 403 Forbidden
```

O proxy registra a recusa como `connect_rejected — gateway answered 403 to
CONNECT (policy denial or upstream failure)`, e repetiu a mesma resposta em
todas as tentativas. **Não é falha intermitente e não é erro de credencial:** o
403 vem do gateway antes de qualquer TLS com o Monday, ou seja, o token nunca
chegou a ser apresentado. Um host de controle (`api.github.com`) responde `200`
pelo mesmo proxy, o que isola o bloqueio a `api.monday.com` e não à saída de
rede em geral. Evidência bruta em `docs/evidencias/bloqueio-rede-monday.txt`.

Também foi conferido que `MONDAY_ENDPOINT` **não está definida**, isto é, o
cliente aponta para `https://api.monday.com/v2` — o endereço oficial. O bloqueio
não é consequência de redirecionamento da integração (ver limitação 8).

Rota de saída: liberar `api.monday.com:443` na política de egresso do ambiente e
repetir a execução. Nada precisa mudar no código.

### O que continua não sendo preenchido, e por quê

Métricas, rótulos reais e amostra com dados reais seguem **em branco**. Há
números disponíveis — os do dublê de teste, e o ensaio ponta a ponta produz um
relatório completo com eles. Apresentá-los como resultado da homologação é
exatamente o que a regra "nenhum dado demonstrativo apresentado como real"
proíbe, e por isso o relatório de homologação real não existe: existe o do
ensaio, e ele nasce marcado como simulado.

Quando `api.monday.com` estiver liberado, o comando é um só:

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
reiniciar o backend não basta se o processo do agente continuar o mesmo. Foi o
que destravou o token nesta tentativa, e vale para a liberação da rede também.

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

### Resultado real — 2026-08-05T01:45:22Z

Os quatro itens são **locais**: presença da variável, comportamento da trava, id
do quadro e as consultas do próprio pipeline. Nenhum depende de alcançar a API,
e por isso puderam ser verificados de verdade mesmo com a rede recusando o host.

| Item | Resultado |
| --- | --- |
| `token_configurado: true` | ✅ MONDAY_TOKEN presente no ambiente (valor nunca exibido) |
| integração em modo somente leitura | ✅ trava no transporte (`consultar`), antes de qualquer requisição |
| quadro configurado = 5959705266 | ✅ (JUR) PROCESSOS JUDICIAIS — `5959705266` |
| nenhuma `mutation` ou `subscription` no pipeline | ✅ 4 consultas do pipeline, todas aceitas pela trava |

Relatório em `docs/evidencias/preconfirmacao-monday.md`, gerado por:

```bash
npx tsx scripts/homologar-monday.ts --pre-confirmacao \
  --saida docs/evidencias/preconfirmacao-monday.md
```

**Sobre `--pre-confirmacao`.** A opção foi acrescentada nesta tentativa e para o
runner logo depois dos quatro itens, **antes de qualquer tráfego de rede**. Ela
separa dois diagnósticos que a falha de rede confunde com facilidade: "a
pré-confirmação não passou" e "a pré-confirmação passou, mas não foi possível
chegar ao Monday". O segundo não é defeito do produto, e sem essa separação a
distinção depende de ler log de erro. Ela **não** substitui a homologação: não
lê, não grava e não emite prova nenhuma.

Rodando o runner completo, os quatro passam e a execução para no exercício da
credencial, com `O token nao autenticou no Monday: Nao foi possivel consultar o
Monday` — após três tentativas com espera progressiva. É a rede, não o token:
o 403 do gateway acontece antes de a credencial ser apresentada.

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

1. **As duas execuções reais não foram feitas** — a política de egresso do
   ambiente recusa `api.monday.com:443` com `403` no `CONNECT`. O token está
   presente e a pré-confirmação passou; o bloqueio é de rede, não de credencial
   nem de código. Ver seção 1.
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
7. **A proposta de regra é heurística.** Ela sugere uma direção a partir de
   palavras contidas no rótulo. Não substitui quem conhece o fluxo do jurídico,
   e por isso a classificação permanece em revisão até a aprovação.
8. **`MONDAY_ENDPOINT` existe como variável.** Ela só é usada pelo ensaio, que
   sobe um servidor local. Em produção a variável não é definida e o endereço é
   o oficial — mas vale saber que ela existe, porque quem controla o ambiente do
   servidor pode redirecionar a integração.

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
