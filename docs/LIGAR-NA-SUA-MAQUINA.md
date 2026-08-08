# Ligar a plataforma nova na sua máquina

A plataforma roda da sua máquina, não em nuvem. Este documento é o roteiro para
ligar a versão nova — a que guarda os dados no PostgreSQL, exige login e tem a
integração com o Monday.

**Resumo:** rode `Preparar Plataforma (Primeira Vez).bat` uma vez, e depois
`Iniciar Plataforma.bat` no dia a dia. O resto deste documento explica o que
esses scripts fazem, o que só você pode fazer, e o que dá errado se pular etapa.

---

## 1. O que muda em relação a hoje

| | Hoje (o que está no ar) | Depois |
| --- | --- | --- |
| Quem serve a plataforma | `server.js` | `server/` (backend novo) |
| Onde os dados ficam | `db.json` + navegador | PostgreSQL na sua máquina |
| Login | não existe | **obrigatório**, um usuário por pessoa |
| Porta | 3131 | 3131 — **a mesma** |
| Monday | token no navegador | token só no servidor |

A porta não muda, então `Liberar Firewall (Admin).bat` e o acesso pelo IP da sua
máquina continuam funcionando igual.

**O `server.js` antigo deixa de ser usado.** O backend novo serve a interface
também — por isso os `.bat` foram atualizados para iniciá-lo. Nesta versão,
iniciar o `server.js` daria plataforma quebrada: a interface já foi convertida
para falar com a API nova.

---

## 2. Antes de começar — o que só você pode fazer

**1. Instalar o PostgreSQL 16+** em <https://www.postgresql.org/download/windows/>.
Na instalação, **anote a senha do usuário `postgres`**. Se ele já estiver
instalado, confira se a pasta `bin` está no PATH (algo como
`C:\Program Files\PostgreSQL\16\bin`) — o script avisa se não estiver.

**2. Criar o banco**, uma vez, no terminal:

```
createdb -U postgres patrono
```

**3. Gerar o token do Monday** em *Perfil → Developers → My Access Tokens* e
colar em `server\.env`, **sem `<` `>` em volta**. O token que está no ambiente
hoje foi rejeitado pelo Monday (`401`) — provavelmente foi regenerado depois, o
que invalida o anterior.

Nada disso eu consigo fazer por você: é senha de instalação, banco na sua
máquina e credencial da sua conta.

---

## 3. Preparar (uma vez)

Duplo clique em **`Preparar Plataforma (Primeira Vez).bat`**. Ele:

1. confere Node e PostgreSQL, e **para com instrução clara** se faltar algum;
2. cria `server\.env` a partir do modelo e abre no Notepad para você preencher;
3. instala as dependências;
4. cria a estrutura do banco (17 migrações);
5. cadastra o seu usuário — a senha é digitada oculta e **não** fica no
   histórico do terminal.

O `server\.env` precisa de duas linhas preenchidas:

```
DATABASE_URL=postgres://postgres:SUA_SENHA@localhost:5432/patrono
MONDAY_TOKEN=COLE_AQUI_O_TOKEN_SEM_SINAIS_EM_VOLTA
```

O token do Monday é uma sequência longa, com pontos, começando por `eyJ`. Cole-a
inteira, sem `<` `>` e sem aspas.

---

## 4. Seus dados atuais — a parte que exige atenção

Os dados de hoje estão **no navegador** (localStorage), e o `db.json` é uma
cópia deles. A plataforma nova guarda tudo no PostgreSQL.

Na primeira vez que você entrar, a tela oferece a migração. Duas condições:

- faça **no mesmo navegador e no mesmo perfil** que você usa hoje — é de lá que
  os dados saem;
- a migração **não apaga** o que está no navegador. A remoção é um passo
  separado, depois de você conferir que está tudo certo no banco.

Se abrir a plataforma nova em outro computador antes de migrar, ela vai aparecer
vazia — não porque os dados sumiram, mas porque estão no navegador da outra
máquina.

---

## 5. Usar no dia a dia

**`Iniciar Plataforma.bat`** — abre em <http://localhost:3131>, e as outras
máquinas da rede acessam pelo IP desta (o script mostra o IP). Mantenha a janela
aberta.

**`Iniciar e Compartilhar.bat`** — cria o link público via Cloudflare, como
antes. Quem receber o link **precisa de usuário e senha**: a plataforma agora
exige login, e cada pessoa entra com o seu.

### Por que os dois scripts rodam em modos diferentes

Não é descuido, e vale saber caso alguém mexa neles:

