# -*- coding: utf-8 -*-
"""Gera as planilhas de Orcamento Planejado x Realizado 2026.

Produz uma planilha por departamento (Juridico e TI) e o consolidado.
"""

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule

OUT = "/home/user/Comit-/orcamento/Orcamento_Planejado_x_Realizado_2026.xlsx"

MESES = ["Jan/26", "Fev/26", "Mar/26", "Abr/26", "Mai/26", "Jun/26",
         "Jul/26", "Ago/26", "Set/26", "Out/26", "Nov/26", "Dez/26"]

NM = len(MESES)          # numero de meses
M0 = 8                   # primeira coluna de mes (H)
MZ = M0 + NM - 1         # ultima coluna de mes
C_TOT = MZ + 1           # coluna do total
L_M0 = "H"
L_MZ = "S"               # ultima coluna de mes com 12 meses
L_TOT = "T"              # coluna do total

# Paleta
AZUL = "1F3864"
AZUL_MED = "2E5395"
CINZA_H = "D9E1F2"
CINZA_L = "F2F2F2"
INPUT_BG = "FFF7DC"
VERDE = "E2EFDA"
LARANJA = "FCE4D6"
BRANCO = "FFFFFF"

MOEDA = 'R$ #,##0.00'
PCT = '0.0%'

thin = Side(style="thin", color="BFBFBF")
BORDA = Border(left=thin, right=thin, top=thin, bottom=thin)

# ---------------------------------------------------------------------------
# Dados do planejado (base jan-dez/2026 = 12 meses)
# ID, Depto, Bloco, Descricao, Detalhe, Vinculo, Plano de contas, [12 valores]
#
# A base de 12 meses reconcilia os totais digitados a mao na ficha original:
# Vinicius R$ 64.998,30 (5.416,525 x 12), Elias R$ 12.780 (1.065 x 12) e
# Jonathan R$ 90.000 (10.000 x 9, entrada em abril). Somados dao exatamente
# os R$ 167.778,30 da ficha.
# ---------------------------------------------------------------------------
V = 4825.515
VIN = 5416.525          # envelope de custo total do Vinicius
_12 = lambda v: [v] * 12

LINHAS = [
    # JURIDICO - EQUIPE
    ("JUR-E01", "Jurídico", "Equipe", "Miguel Clepf", "Advogado Júnior", "PJ",
     "Pessoal - PJ", _12(10000.00)),
    # Planejado = o valor orcado na ficha (custo total com encargos e beneficios).
    # O realizado tem que ser lancado na mesma base, senao a comparacao mistura
    # custo total com salario bruto e inventa economia.
    ("JUR-E02", "Jurídico", "Equipe", "Geovanna",
     "Analista Administrativo — orçada pelo custo total (encargos de folha + benefícios). "
     "Salário bruto informado: R$ 2.886,91/mês",
     "CLT", "Pessoal - CLT", _12(V)),
    # Reajuste permanente de R$ 500 confirmado pela gestora. Mantido em R$ 5.000
    # nos meses já realizados para o desvio ficar visível; revisado de out em diante.
    ("JUR-E03", "Jurídico", "Equipe", "Thamar Victória",
     "Advogada — reajuste permanente de R$ 5.000 para R$ 5.500 (revisado a partir de out/26)",
     "PJ", "Pessoal - PJ", [5000.00] * 9 + [5500.00] * 3),
    # JURIDICO - DESPESAS
    ("JUR-D01", "Jurídico", "Despesas", "JUSFY",
     "Fase de teste com objetivo de eliminar o Astrea", "",
     "Licenças de Softwares", _12(100.00)),
    ("JUR-D02", "Jurídico", "Despesas", "JUSBRASIL", "", "",
     "Licenças de Softwares", _12(104.90)),
    ("JUR-D03", "Jurídico", "Despesas", "ASTREA",
     "Cancelado — realizado zerado desde mai/26", "",
     "Licenças de Softwares", _12(112.07)),
    ("JUR-D04", "Jurídico", "Despesas", "LEME", "", "",
     "Licenças de Softwares", _12(1030.00)),
    ("JUR-D05", "Jurídico", "Despesas", "Cursos / Eventos / Network", "", "",
     "Custeio de Treinamento", _12(1000.00)),
    ("JUR-D06", "Jurídico", "Despesas",
     "Bonificações trimestrais/semestrais do time",
     "Participação em projetos e atingimento de resultados — CONFIRMAR se houve "
     "parcela no 1º quadrimestre",
     "", "Prêmios", [0] * 7 + [10293.60] + [0] * 3 + [12867.00]),
    # TI - EQUIPE
    # Envelope de custo total fixo em R$ 5.416,525/mes x 12 = R$ 64.998,30, exatamente
    # o total digitado a mao na ficha original. O aumento de 05/08 (bruto de 2.570,52
    # para 3.070,52) e absorvido pela folga: o planejado de encargos e o residuo.
    ("TI-E01", "TI", "Equipe", "Vinicius Di Franco",
     "Analista Administrativo — orçado pelo custo total (encargos de folha + benefícios). "
     "Salário bruto: R$ 2.570,52/mês até jul/26 e R$ 3.070,52 a partir de 05/08/26, "
     "aumento absorvido pela folga do envelope",
     "CLT", "Pessoal - CLT", _12(VIN)),
    ("TI-E02", "TI", "Equipe", "Elias Benedito", "Suporte Técnico Terceirizado", "PJ",
     "Pessoal - PJ", _12(1065.00)),
    # 9 meses (abr-dez) = R$ 90.000, o total da ficha original.
    ("TI-E03", "TI", "Equipe", "Jonathan",
     "Consultor — entrada em abr/26 (9 meses), conforme o total da ficha original",
     "PJ", "Pessoal - PJ", [0] * 3 + [10000.00] * 9),
    # TI - DESPESAS
    ("TI-D01", "TI", "Despesas", "Peças de Manutenção",
     "Tela, teclado, carcaça, mouses de reposição, carregadores etc.", "",
     "Equipamentos Eletrônicos Diversos", _12(810.00)),
    ("TI-D02", "TI", "Despesas", "Backup em Nuvem",
     "Serviço de backup em nuvem para servidor — RATEIO A DEFINIR", "",
     "Licenças de Softwares", _12(825.00)),
    ("TI-D03", "TI", "Despesas", "Inteligência Artificial (Adapta)",
     "Plataforma de IA para utilização de agentes — RATEIO A DEFINIR", "",
     "Licenças de Softwares", [1300.00] * 6 + [1600.00] * 6),
    ("TI-D04", "TI", "Despesas", "Antivírus",
     "Proteção para equipamentos — RATEIO A DEFINIR", "",
     "Licenças de Softwares", _12(240.00)),
    ("TI-D05", "TI", "Despesas", "Pacote Office 365",
     "Licenças de software (conferir nº de licenças x usuários) — RATEIO A DEFINIR", "",
     "Licenças de Softwares", _12(375.00)),
    ("TI-D06", "TI", "Despesas", "Projeto Melhoria de Infraestrutura - Sala de Reunião",
     "Cadeiras, cafeteira, copos, canetas, blocos personalizados, câmeras, microfones etc.", "",
     "Móveis e Utensílios", _12(2800.00)),
    ("TI-D07", "TI", "Despesas", "Cursos e Treinamentos", "", "",
     "Custeio de Treinamento", _12(200.00)),
    ("TI-D08", "TI", "Despesas", "Aplicativo de Gravação de Reunião", "", "",
     "Licenças de Softwares", _12(220.00)),
    ("TI-D09", "TI", "Despesas", "Bonificação do time",
     "Cumprimento de prazos e participação em projetos — CONFIRMAR se houve "
     "parcela no 1º quadrimestre",
     "", "Prêmios", [0] * 7 + [2400.00] + [0] * 3 + [3600.00]),
]

