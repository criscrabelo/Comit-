# Roteiro do comitê — números reais da plataforma

**Data de referência:** 07/08/2026
**Origem dos dados:** Monday (7 quadros) e Sienge (somente leitura), carregados
pela própria plataforma. Nenhum número deste documento é demonstrativo.

Cada número abaixo pode ser reproduzido a partir do banco. Onde um número **não**
está aqui, é porque a regra que o define ainda está pendente — e isso também está
declarado, para que ninguém no comitê receba um número plausível e errado.

---

## 1. O que a plataforma já tem dentro

| Base | Registros | Fonte |
| --- | ---: | --- |
| Títulos a receber | 5.142 | Sienge |
| Clientes | 3.257 | Sienge |
| Parcelas dos inadimplentes | 47.162 | Sienge |
| Notificações a clientes | 1.072 | Monday |
| Honorários | 894 | Monday |
| Processos judiciais | 250 | Monday |
| Distratos, recompras e retomadas | 86 | Monday |
| Empreendimentos | 28 | Monday + Sienge |

**11.181 registros de negócio**, todos com procedência gravada: de qual fonte
vieram, em qual execução, em que data, e com o histórico de cada alteração.

---

## 2. Carteira

| Situação | Títulos | Valor nominal |
| --- | ---: | ---: |
| Em aberto | 3.835 | R$ 990.549.301 |
| Inadimplente | 1.022 | R$ 188.007.851 |
| Quitado | 285 | R$ 28.804.367 |

A situação é **factual**: vem das próprias marcações do Sienge, não de uma regra
que a plataforma inventou.

---

## 3. Inadimplência por faixa de atraso

Apurada sobre as parcelas **em aberto e vencidas** dos títulos inadimplentes.
Parcela quitada não conta; parcela a vencer não recebe faixa.

| Faixa | Parcelas | Clientes | Saldo vencido |
| --- | ---: | ---: | ---: |
| 1–30 dias | 243 | 190 | R$ 720.866 |
| 31–60 dias | 186 | 137 | R$ 806.678 |
| 61–90 dias | 170 | 125 | R$ 699.103 |
| 91–120 dias | 168 | 121 | R$ 314.488 |
| **> 120 dias** | **5.381** | **614** | **R$ 26.562.767** |
| **Total vencido** | **6.148** | | **R$ 29.103.903** |

**A leitura:** 91,3% do saldo vencido está acima de 120 dias. A inadimplência
da Coevo não é um problema de atraso recente — é um estoque antigo concentrado
em 614 clientes.

### Por que o percentual contra as metas não aparece

As metas de gestão são **até 4%** da carteira até 120 dias e **2% a 2,1%** acima
de 120 dias. Para calcular esses percentuais é preciso dividir pela **carteira
ativa exigível** — e o que é carteira ativa exigível no Sienge da Coevo ainda
não está definido como regra de negócio.

Dividir pelo total de títulos daria um número que parece certo e não é. A
metodologia exige informar o denominador; enquanto ele não existir, o percentual
fica de fora. **Essa é uma decisão que o comitê pode tomar hoje.**

### Alcance desta carga

Foram lidos **850 dos 1.022** títulos inadimplentes — a franquia diária da API
do Sienge (1.000 requisições) acabou antes. A leitura foi feita **em ordem de
maior valor primeiro**, então os 172 que faltam são a cauda de menor exposição.
Os 172 restantes entram na próxima carga.

---

## 4. Notificações a clientes

| Estágio | Quantidade |
| --- | ---: |
| Resolvida | 827 |
| Em andamento | 208 |
| Encerrada sem resolver | 37 |

"Encerrada" é o estágio criado para distratos, recompras e unidades a retomar:
o ciclo acabou, mas não porque o cliente se regularizou. Antes disso, esses
casos ficavam para sempre "em andamento" e inflavam o prazo médio.

### Prazo

- Notificações **resolvidas**: média de **20 dias** entre notificar e resolver
  (177 casos com as duas datas).
- Notificações **em andamento**: média de **359 dias** em aberto, a mais antiga
  há **1.466 dias** (4 anos).

| Tempo em aberto | Casos |
| --- | ---: |
| Até 30 dias | 43 |
| 31 a 90 dias | 12 |
| 91 a 180 dias | 30 |
| 181 a 365 dias | 32 |
| **Acima de 1 ano** | **82** |

**A leitura:** quando o processo funciona, resolve em 20 dias. O problema não é
o tempo de resposta — são os **82 casos parados há mais de um ano**, que
provavelmente já não são notificação, e sim outra coisa que nunca foi
reclassificada.

---

## 5. Recompras — o dado que faltava

Regra de negócio, como o jurídico a descreve: a recompra assume o financiamento
do cliente junto à Caixa, mas **a unidade só sai de fato quando há um novo
comprador**. Até lá o financiamento segue no nome do cliente original e o caso
continua sendo acompanhado.

Por isso "recompra realizada" **não** é "recompra encerrada".

### Em aberto hoje: 11 unidades