O cookie de sessão recebe a marca `Secure` em modo produção, e o navegador então
só o envia por HTTPS. O acesso na rede local é por `http://` sem certificado —
com `Secure`, o navegador descartaria o cookie e **o login pareceria quebrado
sem nenhuma mensagem de erro**. Por isso:

- **rede local** (`Iniciar Plataforma.bat`): modo desenvolvimento, cookie sem
  `Secure`, login funciona por `http://`;
- **link público** (`Iniciar e Compartilhar.bat`): modo produção, cookie com
  `Secure`, e o Cloudflare entrega HTTPS de verdade.

No script compartilhado o túnel sobe **antes** do servidor. Em produção a
plataforma exige a lista de origens permitidas, e a origem é o endereço do
túnel — que só existe depois que o túnel sobe. Inverter a ordem obrigaria a
reiniciar o servidor a cada vez.

---

## 6. Ligar a integração com o Monday

Com a plataforma no ar e o token válido em `server\.env`, a integração liga
sozinha na primeira verificação: a tela de administração chama
`POST /api/monday/testar`, e ela grava `habilitada = true` **somente se o token
autenticar de verdade**.

Repare no desenho: **não existe liga manual.** Não dá para ligar a integração
com credencial quebrada, e isso é de propósito — uma integração marcada como
ligada, sem conseguir ler, produziria painel silenciosamente velho.

A integração é **somente leitura**. A trava vive no transporte: qualquer caminho
que chegue ao Monday passa por ela, e nenhum consegue escrever. Detalhe em
[`HOMOLOGACAO-MONDAY.md`](HOMOLOGACAO-MONDAY.md) §3.

### O que ainda depende de decisão sua

- **Taxa de judicialização:** os 6 rótulos reais de situação do board não casam
  com nenhuma regra atual, e os 250 processos estão marcados como "revisão
  necessária". A taxa fica indisponível até você aprovar as regras —
  [`HOMOLOGACAO-MONDAY.md`](HOMOLOGACAO-MONDAY.md) §5.
- **Quadros novos** (Projetos de TI, Transferência Intermediada): sem id, sem
  colunas e sem destino definido —
  [`HOMOLOGACAO-QUADROS-NOVOS.md`](HOMOLOGACAO-QUADROS-NOVOS.md).

---

## 7. Quando algo não subir

| Sintoma | Causa provável |
| --- | --- |
| "Falta preparar esta maquina" | rode `Preparar Plataforma (Primeira Vez).bat` |
| Falha nas migrações | o banco da `DATABASE_URL` não existe: `createdb -U postgres patrono` |
| "Banco de dados inacessivel" | PostgreSQL parado, ou senha errada na `DATABASE_URL` |
| Login não entra, sem erro | modo produção em acesso `http://` — use `Iniciar Plataforma.bat` |
| Monday responde 401 | token inválido ou regenerado; gere outro e cole sem `< >` |
| "MONDAY_TOKEN tem delimitadores" | tire o `<` e o `>` do valor no `.env` |
| Outra máquina não abre | rode `Liberar Firewall (Admin).bat` |

---

## 8. O que foi testado, e o que não foi

**Testado de verdade, nesta sessão, contra PostgreSQL real:** as 17 migrações
pelo caminho de produção (`npm run migrate:up`) em banco novo; a criação do
primeiro usuário; a subida do servidor servindo a interface e a API; o login
real devolvendo cookie de sessão; e o modo produção recusando subir sem a lista
de origens. Suíte completa: 358 testes.

**Não testado:** os arquivos `.bat` em si. Este ambiente é Linux — não há como
executar batch do Windows aqui. Os comandos que eles chamam foram todos
verificados um a um; a sintaxe do batch, não. Se algum deles falhar na primeira
vez, é aí que a causa provavelmente está.

**Um defeito encontrado no caminho:** `npm run migrate:up` — o comando que o
README manda usar em produção — **falhava em banco novo**. As migrações 014 e
015 foram deliberadamente separadas porque o PostgreSQL não permite usar um
valor de enum na mesma transação em que ele foi criado; só que o
`node-pg-migrate` envolve a execução inteira numa transação única por padrão, e
isso anulava a separação. O erro era
`unsafe use of new value "sistema" of enum type modulo_plataforma`.

Nunca havia aparecido porque os testes usam outro caminho (`recriar-banco.sh`,
que aplica cada arquivo em transação própria) e em banco já migrado não há o que
aplicar. Ele só aparece em **banco novo** — que é exatamente o primeiro contato
de quem vai instalar. Corrigido, e com teste que reprova sem a correção.