# ---------------------------------------------------------------------------
# Realizado do Juridico informado pela gestora (05/08/2026).
# Lancado apenas em mai, jun e jul/26 — os tres meses efetivamente fechados.
# Ago em diante fica em branco ate o mes fechar. None = sem lancamento.
# ---------------------------------------------------------------------------
FONTE_JUR = "Gestora, 05/08/26"
# mai, jun e jul sao os indices 4, 5 e 6 na base de 12 meses.
# Jan a abr ficam em branco: nao foram informados.
_r3 = lambda v: [None] * 4 + [v] * 3 + [None] * 5

REALIZADO = {
    "JUR-E01": (_r3(8818.00), FONTE_JUR, "Valor cheio da nota — R$ 1.182/mês abaixo do contratado"),
    # Bruto informado (R$ 2.886,91) nao e lancavel contra um orcado de custo total:
    # lancar so ele produziria economia de R$ 1.938,61/mes que nao existe.
    "JUR-E02": ([None] * 12, "",
                "PREENCHER com o CUSTO TOTAL. Bruto informado: R$ 2.886,91/mês — "
                "faltam encargos e benefícios"),
    "JUR-E03": (_r3(5500.00), FONTE_JUR, "Reajuste permanente aplicado desde mai/26"),
    "JUR-D01": (_r3(0.00), FONTE_JUR, "Ainda não iniciado — sem cobrança"),
    "JUR-D02": (_r3(136.00), FONTE_JUR, "Acima do orçado (R$ 104,90) — conferir contrato"),
    "JUR-D03": (_r3(0.00), FONTE_JUR, "Cancelado — sem cobrança"),
    "JUR-D04": (_r3(970.00), FONTE_JUR, ""),
    "JUR-D05": (_r3(0.00), FONTE_JUR, "Sem gasto no período"),
    "JUR-D06": ([None] * 12, "", "Bonificação de ago/26 a confirmar"),
    # Equipe de TI — informado pela gestora em 05/08/26. Despesas ainda pendentes.
    "TI-E01": ([None] * 12, "",
               "PREENCHER com o CUSTO TOTAL. Bruto: R$ 2.570,52/mês até jul e "
               "R$ 3.070,52 de ago — faltam encargos e benefícios"),
    "TI-E02": (_r3(0.00), FONTE_JUR, "Sem acionamento no período — confirmar se o contrato segue ativo"),
    "TI-E03": (_r3(6300.00), FONTE_JUR, "R$ 3.700/mês abaixo do contratado — confirmar escopo"),
}

PLANOS = [
    "Pessoal - CLT",
    "Pessoal - PJ",
    "Licenças de Softwares",
    "Custeio de Treinamento",
    "Prêmios",
    "Equipamentos Eletrônicos Diversos",
    "Móveis e Utensílios",
]

HDR_ROW = 4          # linha do cabecalho nas abas de dados
FIRST = 5            # primeira linha de dados
LAST = FIRST + len(LINHAS) - 1
TOT_ROW = LAST + 1


def titulo(ws, texto, sub, ncols):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    c = ws.cell(row=1, column=1, value=texto)
    c.font = Font(bold=True, size=15, color=BRANCO)
    c.fill = PatternFill("solid", fgColor=AZUL)
    c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 30
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ncols)
    c2 = ws.cell(row=2, column=2 - 1, value=sub)
    c2.font = Font(size=9, italic=True, color="595959")
    c2.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[2].height = 18


def header(ws, row, labels, fill=AZUL_MED):
    for i, lab in enumerate(labels, start=1):
        c = ws.cell(row=row, column=i, value=lab)
        c.font = Font(bold=True, size=9, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=fill)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDA
    ws.row_dimensions[row].height = 30


def widths(ws, mapping):
    for col, w in mapping.items():
        ws.column_dimensions[col].width = w



