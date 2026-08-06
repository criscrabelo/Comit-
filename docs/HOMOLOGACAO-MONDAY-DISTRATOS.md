# Homologação controlada do Monday — Distratos e Desistências

> ## ⏳ AGUARDANDO APROVAÇÃO
>
> Homologação do quadro **Distratos e Desistências** (board `18404493605`)
> executada de ponta a ponta em **2026-08-06**, com o mesmo rito aprovado para
> Processos Judiciais: pré-confirmação, duas execuções consecutivas, 14
> métricas, 7 provas, rótulos reais e amostra anonimizada.
>
> **As sete provas passaram.** Há **quatro itens abertos**, um deles com
> consequência direta no cruzamento entre quadros — seção 6.

**Quadro autorizado:** `(JUR) DISTRATOS E DESISTÊNCIAS` — board **18404493605**
**Tabela de destino:** `distratos` — a mesma que o quadro de Retomadas usará.
**Relatório completo, com os números reais:**
`docs/evidencias/homologacao-monday-distratos.md`

---

## 1. Estado desta entrega

| Item | Situação |
| --- | --- |
| **Pré-confirmação dos 4 itens** | ✅ **os 4 passaram** antes de qualquer leitura |
| Credencial autenticada (`query { me }`) | ✅ conta Cristiane C. Rabelo |
| **Primeira execução** — 14 métricas | ✅ **38 lidos, 38 incluídos, 0 ignorados, 0 erros** |
| **Segunda execução** — 7 provas | ✅ **7 de 7** — idempotência provada sobre o board real |
| Rótulos reais do board | ✅ **levantados** — 25 colunas, todos os valores distintos |
| Títulos repetidos no quadro | ⚠️ **2 detectados e declarados** — `EMPREENDIMENTO` e `SETOR` |
| Amostra anonimizada com dados reais | ✅ emitida; varredura final: **nenhum CPF/CNPJ presente** |
| CPF em campo de texto livre da ORIGEM | ⚠️ **3 encontrados e removidos da amostra** |
| Suíte contra PostgreSQL real | **380 testes passando**, dos quais **9 novos** de Distratos |
| Classificação de judicialização | não se aplica — este quadro não a alimenta |

### Resumo da primeira execução (dados reais)

| Métrica | Valor |
| --- | --- |
| Quantidade recebida (lidos da origem) | 38 |
| Páginas consultadas | 1 |
| Último cursor | `null` — leitura chegou ao fim |
| Quantidade normalizada | 38 |
| Incluída | 38 |
| Atualizada / Inalterada | 0 / 0 (primeira carga) |
| Ignorada | 0 — este quadro não tem grupo excluído do comitê |
| Duplicada / Com erro | 0 / 0 |
| **Data de referência** | **— (indisponível, ver 6.1)** |
| Duração | 2,3 s |
| Contabilidade fecha | sim |

Segunda execução: **0 incluídos, 0 atualizados, 38 inalterados** sobre os mesmos
38 lidos.

**Nota de leitura do relatório:** a inconsistência `falha_importacao` ao final é
a **falha simulada da prova 6**. As duas execuções reais terminaram com status
`sucesso`.

Para repetir:

```bash
MONDAY_TOKEN=<token> \
DATABASE_URL=<url> \
npx tsx scripts/homologar-monday.ts --quadro distratos \
  --saida ../docs/evidencias/homologacao-monday-distratos.md
```

---

## 2. Os três defeitos corrigidos

### 2.1 O perfil de homologação nomeava colunas que a tabela nunca teve

Encontrado **antes da carga**, conferindo o perfil contra a migração 005. Os
perfis de `distratos` e `retomadas` pediam `situacao`, `torre`, `grupo` e
`total_dias` na amostra anonimizada, e usavam `situacao` como campo da prova 5.

A tabela `distratos` tem `unidade`, `categoria`, `motivo`, `equipe`,
`data_solicitacao`, `data_venda`, `data_conclusao` e `tempo_dias` — **nenhuma
das quatro existe**. A amostra teria falhado no `SELECT`, depois de as duas
execuções já terem rodado.

Os dois perfis foram alinhados ao esquema, e o campo da prova 5 passou a ser
`motivo` — que existe, vem preenchido em toda a carga e não tem `CHECK` que
recuse o valor de teste (`categoria` tem). Um teste compara os nomes do perfil
com o `information_schema` e falha se divergirem.

