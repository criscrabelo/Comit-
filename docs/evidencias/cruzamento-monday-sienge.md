# Cruzamento Monday × Sienge — diagnóstico e proposta de mapa

**Executado em:** 2026-08-07T14:26:38.002Z  
**Requisições de rede:** 0 — tudo local, sobre os dados já carregados.

> Este documento **não cruza nada**. Ele mede as chaves disponíveis e
> propõe a correspondência de empreendimentos, que é o pré-requisito.
> Nada aqui foi aplicado.

## 1. Que chave existe, de fato, nos dois lados

| Chave | Monday | Sienge | Serve? |
| --- | --- | --- | --- |
| **CPF/CNPJ** | **0** de 1072 notificações | 3243 de 3257 clientes | ❌ **só um lado tem** |
| Contrato | não mapeado nos quadros | não exposto nos títulos | ❌ |
| Unidade | 1072 de 1072 notificações · 86 de 86 distratos | 4210 de 5142 títulos | ✅ **os dois lados** |
| Empreendimento | 1072 de 1072 · 249 de 250 processos | por nome, com sufixo de centro de custo | ⚠️ **precisa de mapa** |
| Nome | presente | presente | ⚠️ último recurso, nunca automático |

**O achado que decide o desenho:** o CPF/CNPJ — a chave preferencial da
metodologia — **existe só no Sienge**. Nenhum dos 7 quadros do Monday traz
documento, e a varredura dos payloads brutos confirma: nenhum campo de CPF.

Sobra `empreendimento + unidade`, que os dois lados têm. Mas o Sienge nomeia
o empreendimento por centro de custo, e o Monday por ativo — daí a seção 2.

## 2. Proposta de correspondência de empreendimentos

O Sienge tem **570 registros** de empreendimento porque separa o mesmo ativo
em centros de custo (`- OBRA`, `- VENDAS`, `- ADMINISTRATIVO`…). Removendo
esse sufixo, o núcleo do nome passa a ser comparável com o do Monday.

Só dois critérios foram usados: **núcleo idêntico** e **prefixo em fronteira
de palavra** (`ALAMEDA` ⊂ `ALAMEDA DAS CASTANHEIRAS`). Similaridade difusa
ficou de fora de propósito — ela produz par plausível e errado.

### Correspondência única — 11 empreendimento(s)

| Monday | Sienge (centros de custo) | Correspondência | Títulos |
| --- | --- | --- | ---: |
| **IPÊ 2** | IPE 2 · IPE 2 - ADMINISTRATIVO · IPE 2 - DESENVOLVIMENTO IMOBILIÁRIO | exata | 1 |
| **ALENCAR MAZZEO** | ALENCAR MAZZEO SPE - APT | prefixo | — |
| **BELLA VIDA** | BELLA VIDA · BELLA VIDA - ADMINISTRATIVO · BELLA VIDA - COMERCIAL … +4 | exata | — |
| **CARPE DIEM** | CARPE DIEM - OBRA | exata | — |
| **COEVO** | COEVO | exata | — |
| **COEVO E CONELESTE** | COEVO | prefixo | — |
| **CONTEMPORANEO** | CONTEMPORÂNEO | exata | — |
| **GRAN PARK** | GRAN PARK · GRAN PARK  - OBRA · GRAN PARK -  ADMINISTRATIVO … +5 | exata | — |
| **MORATTA** | MORATTA · MORATTA - ADMINISTRATIVO · MORATTA - COMERCIAL … +5 | exata | — |
| **PADRE EUGÊNIO** | PADRE EUGÊNIO SPE - APT | prefixo | — |
| **SAN MARINO** | SAN MARINO SPE - APT | prefixo | — |

### ⚠️ Ambíguos — 8: o nome casa com mais de um ativo

| Monday | Sienge (centros de custo) | Correspondência | Títulos |
| --- | --- | --- | ---: |
| **AURORA** | AURORA - PERSONALIZAÇÃO - TORRE A · AURORA - PERSONALIZAÇÃO - TORRE B · AURORA RESIDENCE - ADMINISTRATIVO … +10 | prefixo | 900 |
| **VITA VILLAGE** | VITA VILLAGE - EXPERIENCE · VITA VILLAGE - PERMUTA · VITA VILLAGE - SALDOS … +10 | prefixo | 370 |
| **HORIZONTES** | HORIZONTES CONDOMINIO CLUBE - CONFISSÃO DE DÍVIDAS · HORIZONTES CONDOMÍNIO CLUB - VENDAS · HORIZONTES CONDOMÍNIO CLUBE … +1 | prefixo | 158 |
| **JARDIM ANA MARIA** | JARDIM ANA MARIA CLUBE · JARDIM ANA MARIA CLUBE - ADMINISTRATIVO · JARDIM ANA MARIA CLUBE - COMERCIAL … +5 | prefixo | 1 |
| **ALAMEDA** | ALAMEDA DAS CASTANHEIRAS -  VENDAS · ALAMEDA DAS CASTANHEIRAS - ADMINISTRATIVO · ALAMEDA DAS CASTANHEIRAS - COMERCIAL … +5 | prefixo | — |
| **JARDIM PAULISTA** | JARDIM PAULISTA - FIORI · JARDIM PAULISTA SPE - APT | prefixo | — |
| **SIETE** | SIETE RESIDENCE · SIETE RESIDENCE - MARKETING · SIETE RESIDENCE - VENDAS … +1 | prefixo | — |
| **VERANO** | VERANO RESIDENCIAL · VERANO RESIDENCIAL - ADMINISTRATIVO · VERANO RESIDENCIAL - COMERCIAL … +11 | prefixo | — |

### Sem correspondência — 9

- A6D
- CASABELA
- FGV
- IPÊ
- JS
- MORADAS PARATY
- PARATY
- VITOR
- VSR

> Podem ser ativos que não existem no Sienge, grafias divergentes, ou
> nomes que o Monday usa e a contabilidade não. Cada um precisa de
> resposta humana — presumir aqui contaminaria todo o cruzamento.

## 3. O que falta decidir antes de cruzar

1. **Aprovar ou corrigir o mapa da seção 2.** É o pré-requisito: sem ele,
   `empreendimento + unidade` não é chave, porque os dois lados chamam o
   mesmo ativo de nomes diferentes.
2. **Decidir o que fazer sobre o CPF/CNPJ ausente no Monday.** Duas saídas:
   incluir a coluna nos quadros (a plataforma passa a lê-la sozinha, como
   já faz com as outras), ou aceitar que o vínculo por pessoa fica
   indisponível e cruzar só por unidade.

Enquanto isso não for decidido, **nenhum vínculo é criado** — que é o
comportamento correto: vínculo errado contamina indicador e é difícil de
desfazer depois.