# ---------------------------------------------------------------------------
# Geracao. DEPTO=None produz o consolidado; "Jurídico"/"TI" produzem a planilha
# de um departamento so, com o Painel, o resumo por plano de contas e a
# evolucao mensal reduzidos aquele departamento.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Pendencias. Ultimo campo = departamento; "" vale para os dois e aparece nas
# duas planilhas.
# (#, Tema, Em aberto, Impacto, Responsavel, Status, Departamento)
# ---------------------------------------------------------------------------
PEND = [
    ("A", "Custo total da Geovanna — A LANÇAR",
     "O planejado dela é R$ 4.825,52/mês, que é o custo total orçado na ficha "
     "(salário + encargos de folha + benefícios). O dado disponível hoje é só o "
     "salário bruto, R$ 2.886,91/mês. O realizado está em branco.",
     "Lançar só o bruto contra um orçado de custo total mostraria economia de "
     "R$ 1.938,61/mês que não existe. Peça ao RH o custo total mensal dela, ou o "
     "bruto mais os encargos para somar antes de lançar.",
     "Cristiane + RH", "A LANÇAR", "Jurídico"),
    ("B", "Custo total do Vinicius — A LANÇAR",
     "Mesmo caso da Geovanna. O planejado é R$ 5.416,525/mês (custo total). Brutos "
     "confirmados: R$ 2.570,52 até jul/26 e R$ 3.070,52 a partir de 05/08/26 — o "
     "aumento é absorvido pela folga do envelope, que já previa reajuste, então o "
     "orçado não muda. O realizado está em branco.",
     "A folga do orçado NÃO é economia estrutural. Com o bruto de agosto, sobram "
     "R$ 2.346,01 para encargos, o que equivale a 76% sobre o bruto — dentro da "
     "faixa normal (67% a 80%), então pode sobrar ou estourar. Só o custo total "
     "real vai dizer.",
     "Cristiane + RH", "A LANÇAR", "TI"),
    ("C", "Reajuste da Thamar — revisão orçamentária",
     "Reajuste permanente de R$ 5.000 para R$ 5.500/mês, em vigor desde mai/26. "
     "O planejado foi mantido em R$ 5.000 nos meses já realizados (para o desvio "
     "ficar visível) e revisado para R$ 5.500 de out a dez.",
     "Desvio já incorrido de R$ 500/mês. Ao contrário do aumento do Vinicius, "
     "este estourou o orçado: não havia folga na linha dela.",
     "Cristiane", "APLICADO", "Jurídico"),
    ("D", "Jusbrasil 30% acima do orçado",
     "Orçado R$ 104,90/mês, realizado R$ 136,00/mês em mai, jun e jul.",
     "Menor desvio em reais (R$ 31,10/mês), mas o maior em percentual. "
     "Vale conferir se houve reajuste contratual ou mudança de plano.",
     "Cristiane", "EM ABERTO", "Jurídico"),
    ("E", "Bonificação de ago/26 do Jurídico",
     "Estão orçados R$ 10.293,60 em agosto e R$ 12.867,00 em dezembro. "
     "O realizado de agosto ainda não foi informado.",
     "É a maior despesa isolada do Jurídico no segundo semestre.",
     "Cristiane", "EM ABERTO", "Jurídico"),
    ("F", "Jonathan R$ 3.700/mês abaixo do contratado",
     "Orçado R$ 10.000/mês, realizado R$ 6.300/mês em mai, jun e jul.",
     "Maior desvio em reais de todo o orçamento: R$ 11.100 em três meses. "
     "Se o valor menor for o novo padrão, o planejado de ago a dez deve ser "
     "revisado para baixo — sobrariam R$ 18.500 no orçamento do TI.",
     "Cristiane", "EM ABERTO", "TI"),
    ("G", "Elias Benedito zerado nos três meses",
     "Orçado R$ 1.065/mês como suporte técnico terceirizado, realizado R$ 0 "
     "em mai, jun e jul.",
     "Confirmar se o contrato segue ativo (acionamento sob demanda) ou se foi "
     "encerrado. Se encerrado, são R$ 12.780 a liberar no orçamento do ano.",
     "Cristiane", "EM ABERTO", "TI"),
    ("H", "Planejado de jan a abr — CONFERIR",
     "O 1º quadrimestre foi preenchido replicando os valores mensais conhecidos, "
     "porque a ficha original só trazia o grid de mai a dez. Exceções tratadas: "
     "Jonathan começa em abr, Thamar a R$ 5.000 (pré-reajuste), Vinicius com bruto "
     "de R$ 2.570,52 e Adapta a R$ 1.300 (valor até jun).",
     "Se algum contrato tinha valor diferente no 1º quadrimestre, ou se houve "
     "bonificação nesse período, o planejado de jan a abr precisa ser corrigido "
     "antes de comparar com o realizado.",
     "Cristiane", "CONFERIR", ""),
    ("I", "Realizado de jan a abr — A LANÇAR",
     "As colunas de jan a abr estão em branco na aba Realizado. Só mai, jun e jul "
     "foram informados.",
     "São 4 dos 7 meses já fechados do ano. Sem eles o acumulado e o Painel "
     "refletem menos da metade do período decorrido.",
     "Cristiane", "A LANÇAR", ""),
    ("J", "Despesas do TI — A LANÇAR",
     "As 9 linhas de despesas do TI (peças, backup, Adapta, antivírus, Office, "
     "sala de reunião, cursos, app de gravação e bonificação) não têm lançamento "
     "em nenhum mês.",
     "São R$ 89.040 orçados no ano, 35% do orçamento do TI. Sem lançamento, o "
     "departamento aparece com desvio negativo que é ausência de dado.",
     "Cristiane", "A LANÇAR", "TI"),
    ("1", "Base de meses — reconciliada com a ficha original",
     "A ficha trazia a coluna TOTAL do TI digitada à mão em bases diferentes por "
     "pessoa (Vinicius e Elias em 12 meses, Jonathan em 9) enquanto o grid mensal "
     "tinha só 8 colunas. Com o período em jan–dez os três totais batem exatamente: "
     "R$ 64.998,30 + R$ 12.780,00 + R$ 90.000,00 = R$ 167.778,30, o valor da ficha. "
     "Não era erro de digitação — era o grid que estava incompleto.",
     "Equipe de TI no valor original de R$ 167.778,30. Jonathan lançado com "
     "entrada em abr/26 (9 meses), que é o que explica os R$ 90.000.",
     "Cristiane", "RESOLVIDO", "TI"),
    ("2", "Origem do valor realizado",
     "Ainda não definido se o realizado virá de lançamento manual, de relatório do "
     "financeiro/ERP por centro de custo, ou misto. Até aqui os números vieram "
     "informados pela gestora.",
     "Sem fonte definida o realizado pode divergir da contabilidade e o comparativo "
     "perde valor na apresentação à diretoria.",
     "Cristiane + Financeiro", "EM ABERTO", ""),
    ("3", "Jusfy x Astrea",
     "O risco era pagar os dois em paralelo. O realizado de mai–jul mostra "
     "Astrea em R$ 0 (cancelado) e Jusfy em R$ 0 (ainda não iniciado) — "
     "no momento não há custo de nenhum dos dois.",
     "Economia de R$ 212,07/mês enquanto durar. Falta decidir se o Jusfy entra "
     "e quando, para ajustar o planejado dos meses seguintes.",
     "Cristiane", "RESOLVIDO", "Jurídico"),
    ("4", "Rateio dos softwares corporativos de TI",
     "Backup (R$ 9.900), Adapta/IA (R$ 17.400), Antivírus (R$ 2.880) e Office 365 "
     "(R$ 4.500) estão marcados na ficha como 'não sei se seria administrativo'. "
     "Total no ano: R$ 34.680.",
     "São 39% das despesas do TI. Se são da empresa toda e ficam no centro de custo "
     "de TI, o departamento carrega despesa que não é dele e aparece caro.",
     "Cristiane + Controladoria", "EM ABERTO", "TI"),
    ("5", "Sala de Reunião — recorrente ou pontual?",
     "R$ 2.800/mês × 12 = R$ 33.600 diluídos linearmente, classificados em "
     "Móveis e Utensílios.",
     "Se for compra pontual (CAPEX), o desvio mensal vai acusar alarme falso todo "
     "mês até a compra acontecer, e um pico no mês da compra.",
     "Cristiane", "EM ABERTO", "TI"),
    ("6", "Office 365 — nº de licenças",
     "A observação diz '10 licenças de software – 60 usuários'. Os dois números "
     "não fecham entre si.",
     "Afeta o valor orçado da linha e a projeção de crescimento.",
     "Cristiane", "EM ABERTO", "TI"),
    ("7", "Critério de competência x caixa",
     "Definir se o realizado será lançado pela data de pagamento (caixa) ou pelo "
     "mês de referência da despesa (competência).",
     "Misturar os dois critérios gera desvio artificial em meses de virada, "
     "principalmente em folha e prêmios.",
     "Cristiane + Financeiro", "EM ABERTO", ""),
]