### 2.2 `ALAMEDA` cortava `ALAMEDAS 406A` no meio da palavra

A extração da unidade remove o nome do empreendimento do começo do nome do item.
A remoção não exigia fronteira de palavra: o item `ALAMEDAS 406A`, com
EMPREENDIMENTO `ALAMEDA`, virava a unidade **`S 406A`** — um identificador que
não existe em lugar nenhum.

**Correção:** o prefixo só é removido quando termina em espaço ou fim de texto.
Quando não termina, o nome do item inteiro vira a unidade — informação
incompleta e verdadeira vale mais que um recorte inventado. Vale para os três
quadros já homologados; nenhum deles regrediu.

### 2.3 O relatório publicava 22 links de assinatura da ClickSign

Encontrado na conferência final do relatório gerado. A coluna espelhada
`Espelho` deste quadro carrega **22 endereços de assinatura notarial**
(`https://app.clicksign.com/accounts/.../notarial/links/<uuid>/signatures`), e o
levantamento de rótulos os listava um a um.

O runner já suprimia valores de colunas do tipo `text`, pela regra de que texto
digitado à mão pode conter nome ou documento. Um link não é texto livre — mas é
pior: **ele não descreve o dado, ele dá acesso ao dado**, e este relatório é
evidência versionada em repositório.

**Correção:** coluna cujos valores contenham endereço `http(s)` tem os valores
suprimidos; só a contagem é publicada. A regra da amostra — sem CPF, CNPJ nem
nome completo — vale para o relatório inteiro, e um endereço de documento
assinado está do mesmo lado da linha.

> **Nota sobre a evidência anterior.** Ao contrário das homologações de
> Processos e Notificações, aqui **não há relatório "antes da correção"
> preservado**: as duas versões geradas antes desta correção continham os 22
> links, e versioná-las anularia a correção. O que elas mostravam de único — a
> unidade `S 406A` — está fixado em teste e descrito em 2.2.

---

## 3. Mapa de colunas — Monday → Patrono

**Conferido contra o board real (2026-08-06).** O quadro tem 25 colunas; 5
alimentam campos do Patrono.

| Campo no Patrono | Coluna no Monday | Coluna no banco | Preenchimento |
| --- | --- | --- | --- |
| `cliente` | CLIENTE | (vínculo) | 38 / 38 |
| `empreendimento` | EMPREENDIMENTO (status) | `empreendimento_id` | 38 / 38 |
| `motivo` | MOTIVO | `motivo` | 38 / 38 |
| `equipe` | EQUIPE | `equipe` | 38 / 38 |
| `data_solicitacao` | DATA DA SOLICITAÇÃO | `data_solicitacao` | 38 / 38 |
| `data_venda` | DATA DA VENDA | `data_venda` | 38 / 38 |
| — | título do grupo | `categoria` | 38 / 38 |
| — | nome do item | `unidade` | 38 / 38 |
| — | **não existe no quadro** | `data_conclusao` | **0 / 38** |
| — | **não existe no quadro** | `tempo_dias` | **0 / 38** |

### Categoria vem do grupo, e os dois grupos reais funcionam

| Grupo | Itens | Categoria gravada |
| --- | --- | --- |
| DISTRATOS | 26 | `distrato` |
| DESISTÊNCIAS | 12 | `desistencia` |

A distinção entre distrato e desistência é preservada — é a mesma que o
code-drop paralelo tinha perdido, contando as duas juntas.

### Colunas que o quadro tem e ninguém mapeou

Levantadas com seus rótulos reais no relatório, disponíveis para decisão futura.
Chamam atenção as **financeiras**, que hoje não entram em lugar nenhum:
`VALOR DA VENDA`, `VALOR PAGO`, `VALOR DEVOLVIDO`, `VALOR A RECEBER`,
`CORRETAGEM`, `COMISSÃO PAGA` (vazia em 38/38), `COMISSÃO DESCONTADA`,
`HONORÁRIOS` e `MULTA 50%` (fórmula: `VALOR PAGO × 0,5`).

Também não mapeadas: `DISTRATO SIENGE`, `DISTRATO SIENGE/FINANCEIRO`,
`INTEGRAÇÃO`, `SOLICITANTE`, `SETOR`, `PERÍODO (DIAS)` e a ligação
`(JUR) CONTRATOS PARA CLIENTES` (vazia em 38/38).

