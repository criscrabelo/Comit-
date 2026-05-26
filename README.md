# Plataforma de Comitês — Jurídico

## Como abrir
1. Clique duas vezes no arquivo `index.html`
2. Ele abre diretamente no navegador (Chrome, Edge ou Firefox)
3. Não precisa instalar nada

## Como usar

### Primeiro acesso
- Os dados do **Comitê de Abril 2026** já estão pré-carregados como demonstração
- Selecione o comitê no seletor da barra lateral esquerda

### Criar novo comitê mensal
1. Clique no botão **+ Mês** na barra lateral
2. Escolha o mês, ano e a data da apresentação
3. O sistema cria o comitê em branco e navega para o dashboard

### Cadastrar dados do mês
Use o menu lateral para acessar cada módulo:
- **📌 Fatos Relevantes** — eventos jurídicos por empreendimento
- **📨 Notificações** — notificações a clientes com controle de estágio
- **📄 Contratos** — contratos por tipo e empreendimento
- **🔁 Retomadas** — unidades retomadas com motivo e equipe
- **❌ Distratos** — distratos com tempo de ciclo
- **⚖️ Processos Judiciais** — externos e internos
- **🏦 Análise de Risco** — análise de contratos bancários (CCB, SFH)
- **📋 Temas Regulatórios** — alertas de prazo regulatório (NR-1, etc.)

### Gerar a apresentação para a diretoria
1. Clique em **📑 Gerar Comitê do Mês**
2. Você verá a prévia de todos os slides na tela
3. Pressione **Ctrl+P** (ou clique em 🖨️ Imprimir / PDF)
4. Selecione **"Salvar como PDF"** como destino
5. O PDF sai em formato A4 paisagem, pronto para apresentar

### Empreendimentos
- Acesse **🏗️ Empreendimentos** para cadastrar novos empreendimentos
- Os empreendimentos são a base para todos os outros módulos

### Unidades / Habite-se
- Acesse **🏠 Unidades / Habite-se** para controlar o cronograma de entrega
- Use **📥 Importar Lote** para colar dados em CSV:
  ```
  numero,prazo_habite_se,prazo_180,previsao_entrega
  101,2025-12-31,2026-06-29,2026-08-31
  ```

### Sincronizar com Monday.com
1. Na barra lateral, clique em **⚙️ Configurar Token**
2. Cole seu **token pessoal** do Monday.com (Perfil → Administração → API)
3. O ponto 🟠 na barra lateral fica 🟢 ao configurar corretamente
4. Selecione o mês desejado no seletor da barra lateral
5. Clique em **🔄 Sincronizar Monday** → **▶ Iniciar Sincronização**

**O que é sincronizado do Monday.com:**
| Módulo | Board Monday.com | Filtro |
|--------|-----------------|--------|
| ⚖️ Processos | (JUR) PROCESSOS JUDICIAIS | Todos (snapshot atual) |
| ❌ Distratos | (JUR) DISTRATOS E RETOMADAS | Criados no mês selecionado |
| 🔁 Retomadas | (JUR) DISTRATOS E RETOMADAS | Grupo "Retomadas", mês selecionado |
| 📨 Notificações | (JUR) NOTIFICAÇÕES | Data da notificação no mês |
| 🏠 Unidades | (JUR) CONTROLE CARPE DIEM | Todas as unidades vendidas |
| 📄 Contratos | (JUR) CONTRATOS PARA CLIENTES + (JUR) OBRA - CONTRATO DE PRESTAÇÃO DE SERVIÇO + (JUR) CONTRATO DE SCP/SPE | Data de Solicitação no mês selecionado |

> ⚠️ **Fatos Relevantes**, Análise de Risco e Temas Regulatórios são inseridos manualmente — não são sobrescritos pela sincronização.

### Backup
- Acesse **💾 Backup / Restaurar**
- Clique em **⬇️ Baixar Backup JSON** para salvar todos os dados
- Salve o arquivo periodicamente para não perder dados
- Para restaurar, use **⬆️ Restaurar Dados**

## Onde os dados ficam
Os dados ficam no `localStorage` do navegador, no mesmo computador.
Faça backup JSON regularmente para segurança.

## Suporte
Plataforma desenvolvida especificamente para o Departamento Jurídico — Grupo Patrono.
