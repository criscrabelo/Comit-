# Regra de judicialização — configurável por fonte e vigência

**Status:** política do Monday cadastrada como **proposta**. Nenhum registro foi
classificado. Os 250 processos permanecem em `revisao_necessaria`.

**Decisão que originou este documento** (Coevo, 05/08/2026):

> Neste momento, considerar judicializado todo registro que esteja no quadro
> "Processos Judiciais" do Monday, pois hoje essa é a fonte oficial da
> informação jurídica. Contudo, essa regra deve ser configurável e não ficar
> presa ao Monday.

---

## 1. Por que a regra saiu do código

Até aqui, "está judicializado?" era respondido por listas de termos escritas no
código-fonte, casadas por substring contra uma coluna de um quadro do Monday.

A homologação do board 5959705266 mostrou o custo desse desenho. Os seis rótulos
reais da coluna de situação são:

| Rótulo | Registros |
| --- | --- |
| ACOMPANHANDO | 150 |
| FINALIZADO | 69 |
| ACORDO | 47 |
| BAIXA DEFINITIVA | 3 |
| RECOMPRA/ACORDO | 3 |
| ARQUIVADO PROVISORIAMENTE | 1 |

Nenhum deles responde *"está judicializado?"*. Todos respondem *"em que pé
está?"*. A coluna descreve **andamento**, não natureza — e forçá-la a alimentar
a taxa de judicialização produziria um número com aparência de certo.

Três consequências práticas do desenho antigo:

- **Trocar de fonte exigiria reescrever a lógica.** O Sienge não tem a coluna
  `MEU TRABALHO`; ele tem outros campos, com outros valores.
- **Mudar de critério não deixava rastro.** Sem versão, sem vigência, sem autor.
- **O passado seria reescrito.** Alterar as listas mudaria retroativamente o
  número de todas as competências já fechadas.

---

## 2. As três camadas

```
POLÍTICA          a regra: (fonte, escopo, vigência, critério, aprovação)
    ↓
APURAÇÃO          o que CADA fonte concluiu sobre CADA registro
    ↓
CONSOLIDAÇÃO      o que vale operacionalmente, por precedência
```

### Política — `politicas_judicializacao`

Uma linha por regra. Campos que importam:

| Campo | Papel |
| --- | --- |
| `fonte` | `monday`, `sienge`, … — **trocar de fonte é cadastrar linha, não editar código** |
| `escopo` | `processos`, `distratos`, ou `*` para todo o conector |
| `tipo` | `premissa_de_escopo`, `por_rotulo`, `por_termos` |
| `configuracao` | parâmetros do tipo, em jsonb |
| `precedencia` | menor número decide o valor exibido quando duas fontes valem |
| `vigente_de` / `vigente_ate` | a regra da época, para reapurar o passado |
| `situacao` | `proposta` → `aprovada` → `revogada` |
| `justificativa` | por que a regra existe, em texto |
| `aprovada_por` / `aprovada_em` | quem decidiu e quando |

**Três travas no banco, não em convenção:**

1. Duas políticas aprovadas não podem valer ao mesmo tempo para o mesmo par
   (fonte, escopo). Sem isso, a escolha entre elas viraria ordem de leitura.
2. Política aprovada é **imutável no critério**. Encerrar vigência e revogar
   continuam permitidos; alterar `configuracao`, `tipo`, `fonte`, `escopo`,
   `precedencia` ou `vigente_de`, não. Mudança de critério é versão nova.
3. Aprovação sem autor e sem data é recusada.

### Os três tipos de critério

**`premissa_de_escopo`** — o escopo *é* o critério; o rótulo não entra na conta.
É a regra da Coevo hoje: estar no quadro Processos Judiciais basta. A
configuração aceita `judicializado: false`, para um escopo que signifique o
contrário (um quadro de cobrança extrajudicial, por exemplo).

**`por_rotulo`** — mapa explícito rótulo → judicializado. Comparação ignora
acento e caixa, porque o mapa é digitado por uma pessoa e o Monday traz outra
grafia. **Rótulo fora do mapa não é presumido**: vira revisão.

**`por_termos`** — listas de termos casadas por substring. Preservado para que
uma apuração antiga continue explicável pelo critério que a produziu.

### Apuração — `judicializacao_apuracoes`

Uma linha por `(entidade, registro, fonte)`. Na transição, Monday e Sienge
coexistem: as duas conclusões ficam gravadas lado a lado, com o rótulo cru que
levou cada uma até ali.

`judicializado` é **anulável de propósito**. `NULL` significa "a política olhou e
não concluiu" — diferente de `false`, que é conclusão. Colapsar os dois
transformaria "não sei" em "não está".

### Consolidação

A precedência decide **o que exibir**, nunca o que descartar. Quando as fontes
divergem:

- o valor operacional segue a fonte de menor `precedencia`;
- as duas conclusões continuam em `judicializacao_apuracoes`;
- `judicializacao_divergente` fica verdadeiro no registro;
- abre-se uma inconsistência do tipo `divergencia_judicializacao`, que
  **bloqueia indicador** — número apurado sobre divergência aberta seria
  apresentado como certo sem ser;