### Colunas que o quadro não tem

`cpf_cnpj` e `contrato` — gravadas como nulas, nunca presumidas. Sem `cpf_cnpj`,
as inconsistências de documento inválido não são geradas para distratos, e o
vínculo com cliente depende do motor de relacionamento.

---

## 4. Títulos repetidos — o detector já entregou valor

O mecanismo criado na homologação de Notificações pegou **dois** casos aqui, na
primeira execução em que rodou contra um quadro novo:

| Título | Colunas | Escolhida | Certa? |
| --- | --- | --- | --- |
| `EMPREENDIMENTO` | `lookup_mm1re8j8` (mirror) · `color_mm28cam9` (status) | `color_mm28cam9` | ✅ o espelho vem vazio em 12 dos 38 |
| `SETOR` | `lookup_mm1rpssd` (mirror) · `color_mm2knzbk` (status) | `color_mm2knzbk` | ✅ mesmo motivo |

Nos dois casos a regra "espelho perde para não-espelho" acertou, e agora isso
está **declarado no relatório** em vez de decidido em silêncio. Vale notar que os
dois espelhos discordam do status também no conteúdo: `SETOR` espelhado traz
`JURIDICO / RELACIONAMENTO / COMERCIAL / CRÉDITO`, e o de status traz
`PÓS VENDAS / JURÍDICO / COMERCIAL`. São vocabulários diferentes para o mesmo
nome de coluna.

---

## 5. Amostra anonimizada

Emitida com **dados reais do board**, já mascarados; a varredura final não
encontrou CPF nem CNPJ. A tabela `distratos` **não tem coluna de nome de
cliente** — o nome vai para o motor de vínculo, não para o destino —, então a
amostra não tem por onde vazar nome.

> ⚠️ **A varredura acusou 3 CPF nos campos de texto livre da ORIGEM**, removidos
> antes de publicar. Informação para o jurídico: documento digitado em campo
> livre não é protegido por mascaramento de coluna.

E vale repetir o que a seção 2.3 corrigiu: a varredura automática do runner
cobre **CPF e CNPJ na amostra publicada**. Ela não cobria endereços de acesso em
outras seções do relatório, e não cobre tudo que pode ser sensível. A
conferência final do relatório gerado continua sendo parte do rito, não
formalidade.

---

## 6. Itens abertos — decisão do jurídico

### 6.1 O quadro não tem data de conclusão — e isso deixa a carga sem data de referência

Não existe coluna de conclusão do distrato. Consequências, em ordem de gravidade:

1. **`data_referencia` da execução saiu vazia.** É o campo que responde "até
   quando este dado está atualizado". Para processos ele vinha da citação, para
   notificações da data da notificação; aqui `dataReferencia` é derivada de
   `data_conclusao`, que não existe. **A carga não sabe declarar sua própria
   data de corte.**
2. **`tempo_dias` fica nulo em 38 de 38** — não há de onde calcular o tempo até
   concluir.
3. O indicador "tempo médio de conclusão de distrato" está **indisponível**.

Há três saídas, e a escolha é de produto: criar a coluna no Monday; usar
`DATA DA SOLICITAÇÃO` como data de referência (assumindo que o distrato conta
pela solicitação); ou aceitar que este quadro não tem corte temporal próprio.
**Nada foi assumido.**

### 6.2 `PERÍODO (DIAS)` não é o tempo de conclusão — e por isso não foi mapeado

O board tem uma coluna `PERÍODO (DIAS)`, e seria natural ligá-la a `tempo_dias`.
A fórmula diz que seria errado:

```
DAYS({data}, {date_mm1zzqfm})   →   DAYS({DATA DA SOLICITAÇÃO}, {DATA DA VENDA})
```

Isso é **quanto tempo o cliente segurou a unidade antes de pedir o distrato** —
período de posse. Não é o tempo de processamento, que é o que `tempo_dias`
significa nas outras cargas. Mapear os dois igualaria coisas diferentes e o
indicador mentiria sem alarme.

Note que aqui a fórmula da origem **desmentiu** a associação óbvia, enquanto em
Notificações a fórmula de `TOTAL DIAS` **confirmou** que `RESOLUÇÃO` era a data
de solução. Ler a fórmula antes de mapear vale nos dois sentidos.