| Unidade | Solicitada em | Dias em aberto |
| --- | --- | ---: |
| 309 A | 01/03/2024 | **889** |
| 806 B | 01/08/2025 | 371 |
| 1302 B | 01/09/2025 | 340 |
| 304 C | 01/10/2025 | 310 |
| 302 A | 01/06/2026 | 67 |
| 501 B | 01/06/2026 | 67 |
| 105 C | 18/06/2026 | 50 |
| 001 A | 03/07/2026 | 35 |
| 010 C | 07/07/2026 | 31 |
| 1001 B | 08/07/2026 | 30 |
| 605 C | 08/07/2026 | 30 |

Média em aberto: **202 dias**. Máxima: **889 dias** (2 anos e 5 meses).

### Concluídas: quanto tempo levaram

| Unidade | Solicitada | Concluída | Dias |
| --- | --- | --- | ---: |
| 110 A | 01/05/2024 | 27/02/2026 | 667 |
| 105A | 02/12/2024 | 30/07/2026 | 605 |
| 1010 A | 08/07/2024 | 21/11/2025 | 501 |
| 602 A | 01/04/2024 | 09/05/2025 | 403 |
| 033 BELLA | 02/02/2024 | 16/08/2024 | 196 |

Média para concluir: **474 dias**.

**A leitura:** o ciclo de recompra da Coevo leva, historicamente, entre 6 meses
e 2 anos — exatamente o que o jurídico dizia por experiência, agora medido.
Com 474 dias de média histórica, as quatro unidades em aberto há mais de 300
dias estão dentro do padrão; **a 309 A, com 889 dias, está fora dele** e é a
única que pede explicação.

Outras 9 unidades constam como recusadas pelo cliente e não têm datas
registradas no Monday — não entram em nenhuma média.

---

## 6. Processos judiciais e honorários

| Item | Valor |
| --- | ---: |
| Processos | 250 |
| Valor de causa somado | R$ 15.213.838 |
| Honorários lançados | 894 |
| Valor de honorários | R$ 466.018 |

| Situação | Processos |
| --- | ---: |
| Acompanhando | 139 |
| Finalizado | 60 |
| Acordo | 44 |
| Recompra/acordo | 3 |
| Baixa definitiva | 3 |
| Arquivado provisoriamente | 1 |

### Por que a taxa de judicialização não aparece

Ela existe na plataforma, com política versionada e apuração auditável — mas a
política ainda está no estado **"proposta"**. Nenhum processo foi marcado como
judicializado porque **a regra que decide o que conta como judicialização ainda
não foi aprovada**.

Duas observações que o comitê precisa ouvir:

1. **Taxa de judicialização não é PDD contábil.** São coisas diferentes e não
   devem ser apresentadas como se fossem a mesma.
2. Aprovar a política é o desbloqueio de maior efeito hoje: é o que liga o
   indicador. A política aprovada fica imutável e versionada; mudar a regra no
   futuro cria uma nova versão, sem reescrever o passado.

---

## 7. O que a plataforma garante (e vale dizer ao comitê)

- **Nenhuma credencial no navegador ou no código.** Monday e Sienge são
  acessados pelo servidor, com credenciais em variáveis de ambiente.
- **Sienge é somente leitura.** A plataforma nunca escreve na fonte.
- **Falha de uma fonte não apaga o último dado válido.** Se a integração cair, o
  que já estava lá continua lá, com a data em que foi obtido.
- **Reprocessar cria nova versão**, não sobrescreve. Toda alteração relevante
  fica no histórico e no log de auditoria, que não aceita alteração nem exclusão.
- **Dados conflitantes são preservados**, não escolhidos em silêncio: vão para a
  Central de Inconsistências para decisão humana.
- **Indicadores de posição não são somados entre dias.**
- **421 testes automatizados** rodando contra PostgreSQL real, todos passando.

---

## 8. Decisões que dependem do comitê

Em ordem de efeito:

1. **Aprovar a política de judicialização** — liga o indicador de judicialização.
2. **Definir carteira ativa exigível** — liga os percentuais de inadimplência
   contra as metas de 4% e 2 a 2,1%.
3. **Confirmar o pareamento de empreendimentos** entre Monday e Sienge — 8 pares
   ambíguos e 9 sem par. Sem isso, os números não se consolidam por
   empreendimento.
4. **Decidir sobre CPF/CNPJ no Monday** — hoje o documento existe só no lado
   Sienge, o que limita o cruzamento automático entre as duas fontes.

---

## 9. Ressalvas honestas

- A carga de parcelas é **parcial** (850 de 1.022 títulos), por limite diário da
  API. Está declarado no relatório e a diferença é a cauda de menor valor.
- O campo `desfecho` dos distratos e recompras traz "SUCESSO" também em casos
  cujo andamento está marcado como "Em andamento" no Monday. **Esse campo ainda
  não foi homologado e não foi usado em nenhum número deste roteiro.** As
  contagens de recompra acima usam data de solicitação e data de conclusão, que
  foram conferidas registro a registro.
- 61 dos 86 distratos não têm desfecho preenchido na origem.

---

**Evidências:** `docs/evidencias/parcelas-sienge.md`,
`docs/evidencias/carga-sienge.md`, `docs/evidencias/cruzamento-monday-sienge.md`.
