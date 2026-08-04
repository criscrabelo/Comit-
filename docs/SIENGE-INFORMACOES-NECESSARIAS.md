# Sienge — informações necessárias para ligar a integração

Documento para enviar ao responsável pelo Sienge na Coevo ou ao suporte da
Softplan.

**Por que existe:** o conector do Patrono está construído, mas **desligado**. A
documentação que temos (`references/sienge.md`) lista cinco caminhos com a
ressalva explícita "confirmar no ambiente", e nenhum foi validado contra a API
da Coevo. Não vamos presumir endpoint, parâmetro ou formato de resposta — um
palpite errado produziria número errado apresentado como real.

Enquanto estas respostas não chegarem, os indicadores financeiros aparecem como
**"sem dado"**, com o motivo declarado. Nunca como zero.

---

## 1. Acesso à API

| # | O que precisamos | Por quê |
|---|---|---|
| 1.1 | **URL completa** da API, ou o **subdomínio** da Coevo | Montamos hoje como `https://api.sienge.com.br/{subdominio}/public/api/v1`, mas isso veio de documentação genérica e precisa ser confirmado |
| 1.2 | **Versão da API** disponível (v1? outra?) | O caminho muda conforme a versão |
| 1.3 | Existe **ambiente de homologação** separado do de produção? Qual a URL? | Queremos testar sem tocar em produção |
| 1.4 | A API está **habilitada** no contrato da Coevo? | Em alguns contratos o módulo de API é adicional |

## 2. Autenticação

| # | O que precisamos | Por quê |
|---|---|---|
| 2.1 | **Método**: Basic Auth (usuário e senha), token, OAuth? | Implementamos Basic, que é o que a documentação sugere — confirmar |
| 2.2 | **Usuário de integração** dedicado, com permissão apenas de LEITURA | Não queremos usar credencial pessoal, e a integração nunca escreve |
| 2.3 | O usuário precisa de alguma **permissão específica** por módulo? | Para não descobrirmos por tentativa e erro |
| 2.4 | A credencial **expira**? Com que frequência? | Para planejar a renovação sem interromper a carga |

> ⚠️ **Não envie a senha por e-mail, chat ou neste documento.** Ela será
> configurada diretamente como variável de ambiente no servidor
> (`SIENGE_SUBDOMAIN`, `SIENGE_USER`, `SIENGE_PASSWORD`). Nenhuma credencial
> fica no código, no navegador ou no repositório.

## 3. Endpoints

Precisamos confirmar **cada um** destes, que estão na nossa documentação mas
nunca foram validados. Para cada um: **existe? o caminho está certo? o que
devolve?**

| # | Caminho que temos | Para que usaríamos | Natureza |
|---|---|---|---|
| 3.1 | `/receivable-bills` | títulos a receber | posição |
| 3.2 | `/installments` | parcelas e vencimentos | posição |
| 3.3 | `/current-debit-balance` | saldo devedor por contrato | posição |
| 3.4 | `/total-current-debit-balance` | carteira de referência | posição |
| 3.5 | `/commissions` | comissões | movimentação |

**Além disso:** existe algum endpoint que devolva **contratos**, **clientes**,
**unidades** ou **empreendimentos** diretamente? Precisamos deles para
relacionar os dados do Sienge com os do Monday.

## 4. Parâmetros

| # | O que precisamos |
|---|---|
| 4.1 | Quais parâmetros são **obrigatórios** em cada endpoint |
| 4.2 | Como filtrar por **empresa** |
| 4.3 | Como filtrar por **empreendimento** |
| 4.4 | Como filtrar por **período** ou **data de referência** |
| 4.5 | Existe filtro por **data de alteração**, para carga incremental? |

A carga incremental importa: sem ela, toda sincronização lê a base inteira.

## 5. Paginação

| # | O que precisamos | Por quê |
|---|---|---|
| 5.1 | **Esquema**: `offset`/`limit`? página numerada? cursor? cabeçalho `Link`? | Implementamos `offset`/`limit` como hipótese; se for outro, ajustamos |
| 5.2 | **Nome exato** dos parâmetros | |
| 5.3 | **Tamanho máximo** de página | |
| 5.4 | Em que **campo do corpo** vêm os resultados (`results`? `data`? outro?) | |
| 5.5 | A resposta informa o **total de registros**? | Para saber se a leitura veio completa |

Este ponto é crítico: uma paginação mal implementada lê só a primeira página e
os indicadores saem calculados sobre uma fração da carteira, sem aviso.

## 6. Limites de requisição