def gerar(DEPTO, OUT):
    LIN = [l for l in LINHAS if DEPTO is None or l[1] == DEPTO]
    DEPTOS = [DEPTO] if DEPTO else ["Jurídico", "TI"]
    SUF = DEPTO if DEPTO else "Jurídico e TI"
    LAST = FIRST + len(LIN) - 1
    TOT_ROW = LAST + 1
    # planos de contas que de fato aparecem neste recorte, na ordem canonica
    PLAN_D = [p for p in PLANOS if any(l[6] == p for l in LIN)]
    PEND_D = [p for p in PEND if not p[6] or p[6] in DEPTOS]

    wb = openpyxl.Workbook()

    # ===========================================================================
    # ABA 1 - PLANEJADO
    # ===========================================================================
    ws = wb.active
    ws.title = "Planejado"
    NCOL_P = C_TOT  # A..T

    titulo(ws, "ORÇAMENTO PLANEJADO 2026  —  " + SUF.upper(),
           "Base: janeiro a dezembro/2026 (12 meses). CLT com encargos de folha + benefícios inclusos. "
           "Esta aba é a referência — altere aqui apenas se o orçamento for oficialmente revisado.",
           NCOL_P)

    header(ws, HDR_ROW,
           ["ID", "Departamento", "Bloco", "Descrição", "Detalhe / Observação",
            "Vínculo", "Plano de Contas"] + MESES + ["TOTAL DO ANO"])

    for i, (lid, dep, bloco, desc, det, vinc, plano, vals) in enumerate(LIN):
        r = FIRST + i
        base = CINZA_L if dep == "TI" else BRANCO
        for col, val in enumerate([lid, dep, bloco, desc, det, vinc, plano], start=1):
            c = ws.cell(row=r, column=col, value=val)
            c.font = Font(size=9)
            c.fill = PatternFill("solid", fgColor=base)
            c.border = BORDA
            c.alignment = Alignment(vertical="center",
                                    wrap_text=(col in (4, 5)),
                                    horizontal="left")
        for j, val in enumerate(vals):
            c = ws.cell(row=r, column=8 + j, value=val)
            c.number_format = MOEDA
            c.font = Font(size=9)
            c.fill = PatternFill("solid", fgColor=base)
            c.border = BORDA
        t = ws.cell(row=r, column=C_TOT, value="=SUM({1}{0}:{2}{0})".format(r, L_M0, L_MZ))
        t.number_format = MOEDA
        t.font = Font(size=9, bold=True)
        t.fill = PatternFill("solid", fgColor=CINZA_H)
        t.border = BORDA
        ws.row_dimensions[r].height = 26

    # Linha de total
    ws.cell(row=TOT_ROW, column=1, value="TOTAL GERAL")
    for col in range(1, NCOL_P + 1):
        c = ws.cell(row=TOT_ROW, column=col)
        c.font = Font(bold=True, size=10, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=AZUL)
        c.border = BORDA
    for col in range(M0, NCOL_P + 1):
        L = get_column_letter(col)
        c = ws.cell(row=TOT_ROW, column=col,
                    value="=SUM({0}{1}:{0}{2})".format(L, FIRST, LAST))
        c.number_format = MOEDA
        c.font = Font(bold=True, size=10, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=AZUL)
        c.border = BORDA

    widths(ws, {"A": 10, "B": 13, "C": 11, "D": 34, "E": 42, "F": 8, "G": 26})
    ws.column_dimensions[L_TOT].width = 16
    for col in range(M0, C_TOT):
        ws.column_dimensions[get_column_letter(col)].width = 12
    ws.freeze_panes = "H5"
    ws.auto_filter.ref = "A{0}:{2}{1}".format(HDR_ROW, LAST, L_TOT)

    # ===========================================================================
    # ABA 2 - REALIZADO
    # ===========================================================================
    wr = wb.create_sheet("Realizado")
    NCOL_R = C_TOT + 2  # A..V

    titulo(wr, "REALIZADO 2026  —  " + SUF.upper(),
           "Preencha SOMENTE as células amarelas (meses). As colunas de identificação vêm da aba Planejado. "
           "Lance o valor efetivamente pago/competência do mês. Mês sem gasto: digite 0 para diferenciar de 'ainda não lançado'.",
           NCOL_R)

    header(wr, HDR_ROW,
           ["ID", "Departamento", "Bloco", "Descrição", "Detalhe / Observação",
            "Vínculo", "Plano de Contas"] + MESES +
           ["TOTAL REALIZADO", "Fonte do dado", "Observações do mês"],
           fill="7B3F00")

    for i in range(len(LIN)):
        r = FIRST + i
        for col in range(1, 8):
            L = get_column_letter(col)
            c = wr.cell(row=r, column=col, value="=Planejado!{0}{1}".format(L, r))
            c.font = Font(size=9, color="595959")
            c.fill = PatternFill("solid", fgColor=CINZA_L)
            c.border = BORDA
            c.alignment = Alignment(vertical="center",
                                    wrap_text=(col in (4, 5)), horizontal="left")
        lid = LIN[i][0]
        vals, fonte, obs = REALIZADO.get(lid, ([None] * 8, "", ""))
        for j in range(8):
            c = wr.cell(row=r, column=8 + j, value=vals[j])
            c.number_format = MOEDA
            c.font = Font(size=9)
            c.fill = PatternFill("solid", fgColor=INPUT_BG)
            c.border = BORDA
        t = wr.cell(row=r, column=C_TOT, value="=SUM({1}{0}:{2}{0})".format(r, L_M0, L_MZ))
        t.number_format = MOEDA
        t.font = Font(size=9, bold=True)
        t.fill = PatternFill("solid", fgColor=CINZA_H)
        t.border = BORDA
        for col, txt in ((C_TOT + 1, fonte), (C_TOT + 2, obs)):
            c = wr.cell(row=r, column=col, value=txt or None)
            c.font = Font(size=8)
            c.fill = PatternFill("solid", fgColor=INPUT_BG)
            c.border = BORDA
            c.alignment = Alignment(vertical="center", wrap_text=True)
        wr.row_dimensions[r].height = 26

    wr.cell(row=TOT_ROW, column=1, value="TOTAL GERAL")
    for col in range(1, NCOL_R + 1):
        c = wr.cell(row=TOT_ROW, column=col)
        c.font = Font(bold=True, size=10, color=BRANCO)
        c.fill = PatternFill("solid", fgColor="7B3F00")
        c.border = BORDA
    for col in range(M0, C_TOT + 1):
        L = get_column_letter(col)
        c = wr.cell(row=TOT_ROW, column=col,
                    value="=SUM({0}{1}:{0}{2})".format(L, FIRST, LAST))
        c.number_format = MOEDA
        c.font = Font(bold=True, size=10, color=BRANCO)
        c.fill = PatternFill("solid", fgColor="7B3F00")
        c.border = BORDA

    widths(wr, {"A": 10, "B": 13, "C": 11, "D": 34, "E": 42, "F": 8, "G": 26})
    wr.column_dimensions[L_TOT].width = 16
    wr.column_dimensions[get_column_letter(C_TOT + 1)].width = 22
    wr.column_dimensions[get_column_letter(C_TOT + 2)].width = 34
    for col in range(M0, C_TOT):
        wr.column_dimensions[get_column_letter(col)].width = 12
    wr.freeze_panes = "H5"

    # ===========================================================================
    # ABA 3 - COMPARATIVO
    # ===========================================================================
    wc = wb.create_sheet("Comparativo")
    NCOL_C = 14

    titulo(wc, "PLANEJADO x REALIZADO  —  linha a linha",
           "Escolha o mês de referência em B3. As colunas 'no mês' mostram só aquele mês; "
           "as colunas 'acumulado' somam de maio até o mês escolhido. Desvio positivo = gastou ACIMA do orçado.",
           NCOL_C)

    wc.cell(row=3, column=1, value="Mês de referência:").font = Font(bold=True, size=10)
    sel = wc.cell(row=3, column=2, value="Jul/26")
    sel.font = Font(bold=True, size=11, color=AZUL)
    sel.fill = PatternFill("solid", fgColor=INPUT_BG)
    sel.alignment = Alignment(horizontal="center")
    sel.border = BORDA
    dv = DataValidation(type="list", formula1='"{0}"'.format(",".join(MESES)),
                        allow_blank=False, showDropDown=False)
    wc.add_data_validation(dv)
    dv.add(sel)

    wc.cell(row=3, column=3, value="Mês nº:").font = Font(size=9, color="808080")
    idx = wc.cell(row=3, column=4, value="=MATCH($B$3,Planejado!$H$4:$S$4,0)")
    idx.font = Font(size=9, color="808080")
    idx.alignment = Alignment(horizontal="center")

    CH = HDR_ROW + 1   # cabecalho na linha 5
    CF = CH + 1        # dados a partir da 6

    header(wc, CH,
           ["ID", "Departamento", "Bloco", "Descrição", "Plano de Contas",
            "Planejado no mês", "Realizado no mês", "Desvio no mês (R$)",
            "Planejado acum.", "Realizado acum.", "Desvio acum. (R$)",
            "Desvio acum. (%)", "% Executado", "Situação"])

    for i in range(len(LIN)):
        rp = FIRST + i           # linha na aba Planejado/Realizado
        rc = CF + i              # linha aqui
        dep = LIN[i][1]
        base = CINZA_L if dep == "TI" else BRANCO
        mapa = {1: "A", 2: "B", 3: "C", 4: "D", 5: "G"}
        for col, src in mapa.items():
            c = wc.cell(row=rc, column=col, value="=Planejado!{0}{1}".format(src, rp))
            c.font = Font(size=9)
            c.fill = PatternFill("solid", fgColor=base)
            c.border = BORDA
            c.alignment = Alignment(vertical="center", wrap_text=(col == 4),
                                    horizontal="left")
        formulas = {
            6:  "=INDEX(Planejado!$H{0}:$S{0},$D$3)".format(rp),
            7:  "=INDEX(Realizado!$H{0}:$S{0},$D$3)".format(rp),
            8:  "=G{0}-F{0}".format(rc),
            9:  ("=SUMPRODUCT((COLUMN(Planejado!$H$4:$S$4)-COLUMN(Planejado!$H$4)"
                 "+1<=$D$3)*Planejado!$H{0}:$S{0})").format(rp),
            10: ("=SUMPRODUCT((COLUMN(Realizado!$H$4:$S$4)-COLUMN(Realizado!$H$4)"
                 "+1<=$D$3)*Realizado!$H{0}:$S{0})").format(rp),
            11: "=J{0}-I{0}".format(rc),
            12: '=IFERROR(K{0}/I{0},"")'.format(rc),
            13: '=IFERROR(J{0}/I{0},"")'.format(rc),
            # P conta MESES PREENCHIDOS, nao valor > 0: um item legitimamente zerado
            # (Astrea cancelado, curso nao realizado) e um lancamento valido.
            14: ('=IF(P{0}=0,"Sem lançamento",'
                 'IF(AND(I{0}=0,J{0}=0),"—",'
                 'IF(I{0}=0,"Não orçado",'
                 'IF(K{0}>0.05*I{0},"Acima do orçado",'
                 'IF(K{0}<-0.05*I{0},"Abaixo do orçado","Dentro do orçado")))))').format(rc),
            16: ('=SUMPRODUCT((COLUMN(Realizado!$H$4:$S$4)-COLUMN(Realizado!$H$4)'
                 '+1<=$D$3)*(Realizado!$H{0}:$S{0}<>""))').format(rp),
        }
        for col, f in formulas.items():
            c = wc.cell(row=rc, column=col, value=f)
            c.font = Font(size=9)
            c.fill = PatternFill("solid", fgColor=base)
            c.border = BORDA
            c.number_format = PCT if col in (12, 13) else MOEDA
            if col == 14:
                c.number_format = "General"
                c.alignment = Alignment(horizontal="center", vertical="center")
            if col == 16:
                c.number_format = "General"
                c.font = Font(size=8, color="BFBFBF")
        # Coluna O (oculta): chave de ordenacao do ranking de estouros.
        # Piso de R$ 1,00 para o ranking nao ser poluido por centavos de
        # arredondamento (o rateio mensal da folha CLT tem meio centavo).
        # O ROW()/1e6 desempata: sem ele, itens de mesmo desvio fariam o MATCH
        # do Painel devolver sempre o primeiro deles.
        aux = wc.cell(row=rc, column=15,
                      value='=IF(K{0}>1,K{0}+ROW()/1000000,"")'.format(rc))
        aux.font = Font(size=8, color="BFBFBF")
        wc.row_dimensions[rc].height = 24

    CTOT = CF + len(LINHAS)
    wc.cell(row=CTOT, column=1, value="TOTAL GERAL")
    for col in range(1, NCOL_C + 1):
        c = wc.cell(row=CTOT, column=col)
        c.font = Font(bold=True, size=10, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=AZUL)
        c.border = BORDA
    for col in (6, 7, 8, 9, 10, 11):
        L = get_column_letter(col)
        c = wc.cell(row=CTOT, column=col,
                    value="=SUM({0}{1}:{0}{2})".format(L, CF, CF + len(LIN) - 1))
        c.number_format = MOEDA
        c.font = Font(bold=True, size=10, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=AZUL)
        c.border = BORDA
    for col, f in ((12, '=IFERROR(K{0}/I{0},"")'), (13, '=IFERROR(J{0}/I{0},"")')):
        c = wc.cell(row=CTOT, column=col, value=f.format(CTOT))
        c.number_format = PCT
        c.font = Font(bold=True, size=10, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=AZUL)
        c.border = BORDA

    rng_desvio = "H{0}:H{1} K{0}:K{1}".format(CF, CF + len(LIN) - 1)
    for rng in ("H{0}:H{1}".format(CF, CF + len(LIN) - 1),
                "K{0}:K{1}".format(CF, CF + len(LIN) - 1)):
        wc.conditional_formatting.add(rng, CellIsRule(
            operator="greaterThan", formula=["0"],
            font=Font(color="9C0006", bold=True, size=9),
            fill=PatternFill("solid", fgColor="FFC7CE")))
        wc.conditional_formatting.add(rng, CellIsRule(
            operator="lessThan", formula=["0"],
            font=Font(color="006100", size=9),
            fill=PatternFill("solid", fgColor="C6EFCE")))

    widths(wc, {"A": 10, "B": 13, "C": 11, "D": 36, "E": 26, "F": 15, "G": 15,
                "H": 16, "I": 15, "J": 15, "K": 16, "L": 14, "M": 12, "N": 17,
                "O": 10})
    wc.column_dimensions["O"].hidden = True
    wc.column_dimensions["P"].hidden = True
    wc.cell(row=CH, column=15, value="(aux ranking)").font = Font(size=8, color="BFBFBF")
    wc.cell(row=CH, column=16, value="(aux meses lançados)").font = Font(size=8, color="BFBFBF")
    wc.freeze_panes = "F6"
    wc.auto_filter.ref = "A{0}:N{1}".format(CH, CF + len(LIN) - 1)

    # ===========================================================================
    # ABA 4 - PAINEL
    # ===========================================================================
    wp = wb.create_sheet("Painel", 0)
    titulo(wp, "PAINEL EXECUTIVO  —  Orçamento 2026  " + SUF.upper(),
           "Acompanha o mês selecionado na aba Comparativo (célula B3). "
           "Desvio positivo = gastou acima do orçado. ATENÇÃO: confira a coluna "
           "'Linhas lançadas' — desvio negativo em linha não lançada é ausência de "
           "dado, não economia.", 9)

    wp.cell(row=3, column=1, value="Mês de referência:").font = Font(bold=True, size=10)
    m = wp.cell(row=3, column=2, value="=Comparativo!$B$3")
    m.font = Font(bold=True, size=11, color=AZUL)
    m.alignment = Alignment(horizontal="center")
    wp.cell(row=3, column=3, value="(altere na aba Comparativo)").font = Font(size=9, italic=True, color="808080")

    PH = 5
    header(wp, PH, ["Departamento", "Bloco", "Orçado do ano",
                    "Planejado acum.", "Realizado acum.", "Desvio (R$)",
                    "Desvio (%)", "% Executado do ano", "Linhas lançadas"])


    def cobertura(dep, bloco):
        """'x de y' linhas com lançamento — impede ler falta de lançamento como economia.

        Um desvio negativo só significa economia se a linha foi de fato lançada;
        sem esta coluna, um departamento ainda não lançado aparece no Painel com
        desvio de milhares de reais a menor.
        """
        filtros = ""
        if dep:
            filtros += ',Comparativo!$B${0}:$B${1},"{2}"'.format(CF, CF_END, dep)
        if bloco:
            filtros += ',Comparativo!$C${0}:$C${1},"{2}"'.format(CF, CF_END, bloco)
        lanc = 'COUNTIFS(Comparativo!$P${0}:$P${1},">0"{2})'.format(CF, CF_END, filtros)
        if filtros:
            # o primeiro par ja restringe o grupo; o "<>" apenas exige celula preenchida
            tot = 'COUNTIFS(Comparativo!$A${0}:$A${1},"?*"{2})'.format(CF, CF_END, filtros)
        else:
            tot = 'COUNTA(Comparativo!$A${0}:$A${1})'.format(CF, CF_END)
        return '{0}&" de "&{1}'.format(lanc, tot)

    CF_END = CF + len(LIN) - 1
    CREF = "Comparativo!"
    PREF = "Planejado!"


    def sumifs_comp(col, dep, bloco):
        """SUMIFS numa coluna do Comparativo filtrando depto e/ou bloco."""
        rng = "{0}${1}${2}:${1}${3}".format(CREF, col, CF, CF_END)
        crits = []
        if dep:
            crits.append('{0}$B${1}:$B${2},"{3}"'.format(CREF, CF, CF_END, dep))
        if bloco:
            crits.append('{0}$C${1}:$C${2},"{3}"'.format(CREF, CF, CF_END, bloco))
        if not crits:
            return "=SUM({0})".format(rng)
        return "=SUMIFS({0},{1})".format(rng, ",".join(crits))


    def sumifs_plan(dep, bloco):
        rng = "{0}${3}${1}:${3}${2}".format(PREF, FIRST, LAST, L_TOT)
        crits = []
        if dep:
            crits.append('{0}$B${1}:$B${2},"{3}"'.format(PREF, FIRST, LAST, dep))
        if bloco:
            crits.append('{0}$C${1}:$C${2},"{3}"'.format(PREF, FIRST, LAST, bloco))
        if not crits:
            return "=SUM({0})".format(rng)
        return "=SUMIFS({0},{1})".format(rng, ",".join(crits))


    painel_rows = []
    for d in DEPTOS:
        painel_rows += [(d, "Equipe", False), (d, "Despesas", False), (d, None, True)]
    if len(DEPTOS) > 1:
        painel_rows.append((None, None, True))   # so faz sentido no consolidado

    r = PH + 1
    for dep, bloco, is_tot in painel_rows:
        label_dep = dep if dep else "TOTAL GERAL"
        label_bl = bloco if bloco else ("Equipe + Despesas" if dep else "")
        wp.cell(row=r, column=1, value=label_dep)
        wp.cell(row=r, column=2, value=label_bl)
        wp.cell(row=r, column=3, value=sumifs_plan(dep, bloco))
        wp.cell(row=r, column=4, value=sumifs_comp("I", dep, bloco))
        wp.cell(row=r, column=5, value=sumifs_comp("J", dep, bloco))
        wp.cell(row=r, column=6, value="=E{0}-D{0}".format(r))
        wp.cell(row=r, column=7, value='=IFERROR(F{0}/D{0},"")'.format(r))
        wp.cell(row=r, column=8, value='=IFERROR(E{0}/C{0},"")'.format(r))
        wp.cell(row=r, column=9, value="=" + cobertura(dep, bloco))

        if dep is None:
            fill, fcolor, bold = AZUL, BRANCO, True
        elif is_tot:
            fill, fcolor, bold = CINZA_H, "000000", True
        else:
            fill, fcolor, bold = BRANCO, "000000", False
        for col in range(1, 10):
            c = wp.cell(row=r, column=col)
            c.font = Font(size=10, bold=bold, color=fcolor)
            c.fill = PatternFill("solid", fgColor=fill)
            c.border = BORDA
            if col in (3, 4, 5, 6):
                c.number_format = MOEDA
            if col in (7, 8):
                c.number_format = PCT
                c.alignment = Alignment(horizontal="center")
            if col == 9:
                c.alignment = Alignment(horizontal="center")
        wp.row_dimensions[r].height = 22
        r += 1

    # Destaques / alertas
    r += 2
    wp.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
    c = wp.cell(row=r, column=1, value="MAIORES DESVIOS DO ACUMULADO (top 5 acima do orçado)")
    c.font = Font(bold=True, size=11, color=BRANCO)
    c.fill = PatternFill("solid", fgColor=AZUL_MED)
    c.alignment = Alignment(indent=1, vertical="center")
    wp.row_dimensions[r].height = 22
    r += 1
    header(wp, r, ["#", "Item", "Departamento", "Planejado acum.",
                   "Realizado acum.", "Desvio (R$)", "Desvio (%)", ""])
    top_hdr = r
    def top_formula(target_col, rr):
        """Busca o item de rank A{rr} pela chave auxiliar (coluna O do Comparativo).

        A chave só existe para desvio > 0, então quando há menos de 5 estouros o
        LARGE devolve #NUM! e o IFERROR deixa a linha em branco.
        """
        return (
            '=IFERROR(INDEX(Comparativo!${2}${0}:${2}${1},'
            'MATCH(LARGE(Comparativo!$O${0}:$O${1},A{3}),'
            'Comparativo!$O${0}:$O${1},0)),"")'
        ).format(CF, CF_END, target_col, rr)


    for k in range(1, 6):
        rr = top_hdr + k
        wp.cell(row=rr, column=1, value=k)
        wp.cell(row=rr, column=2, value=top_formula("D", rr))   # item
        wp.cell(row=rr, column=3, value=top_formula("B", rr))   # departamento
        wp.cell(row=rr, column=4, value=top_formula("I", rr))   # planejado acum
        wp.cell(row=rr, column=5, value=top_formula("J", rr))   # realizado acum
        wp.cell(row=rr, column=6, value=top_formula("K", rr))   # desvio real (R$)
        wp.cell(row=rr, column=7, value='=IFERROR(F{0}/D{0},"")'.format(rr))
        for col in range(1, 8):
            c = wp.cell(row=rr, column=col)
            c.font = Font(size=9)
            c.border = BORDA
            if col in (4, 5, 6):
                c.number_format = MOEDA
            if col == 7:
                c.number_format = PCT
            if col == 1:
                c.alignment = Alignment(horizontal="center")

    widths(wp, {"A": 16, "B": 34, "C": 17, "D": 17, "E": 17, "F": 16, "G": 14,
                "H": 20, "I": 16})

    # ===========================================================================
    # ABA 5 - POR PLANO DE CONTAS
    # ===========================================================================
    wpc = wb.create_sheet("Por Plano de Contas")
    titulo(wpc, "RESUMO POR PLANO DE CONTAS",
           "Mesma referência de mês da aba Comparativo (B3). Serve para conversar com o financeiro "
           "na linguagem do plano de contas.", 5 + 2 * len(DEPTOS))

    PCH = 4
    # Colunas por departamento: 2 por depto (plan/real), depois os totais.
    # Com um departamento so, o par vira as proprias colunas de total.
    ND = len(DEPTOS)
    cols_dep = []
    for d in DEPTOS:
        cols_dep += ["{0} — Plan.".format(d), "{0} — Real.".format(d)]
    C_TP = 2 + 2 * ND          # Total Planejado acum.
    C_TR, C_DV, C_PC, C_ANO = C_TP + 1, C_TP + 2, C_TP + 3, C_TP + 4
    NCOL_PC = C_ANO
    header(wpc, PCH, ["Plano de Contas"] + cols_dep +
           ["Total Planejado acum.", "Total Realizado acum.", "Desvio (R$)",
            "Desvio (%)", "Orçado do ano"])

    L_TP, L_TR = get_column_letter(C_TP), get_column_letter(C_TR)

    for i, plano in enumerate(PLAN_D):
        rr = PCH + 1 + i
        wpc.cell(row=rr, column=1, value=plano)
        args = "Comparativo!$E${0}:$E${1},$A{2}".format(CF, CF_END, rr)
        for k, d in enumerate(DEPTOS):
            for j, src in enumerate(("I", "J")):        # planejado, realizado
                wpc.cell(row=rr, column=2 + 2 * k + j, value=(
                    '=SUMIFS(Comparativo!${3}${0}:${3}${1},{2},'
                    'Comparativo!$B${0}:$B${1},"{4}")').format(
                        CF, CF_END, args, src, d))
        # totais = soma dos pares de cada departamento
        soma_p = "+".join(get_column_letter(2 + 2 * k) + str(rr) for k in range(ND))
        soma_r = "+".join(get_column_letter(3 + 2 * k) + str(rr) for k in range(ND))
        wpc.cell(row=rr, column=C_TP, value="=" + soma_p)
        wpc.cell(row=rr, column=C_TR, value="=" + soma_r)
        wpc.cell(row=rr, column=C_DV, value="={1}{0}-{2}{0}".format(rr, L_TR, L_TP))
        wpc.cell(row=rr, column=C_PC, value='=IFERROR({1}{0}/{2}{0},"")'.format(
            rr, get_column_letter(C_DV), L_TP))
        wpc.cell(row=rr, column=C_ANO, value=(
            '=SUMIFS(Planejado!$T${0}:$T${1},Planejado!$G${0}:$G${1},$A{2})'
        ).format(FIRST, LAST, rr))
        for col in range(1, NCOL_PC + 1):
            c = wpc.cell(row=rr, column=col)
            c.font = Font(size=9)
            c.border = BORDA
            c.fill = PatternFill("solid", fgColor=BRANCO if i % 2 == 0 else CINZA_L)
            if col != 1 and col != C_PC:
                c.number_format = MOEDA
            if col == C_PC:
                c.number_format = PCT
                c.alignment = Alignment(horizontal="center")
        wpc.row_dimensions[rr].height = 20

    PCT_ROW = PCH + 1 + len(PLAN_D)
    wpc.cell(row=PCT_ROW, column=1, value="TOTAL")
    for col in range(1, NCOL_PC + 1):
        c = wpc.cell(row=PCT_ROW, column=col)
        c.font = Font(bold=True, size=10, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=AZUL)
        c.border = BORDA
    for col in [c for c in range(2, NCOL_PC + 1) if c != C_PC]:
        L = get_column_letter(col)
        c = wpc.cell(row=PCT_ROW, column=col,
                     value="=SUM({0}{1}:{0}{2})".format(L, PCH + 1, PCT_ROW - 1))
        c.number_format = MOEDA
        c.font = Font(bold=True, size=10, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=AZUL)
        c.border = BORDA
    c = wpc.cell(row=PCT_ROW, column=C_PC, value='=IFERROR({1}{0}/{2}{0},"")'.format(
        PCT_ROW, get_column_letter(C_DV), L_TP))
    c.number_format = PCT
    c.font = Font(bold=True, size=10, color=BRANCO)
    c.fill = PatternFill("solid", fgColor=AZUL)
    c.border = BORDA
    c.alignment = Alignment(horizontal="center")

    rng_dv = "{0}{1}:{0}{2}".format(get_column_letter(C_DV), PCH + 1, PCT_ROW - 1)
    wpc.conditional_formatting.add(rng_dv, CellIsRule(
        operator="greaterThan", formula=["0"],
        font=Font(color="9C0006", bold=True, size=9),
        fill=PatternFill("solid", fgColor="FFC7CE")))
    wpc.conditional_formatting.add(rng_dv, CellIsRule(
        operator="lessThan", formula=["0"],
        font=Font(color="006100", size=9),
        fill=PatternFill("solid", fgColor="C6EFCE")))

    for col in range(2, NCOL_PC + 1):
        wpc.column_dimensions[get_column_letter(col)].width = 18
    wpc.column_dimensions[get_column_letter(C_PC)].width = 12
    widths(wpc, {"A": 34})

    # ===========================================================================
    # ABA 6 - EVOLUCAO MENSAL
    # ===========================================================================
    we = wb.create_sheet("Evolução Mensal")
    titulo(we, "EVOLUÇÃO MENSAL  —  Planejado x Realizado",
           "Visão mês a mês do consolidado e por departamento. Alimenta gráficos e a leitura de tendência.",
           10)

    EH = 4
    NDE = len(DEPTOS)
    cols_dep = []
    for d in DEPTOS:
        cols_dep += ["{0} Plan.".format(d), "{0} Real.".format(d)]
    E_TP = 2 + 2 * NDE          # Total Plan. (col 1 = mes, depois 2 por depto)
    E_TR, E_DV, E_PA, E_RA = E_TP + 1, E_TP + 2, E_TP + 3, E_TP + 4
    NCOL_E = E_RA
    header(we, EH, ["Mês"] + cols_dep +
           ["Total Plan.", "Total Real.", "Desvio do mês (R$)",
            "Planejado acum.", "Realizado acum."])

    L_TP_E, L_TR_E = get_column_letter(E_TP), get_column_letter(E_TR)

    for i, mes in enumerate(MESES):
        rr = EH + 1 + i
        mcol = get_column_letter(M0 + i)
        we.cell(row=rr, column=1, value=mes)
        for k, d in enumerate(DEPTOS):
            for j, aba in enumerate(("Planejado", "Realizado")):
                we.cell(row=rr, column=2 + 2 * k + j, value=(
                    '=SUMIFS({3}!${2}${0}:${2}${1},{3}!$B${0}:$B${1},"{4}")'
                ).format(FIRST, LAST, mcol, aba, d))
        soma_p = "+".join(get_column_letter(2 + 2 * k) + str(rr) for k in range(NDE))
        soma_r = "+".join(get_column_letter(3 + 2 * k) + str(rr) for k in range(NDE))
        we.cell(row=rr, column=E_TP, value="=" + soma_p)
        we.cell(row=rr, column=E_TR, value="=" + soma_r)
        we.cell(row=rr, column=E_DV, value="={1}{0}-{2}{0}".format(rr, L_TR_E, L_TP_E))
        we.cell(row=rr, column=E_PA,
                value="=SUM(${1}${0}:{1}{2})".format(EH + 1, L_TP_E, rr))
        we.cell(row=rr, column=E_RA,
                value="=SUM(${1}${0}:{1}{2})".format(EH + 1, L_TR_E, rr))
        for col in range(1, NCOL_E + 1):
            c = we.cell(row=rr, column=col)
            c.font = Font(size=9)
            c.border = BORDA
            c.fill = PatternFill("solid", fgColor=BRANCO if i % 2 == 0 else CINZA_L)
            if col > 1:
                c.number_format = MOEDA
            else:
                c.alignment = Alignment(horizontal="center")
        we.row_dimensions[rr].height = 20

    ETOT = EH + 1 + len(MESES)
    we.cell(row=ETOT, column=1, value="TOTAL")
    for col in range(1, NCOL_E + 1):
        c = we.cell(row=ETOT, column=col)
        c.font = Font(bold=True, size=10, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=AZUL)
        c.border = BORDA
    for col in range(2, E_DV + 1):
        L = get_column_letter(col)
        c = we.cell(row=ETOT, column=col,
                    value="=SUM({0}{1}:{0}{2})".format(L, EH + 1, ETOT - 1))
        c.number_format = MOEDA
        c.font = Font(bold=True, size=10, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=AZUL)
        c.border = BORDA

    rng_e = "{0}{1}:{0}{2}".format(get_column_letter(E_DV), EH + 1, ETOT - 1)
    we.conditional_formatting.add(rng_e, CellIsRule(
        operator="greaterThan", formula=["0"],
        font=Font(color="9C0006", bold=True, size=9),
        fill=PatternFill("solid", fgColor="FFC7CE")))
    we.conditional_formatting.add(rng_e, CellIsRule(
        operator="lessThan", formula=["0"],
        font=Font(color="006100", size=9),
        fill=PatternFill("solid", fgColor="C6EFCE")))

    we.column_dimensions["A"].width = 12
    for col in range(2, NCOL_E + 1):
        we.column_dimensions[get_column_letter(col)].width = 17

    # Grafico de linhas Planejado acum x Realizado acum
    from openpyxl.chart import LineChart, Reference

    chart = LineChart()
    chart.title = "Acumulado: Planejado x Realizado"
    chart.style = 2
    chart.height = 8
    chart.width = 18
    data = Reference(we, min_col=E_PA, max_col=E_RA, min_row=EH, max_row=ETOT - 1)
    cats = Reference(we, min_col=1, min_row=EH + 1, max_row=ETOT - 1)
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    chart.y_axis.numFmt = 'R$ #,##0'
    ancora = get_column_letter(NCOL_E + 2)
    we.add_chart(chart, ancora + "5")

    chart2 = LineChart()
    chart2.title = "Mês a mês: Planejado x Realizado"
    chart2.style = 2
    chart2.height = 8
    chart2.width = 18
    data2 = Reference(we, min_col=E_TP, max_col=E_TR, min_row=EH, max_row=ETOT - 1)
    chart2.add_data(data2, titles_from_data=True)
    chart2.set_categories(cats)
    chart2.y_axis.numFmt = 'R$ #,##0'
    we.add_chart(chart2, ancora + "24")

    # ===========================================================================
    # ABA 7 - PENDENCIAS / DECISOES
    # ===========================================================================
    wn = wb.create_sheet("Pendências")
    titulo(wn, "PENDÊNCIAS E DECISÕES EM ABERTO",
           "Pontos que precisam ser fechados para o comparativo ficar confiável. "
           "Atualize a coluna Status conforme forem resolvidos.", 6)

    NH = 4
    header(wn, NH, ["#", "Tema", "O que está em aberto", "Impacto no comparativo",
                    "Responsável", "Status"])

    for i, row in enumerate(PEND_D):
        rr = NH + 1 + i
        for col, val in enumerate(row[:6], start=1):
            c = wn.cell(row=rr, column=col, value=val)
            c.font = Font(size=9, bold=(col == 6))
            c.border = BORDA
            c.alignment = Alignment(vertical="top", wrap_text=True,
                                    horizontal="center" if col in (1, 6) else "left")
            if col == 6:
                cores = {"RESOLVIDO": VERDE, "APLICADO": VERDE, "PREENCHER": "F8CBAD",
                         "A LANÇAR": "F8CBAD", "CONFERIR": "FFE699"}
                c.fill = PatternFill("solid", fgColor=cores.get(val, LARANJA))
            else:
                c.fill = PatternFill("solid", fgColor=BRANCO if i % 2 == 0 else CINZA_L)
        wn.row_dimensions[rr].height = 58

    widths(wn, {"A": 5, "B": 30, "C": 52, "D": 52, "E": 22, "F": 14})

    # ===========================================================================
    # ABA 8 - COMO USAR
    # ===========================================================================
    wu = wb.create_sheet("Como usar")
    titulo(wu, "COMO USAR ESTA PLANILHA", "Rotina mensal de fechamento em 5 passos.", 3)

    PASSOS = [
        ("Rotina mensal", ""),
        ("1", "Abra a aba REALIZADO e preencha apenas as células amarelas do mês que fechou. "
              "Se o item não teve gasto no mês, digite 0 — deixar em branco significa "
              "'ainda não lancei'."),
        ("2", "Preencha a coluna 'Fonte do dado' (ex.: relatório do financeiro, nota fiscal, "
              "extrato do cartão) para o número ser auditável depois."),
        ("3", "Vá na aba COMPARATIVO e selecione o mês em B3. Todas as demais abas "
              "acompanham essa escolha."),
        ("4", "Confira o PAINEL: ele mostra o desvio por departamento e os 5 maiores "
              "estouros do acumulado. É a tela para levar à diretoria."),
        ("5", "Atualize a aba PENDÊNCIAS conforme as decisões forem sendo tomadas."),
        ("", ""),
        ("Como ler os números", ""),
        ("Desvio positivo (vermelho)", "Gastou ACIMA do orçado."),
        ("Desvio negativo (verde)", "Gastou ABAIXO do orçado — economia ou despesa ainda não realizada."),
        ("Planejado acum.", "Soma de maio até o mês selecionado."),
        ("% Executado", "Realizado acumulado ÷ Planejado acumulado. Perto de 100% = no ritmo."),
        ("Sem lançamento", "Nada foi lançado no realizado ainda — não confunda com economia."),
        ("", ""),
        ("Regras da planilha", ""),
        ("Não altere", "As colunas de identificação da aba Realizado (A a G) são fórmulas "
                       "que espelham a aba Planejado. Alterar quebra o comparativo."),
        ("Nova linha de orçamento", "Insira na aba Planejado e replique a mesma linha na aba "
                                    "Realizado e na aba Comparativo, mantendo o mesmo ID."),
        ("Revisão de orçamento", "Se a diretoria aprovar um valor novo, altere na aba Planejado "
                                 "e registre o motivo na aba Pendências."),
    ]

    r = 4
    for a, b in PASSOS:
        if b == "" and a != "":
            wu.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
            c = wu.cell(row=r, column=1, value=a.upper())
            c.font = Font(bold=True, size=11, color=BRANCO)
            c.fill = PatternFill("solid", fgColor=AZUL_MED)
            c.alignment = Alignment(indent=1, vertical="center")
            wu.row_dimensions[r].height = 22
        elif a == "" and b == "":
            wu.row_dimensions[r].height = 8
        else:
            ca = wu.cell(row=r, column=1, value=a)
            ca.font = Font(bold=True, size=10)
            ca.alignment = Alignment(horizontal="left", vertical="top")
            ca.border = BORDA
            wu.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
            cb = wu.cell(row=r, column=2, value=b)
            cb.font = Font(size=10)
            cb.alignment = Alignment(wrap_text=True, vertical="top")
            cb.border = BORDA
            wu.row_dimensions[r].height = 34
        r += 1

    widths(wu, {"A": 26, "B": 60, "C": 34})

    # Ordem final das abas
    wb.move_sheet("Painel", offset=0)
    order = ["Painel", "Comparativo", "Planejado", "Realizado", "Evolução Mensal",
             "Por Plano de Contas", "Pendências", "Como usar"]
    wb._sheets = [wb[n] for n in order]
    wb.active = 0

    wb.save(OUT)
    print("Salvo em", OUT)


BASE = "/home/user/Comit-/orcamento/"
if __name__ == "__main__":
    gerar("Jurídico", BASE + "Orcamento_JURIDICO_2026.xlsx")
    gerar("TI", BASE + "Orcamento_TI_2026.xlsx")
    gerar(None, BASE + "Orcamento_Planejado_x_Realizado_2026.xlsx")
