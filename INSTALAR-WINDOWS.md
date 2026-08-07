# Instalar o Patrono em uma máquina Windows

Este guia instala a plataforma em um computador da Coevo. A partir daí ela roda
localmente, guarda os dados no próprio computador e abre no navegador.

**Importante saber antes de começar:** com esta instalação, os dados de clientes
reais — nome, CPF, contrato, inadimplência — passam a viver **neste computador**.
Se ele for roubado, formatado ou queimar, os dados vão junto. Por isso a seção
"Backup" abaixo não é opcional.

---

## 1. Instalar os dois programas de base

Ambos são instaladores comuns, do tipo avançar-avançar-concluir. Os dois pedem
permissão de administrador. Se o seu usuário não tiver, peça ao TI da Coevo.

### Node.js

1. Abra <https://nodejs.org>
2. Baixe a versão **LTS** (a que aparece à esquerda, recomendada)
3. Instale aceitando as opções padrão

### PostgreSQL 16

1. Abra <https://www.postgresql.org/download/windows/>
2. Baixe o instalador da versão **16**
3. Durante a instalação:
   - **Anote a senha do usuário `postgres`.** Você vai precisar dela no passo 2
     e não há como recuperá-la depois — só reinstalando.
   - Mantenha a porta **5432**
   - Na tela de senha, use **apenas letras e números** — símbolos como `@` e `:`
     têm significado dentro do endereço de conexão do banco
   - No final o *Stack Builder* abre sozinho: feche, não é necessário

Não é preciso mexer em variável de ambiente do Windows. O instalador do Patrono
procura o PostgreSQL nos lugares onde ele realmente se instala.

---

## 2. Instalar o Patrono

Extraia a pasta **fora do OneDrive** — por exemplo em `C:\Users\<seu usuário>\Patrono`.
Dentro do OneDrive, a sincronização dos milhares de arquivos da instalação deixa
tudo lento e chega a travar o instalador.

1. Abra a pasta do Patrono
2. Clique duas vezes em **`Instalar Patrono.bat`**
3. Informe a senha do `postgres` quando ele pedir
4. Informe o nome de usuário e a senha que você vai usar para entrar na
   plataforma

A senha da plataforma precisa de no mínimo 12 caracteres, com maiúscula,
minúscula, número e símbolo. Ela **não** é a mesma senha do `postgres`.

O instalador pode ser rodado de novo quantas vezes for preciso. Ele não apaga
nada: se o banco já existir, preserva; se o `.env` já existir, preserva.

---

## 3. Configurar as credenciais

Abra o arquivo `server\.env` no Bloco de Notas. Ele já foi criado pelo
instalador, com o banco de dados configurado. Falta preencher três blocos.

**Nenhum destes valores deve ser enviado por e-mail, WhatsApp ou chat.** Eles
ficam só neste arquivo, neste computador.

### Backup (obrigatório)

```
BACKUP_CHAVE=
```

Invente uma senha longa, de no mínimo 16 caracteres, e cole aqui. Ela cifra os
backups.

> **Guarde essa chave no cofre de senhas da Coevo antes de continuar.**
> Sem ela, os backups viram arquivos ilegíveis e não há recuperação possível —
> nem por mim, nem por ninguém. É a única coisa nesta instalação que não tem
> conserto se for perdida.

### Monday (para sincronizar os quadros)

```
MONDAY_TOKEN=
```

O token pessoal do Monday, sem aspas e sem os sinais `<` e `>`.

### Sienge (para os dados financeiros)

```
SIENGE_SUBDOMAIN=
SIENGE_USER=
SIENGE_PASSWORD=
SIENGE_HABILITADO=true
```

Depois de salvar o arquivo, feche e abra a plataforma de novo para as
credenciais valerem.

---

## 4. Usar

Clique duas vezes em **`Iniciar Patrono.bat`**. Uma janela preta abre e o
navegador vai para `http://localhost:3131`.

- **Enquanto a janela preta estiver aberta, a plataforma está no ar.**
- Fechar a janela desliga a plataforma. Nada se perde: os dados ficam guardados
  no PostgreSQL, que continua rodando sozinho.
- Para voltar, clique de novo em `Iniciar Patrono.bat`.

Se quiser um atalho na Área de Trabalho: clique com o botão direito em
`Iniciar Patrono.bat` → *Enviar para* → *Área de trabalho (criar atalho)*.

---

## 5. Backup

Com `BACKUP_CHAVE` preenchida, a plataforma gera backup automático todo dia às
3h da manhã, na pasta `Patrono-Backups` dentro da sua pasta de usuário.

**O backup automático não basta.** Ele está no mesmo disco que o banco: se o HD
falhar, os dois vão juntos. Configure um segundo destino em outro lugar — um
pendrive fixo, uma pasta de rede ou o OneDrive da empresa:

```
BACKUP_DIRETORIO_REDUNDANTE=D:/Patrono-Backups
```

A tela **Backup / Restaurar** dentro da plataforma mostra o estado dos backups e
avisa quando só existe um destino.

---

## 6. Quem mais pode acessar

Ninguém, por padrão. Esta instalação atende só este computador.

Isso é proposital: enquanto a plataforma estiver na máquina de uma pessoa, o
dado não circula. Quando o comitê precisar acessar de outros computadores, o
caminho é publicar em um servidor da Coevo — a plataforma é a mesma, muda só
onde roda.

---

## Se der errado

| Sintoma | O que fazer |
| --- | --- |
| "Node.js não encontrado" | Instale o Node.js e rode o instalador de novo |
| "PostgreSQL não encontrado" | Ele não foi instalado, ou foi instalado em pasta fora do padrão. Instale pelo link acima aceitando a pasta sugerida |
| Quero saber se já instalei | Clique em `Iniciar Patrono.bat`. Se abrir, está instalado; se avisar que falta, rode `Instalar Patrono.bat` |
| "Não consegui conectar com essa senha" | A senha do `postgres` está errada. Não é a senha do Windows nem a da plataforma |
| A página não abre | Espere uns 15 segundos e atualize. O servidor demora a subir na primeira vez |
| "Porta 3131 em uso" | Já existe uma janela do Patrono aberta. Use aquela, ou feche e comece de novo |
| Esqueci a senha da plataforma | Rode `Instalar Patrono.bat`; se não houver usuários, ele cria outro. Se houver, peça ajuda |

Para qualquer outro erro, tire uma foto da janela preta inteira — a mensagem de
erro fica nela.