- `revisao_necessaria` volta a ser verdadeiro: divergência é exatamente o caso
  que precisa de olho humano.

**Sem política aprovada alcançando o registro, ele fica em
`revisao_necessaria`.** Nunca vira `false` por omissão.

---

## 3. As três fases da transição

### Fase 1 — hoje: Monday é a fonte oficial

Uma política, `monday` / `processos`, tipo `premissa_de_escopo`, precedência 10.

```
politicas_judicializacao
  1.0.0  monday  processos  premissa_de_escopo  prec 10  {judicializado: true}
```

A coluna `MEU TRABALHO` **continua alimentando situação/estágio** — que é o que
ela de fato descreve. Ela apenas deixa de responder pela judicialização.

Sobre a taxa de judicialização nesta fase: se todo registro do quadro é
judicializado, a taxa não sai de rótulo nenhum. Ela é uma razão entre
*quantidade de processos* e um denominador que vive em outra fonte — contratos
ou distratos. O indicador muda de forma, não só de valor.

### Fase 2 — transição: as duas coexistem

Cadastra-se a política do Sienge com precedência **menor** (prioridade maior),
sem tocar em código:

```
1.0.0  sienge  processos  por_rotulo  prec  5  {rotulos: {...}}
1.0.0  monday  processos  premissa…   prec 10  {judicializado: true}
```

A partir daí, cada registro que as duas fontes alcançarem produz **duas
apurações**. Concordância segue silenciosa; divergência abre inconsistência com
os dois valores preservados e a precedência declarada.

Esta fase é onde a qualidade do Sienge fica visível antes de ele assumir: a
contagem de divergências é a medida direta de quanto as fontes discordam.

### Fase 3 — futuro: Sienge principal

Encerra-se a vigência da política do Monday:

```bash
npx tsx scripts/politica-judicializacao.ts revogar \
  --politica <id-monday> --usuario <login> --motivo "Sienge homologado como fonte oficial"
```

A do Sienge segue sozinha. Nenhuma linha de lógica muda — a mesma função
`avaliar` continua sendo chamada. Isso é testado em
`test/judicializacao-politica.test.ts`, no caso *"Sienge assume a fonte
principal sem que a lógica mude"*.

---

## 4. Comandos

```bash
cd server

# O que existe, em que situação
npx tsx scripts/politica-judicializacao.ts listar

# O que ACONTECERIA se a proposta fosse aprovada — não grava nada
npx tsx scripts/politica-judicializacao.ts simular --politica <id>

# Decide o critério. NÃO reclassifica nada.
npx tsx scripts/politica-judicializacao.ts aprovar --politica <id> --usuario <login>

# Aplica o critério aprovado aos registros já carregados
npx tsx scripts/politica-judicializacao.ts reapurar --escopo processos
```

**Por que aprovar e reapurar são passos separados.** Aprovar é um ato de decisão,
com autor e data. Reapurar é o momento em que 250 registros mudam de estado na
tela. Juntá-los faria a segunda coisa acontecer como efeito colateral da
primeira — e quem aprova precisa poder ver o efeito, pela simulação, antes que
ele alcance qualquer indicador.

A simulação usa **a mesma função** `avaliar` da apuração real. Uma simulação
escrita à parte poderia divergir do que a aprovação de fato faria, e aí o número
apresentado para decidir não seria o número que aconteceria.

---

## 5. O que está pendente de aprovação

A política `1.0.0 monday/processos` está cadastrada como **proposta**. Enquanto
não for aprovada:

- os 250 processos seguem em `revisao_necessaria`;
- `judicializacao_fonte` e `judicializacao_politica` seguem nulos;
- a taxa de judicialização segue **indisponível**, com motivo declarado.

Isso atende ao item 4 da instrução: *"não aplicar classificação definitiva aos
250 registros sem minha aprovação"*.

Para ver o efeito antes de decidir:

```bash
npx tsx scripts/politica-judicializacao.ts simular
```

---

## 6. Limitações conhecidas

1. **`reapurar` cobre apenas `processos`.** Distratos e notificações usam a
   mesma estrutura, mas o comando ainda não mapeia a tabela de destino delas.
2. **A precedência é global por política**, não por registro. Se um dia for
   preciso "Sienge decide para o empreendimento X, Monday para o Y", será uma
   política por escopo — o campo `escopo` já suporta, mas não há interface.
3. **A política do Sienge ainda não existe.** Ela depende da homologação dos
   endpoints e campos, que segue bloqueada em
   `docs/SIENGE-INFORMACOES-NECESSARIAS.md`.
4. **Não há tela.** O ciclo de vida é por linha de comando. A Central de
   Inconsistências já exibe a divergência; a gestão da política, não.
5. **`reapurar` não registra quem mandou reapurar.** A apuração guarda a
   política e o instante, mas não o operador. Registrado no backlog.