**Pergunta para o jurídico:** o período de posse (venda → solicitação) é um
indicador que interessa? Se sim, ele merece campo próprio, e não o de tempo de
conclusão.

### 6.3 A coluna EMPREENDIMENTO é a SPE, não o prédio

O achado mais consequente. A coluna EMPREENDIMENTO do quadro **não traz o
empreendimento do item**:

| EMPREENDIMENTO (coluna) | Nome do item | Prédio real |
| --- | --- | --- |
| `ALENCAR MAZZEO` | `MORATTA 001B` | MORATTA |
| `COEVO E CONELESTE` | `ALAMEDA 003B` | ALAMEDA |
| `SAN MARINO` | `VERANO 907A` | VERANO |
| `FGV` | `VITA 02` | VITA |
| `GRAN PARK` | `GRAN PARK 1308` | GRAN PARK — coincidem |

É a mesma classe de defeito do `LOCAL` em Processos, que parecia comarca e era
atuação: uma coluna com nome familiar carregando outro conceito. Aqui parece ser
a **SPE / incorporadora** proprietária do empreendimento.

Três consequências concretas, já medidas:

1. **9 empreendimentos foram criados na base** a partir dessa coluna —
   `ALENCAR MAZZEO`, `COEVO E CONELESTE`, `SAN MARINO`, `FGV`,
   `JARDIM PAULISTA`, `GRAN PARK`, `ALAMEDA`, `SIETE`, `MORATTA`. Os cinco
   primeiros **não são empreendimentos**.
2. **O cruzamento entre quadros não fecha.** Notificações trouxe `MORATTA`,
   `VERANO`, `AURORA`, `ALAMEDAS`, `BELLA VIDA`, `CARPE DIEM`. Distratos traz
   `ALENCAR MAZZEO` e `SAN MARINO`. O mesmo prédio entra na base com dois nomes
   que não se encontram — e o histórico do ativo fica partido.
3. **25 de 38 unidades ficaram com o nome do item inteiro** (`MORATTA 001B` em
   vez de `001B`), porque a remoção do prefixo depende de o nome do
   empreendimento ser o começo do nome do item. Comportamento correto — o
   recorte não é inventado —, mas o dado fica menos útil.

**Nada foi corrigido por suposição.** A pergunta para o jurídico: o
empreendimento do distrato deve sair do **prefixo do nome do item** (como em
Notificações) ou essa coluna deve ser renomeada no Monday para `SPE` e uma
coluna `EMPREENDIMENTO` de verdade ser criada? A segunda resolve na origem e não
deixa dívida no código.

**Até a decisão, a carga de distratos não deve alimentar indicadores por
empreendimento**, nem ser cruzada com Notificações por esse campo.

### 6.4 Os valores financeiros não entram em lugar nenhum

Nove colunas de valor (venda, pago, devolvido, a receber, corretagem, comissões,
honorários, multa) estão no quadro e **não têm destino** na tabela `distratos`,
que não tem campo de valor. Se o comitê precisa de perda financeira por
distrato, isso exige coluna nova e migração — não é ajuste de mapa.

---

## 7. Limitações

1. **Volume pequeno.** 38 itens numa página. As provas de paginação e cursor não
   foram exercitadas com profundidade aqui como foram em Notificações (6
   páginas, 1072 itens).
2. **A execução real rodou em banco local de homologação** (`patrono_homolog`),
   recriado do zero pelas 18 migrações.
3. **O board é vivo.** Os números valem para 2026-08-06.
4. **`data_referencia` indisponível** (item 6.1) — a carga não declara data de
   corte própria.
5. **A tabela `distratos` é compartilhada com Retomadas.** A homologação daquele
   quadro grava na mesma tabela, e `categoria` é o que os separa. Convém
   homologá-lo em seguida, com o banco recriado, para que a coexistência das
   quatro categorias seja verificada.

---

## 8. Ordem seguinte, após aprovação

1. **Retomadas** (board `18413057491`) — mesma tabela, perfil já corrigido;
2. Honorários Extrajudiciais (`7231876117`) — exige destino de ingestão;
3. Controle de Entrega Carpe Diem (`18410779605`) — idem;
4. validação dos endpoints do Sienge;
5. cruzamento Monday × Sienge — **depende do item 6.3**.

Um quadro por vez, como aprovado em 06/08/2026.
