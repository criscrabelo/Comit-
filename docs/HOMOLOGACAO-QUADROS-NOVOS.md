# Homologação dos quadros novos — Projetos de TI, Honorários, Transferência Intermediada

**Estado: NÃO HOMOLOGADOS.** Nenhum dos três foi lido. Este documento registra o
que impediu, o que já está pronto para quando o impedimento sair, e o que
depende de decisão sua.

Homologação de Processos Judiciais (board 5959705266), que é a referência de
método: [`HOMOLOGACAO-MONDAY.md`](HOMOLOGACAO-MONDAY.md).

---

## 1. O impedimento: a credencial, não a rede

**A rede está liberada.** É o oposto do bloqueio de 05/08, e a diferença importa
porque os dois sintomas se parecem quando se olha só o erro final.

| | 05/08 (B16.2) | 08/08 (agora) |
| --- | --- | --- |
| `CONNECT api.monday.com:443` | `403` do gateway | ✅ `200 Connection Established` |
| TLS com o Monday | nunca aconteceu | ✅ concluído em 0,38 s |
| Quem recusa | o proxy de egresso | **o Monday** — `server: cloudflare`, HTTP/2 `401` |
| O token foi apresentado? | não chegou a ser | **sim, e foi rejeitado** |
| Host de controle (`api.github.com`) | `200` | `200` |

O corpo da resposta é do próprio Monday:
`{"errors":[{"message":"Not authenticated","extensions":{"code":"NOT_AUTHENTICATED"}}]}`.

O token presente no ambiente é **estruturalmente íntegro** — JWT de três partes
(20/160/43 caracteres), conta `9877272`, usuário `25142950`, emitido
`2026-08-08T21:26:50Z`. Ou seja: não está truncado nem mal copiado, e aponta
para a conta certa. Ainda assim o Monday o recusa, o que é o sintoma de **token
pessoal regenerado depois** que este valor foi capturado: regenerar invalida o
anterior, e o valor no ambiente passa a ser o antigo.

O token que funcionou em 05/08 era outro (227 caracteres, envolto em `<`...`>`).

### Para destravar

Gerar um token novo no Monday (*Perfil → Developers → My Access Tokens*),
colocá-lo em `MONDAY_TOKEN` **sem delimitadores** e abrir uma **sessão nova** —
o processo herda as variáveis quando sobe, e uma variável trocada depois não é
vista pelo processo que já está no ar.

Conferência de 10 segundos, antes de qualquer outra coisa:

```bash
PATRONO_SEM_BANCO=1 npx tsx scripts/descobrir-quadro.ts --listar
```

---

## 2. O que os três quadros exigem, além do token

Aqui está a parte que **não** é só rodar um comando. Processos Judiciais tinha
tabela de destino, mapa de colunas e regras de classificação prontos antes de a
homologação começar. Dos três quadros pedidos, isso existe para **um**.

| Quadro | Está no mapa? | Board ID | Tabela de destino | O que falta |
| --- | --- | --- | --- | --- |
| **Honorários** | sim — `honorarios` | `7231876117` (do código legado, **não conferido**) | `honorarios` — existe | conferir as 10 colunas contra o board real |
| **Projetos de TI** | **não** | **desconhecido** | **não existe** | levantar o quadro; decidir destino; migração; definição |
| **Transferência Intermediada** | **não** | **desconhecido** | **não existe** | levantar o quadro; decidir destino; migração; definição |

Os dois últimos não aparecem em nenhum lugar do repositório — nem no
`js/monday-sync.js` de produção, nem nas migrações, nem na documentação. São
quadros que a plataforma nunca viu.

### Por que a definição não foi escrita "por enquanto"

Escrever o mapa de colunas de um quadro que não se leu é inventar títulos. A
homologação de Processos provou o custo disso da forma mais direta possível: a
coluna de situação se chama `'MEU TRABALHO'` — **com apóstrofos no título** — e
a documentação toda dizia `MEU TRABALHO`. O resultado foi `situacao` nula em 250
registros, 100% em revisão, e a taxa de judicialização indisponível **sem um
único erro na tela**.

Um mapa inventado para "Projetos de TI" produziria exatamente esse silêncio, com
a diferença de que ninguém teria uma homologação anterior para desconfiar.

### A decisão que é sua, não minha

Para os dois quadros novos, **onde os dados aterram é decisão de produto**, não
de implementação:

- **Projetos de TI** não é assunto jurídico nem de comitê de crédito. Vira
  tabela nova? Entra em algum painel? Ou é só leitura para acompanhamento?
- **Transferência Intermediada** tem cara de operação de unidade/contrato — pode
  se relacionar com `distratos`, `unidades` ou com o motor de vínculos
  Monday × Sienge. Se for para cruzar com contrato, a modelagem muda.

Sem essa resposta, a migração de destino seria um palpite estrutural — e
estrutura errada custa mais que coluna errada.

---

## 3. O que ficou pronto nesta sessão

Tudo o que não dependia de ler o Monday.

### `scripts/descobrir-quadro.ts` — o passo zero

Levantamento **somente leitura**, que responde as duas perguntas que hoje não
têm resposta: qual é o id do quadro com tal nome, e quais colunas ele tem.

```bash
# 1. achar os quadros e seus ids
PATRONO_SEM_BANCO=1 npx tsx scripts/descobrir-quadro.ts --listar
PATRONO_SEM_BANCO=1 npx tsx scripts/descobrir-quadro.ts --nome 'PROJETOS DE TI'

# 2. levantar a forma de um quadro
PATRONO_SEM_BANCO=1 npx tsx scripts/descobrir-quadro.ts \
  --quadro <id> --saida docs/evidencias/forma-projetos-ti.md

# 3. conferir a definição existente contra o board real (caso de Honorários)
PATRONO_SEM_BANCO=1 npx tsx scripts/descobrir-quadro.ts \
  --quadro 7231876117 --conferir honorarios \
  --saida docs/evidencias/forma-honorarios.md
```