| # | O que precisamos |
|---|---|
| 6.1 | **Quantas requisições por minuto** são permitidas |
| 6.2 | Existe limite **diário** ou por período maior? |
| 6.3 | O que a API devolve ao exceder (HTTP 429? cabeçalho `Retry-After`?) |
| 6.4 | Há **janela recomendada** para cargas grandes (madrugada)? |

Hoje usamos um limite conservador de 60 por minuto, por não conhecer o real.

## 7. Empresas e empreendimentos

| # | O que precisamos | Por quê |
|---|---|---|
| 7.1 | **Lista das empresas** cadastradas, com código e nome | O Patrono precisa saber quais existem para não inventar |
| 7.2 | **Lista dos empreendimentos**, com código e nome | Para relacionar com os nomes usados no Monday |
| 7.3 | Quais empreendimentos entram no acompanhamento **agora** | Começamos pequeno, não com tudo |
| 7.4 | O código do empreendimento no Sienge é **estável ao longo do tempo**? | Guardamos a correspondência histórica; se o código muda, precisamos saber |

Os nomes no Monday e no Sienge provavelmente diferem (ex.: `VERANO TORRE B` ×
`Verano - Torre B`). A correspondência será registrada explicitamente, não
adivinhada por semelhança de texto.

## 8. Exemplos de resposta

Precisamos de **um exemplo real anonimizado** de cada endpoint — pode ser um
único registro, com nome, CPF/CNPJ e valores trocados por dados fictícios.

O que precisamos ver na estrutura:

- nomes exatos dos campos;
- tipos (número, texto, data);
- formato das **datas** (`2026-05-28`? `28/05/2026`? com fuso?);
- formato dos **valores** (número? texto com vírgula? centavos?);
- como vêm os **identificadores** de contrato, cliente, unidade e empreendimento;
- se há campos nulos e como aparecem.

Sem isso não conseguimos mapear campo a campo — e mapear por adivinhação é
exatamente o que produz indicador errado.

## 9. Dados disponíveis

Para cada item, precisamos saber **se está disponível pela API** e **em qual
endpoint**:

| Dado | Disponível? | Endpoint |
|---|---|---|
| Empresa | | |
| Empreendimento | | |
| Cliente | | |
| CPF/CNPJ do cliente | | |
| Contrato | | |
| Unidade | | |
| Título a receber | | |
| Parcela | | |
| Vencimento | | |
| Valor original | | |
| Saldo vencido | | |
| Saldo atualizado | | |
| Juros | | |
| Multa | | |
| Dias de atraso | | |
| Pagamentos | | |
| Saldo contratual | | |
| Carteira ativa exigível | | |
| Comissão | | |

## 10. Datas e regras de atualização

Este bloco é o que mais afeta a confiabilidade dos indicadores.

| # | O que precisamos | Por quê |
|---|---|---|
| 10.1 | A que **data** se referem os saldos devolvidos: hoje? fechamento do dia anterior? data informada? | Comparar posições de datas diferentes produz falsa divergência |
| 10.2 | É possível pedir a posição de uma **data específica** (retroativa)? | Para reconstruir histórico e recalcular fechamentos |
| 10.3 | Com que **frequência** os dados são atualizados no Sienge | Para definir a janela da carga diária |
| 10.4 | Existe **horário de fechamento** diário? | Ler antes do fechamento traz posição incompleta |
| 10.5 | Saldos já incluem **juros, multa e correção**, ou vêm separados? | Muda completamente a comparação com o Monday |
| 10.6 | Como aparecem **renegociação**, **acordo**, **distrato** e **retomada**? | O motor precisa saber para não classificar como divergência de valor |
| 10.7 | O que é considerado **carteira ativa exigível** no Sienge da Coevo? | É o denominador dos indicadores de inadimplência |

---

## Resumo do que travamos até responder

| Bloqueio | Efeito hoje |
|---|---|
| Endpoints não confirmados | Conector desligado; `/api/sienge/sync` recusa com motivo |
| Formato de resposta desconhecido | Nenhum mapeamento de campo foi escrito |
| Paginação desconhecida | Implementada como hipótese, não executada |
| Limite de requisições desconhecido | Configurado conservador (60/min) |
| Datas de referência desconhecidas | Comparação financeira classifica como "a validar", nunca como divergência confirmada |

**Nada disso impede o Monday de avançar.** As duas integrações são
independentes: o Monday pode entrar em homologação enquanto estas respostas não
chegam.

## Como responder

O mais prático é preencher as tabelas acima e devolver este arquivo. Se for mais
fácil, uma conversa de 30 minutos com quem administra o Sienge resolve os itens
1 a 7; os itens 8 a 10 exigem consultar a documentação ou o suporte.

Assim que as respostas chegarem, a confirmação é registrada endpoint por
endpoint em `POST /api/sienge/homologar`, com autoria e data — e só então a
ingestão destrava.