Três propriedades deliberadas:

**Não grava nada.** Nem no Monday — a trava de escrita do transporte continua
valendo, e as quatro consultas do levantamento são submetidas a ela antes de
qualquer requisição — nem no banco. Por isso roda com `PATRONO_SEM_BANCO=1`:
exigir banco para *olhar* um quadro inverteria a ordem das coisas, porque o
destino é justamente o que se decide **depois** do levantamento.

**Não lista valor de coluna de texto livre.** O relatório é evidência
versionada, e coluna digitada à mão guarda nome de parte e documento — a
`NOME DA PARTE / REFERÊNCIA` de Processos é exatamente isso. CPF e CNPJ são
removidos antes da contagem, portanto não existem nem na estrutura em memória.
Coluna com quase um valor por item é marcada como identificadora e também não
tem valores listados: ela identifica o item em vez de classificá-lo.

**Não sugere mapeamento.** A conferência diz quais campos da definição **não
têm** coluna no quadro. Não propõe de onde eles "deveriam" vir: inferir
mapeamento por semelhança de nome é o palpite que muda indicador sem ninguém
perceber.

### Recusa de token malformado, com a causa dita

O token de 05/08 vinha envolto em `<`...`>`, como o marcador `<token>` da
documentação. O `.trim()` da configuração não pega isso: a requisição saía com
os delimitadores e o Monday respondia `401` — **indistinguível de credencial
revogada**. Perdeu-se tempo atrás do problema errado.

Agora o cliente recusa antes de qualquer requisição, e a mensagem separa os dois
casos: valor com delimitadores, e valor com caractere que não existe em token
(espaço, quebra de linha). O valor nunca aparece em mensagem nem em log.

### Uma regressão que o ensaio pegou

A mensagem acima, na primeira versão, citava o marcador entre acentos graves. A
pré-confirmação da homologação extrai as consultas GraphQL de `cliente.ts`
delimitando por acento grave — e um acento grave em texto comum deslocou a
delimitação, fazendo o extrator capturar prosa em vez de consulta. A
pré-confirmação passou a reprovar.

O ensaio ponta a ponta pegou isso antes de qualquer commit. Duas correções: a
mensagem não usa mais acento grave, e o extrator ficou capaz de perceber a
própria degradação — a consulta precisa **começar** por `query`/`mutation`/
`subscription`, e encontrar menos consultas que o piso conhecido agora
**interrompe** em vez de aprovar. Uma verificação que não olhou não aprova nada.

### Um teste que dependia da máquina

`sienge-estrutura.test.ts` afirmava que a configuração do Sienge está
incompleta — e passava só porque o ambiente estava vazio. Esta sessão trouxe
`SIENGE_SUBDOMAIN`, `SIENGE_USER` e `SIENGE_PASSWORD` no ambiente, e o teste
quebrou sem nada ter mudado no produto.

Agora ele controla as variáveis explicitamente, e ganhou o caso que faltava: com
as credenciais **preenchidas**, nenhum valor aparece no resultado. Com as
variáveis vazias não havia o que vazar — o vazamento só é possível quando há
valor, e era justamente esse caso que o teste nunca exercitou. Também ficou
provado que credencial completa **não** liga o conector: quem liga é
`SIENGE_HABILITADO`, e essa distinção é o que impede uma carga acidental contra
o Sienge real.

> **Nota sobre o Sienge.** As credenciais estão no ambiente desta sessão. O
> conector continua desligado, como manda `docs/SIENGE-INFORMACOES-NECESSARIAS.md`
> — os endpoints seguem não confirmados. Registrado aqui porque credencial
> presente é fácil de confundir com "pode usar".

### Números

357 testes contra PostgreSQL real (eram 336), sendo **19 novos** para o
levantamento e a recusa de token. Typecheck limpo. Ensaio da homologação de
Processos: 7 de 7 provas — o runner segue íntegro depois da extração do módulo
de sigilo.

---

## 4. Ordem sugerida, quando o token voltar

1. `--listar` para achar os ids dos três quadros;
2. `--quadro 7231876117 --conferir honorarios` — Honorários é o único com
   definição e destino prontos, e a conferência dirá se as 10 colunas existem
   mesmo. É o candidato natural a ser o primeiro homologado;
3. levantar a forma de Projetos de TI e de Transferência Intermediada, e
   **decidir o destino de cada um** (seção 2);
4. escrever definição e migração a partir do que o levantamento mostrou;
5. generalizar o runner de homologação, que hoje está travado no board
   5959705266 e acoplado a `processos_judiciais` — projeção da amostra, prova 5
   e cobertura de judicialização são específicas de processos. A generalização
   ficou de fora de propósito: a forma certa dela depende do que os quadros
   têm, e projetá-la antes do levantamento seria adivinhar;
6. rodar as duas execuções e as sete provas, um quadro por vez.

**A doutrina de `HOMOLOGACAO-MONDAY.md` §9 continua valendo:** nenhum quadro
adicional é ligado antes da aprovação de Processos Judiciais — que segue
pendente das regras de judicialização (§5 daquele documento). Homologar não é
ligar: o levantamento e as provas podem correr antes, e os quadros nascem
desligados. Ligar em produção depende da sua aprovação.
