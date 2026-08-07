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
    # Recebe R$ 5.500 desde jan/26, contra R$ 5.000 orcados. O baseline de R$ 5.000
    # e mantido nos meses ja fechados (jan-jul) para o desvio ficar visivel, e o
    # planejado e revisado para R$ 5.500 de ago em diante — os meses a realizar.
    ("JUR-E03", "Jurídico", "Equipe", "Thamar Victória",
     "Advogada — recebia R$ 4.500/mês em jan–mar e passou a R$ 5.500 em abr/26 "
     "(aumento de R$ 1.000), contra R$ 5.000 orçados. Planejado revisado para "
     "R$ 5.500 a partir de ago/26",
     "PJ", "Pessoal - PJ", [5000.00] * 7 + [5500.00] * 5),
    # Mao de obra esquecida na montagem da ficha, orcada agora pelo ano inteiro.
    ("JUR-E04", "Jurídico", "Equipe", "Dra. Michele de Oliveira Silva",
     "Advogada — R$ 2.750/mês fixos desde jan/26. Não constava na ficha por "
     "esquecimento na montagem do orçamento; incluída na revisão",
     "PJ", "Pessoal - PJ", _12(2750.00)),
    # JURIDICO - DESPESAS
    ("JUR-D01", "Jurídico", "Despesas", "JUSFY",
     "Fase de teste com objetivo de eliminar o Astrea", "",
     "Licenças de Softwares", _12(100.00)),
    ("JUR-D02", "Jurídico", "Despesas", "JUSBRASIL",
     "ORÇAMENTO VEIO ERRADO: orçado R$ 104,90/mês, custo real R$ 136,00/mês. "
     "Corrigir na revisão orçamentária", "",
     "Licenças de Softwares", _12(104.90)),
    ("JUR-D03", "Jurídico", "Despesas", "ASTREA",
     "ORÇAMENTO VEIO ERRADO: orçado R$ 112,07/mês, custo real R$ 346,00/mês. "
     "Corrigir na revisão orçamentária", "",
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
     "Analista Administrativo — suporte ao usuário, rotina administrativa do "
     "orçamento e apoio operacional ao desenvolvimento conduzido pelo consultor. "
     "Orçado pelo custo total (encargos de folha + benefícios). "
     "Salário bruto: R$ 2.570,52/mês até jul/26 e R$ 3.070,52 a partir de 05/08/26, "
     "aumento absorvido pela folga do envelope",
     "CLT", "Pessoal - CLT", _12(VIN)),
    # R$ 1.065/mes ate ago; renegociado para R$ 603,30 a partir de set/26.
    ("TI-E02", "TI", "Equipe", "Elias Benedito",
     "Suporte Técnico Terceirizado — R$ 1.065/mês até ago/26; R$ 603,30 a partir "
     "de set/26 (renegociação)",
     "PJ", "Pessoal - PJ", [1065.00] * 8 + [603.30] * 4),
    # Orcado desde jan/26 pelos 12 meses, conforme a gestora. A ficha trazia
    # R$ 90.000 (9 meses), valor que nao refletia o orcamento aprovado.
    ("TI-E03", "TI", "Equipe", "Jonathan — consultor (desde abr/26)",
     "Consultor/desenvolvedor, 3 dias por semana (104 h/mês) desde abr/26. "
     "Orçado em R$ 10.000/mês desde jan/26; a contratação foi segurada por três "
     "meses. Credor no SIENGE: J H ALVES — MONITOR REMOTO",
     "PJ", "Pessoal - PJ", _12(10000.00)),
    # Vinculo anterior do mesmo prestador: servicos esporadicos, prestados de fora,
    # ate mar/26. Natureza diferente da consultoria fixa, por isso linha separada.
    ("TI-E04", "TI", "Equipe", "Monitor Remoto — serviços esporádicos (até mar/26)",
     "Mesmo prestador do TI-E03, em vínculo anterior: serviços esporádicos "
     "prestados de fora, encerrados quando ele passou a atuar como consultor "
     "fixo em abr/26. Não constava na ficha de orçamento",
     "PJ", "Pessoal - PJ", _12(0.00)),
    # TI - DESPESAS
    ("TI-D01", "TI", "Despesas", "Peças de Manutenção",
     "Tela, teclado, carcaça, mouses de reposição, carregadores etc.", "",
     "Equipamentos Eletrônicos Diversos", _12(810.00)),
    ("TI-D02", "TI", "Despesas", "Backup em Nuvem",
     "Serviço de backup em nuvem para servidor — RATEIO A DEFINIR", "",
     "Licenças de Softwares", _12(825.00)),
    ("TI-D03", "TI", "Despesas", "Inteligência Artificial (Adapta)",
     "Plataforma de IA para utilização de agentes — RATEIO A DEFINIR. Pagamentos "
     "reais de R$ 575/mês estão lançados no centro de custo Jurídico por engano "
     "(ver pendência Q)", "",
     "Licenças de Softwares", [1300.00] * 6 + [1600.00] * 6),
    ("TI-D04", "TI", "Despesas", "Antivírus",
     "Proteção para equipamentos — RATEIO A DEFINIR", "",
     "Licenças de Softwares", _12(240.00)),
    ("TI-D05", "TI", "Despesas", "Pacote Office 365",
     "Licenças de software (conferir nº de licenças x usuários) — RATEIO A DEFINIR", "",
     "Licenças de Softwares", _12(375.00)),
    # Decidido executar so o funcional: cameras, microfones e cadeiras. Consumo e
    # brinde (cafeteira, copos, canetas, blocos) saem para o Administrativo.
    ("TI-D06", "TI", "Despesas", "Projeto Sala de Reunião — itens funcionais",
     "Câmeras, microfones e cadeiras. DECIDIDO executar só o funcional; cafeteira, "
     "copos, canetas e blocos personalizados saem para o Administrativo. Valor a "
     "rever quando vier a quebra entre funcional e consumo", "",
     "Móveis e Utensílios", _12(2800.00)),
    ("TI-D07", "TI", "Despesas", "Cursos e Treinamentos", "", "",
     "Custeio de Treinamento", _12(200.00)),
    ("TI-D08", "TI", "Despesas", "Aplicativo de Gravação de Reunião", "", "",
     "Licenças de Softwares", _12(220.00)),
    # Ferramentas de IA que existem hoje e nao estavam na ficha. Planejado zerado
    # de proposito: a meta sera definida com a diretoria. Lancadas em separado, a
    # pedido da gestora, para dar visibilidade item a item.
    ("TI-D10", "TI", "Despesas", "Claude",
     "Ferramenta de IA — não constava na ficha. Planejado a definir com a "
     "diretoria. RATEIO A DEFINIR: uso transversal entre as áreas",
     "", "Licenças de Softwares", _12(0.00)),
    ("TI-D11", "TI", "Despesas", "GPT",
     "Ferramenta de IA — não constava na ficha. Planejado a definir com a "
     "diretoria. RATEIO A DEFINIR: uso transversal entre as áreas",
     "", "Licenças de Softwares", _12(0.00)),
    ("TI-D12", "TI", "Despesas", "Adapta One",
     "Ferramenta de IA — não constava na ficha. Planejado a definir com a "
     "diretoria. RATEIO A DEFINIR: uso transversal entre as áreas. CONFERIR "
     "sobreposição com a linha 'Inteligência Artificial (Adapta)'",
     "", "Licenças de Softwares", _12(0.00)),
    ("TI-D13", "TI", "Despesas", "Adapta Skip",
     "Ferramenta de IA — não constava na ficha. Planejado a definir com a "
     "diretoria. RATEIO A DEFINIR: uso transversal entre as áreas. CONFERIR o "
     "nome exato do produto e a sobreposição com 'Inteligência Artificial (Adapta)'",
     "", "Licenças de Softwares", _12(0.00)),
    ("TI-D14", "TI", "Despesas", "AnyDesk",
     "Licença de acesso remoto — contratação prevista, não constava na ficha. "
     "Valor e mês de início a definir. CONFERIR sobreposição com o serviço de "
     "monitoramento remoto já contratado (J H Alves)",
     "", "Licenças de Softwares", _12(0.00)),
    ("TI-D09", "TI", "Despesas", "Bonificação do time",
     "Cumprimento de prazos e participação em projetos — CONFIRMAR se houve "
     "parcela no 1º quadrimestre",
     "", "Prêmios", [0] * 7 + [2400.00] + [0] * 3 + [3600.00]),
]

# ---------------------------------------------------------------------------
# Realizado informado pela gestora (05/08/2026): valores constantes de jan a jul,
# os sete meses ja fechados. Ago a dez ficam em branco e serao confirmados no
# decorrer do ano. None = sem lancamento.
# ---------------------------------------------------------------------------
FONTE_JUR = "Gestora, 05/08/26"
_r7 = lambda v: [v] * 7 + [None] * 5

REALIZADO = {
    # Lancado por CAIXA (mes em que o pagamento saiu). O de ago/26 refere-se a
    # julho, pago em 01/08 — ver pendencia sobre competencia x caixa.
    "JUR-E01": ([6750.00] * 7 + [8818.00] + [None] * 4, FONTE_JUR,
                "R$ 6.750/mês de jan a jul; R$ 8.818 pagos em 01/08 (ref. julho). "
                "Lançado por caixa"),
    # Lancado o salario bruto, que e o dado disponivel e nao mudou no ano. Atencao:
    # o orcado desta linha e custo total, entao o desvio dela nao e comparavel —
    # faltam encargos e beneficios do lado do realizado.
    "JUR-E02": (_r7(2886.91), FONTE_JUR,
                "SALÁRIO BRUTO, sem alteração no ano. O orçado é custo total, "
                "então o desvio desta linha NÃO é economia: faltam encargos e "
                "benefícios (~R$ 1.938,61/mês)"),
    # R$ 4.500 de jan a mar; aumento de R$ 1.000 a partir de abr/26.
    # So o fixo mensal e custo do departamento. Os demais lancamentos em nome dela
    # no extrato sao repasse: o cliente paga a empresa e a empresa repassa a ela.
    "JUR-E04": (_r7(2750.00), FONTE_JUR,
                "R$ 2.750/mês fixos desde jan/26. Os demais lançamentos em nome "
                "dela no extrato são REPASSE de honorários pagos pelo cliente — "
                "não são custo do departamento"),
    "JUR-E03": ([4500.00] * 3 + [5500.00] * 4 + [None] * 5, FONTE_JUR,
                "R$ 4.500/mês em jan–mar; aumento de R$ 1.000 a partir de abr/26"),
    "JUR-D01": ([0.00] * 12, FONTE_JUR,
                "Nunca iniciado. Cancelado em jan/26 na fase de experimento e não "
                "será contratado: zero o ano todo"),
    "JUR-D02": (_r7(136.00), FONTE_JUR,
                "R$ 136,00/mês contra R$ 104,90 orçados. Erro no orçamento original"),
    # Anuidade 2026 em 5 parcelas de R$ 1.346,28. Por caixa: 1 parcela em jan e as
    # outras 4 em fev (R$ 150 + R$ 1.196,28 + R$ 4.038,84 de antecipacao). Por
    # competencia as parcelas vao de dez/25 a abr/26. Sem cobranca de mar em diante.
    "JUR-D03": ([1346.28, 5385.12] + [0.00] * 10, "Extrato do financeiro + portal Astrea",
                "Anuidade 2025/26 = R$ 6.731,40 em 5x de R$ 1.346,28 (venc. 01/11/25 a "
                "01/03/26), quitada em 10/02/26. Cancelamento em ago/26, sem renovação "
                "e sem substituto: zero de mar a dez"),
    "JUR-D04": (_r7(970.00), FONTE_JUR, ""),
    "JUR-D05": (_r7(0.00), FONTE_JUR, "Sem gasto no período"),
    "JUR-D06": ([0.00] * 7 + [None] * 5, FONTE_JUR,
                "Sem parcela no 1º semestre; bonificação de ago/26 a confirmar"),
    # AnyDesk ainda nao contratado: zero nos meses fechados, nao falta de lancamento.
    "TI-D14": (_r7(0.00), FONTE_JUR, "Ainda não contratado — sem custo até jul/26"),
    # Equipe de TI — informado pela gestora em 05/08/26. Despesas ainda pendentes.
    "TI-E01": ([None] * 12, "",
               "PREENCHER com o CUSTO TOTAL. Bruto: R$ 2.570,52/mês até jul e "
               "R$ 3.070,52 de ago — faltam encargos e benefícios"),
    "TI-E02": (_r7(0.00), FONTE_JUR, "Sem acionamento no período — confirmar se o contrato segue ativo"),
    # Consultoria fixa: pagamentos de 01/05 em diante.
    "TI-E03": ([0.00] * 4 + [3723.62, 6173.37, 6300.00] + [None] * 5,
               "Extrato do financeiro",
               "01/05 NFS.76 R$ 3.723,62; 01/06 NFS.78 R$ 6.173,37; 01/07 NFS.3 "
               "R$ 6.300,00. Sem pagamento em jan–abr: contratação segurada"),
    # Vinculo esporadico anterior: unico pagamento em jan, encerrado.
    "TI-E04": ([4311.56] + [0.00] * 11, "Extrato do financeiro",
               "19/01 NFS.70 R$ 4.311,56 — serviço esporádico, provavelmente "
               "referente a dez/25. Vínculo encerrado com a entrada como "
               "consultor fixo"),
}

# Linhas cujo realizado esta numa base diferente do orcado (bruto x custo total).
# O desvio delas nao e comparavel, entao recebem status proprio e alerta no Painel.
BASE_DIF = {"JUR-E02": "realizado em salário bruto; orçado em custo total"}

PLANOS = [
    "Pessoal - CLT",
    "Pessoal - PJ",
    "Licenças de Softwares",
    "Custeio de Treinamento",
    "Prêmios",
    "Equipamentos Eletrônicos Diversos",
    "Móveis e Utensílios",
]


# ---------------------------------------------------------------------------
# Contas pagas — extrato do financeiro (jan a jul/2026), carregado do arquivo em
# dados/. Entra como abas de APOIO: o centro de custo desses itens ainda nao foi
# decidido, entao nada daqui alimenta o Planejado, o Realizado ou o Painel.
# ---------------------------------------------------------------------------
EXTRATO = "/home/user/Comit-/orcamento/dados/Contas_Pagas_Juridico_TI.xlsx"

# Palavra-chave no nome do credor -> linha do orcamento que ele provavelmente
# duplica. Serve para a gestora localizar as sobreposicoes e remover a mao.
DE_PARA = [
    ("MIGUEL", "JUR-E01 Miguel Clepf"),
    ("GEOVAN", "JUR-E02 Geovanna"),
    ("THAMAR", "JUR-E03 Thamar Victória"),
    ("JUSFY", "JUR-D01 Jusfy"),
    ("JUSBRASIL", "JUR-D02 Jusbrasil"),
    ("ASTREA", "JUR-D03 Astrea"),
    ("LEME", "JUR-D04 Leme"),
    ("VINICIUS DI FRANCO", "TI-E01 Vinicius Di Franco"),
    ("Vale Alimentação Vinicius", "TI-E01 Vinicius (benefício)"),
    ("ELIAS", "TI-E02 Elias Benedito"),
    ("JONATHAN", "TI-E03 Jonathan"),
    ("J H ALVES", "TI-E03 Jonathan (Monitor Remoto)"),
    ("ADAPTA", "TI-D03 / TI-D12 / TI-D13 (Adapta)"),
    ("OPENAI", "TI-D11 GPT"),
    ("ANTHROPIC", "TI-D10 Claude"),
]


def carrega_extrato():
    """Le o extrato e devolve (lancamentos, meses). Silencioso se o arquivo sumir."""
    try:
        we = openpyxl.load_workbook(EXTRATO, data_only=True).worksheets[0]
    except Exception:
        return [], []
    out = []
    for row in we.iter_rows(min_row=2, max_row=we.max_row, max_col=14):
        v = [c.value for c in row]
        if v[0] is None:
            continue
        mes = str(v[13])[:7]
        out.append({
            "credor": str(v[0]).strip(),
            "doc": str(v[2] or ""),
            "titulo": str(v[3] or ""),
            "dtpag": str(v[5] or ""),
            "valor": v[10] or 0,
            "cc": str(v[11] or "").strip(),
            "empresa": str(v[12] or "").strip(),
            "mes": mes,
        })
    meses = sorted({r["mes"] for r in out})
    return out, meses


def de_para(credor):
    alvo = credor.upper()
    for chave, linha in DE_PARA:
        if chave.upper() in alvo:
            return linha
    return ""


# Conciliacao Astrea: cobrancas na plataforma do fornecedor x pagamentos no SIENGE.
# Mesmo total, datas divergentes — duas parcelas debitadas no cartao em 2025 so
# aparecem lancadas no SIENGE em 2026.
CONC_ASTREA_PLAT = [
    ("01/11/25", "Parcela 1/5 — anuidade 2025/26", 1346.28),
    ("01/12/25", "Parcela 2/5 — anuidade 2025/26", 1346.28),
    ("01/01/26", "Parcela 3/5 — anuidade 2025/26", 1346.28),
    ("01/02/26", "Parcela 4/5 — anuidade 2025/26", 1346.28),
    ("01/03/26", "Parcela 5/5 — anuidade 2025/26", 1346.28),
]
CONC_ASTREA_SIENGE = [
    ("05/01/26", "AV.Mens_1225", 1346.28),
    ("04/02/26", "NF.Men_0126", 150.00),
    ("04/02/26", "NF.Men_0126", 1196.28),
    ("10/02/26", "AV.Anuidade_2026", 4038.84),
]

EXTRATO_LANC, EXTRATO_MESES = carrega_extrato()
# O extrato usa "Júridico" e "T.I"; o orcamento usa "Jurídico" e "TI".
CC_DO_DEPTO = {"Jurídico": "Júridico", "TI": "T.I"}

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
    ("A", "Geovanna — realizado em base diferente do orçado",
     "O planejado dela é R$ 4.825,52/mês, que é o CUSTO TOTAL orçado na ficha "
     "(salário + encargos de folha + benefícios). O realizado lançado é o SALÁRIO "
     "BRUTO, R$ 2.886,91/mês, confirmado sem alteração no ano. São bases "
     "diferentes.",
     "O desvio desta linha (−R$ 1.938,61/mês, −R$ 13.570,24 no acumulado jan–jul) "
     "NÃO é economia: é o encargo que falta do lado do realizado. Para fechar, "
     "peça ao RH o custo total mensal dela — ou o percentual de encargos da "
     "empresa, que dá para calcular a partir do bruto.",
     "Cristiane + RH", "BASE DIFERENTE", "Jurídico"),
    ("B", "Vinicius — custo total A LANÇAR",
     "Mesmo caso da Geovanna. O planejado é R$ 5.416,525/mês (custo total). Brutos "
     "confirmados: R$ 2.570,52 até jul/26 e R$ 3.070,52 a partir de 05/08/26 — o "
     "aumento é absorvido pela folga do envelope, que já previa reajuste, então o "
     "orçado não muda. O realizado está em branco.",
     "A folga do orçado NÃO é economia estrutural. Com o bruto de agosto, sobram "
     "R$ 2.346,01 para encargos, o que equivale a 76% sobre o bruto — dentro da "
     "faixa normal (67% a 80%), então pode sobrar ou estourar. Só o custo total "
     "real vai dizer.",
     "Cristiane + RH", "A LANÇAR", "TI"),
    ("C", "Aumento da Thamar em abr/26",
     "Recebia R$ 4.500/mês de jan a mar, abaixo dos R$ 5.000 orçados. Em abr/26 "
     "teve aumento de R$ 1.000 e passou a R$ 5.500, acima do orçado. O planejado "
     "foi mantido em R$ 5.000 nos sete meses fechados (para o desvio ficar visível) "
     "e revisado para R$ 5.500 de ago a dez.",
     "No acumulado jan–jul o efeito líquido é de apenas R$ 500 acima do orçado "
     "(−R$ 1.500 em jan–mar, +R$ 2.000 em abr–jul), e mais R$ 2.500 previstos até "
     "dezembro. Ao contrário do aumento do Vinicius, este estourou o orçado: não "
     "havia folga na linha dela.",
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
    ("F", "Jonathan — economia de R$ 53.803 até julho",
     "Orçado R$ 10.000/mês desde jan/26, com a contratação segurada até abr/26, "
     "quando ele passou a atuar como consultor fixo, 3 dias por semana. "
     "Realizado de R$ 16.196,99 em jan–jul (pagamentos de mai, jun e jul) contra "
     "R$ 70.000 orçados. O vínculo anterior, de serviços esporádicos prestados "
     "de fora, foi separado na linha TI-E04.",
     "É de longe a maior economia das duas áreas: R$ 53.803,01 em sete meses, e "
     "decorre de decisão de gestão, não de erro de orçamento. Vale destacar na "
     "apresentação. A CONFERIR: mai e jun saíram abaixo de R$ 6.300 "
     "(R$ 3.723,62 e R$ 6.173,37) — verificar se foi proporcional aos dias "
     "trabalhados no início do contrato.",
     "Cristiane", "CONFERIR", "TI"),
    ("Z", "Serviços esporádicos do Monitor Remoto — fora do orçamento",
     "Antes de entrar como consultor fixo, o mesmo prestador atendia de fora, em "
     "serviços esporádicos. Consta um pagamento de R$ 4.311,56 em 19/01/26 "
     "(NFS.70), provavelmente referente a dez/25 pelo regime de caixa. Esse "
     "vínculo não estava na ficha de orçamento e foi encerrado em abr/26.",
     "Linha TI-E04 criada com planejado zero, então o valor aparece como 'Não "
     "orçado'. Como o vínculo acabou, não haverá novos lançamentos — a linha "
     "existe para o histórico não se misturar com a consultoria fixa. Confirmar "
     "se houve pagamento esporádico em fev e mar que não caiu no centro de custo "
     "do TI.",
     "Cristiane", "CONFERIR", "TI"),
    ("G", "Elias Benedito — sem custo até jul, renegociado para set",
     "Orçado R$ 1.065/mês, realizado R$ 0 de jan a jul — contrato ativo, mas sem "
     "acionamento no período (confirmado pela gestora). O pagamento passa a "
     "ocorrer agora, e a partir de set/26 o valor foi renegociado de R$ 1.065 "
     "para R$ 603,30.",
     "Duas economias na mesma linha: R$ 7.455 pelos sete meses sem acionamento, e "
     "R$ 461,70/mês (43%) a partir de set pela renegociação — R$ 1.846,80 no ano. "
     "O planejado já reflete o valor novo de set a dez.",
     "Cristiane", "RESOLVIDO", "TI"),
    ("H", "Planejado de jan a abr — conferido",
     "O 1º quadrimestre foi preenchido replicando os valores mensais conhecidos, "
     "porque a ficha original só trazia o grid de mai a dez. Exceções tratadas: "
     "Jonathan começa em abr, Thamar a R$ 5.000 (pré-reajuste), Vinicius com bruto "
     "de R$ 2.570,52 e Adapta a R$ 1.300 (valor até jun).",
     "Conferido e validado pela gestora: os valores replicados estão corretos, "
     "nenhum ajuste necessário.",
     "Cristiane", "APLICADO", ""),
    ("I", "Realizado de ago a dez — a lançar no decorrer do ano",
     "Jan a jul estão lançados. Ago a dez ficam em branco e serão preenchidos "
     "conforme os meses fecharem, com a extração do SIENGE.",
     "Enquanto isso, o mês de referência do Comparativo deve ficar no último mês "
     "fechado (hoje Jul/26) — assim o acumulado compara períodos iguais dos dois "
     "lados.",
     "Cristiane", "APLICADO", ""),
    ("M", "Despesas fora do orçamento identificadas no extrato",
     "O extrato do financeiro traz gastos relevantes sem linha na ficha. "
     "Jurídico: Carneiro Rabelo (R$ 107.742) e Cristiane Carneiro Rabelo "
     "(R$ 94.825), somando R$ 202.567 em sete meses; mais Tribunal de Justiça "
     "(R$ 49.244), Michele de Oliveira (R$ 23.572) e ONR (R$ 22.576). "
     "TI: um bloco de telefonia e infraestrutura de cerca de R$ 15.700 (Claro, "
     "TIM, Telefônica, Locaweb, Web Mobile, Sabha, Intelbras, VC1, Alfama). "
     "O 'J H Alves — Monitor Remoto' NÃO entra nesta lista: é o Jonathan, que já "
     "tem linha no orçamento (TI-E03).",
     "Só os dois primeiros credores do Jurídico superam o orçamento anual inteiro "
     "do departamento. ATENÇÃO: parte desses valores pode ser repasse ou custa "
     "reembolsável pelo cliente, e não custo da área — foi o caso da Dra. Michele "
     "(ver item P). Separar o que é custo antes de decidir. Para os que entrarem "
     "no centro de custo, criar linha no orçamento, senão aparecerão como 'Não "
     "orçado' e distorcerão o comparativo.",
     "Cristiane + Diretoria", "PAUTA REUNIÃO", ""),
    ("J", "Despesas do TI — A LANÇAR",
     "As 9 linhas de despesas do TI (peças, backup, Adapta, antivírus, Office, "
     "sala de reunião, cursos, app de gravação e bonificação) não têm lançamento "
     "em nenhum mês.",
     "São R$ 89.040 orçados no ano, 35% do orçamento do TI. Sem lançamento, o "
     "departamento aparece com desvio negativo que é ausência de dado.",
     "Cristiane", "A LANÇAR", "TI"),
    ("1", "Base de meses do TI — Jonathan corrigido para 12 meses",
     "A ficha trazia os totais do TI digitados à mão: Vinicius e Elias em 12 meses "
     "(R$ 64.998,30 e R$ 12.780,00, ambos confirmados) e Jonathan em 9 meses "
     "(R$ 90.000). A gestora confirmou que o orçamento dele valia desde jan/26, ou "
     "seja, 12 meses — os R$ 90.000 da ficha não refletiam o orçamento aprovado.",
     "Equipe de TI passa de R$ 167.778,30 para R$ 197.778,30 (+R$ 30.000). "
     "Os R$ 167.778,30 da ficha continuam batendo com Vinicius e Elias, mas a "
     "linha do Jonathan estava subdimensionada em 3 meses.",
     "Cristiane", "RESOLVIDO", "TI"),
    ("2", "Origem do valor realizado — DEFINIDA: SIENGE",
     "Será aberto um centro de custo próprio no SIENGE e todos os valores do "
     "realizado serão extraídos de lá. Nada será lançado manualmente. O extrato "
     "das abas 'Contas Pagas' já vem nesse formato.",
     "O realizado passa a bater com a contabilidade por construção, que era o "
     "risco principal. Duas coisas a encaminhar: (1) o de-para entre credor do "
     "SIENGE e linha do orçamento — a coluna 'Já está no orçamento?' da aba de "
     "resumo é o rascunho dele; (2) definir se a extração sai por regime de caixa "
     "ou de competência, ver item 7.",
     "Cristiane + Financeiro", "RESOLVIDO", ""),
    ("3", "Jusfy — nunca iniciado",
     "O Jusfy entrou na ficha porque o orçamento foi montado em nov/dez de 2025, "
     "durante a fase de experimento. Em janeiro a decisão foi cancelar, e o "
     "serviço nunca chegou a ser iniciado. Custo zero o ano todo.",
     "Os R$ 1.200 orçados no ano nunca serão usados, e a gestora confirmou que "
     "não haverá substituto para o Astrea. Não é economia de gestão: é item que "
     "já nasceu fora do escopo e deve sair na revisão do orçamento.",
     "Cristiane", "RESOLVIDO", "Jurídico"),
    ("N", "Astrea — cancelar antes de 01/11/26 (renovação automática)",
     "Anuidade 2025/26 de R$ 6.731,40 em 5x de R$ 1.346,28, com vencimentos de "
     "01/11/25 a 01/03/26 e quitação em 10/02/26 — conferido contra o portal do "
     "fornecedor. Cancelamento solicitado em ago/26, sem substituto. Realizado "
     "zerado de mar a dez.",
     "ATENÇÃO AO PRAZO: o ciclo do Astrea começa sempre em 1º de novembro e a "
     "cobrança é automática em cartão (Visa final 4957) — não passa por aprovação "
     "de boleto. Se o cancelamento não estiver confirmado até 01/11/26, entra a "
     "anuidade 2026/27, que pelo histórico de reajuste (+83% e depois +10,1%) "
     "sairia por volta de R$ 7.400. O responsável financeiro cadastrado no "
     "fornecedor é a Thamar. Guardar a confirmação por escrito.",
     "Cristiane + Thamar", "PRAZO 01/11", "Jurídico"),
    ("O", "Dra. Michele incluída no orçamento",
     "Mão de obra que ficou de fora da ficha por esquecimento na montagem do "
     "orçamento. Orçada em R$ 2.750/mês pelo ano inteiro, valor fixo em vigor "
     "desde jan/26.",
     "Acréscimo de R$ 33.000 ao orçamento do Jurídico, que passa a R$ 324.730,42. "
     "No extrato, o fixo de jan a jun vem somado aos honorários de repasse no "
     "mesmo credor: o total mensal (R$ 3.739 a R$ 4.326) é o fixo de R$ 2.750 "
     "mais o repasse, que o cliente paga e a empresa apenas transfere. Só jun/26 "
     "fica abaixo do fixo (R$ 1.036,92), provavelmente porque o pagamento daquele "
     "mês caiu em jul — é o lançamento isolado de R$ 2.750 que aparece lá. "
     "A justificativa da inclusão é pauta da reunião.",
     "Cristiane + Diretoria", "APLICADO", "Jurídico"),
    ("Q", "Adapta lançado no centro de custo errado — RECLASSIFICAR",
     "Os pagamentos do Adapta (ADAPTA EDUCACAO LTDA, contrato 4134643529) estão "
     "no centro de custo Jurídico no SIENGE: R$ 575,00/mês de jan a mai e "
     "R$ 476,00 em jun, todos com vencimento dia 15. Total de R$ 3.351,00 em seis "
     "meses. Não é despesa do Jurídico — é ferramenta de IA, de uso transversal.",
     "DECIDIDO: solicitar a reclassificação contábil ao financeiro agora, sem "
     "esperar a abertura do centro de custo novo. Enquanto não for corrigido, o "
     "Jurídico carrega R$ 3.351 que não são dele e o TI aparece sem um gasto que "
     "é seu — as duas áreas ficam com o comparativo errado ao mesmo tempo. "
     "O que pedir ao financeiro: reclassificar os seis lançamentos do contrato "
     "4134643529 (jan a jun/26) do centro de custo Jurídico para o de TI, e "
     "ajustar a classificação dos próximos para não repetir. Depois de "
     "reclassificado, aplicar o rateio do item L, já que é ferramenta de uso "
     "transversal. Quando o centro de custo novo abrir, conferir se a "
     "classificação nasceu certa.",
     "Cristiane + Financeiro", "SOLICITADA", ""),
    ("P", "Extrato contém REPASSES, não só custo",
     "Os lançamentos em nome da Dra. Michele até jun/26 (R$ 20.821,53) são "
     "repasse: o cliente paga à empresa e a empresa repassa a ela. Não são custo "
     "do departamento e por isso não foram lançados no realizado.",
     "Vale a mesma checagem nos outros credores das abas 'Contas Pagas' antes de "
     "usá-los como custo — em especial custas processuais e honorários de "
     "terceiros, que podem ser reembolsados pelo cliente. O total de R$ 446.577,92 "
     "do centro de custo Jurídico no extrato NÃO é despesa líquida do "
     "departamento.",
     "Cristiane + Financeiro", "CONFERIR", "Jurídico"),
    ("K", "ORÇAMENTO VEIO ERRADO — Astrea e Jusbrasil",
     "ASTREA: orçado R$ 112,07/mês, o que dá R$ 1.344,84 no ano — praticamente o "
     "valor de UMA das cinco parcelas (R$ 1.346,28). Quem montou a ficha tomou uma "
     "parcela pelo custo total do ano. O custo real da anuidade foi R$ 6.731,40, "
     "5x o orçado. JUSBRASIL: orçado R$ 104,90/mês contra R$ 136,00 reais (1,3x), "
     "R$ 373,20 no ano. PAUTA PARA A REUNIÃO COM A DIRETORIA.",
     "Subdimensionamento de R$ 5.759,76 no ano (R$ 5.386,56 do Astrea + R$ 373,20 "
     "do Jusbrasil). O planejado das duas linhas foi mantido como veio na ficha, "
     "de propósito, para o erro aparecer no comparativo em vez de ser corrigido "
     "em silêncio. Não é estouro de gestão: é erro na origem. Como o Astrea será "
     "cancelado, o efeito prático é só de 2026 — mas o método de orçar serviços "
     "parcelados precisa ser revisto para o ano que vem.",
     "Cristiane + Diretoria", "PAUTA REUNIÃO", "Jurídico"),
    ("L", "Ferramentas de IA — DEFINIR META E RATEIO",
     "Claude, GPT, Adapta One e Adapta Skip existem hoje e não constavam na "
     "ficha. Quatro linhas criadas com planejado zerado, à espera da meta. Todas "
     "marcadas com RATEIO A DEFINIR: são de uso transversal, não exclusivo do TI.",
     "O rateio já acontece de fato, mas sem regra: no extrato, a OpenAI "
     "(R$ 5.950,10) caiu no centro de custo do TI e o Adapta (R$ 3.351) caiu no "
     "Jurídico — mesma natureza de gasto, centros diferentes por acaso. Sem "
     "critério definido, o TI absorve custo de ferramenta que a empresa inteira "
     "usa e aparece caro na comparação, enquanto as áreas usuárias não enxergam o "
     "que consomem. Sugestão: manter o contrato centralizado no TI (facilita "
     "negociação e controle de licenças) e ratear o custo por usuário ativo, que "
     "é métrica que as próprias plataformas fornecem. Conferir também a "
     "sobreposição com 'Inteligência Artificial (Adapta)', já orçada em "
     "R$ 17.400/ano, e o nome exato do 'Adapta Skip'.",
     "Cristiane + Diretoria", "PAUTA REUNIÃO", "TI"),
    ("4", "Rateio dos softwares corporativos e das IAs",
     "Backup (R$ 9.900), Adapta/IA (R$ 17.400), Antivírus (R$ 2.880) e Office 365 "
     "(R$ 4.500) estão marcados na ficha como 'não sei se seria administrativo' — "
     "R$ 34.680 no ano. Somam-se a eles as quatro ferramentas de IA do item L, "
     "também de uso transversal.",
     "São 39% das despesas orçadas do TI, mais o que vier das IAs. Se são da "
     "empresa toda e ficam no centro de custo de TI, o departamento carrega "
     "despesa que não é dele e aparece caro. Tratar os dois blocos com o mesmo "
     "critério de rateio, para não criar duas regras diferentes.",
     "Cristiane + Controladoria", "EM ABERTO", "TI"),
    ("5", "Sala de Reunião — DECIDIDO: executar só o funcional",
     "DECISÃO DA GESTORA: mexer somente no que for funcional. Entram os itens de "
     "infraestrutura de reunião — câmeras, microfones e cadeiras. Ficam de fora "
     "cafeteira, copos, canetas e blocos personalizados, que são consumo e "
     "brinde, pertencem ao Administrativo (item U) e não resolvem o problema da "
     "sala. O orçamento atual é de R$ 2.800/mês, R$ 33.600 no ano, sem nenhum "
     "lançamento até jul/26.",
     "FALTA A QUEBRA DO VALOR: quanto dos R$ 33.600 é funcional e quanto é "
     "consumo. Só com isso dá para ajustar a linha e liberar a diferença. "
     "Levantar orçamento dos itens funcionais antes de comprar. Definir também se "
     "é compra pontual ou parcelada — hoje está diluída linearmente em 12 meses, "
     "e se for compra única o desvio vai acusar economia falsa todo mês até a "
     "compra e um pico no mês em que ocorrer. Segue de pé a observação da "
     "gestora de que a sala já não comporta todas as pessoas: o funcional "
     "melhora a qualidade da reunião, não a capacidade — se o problema de espaço "
     "precisar de solução, é projeto à parte.",
     "Cristiane", "QUEBRAR VALOR", "TI"),
    ("R", "Notebooks — TI compra, mas não enxerga o saldo das áreas",
     "Cada área tem a própria linha de orçamento para notebooks, mas é o TI que "
     "recebe a solicitação e executa a compra quando surge a necessidade. Hoje o "
     "TI não tem acompanhamento do orçamento das outras áreas, então aprova "
     "pedidos sem saber quanto resta em cada uma.",
     "O TI vira o executor de um estouro que não é dele e que ninguém percebe "
     "antes de acontecer — a área descobre no fechamento, quando já comprou. "
     "Proposta: o TI passa a acompanhar o saldo da rubrica de notebooks de cada "
     "área e avisa quando a solicitação for levar ao estouro, antes de comprar. "
     "Com o centro de custo no SIENGE, esse acompanhamento sai do mesmo "
     "relatório. Definir com a diretoria quem dá o aval quando o saldo acabar: "
     "a área solicitante, o TI ou a controladoria.",
     "Cristiane + Diretoria", "PAUTA REUNIÃO", "TI"),
    ("S", "Rubricas genéricas — detalhar no lançamento, não no orçamento",
     "Rubricas como 'Peças de Manutenção' (R$ 9.720/ano) agrupam itens de "
     "naturezas diferentes: mouse, teclado, carregador, tela, carcaça. Sem "
     "detalhe, não dá para saber o que puxa o gasto. A alternativa de criar uma "
     "linha por item foi avaliada e descartada por ora.",
     "DECIDIDO: manter uma linha de orçamento e detalhar na DESCRIÇÃO do "
     "lançamento no SIENGE, com padrão fixo ('Peças – mouse', 'Peças – tela'). "
     "Motivos: (1) não há histórico — as despesas do TI ainda não têm lançamento, "
     "então orçar item a item seria estimativa sem base, e cada linha acusaria "
     "desvio pela divisão errada, não pelo gasto; (2) cinco linhas viram cinco "
     "lançamentos mensais para uma rubrica que é 11% das despesas da área; (3) o "
     "plano de contas é definido pela controladoria, então subitens no orçamento "
     "não mudariam a classificação contábil. Em jan/27, com seis meses de dados "
     "reais, reavaliar. Se separar, separar por NATUREZA (reposição x reparo), "
     "que é o que dá leitura gerencial, e não item a item. Mesmo critério vale "
     "para 'Equipamentos Eletrônicos Diversos' e demais rubricas genéricas.",
     "Cristiane", "APLICADO", "TI"),
    ("T", "Política de troca 1x1 e empréstimo — IMPLANTAR",
     "Hoje não existe regra: o pedido chega e a compra é feita. A proposta é que "
     "para receber um item novo a pessoa entregue o que quebrou (troca 1x1), e "
     "que exista um equipamento reserva para empréstimo imediato, para ninguém "
     "ficar parado esperando. O reserva é COM FIO de propósito: mais barato e "
     "menos confortável que o definitivo, o que cria o incentivo natural para "
     "devolver e fechar a troca. A aba 'Controle de Equipamentos' já está pronta "
     "para o registro.",
     "APROVADA pela gestora, com prazo de empréstimo de 7 DIAS CORRIDOS — "
     "passou disso, vira 'Atrasado' e o TI cobra a devolução. A aba de controle "
     "já destaca em vermelho quem passar do prazo. Além de controlar estoque, a "
     "troca 1x1 gera dado de durabilidade e padrão de uso: se uma área quebra "
     "três vezes mais que as outras, isso aparece. "
     "Falta encaminhar: (1) comunicar a regra e o prazo às áreas; (2) montar o "
     "estoque de reserva com fio; (3) verificar com o financeiro se o lançamento "
     "pode nascer no centro de custo da área solicitante — se puder, o controle "
     "de custo por área sai do próprio SIENGE e esta aba fica só para o que ainda "
     "não virou pagamento.",
     "Cristiane + Vinicius", "APROVADA", "TI"),
    ("U", "Papelaria não é TI — manter no Administrativo",
     "Recomendação registrada: o controle de papelaria (canetas, blocos, papel, "
     "copos) deve ficar no Administrativo/Facilities, não no TI. O TI controla "
     "equipamento porque há decisão TÉCNICA envolvida — se o notebook precisa "
     "de troca ou só de formatação, se a tela quebrou por defeito ou por queda. "
     "Não existe decisão técnica em caneta e bloco.",
     "CONFIRMADO pela gestora: papelaria fica no Administrativo. Três diferenças "
     "sustentam a separação: (1) papelaria acaba, não quebra, então a regra de "
     "troca 1x1 não se aplica — o controle é de estoque por ponto de pedido, "
     "outra lógica; (2) não há patrimônio nem número de série para rastrear item "
     "a item; (3) o custo de controlar uma caneta é maior que a caneta. "
     "A VERIFICAR: se hoje há papelaria caindo no orçamento ou no centro de custo "
     "do TI por motivo histórico. Se houver, entra no mesmo pedido de "
     "reclassificação do Adapta (item Q). Vale conferir também os itens de "
     "consumo que estavam no projeto da sala de reunião — cafeteira, copos, "
     "canetas e blocos personalizados —, que por esta decisão saem do TI.",
     "Cristiane + Administrativo", "CONFIRMADA", "TI"),
    ("V", "AnyDesk — contratação prevista, definir valor",
     "Licença de acesso remoto que será contratada e não constava na ficha. Linha "
     "criada com planejado zerado, à espera do valor e do mês de início.",
     "Ainda não contratado — realizado zerado até jul/26, e não falta de "
     "lançamento. Não há sobreposição com o 'Monitor Remoto' do extrato: aquele "
     "credor é o Jonathan (J H Alves), consultor, não um software de acesso "
     "remoto. É contratação nova, sem substituto atual. Definir valor e mês antes "
     "de assinar — enquanto o planejado for zero, qualquer lançamento aparece "
     "como 'Não orçado'.",
     "Cristiane", "DEFINIR VALOR", "TI"),
    ("W", "Vitor (diretoria) — Claude ou GPT? PERGUNTAR",
     "Confirmar com o Vitor se ele seguirá usando o Claude, o GPT, ou os dois. "
     "Hoje as duas ferramentas estão contratadas e são de mesma finalidade — IA "
     "generalista —, então manter as duas para o mesmo usuário é redundância "
     "paga.",
     "É pré-requisito para fechar a meta do item L: não dá para dimensionar o "
     "orçamento de IA sem saber quantas licenças de cada ferramenta ficam de pé. "
     "Referência de custo: a OpenAI aparece no extrato com R$ 5.950,10 em sete "
     "meses, sendo R$ 5.394 só em abr/26. Levantar a mesma informação para os "
     "demais usuários, não só a diretoria — a decisão vale para todo mundo.",
     "Cristiane + Vitor", "PERGUNTAR", "TI"),
    ("X", "Mapa de licenças de IA — quem usa o quê",
     "Situação atual conhecida: a licença do GPT era da Thamar e hoje é usada em "
     "conjunto por Gil, Miguel e Thamar. Uma licença também foi cedida ao "
     "Financeiro. Falta o mapa completo — quem usa cada ferramenta, em qual área "
     "e sob qual login.",
     "Duas consequências. ORÇAMENTO: uma licença usada pelo Financeiro é custo de "
     "outra área lançado no TI/Jurídico — é exatamente o caso que o rateio do "
     "item L precisa resolver, e sem o mapa não há como ratear. RISCO: contas de "
     "IA generalista são individuais, e o compartilhamento entre pessoas costuma "
     "contrariar os termos de uso do fornecedor, com risco de suspensão. Mais "
     "grave num escritório de advocacia: o histórico de conversas fica visível "
     "para todos que usam o mesmo login, então dados de um cliente podem ser "
     "vistos por quem não atua no caso — questão de sigilo profissional, não só "
     "de custo. Avaliar licenças individuais ou plano de equipe, que costuma sair "
     "mais barato por usuário e separa os históricos.",
     "Cristiane + Vitor", "LEVANTAR", "TI"),
    ("Y", "Divisão de responsabilidades no acompanhamento",
     "Definição de quem faz o quê no controle orçamentário do TI. Capacidades: "
     "Vinicius, analista, 173 h/mês a R$ 31,25/h de custo total; Jonathan, "
     "consultor/desenvolvedor, 3 dias por semana, 104 h/mês a R$ 60,58/h — o "
     "dobro. Cristiane na gestão.",
     "VINICIUS (suporte + recorrente + apoio ao desenvolvimento): suporte ao "
     "usuário; extração mensal do SIENGE e lançamento do realizado; controle de "
     "equipamentos (solicitações, empréstimos, troca 1x1); acompanhamento do "
     "saldo por área para avisar antes do estouro; conferência de faturas contra "
     "contrato; e apoio operacional ao Jonathan no que o desenvolvimento exigir. "
     "Esse apoio é o que multiplica as 104 h/mês do consultor: cada tarefa "
     "operacional que sai das mãos dele por R$ 31,25/h é uma hora de R$ 60,58 "
     "liberada para o que só ele faz. "
     "JONATHAN (pontual e técnico, nunca rotina): avaliar AnyDesk x Monitor "
     "Remoto, avaliar Claude x GPT e planos de equipe, e automatizar a extração "
     "do SIENGE — esta última é a que paga o custo dele, porque devolve tempo do "
     "analista todos os meses. "
     "CRISTIANE: negociação de contratos, rateio, o que entra e sai do orçamento, "
     "apresentação à diretoria. "
     "Critério: 104 h/mês é capacidade limitada, e cada hora do consultor em "
     "tarefa administrativa custa o dobro da mesma hora do analista. Se o "
     "Jonathan aparecer na rotina mensal, é sinal de que algo deveria ter sido "
     "automatizado.",
     "Cristiane", "APLICADO", "TI"),
    ("6", "Office 365 — CONFIRMAR se R$ 440 é por licença ou o total",
     "A gestora esclareceu a estrutura: cada licença atende 6 funcionários e "
     "custa R$ 440. Com 10 licenças, fecham os 60 usuários da ficha. Falta "
     "confirmar UMA coisa: os R$ 440 são o valor de CADA licença ou o total pago "
     "por mês? Não há lançamento de Microsoft/Office no extrato de jan a jul, o "
     "que também precisa ser explicado — é custo mensal e deveria aparecer.",
     "A diferença entre as duas leituras é enorme. Se R$ 440 for o total: "
     "R$ 5.280/ano, R$ 780 acima dos R$ 4.500 orçados — ajuste pequeno. Se for "
     "por licença: 10 x R$ 440 = R$ 4.400/mês, R$ 52.800/ano, R$ 48.300 acima do "
     "orçado — sozinho maior que todas as despesas orçadas do TI, e o orçamento "
     "da área estaria comprometido. Confirmar antes da reunião.",
     "Cristiane", "CONFIRMAR", "TI"),
    ("7", "Competência x caixa — DECIDIR O REGIME",
     "Confirmado pela gestora: TODOS os PJs das duas áreas prestam o serviço e "
     "recebem no mês seguinte — no Jurídico, Miguel, Thamar e Dra. Michele; no "
     "TI, Elias e Jonathan. O que foi pago em jan/26 é serviço de dez/2025, e o "
     "serviço de dez/26 só será pago em jan/2027. Hoje o realizado está lançado "
     "por CAIXA (mês do pagamento), que é como os valores foram informados, "
     "enquanto o orçamento foi montado por COMPETÊNCIA (mês do serviço). São "
     "bases diferentes no mesmo comparativo.",
     "RECOMENDAÇÃO: migrar para competência, deslocando os PJs um mês para trás. "
     "Motivos: (1) o orçamento já é de competência, então acaba a comparação de "
     "bases diferentes; (2) por caixa, o ano de 2026 carrega um mês de 2025 e "
     "perde dez/26, o que distorce sempre que o valor muda no meio do ano — no "
     "Miguel, R$ 47.250 por caixa contra R$ 49.318 por competência em jan–jul, "
     "R$ 2.068 de diferença; (3) o SIENGE gera os dois regimes, então é escolha "
     "de configuração. Contra: caixa é mais fácil de bater com o extrato "
     "bancário. Decidir UMA vez e manter, senão o histórico mistura critérios. "
     "ATENÇÃO NO JONATHAN: o planejado dele começa em abr/26 (competência) e o "
     "realizado também foi lançado a partir de abr (caixa) — se ele recebe no mês "
     "seguinte, o pagamento de abril é serviço de março, e ou a entrada dele foi "
     "em março, ou o realizado de abril deveria ser zero. Conferir junto com a "
     "decisão do regime.",
     "Cristiane + Financeiro", "DECIDIR", ""),
]

_rl = [k for k, v in REALIZADO.items() if len(v[0]) != NM]
assert not _rl, "realizado com nº de meses errado: {0}".format(_rl)

_ruins = [p[0] for p in PEND if len(p) != 7]
assert not _ruins, "pendencias com nº de campos errado: {0}".format(_ruins)


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
        vals, fonte, obs = REALIZADO.get(lid, ([None] * NM, "", ""))
        for j in range(NM):
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
        # Linha em base divergente nao pode receber o status generico: "Abaixo do
        # orcado" leria como economia o que e so encargo faltando no realizado.
        if LIN[i][0] in BASE_DIF:
            formulas[14] = "⚠ Base diferente"
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
        # Coluna Q: desvio COMPARAVEL. Linha em base divergente fica vazia para nao
        # contaminar os totais de economia — e o unico jeito de o numero levado a
        # diretoria se sustentar quando questionado.
        # Coluna R: chave de ranking das economias (espelho da O, sinal invertido).
        if LIN[i][0] in BASE_DIF:
            wc.cell(row=rc, column=17, value=None)
        else:
            # P=0 significa linha sem nenhum lancamento: desvio dela e ausencia de
            # dado, nao economia. Deixar de fora e o que faz o numero se sustentar.
            wc.cell(row=rc, column=17,
                    value='=IF(P{0}=0,"",K{0})'.format(rc))
        wc.cell(row=rc, column=18,
                value='=IF(AND(Q{0}<>"",Q{0}<-1),-Q{0}+ROW()/1000000,"")'.format(rc))
        wc.cell(row=rc, column=19, value='=IF(Q{0}="","",I{0})'.format(rc))
        for cc in (17, 18, 19):
            wc.cell(row=rc, column=cc).font = Font(size=8, color="BFBFBF")
            wc.cell(row=rc, column=cc).number_format = MOEDA

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
    wc.column_dimensions["Q"].hidden = True
    wc.column_dimensions["R"].hidden = True
    wc.column_dimensions["S"].hidden = True
    wc.cell(row=CH, column=19, value="(aux planejado comparável)").font = Font(size=8, color="BFBFBF")
    wc.cell(row=CH, column=17, value="(aux desvio comparável)").font = Font(size=8, color="BFBFBF")
    wc.cell(row=CH, column=18, value="(aux ranking economia)").font = Font(size=8, color="BFBFBF")
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

    # Alerta de bases divergentes: sem isso, "9 de 9 linhas lançadas" sugere que o
    # numero esta fechado quando ha linha comparando bruto contra custo total.
    avisos = [(l[3], BASE_DIF[l[0]]) for l in LIN if l[0] in BASE_DIF]
    if avisos:
        wp.merge_cells(start_row=4, start_column=1, end_row=4, end_column=9)
        txt = "  ".join("⚠ {0}: {1} — o desvio desta linha não é economia.".format(a, b)
                        for a, b in avisos)
        ca = wp.cell(row=4, column=1, value=txt)
        ca.font = Font(bold=True, size=9, color="9C0006")
        ca.fill = PatternFill("solid", fgColor="FFC7CE")
        ca.alignment = Alignment(vertical="center", indent=1)
        wp.row_dimensions[4].height = 20

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
    # ------------------------------------------------------------------
    # Bloco de economia. So entra desvio COMPARAVEL (coluna Q do Comparativo):
    # linha em base divergente fica de fora, senao o numero nao resiste a
    # questionamento na diretoria.
    # ------------------------------------------------------------------
    r += 2
    QQ = "Comparativo!$Q${0}:$Q${1}".format(CF, CF_END)
    wp.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
    c = wp.cell(row=r, column=1,
                value="ECONOMIA GERADA — acumulado de janeiro até o mês de referência")
    c.font = Font(bold=True, size=12, color=BRANCO)
    c.fill = PatternFill("solid", fgColor="1E6B3A")
    c.alignment = Alignment(indent=1, vertical="center")
    wp.row_dimensions[r].height = 24
    r += 1

    eco_ini = r
    kpis = [
        ("Economia bruta", '=-SUMIF({0},"<0")'.format(QQ),
         "Soma de tudo que ficou abaixo do orçado"),
        ("(−) Gastos acima do orçado", '=-SUMIF({0},">0")'.format(QQ),
         "Estouros que consomem parte da economia"),
        ("= ECONOMIA LÍQUIDA", '=-SUM({0})'.format(QQ),
         "O número defensável: só linhas comparáveis"),
        ("Projeção para o ano",
         '=IFERROR(-SUM({0})/Comparativo!$D$3*12,"")'.format(QQ),
         "Extrapolação linear, se o padrão dos meses fechados se mantiver"),
        ("% sobre o orçado do período",
         '=IFERROR(-SUM({0})/SUM(Comparativo!$S${1}:$S${2}),"")'.format(QQ, CF, CF_END),
         "Economia líquida ÷ planejado das linhas que entram na conta"),
    ]
    for lab, formula, nota in kpis:
        destaque = lab.startswith("=")
        wp.cell(row=r, column=1, value=lab)
        wp.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2)
        cv = wp.cell(row=r, column=3, value=formula)
        cv.number_format = PCT if lab.startswith("%") else MOEDA
        wp.cell(row=r, column=4, value=nota)
        wp.merge_cells(start_row=r, start_column=4, end_row=r, end_column=9)
        for col in range(1, 10):
            cc = wp.cell(row=r, column=col)
            cc.border = BORDA
            cc.fill = PatternFill("solid", fgColor="E2EFDA" if destaque else BRANCO)
            if col <= 2:
                cc.font = Font(bold=True, size=12 if destaque else 10)
            elif col == 3:
                cc.font = Font(bold=True, size=14 if destaque else 11,
                               color="1E6B3A" if destaque else "000000")
                cc.alignment = Alignment(horizontal="right", vertical="center")
            else:
                cc.font = Font(size=9, italic=True, color="595959")
                cc.alignment = Alignment(vertical="center", indent=1)
        wp.row_dimensions[r].height = 26 if destaque else 20
        r += 1

    fora = [a for a, _ in avisos]
    if True:
        wp.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
        txt_fora = ("Fora desta conta: linhas sem nenhum lançamento"
                    + ("; " + "; ".join(fora) + " (base diferente)" if fora else "")
                    + ". Só entra o que foi efetivamente lançado e é comparável.")
        cn = wp.cell(row=r, column=1, value=txt_fora)
        cn.font = Font(size=9, italic=True, color="9C0006")
        cn.alignment = Alignment(vertical="center", indent=1)
        wp.row_dimensions[r].height = 18
        r += 1

    # Top 5 economias — espelho do ranking de estouros
    r += 1
    wp.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
    c = wp.cell(row=r, column=1, value="DE ONDE VEIO A ECONOMIA (top 5)")
    c.font = Font(bold=True, size=11, color=BRANCO)
    c.fill = PatternFill("solid", fgColor="1E6B3A")
    c.alignment = Alignment(indent=1, vertical="center")
    wp.row_dimensions[r].height = 22
    r += 1
    header(wp, r, ["#", "Item", "Departamento", "Planejado acum.",
                   "Realizado acum.", "Economia (R$)", "% da linha", "", ""])
    eco_hdr = r

    def eco_formula(target_col, rr):
        return (
            '=IFERROR(INDEX(Comparativo!${2}${0}:${2}${1},'
            'MATCH(LARGE(Comparativo!$R${0}:$R${1},A{3}),'
            'Comparativo!$R${0}:$R${1},0)),"")'
        ).format(CF, CF_END, target_col, rr)

    for k in range(1, 6):
        rr = eco_hdr + k
        wp.cell(row=rr, column=1, value=k)
        wp.cell(row=rr, column=2, value=eco_formula("D", rr))
        wp.cell(row=rr, column=3, value=eco_formula("B", rr))
        wp.cell(row=rr, column=4, value=eco_formula("I", rr))
        wp.cell(row=rr, column=5, value=eco_formula("J", rr))
        wp.cell(row=rr, column=6, value='=IFERROR(-{0},"")'.format(
            eco_formula("K", rr).lstrip("=")))
        wp.cell(row=rr, column=7, value='=IFERROR(F{0}/D{0},"")'.format(rr))
        for col in range(1, 8):
            cc = wp.cell(row=rr, column=col)
            cc.font = Font(size=9)
            cc.border = BORDA
            if col in (4, 5, 6):
                cc.number_format = MOEDA
            if col == 6:
                cc.font = Font(size=9, bold=True, color="1E6B3A")
            if col == 7:
                cc.number_format = PCT
            if col == 1:
                cc.alignment = Alignment(horizontal="center")

    r = eco_hdr + 6

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
                         "A LANÇAR": "F8CBAD", "CONFERIR": "FFE699",
                     "BASE DIFERENTE": "F8CBAD", "DECIDIR": "FFE699",
                     "PAUTA REUNIÃO": "FFD966", "EM ANDAMENTO": "DDEBF7",
                     "PRAZO 01/11": "F8CBAD", "RECLASSIFICAR": "F8CBAD"}
                c.fill = PatternFill("solid", fgColor=cores.get(val, LARANJA))
            else:
                c.fill = PatternFill("solid", fgColor=BRANCO if i % 2 == 0 else CINZA_L)
        wn.row_dimensions[rr].height = 58

    widths(wn, {"A": 5, "B": 30, "C": 52, "D": 52, "E": 22, "F": 14})

    # ===========================================================================
    # ABA - PAPEIS E RESPONSABILIDADES (so no TI)
    # ===========================================================================
    if DEPTO in (None, "TI"):
        wy = wb.create_sheet("Papéis e Responsabilidades")
        titulo(wy, "PAPÉIS E RESPONSABILIDADES — equipe de TI",
               "Quem faz o quê no acompanhamento orçamentário e na operação. O critério "
               "é custo por hora: tarefa recorrente vai para quem custa menos, e a "
               "capacidade cara fica reservada para o que só ela resolve.", 5)

        r = 4
        header(wy, r, ["Pessoa", "Função", "Vínculo", "Capacidade", "Custo/hora"])
        equipe = [
            ("Cristiane Rabelo", "Gestora de TI e Jurídico", "—", "—", None),
            ("Vinicius Di Franco", "Analista Administrativo", "CLT",
             "173 h/mês (5x8h)", 31.25),
            ("Jonathan (J H Alves)", "Consultor / Desenvolvedor", "PJ",
             "104 h/mês (3x8h)", 60.58),
            ("Elias Benedito", "Suporte Técnico Terceirizado", "PJ",
             "Sob demanda", None),
        ]
        r += 1
        for nome, func, vinc, cap, ch in equipe:
            wy.cell(row=r, column=1, value=nome).font = Font(bold=True, size=9)
            wy.cell(row=r, column=2, value=func)
            wy.cell(row=r, column=3, value=vinc)
            wy.cell(row=r, column=4, value=cap)
            c = wy.cell(row=r, column=5, value=ch)
            c.number_format = MOEDA
            for col in range(1, 6):
                cc = wy.cell(row=r, column=col)
                cc.border = BORDA
                if col > 1:
                    cc.font = Font(size=9)
                cc.alignment = Alignment(vertical="center",
                                         horizontal="center" if col in (3, 4, 5) else "left")
            wy.row_dimensions[r].height = 20
            r += 1

        blocos = [
            ("CRISTIANE — gestora de TI e Jurídico", AZUL, [
                ("ESCOPO",
                 "Responde pelas duas áreas: TI (R$ 284.971,50 orçados em 2026) e "
                 "Jurídico (R$ 324.730,42), num total de R$ 609.701,92. Equipe direta "
                 "de sete pessoas entre CLT e PJ."),

                ("— ORÇAMENTO —", ""),
                ("Montar e revisar o orçamento",
                 "Definir as linhas do ano, os valores e a base de meses de cada "
                 "contrato. Revisar quando houver reajuste, entrada ou saída — como o "
                 "aumento da Thamar, o do Vinicius e a inclusão da Dra. Michele."),
                ("Aprovar o que entra e sai",
                 "Nenhuma linha nova ou cancelamento sem passar por ela. Exemplos do "
                 "período: cancelamento do Astrea, criação das linhas de IA, entrada do "
                 "AnyDesk, decisão sobre a sala de reunião."),
                ("Validar o fechamento mensal",
                 "Conferir o que o analista lançou antes de o número virar informação "
                 "oficial. Olhar a coluna 'Linhas lançadas' do Painel: desvio negativo em "
                 "linha não lançada é ausência de dado, não economia."),
                ("Responder pelo desvio",
                 "Explicar cada estouro e cada economia — o que foi decisão de gestão, o "
                 "que foi erro de origem do orçamento e o que é só falta de lançamento."),

                ("— CONTRATOS E FORNECEDORES —", ""),
                ("Negociar valor e condições",
                 "É o que gerou as economias do ano: Jonathan de R$ 10.000 para R$ 6.300 "
                 "e Elias de R$ 1.065 para R$ 603,30, 43% de redução. Só a negociação "
                 "responde por boa parte dos R$ 56.946 economizados no TI."),
                ("Decidir contratar, manter ou cancelar",
                 "Avaliar necessidade real antes de assinar e cortar o que não entrega. "
                 "No período: Jusfy cancelado antes de iniciar, Astrea em cancelamento, "
                 "contratação do Jonathan segurada por três meses."),
                ("Controlar prazos de renovação",
                 "Contratos anuais renovam sozinhos. O Astrea cobra em cartão e o ciclo "
                 "vira em 01/11 — se o cancelamento não estiver confirmado até lá, entra "
                 "anuidade de cerca de R$ 7.400 sem previsão orçamentária."),

                ("— PESSOAS —", ""),
                ("Dimensionar a equipe",
                 "Definir quem é CLT, quem é PJ, quantas horas e com que escopo. Decidir "
                 "quando segurar uma contratação, como fez de jan a mar com o consultor."),
                ("Alocar o trabalho por custo",
                 "Manter a rotina com o analista e a capacidade cara reservada para o que "
                 "só ela resolve. A hora do consultor custa o dobro e são só 104 por mês."),
                ("Reajustes e bonificações",
                 "Aprovar aumentos e decidir sobre as bonificações previstas em ago e "
                 "dez, que somam R$ 29.160,60 nas duas áreas."),

                ("— POLÍTICAS E GOVERNANÇA —", ""),
                ("Definir regras de uso",
                 "Troca 1x1 de equipamento, estoque reserva para empréstimo, quem pode "
                 "gerar chave de API, quem tem licença de IA e sob qual login."),
                ("Rateio e centro de custo",
                 "Definir com a controladoria o que é do TI e o que é corporativo: oito "
                 "linhas de uso transversal estão marcadas como RATEIO A DEFINIR, e o "
                 "Adapta está classificado na área errada."),
                ("Zelar pelo sigilo",
                 "Num escritório de advocacia, licença de IA compartilhada expõe o "
                 "histórico de um cliente a quem não atua no caso. É risco de sigilo "
                 "profissional, não só de custo."),

                ("— RELACIONAMENTO —", ""),
                ("Diretoria",
                 "Apresentar o Painel, defender os números e levar as pautas em aberto. "
                 "Hoje são seis: sala de reunião, meta das IAs, notebooks, despesas fora "
                 "do orçamento, reclassificação do Adapta e erro de origem do Astrea."),
                ("Financeiro e controladoria",
                 "Abertura do centro de custo no SIENGE, escolha do regime (competência "
                 "ou caixa), reclassificações e separação entre custo e repasse."),
                ("RH e Administrativo",
                 "Custo total dos CLT para o comparativo, e o que sai do TI por não ser "
                 "dele — papelaria e treinamento corporativo."),
                ("Outras áreas",
                 "Avisar antes do estouro quando uma solicitação de equipamento passar "
                 "do saldo da rubrica delas."),
            ]),
            ("VINICIUS — suporte, rotina e apoio ao desenvolvimento", AZUL_MED, [
                ("Suporte ao usuário",
                 "Atendimento do dia a dia às áreas: equipamento, acesso, software."),
                ("Fechamento mensal do orçamento",
                 "Extrair o relatório do centro de custo no SIENGE e lançar o realizado "
                 "na aba Realizado, preenchendo a coluna Fonte do dado com a data da "
                 "extração. Item sem gasto no mês recebe 0, não fica em branco."),
                ("Controle de equipamentos",
                 "Registrar solicitações e empréstimos na aba própria, cobrar a "
                 "devolução do item quebrado na troca 1x1 e controlar o estoque reserva."),
                ("Saldo por área",
                 "Acompanhar quanto resta na rubrica de cada área e avisar ANTES de "
                 "comprar quando a solicitação for levar ao estouro."),
                ("Conferência de faturas",
                 "Bater o valor cobrado contra o contrato. Foi assim que apareceram o "
                 "Jusbrasil 30% acima e o Astrea a 5x o orçado."),
                ("Padrão de descrição no SIENGE",
                 "Em rubricas genéricas, detalhar o item na descrição do lançamento "
                 "('Peças – mouse', 'Peças – tela'), para a análise sair por filtro."),
                ("Apoio operacional ao desenvolvimento",
                 "Assumir as tarefas operacionais do que o Jonathan conduz. Cada hora "
                 "que sai das mãos dele a R$ 31,25 libera uma hora de R$ 60,58 — é o "
                 "que multiplica a capacidade limitada do consultor."),
            ]),
            ("JONATHAN — técnico e pontual, nunca rotina", "1E6B3A", [
                ("Desenvolvimento",
                 "O trabalho de projeto para o qual foi contratado, 3 dias por semana."),
                ("Automatizar a extração do SIENGE",
                 "Entrega de maior retorno: gasta algumas horas uma vez e devolve tempo "
                 "do analista todo mês."),
                ("Avaliar AnyDesk",
                 "Definir necessidade, plano e valor da licença de acesso remoto."),
                ("Avaliar Claude x GPT e planos de equipe",
                 "Subsidiar a decisão do Vitor e resolver o compartilhamento de login, "
                 "que hoje expõe histórico de cliente entre usuários."),
                ("Investigar o consumo de API",
                 "O gasto da OpenAI saltou de R$ 322 em mar para R$ 5.394 em abr, padrão "
                 "de consumo por uso. Configurar limite rígido de gasto e definir quem "
                 "pode gerar chave."),
                ("NÃO fazer",
                 "Rotina administrativa, lançamento de planilha, controle de estoque. "
                 "São 104 h/mês a R$ 60,58 — se ele aparecer na rotina mensal, é sinal "
                 "de que algo deveria ter sido automatizado."),
            ]),
            ("ELIAS — suporte técnico sob demanda", "7B3F00", [
                ("Acionamento pontual",
                 "Contrato ativo, acionado conforme a necessidade. Sem acionamento de "
                 "jan a jul/26. Valor renegociado de R$ 1.065 para R$ 603,30 a partir "
                 "de set/26."),
            ]),
        ]

        for titulo_bloco, cor, itens in blocos:
            r += 1
            wy.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
            c = wy.cell(row=r, column=1, value=titulo_bloco)
            c.font = Font(bold=True, size=11, color=BRANCO)
            c.fill = PatternFill("solid", fgColor=cor)
            c.alignment = Alignment(indent=1, vertical="center")
            wy.row_dimensions[r].height = 22
            r += 1
            for lab, txt in itens:
                if not txt:      # subtitulo de secao dentro do bloco
                    wy.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
                    cs = wy.cell(row=r, column=1, value=lab)
                    cs.font = Font(bold=True, size=9, color=cor)
                    cs.fill = PatternFill("solid", fgColor=CINZA_L)
                    cs.alignment = Alignment(vertical="center", indent=1)
                    wy.row_dimensions[r].height = 18
                    r += 1
                    continue
                wy.cell(row=r, column=1, value=lab).font = Font(bold=True, size=9)
                wy.cell(row=r, column=1).alignment = Alignment(
                    vertical="top", wrap_text=True)
                wy.merge_cells(start_row=r, start_column=2, end_row=r, end_column=5)
                cc = wy.cell(row=r, column=2, value=txt)
                cc.font = Font(size=9)
                cc.alignment = Alignment(wrap_text=True, vertical="top")
                for col in range(1, 6):
                    wy.cell(row=r, column=col).border = BORDA
                wy.row_dimensions[r].height = 42
                r += 1

        r += 1
        wy.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
        c = wy.cell(row=r, column=1, value=(
            "CRITÉRIO: a hora do consultor custa o dobro da hora do analista, e são só "
            "104 por mês. Tarefa recorrente vai para quem custa menos; capacidade cara "
            "fica reservada para o que só ela resolve. Consultor em rotina "
            "administrativa é o recurso mais caro na tarefa mais barata."))
        c.font = Font(size=9, italic=True, color="595959")
        c.alignment = Alignment(wrap_text=True, vertical="center", indent=1)
        wy.row_dimensions[r].height = 32

        widths(wy, {"A": 34, "B": 30, "C": 12, "D": 18, "E": 14})

    # ===========================================================================
    # ABA DE CONTROLE - EQUIPAMENTOS (so no TI)
    # ===========================================================================
    if DEPTO in (None, "TI"):
        wq = wb.create_sheet("Controle de Equipamentos")
        titulo(wq, "CONTROLE DE EQUIPAMENTOS — solicitações, troca 1x1 e empréstimos",
               "Registro operacional do TI. O SIENGE mostra o que foi PAGO; esta aba mostra "
               "o que foi PEDIDO — é no intervalo entre os dois que dá para avisar a área "
               "antes de estourar o saldo.", 10)

        r = 4
        wq.merge_cells(start_row=r, start_column=1, end_row=r, end_column=10)
        c = wq.cell(row=r, column=1, value="REGRAS")
        c.font = Font(bold=True, size=11, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=AZUL_MED)
        c.alignment = Alignment(indent=1, vertical="center")
        wq.row_dimensions[r].height = 22
        r += 1
        regras = [
            ("Troca 1x1", "Para receber um item novo, a pessoa entrega o que quebrou. "
                          "O patrimônio devolvido é registrado na coluna própria."),
            ("Empréstimo", "Quem está sem o equipamento sai com um reserva na hora, para não "
                           "ficar parado. O reserva é COM FIO de propósito: mais barato e "
                           "menos confortável que o definitivo, o que cria o incentivo para "
                           "devolver e fechar a troca."),
            ("Prazo: 7 dias", "O empréstimo vale por 7 dias corridos. Passou disso, o status "
                              "vira 'Atrasado' e o TI cobra a devolução. A coluna 'Dias em "
                              "posse' calcula sozinha a partir da data de saída."),
            ("Sem devolução", "Se a pessoa não entrega o item antigo, a solicitação fica "
                              "'Pendente devolução' e não vira compra até ser resolvida."),
            ("Aviso de saldo", "Antes de aprovar, conferir o saldo da rubrica da área "
                               "solicitante. Se a compra for levar ao estouro, avisar a área "
                               "ANTES de comprar (pendência R)."),
        ]
        for lab, txt in regras:
            wq.cell(row=r, column=1, value=lab).font = Font(bold=True, size=9)
            wq.merge_cells(start_row=r, start_column=2, end_row=r, end_column=10)
            cc = wq.cell(row=r, column=2, value=txt)
            cc.font = Font(size=9)
            cc.alignment = Alignment(wrap_text=True, vertical="top")
            for col in range(1, 11):
                wq.cell(row=r, column=col).border = BORDA
            wq.row_dimensions[r].height = 30
            r += 1

        r += 1
        wq.merge_cells(start_row=r, start_column=1, end_row=r, end_column=10)
        c = wq.cell(row=r, column=1, value="SOLICITAÇÕES")
        c.font = Font(bold=True, size=11, color=BRANCO)
        c.fill = PatternFill("solid", fgColor=AZUL)
        c.alignment = Alignment(indent=1, vertical="center")
        wq.row_dimensions[r].height = 22
        r += 1
        header(wq, r, ["Data", "Área solicitante", "Solicitante", "Item", "Motivo",
                       "Devolveu o antigo?", "Patrimônio devolvido",
                       "Valor estimado", "Status", "Observações"])
        sol_hdr = r
        for i in range(40):
            rr = r + 1 + i
            for col in range(1, 11):
                cc = wq.cell(row=rr, column=col)
                cc.border = BORDA
                cc.fill = PatternFill("solid", fgColor=INPUT_BG)
                cc.font = Font(size=9)
                if col == 8:
                    cc.number_format = MOEDA
        dv_sit = DataValidation(
            type="list", allow_blank=True, showDropDown=False,
            formula1='"Aberta,Aguardando devolução,Aprovada,Comprada,Entregue,Negada"')
        wq.add_data_validation(dv_sit)
        dv_sit.add("I{0}:I{1}".format(sol_hdr + 1, sol_hdr + 40))
        dv_dev = DataValidation(type="list", allow_blank=True, showDropDown=False,
                                formula1='"Sim,Não,Não se aplica"')
        wq.add_data_validation(dv_dev)
        dv_dev.add("F{0}:F{1}".format(sol_hdr + 1, sol_hdr + 40))
        wq.auto_filter.ref = "A{0}:J{1}".format(sol_hdr, sol_hdr + 40)
        r = sol_hdr + 42

        wq.merge_cells(start_row=r, start_column=1, end_row=r, end_column=10)
        c = wq.cell(row=r, column=1, value="EMPRÉSTIMOS (equipamento reserva)")
        c.font = Font(bold=True, size=11, color=BRANCO)
        c.fill = PatternFill("solid", fgColor="1E6B3A")
        c.alignment = Alignment(indent=1, vertical="center")
        wq.row_dimensions[r].height = 22
        r += 1
        header(wq, r, ["Item emprestado", "Patrimônio", "Área", "Pessoa",
                       "Saída em", "Previsão de devolução", "Devolvido em",
                       "Status", "Dias em posse (limite: 7)", "Observações"],
               fill="1E6B3A")
        emp_hdr = r
        for i in range(25):
            rr = r + 1 + i
            for col in range(1, 11):
                cc = wq.cell(row=rr, column=col)
                cc.border = BORDA
                cc.fill = PatternFill("solid", fgColor=INPUT_BG)
                cc.font = Font(size=9)
            # dias em posse: da saida ate a devolucao, ou ate hoje se ainda em uso
            cc = wq.cell(row=rr, column=9,
                         value='=IF(E{0}="","",IF(G{0}="",TODAY()-E{0},G{0}-E{0}))'.format(rr))
            cc.number_format = "0"
            cc.font = Font(size=9)
            cc.alignment = Alignment(horizontal="center")
            cc.border = BORDA
            cc.fill = PatternFill("solid", fgColor=CINZA_L)
        # destaca em vermelho quando passar do prazo de 7 dias
        wq.conditional_formatting.add(
            "I{0}:I{1}".format(emp_hdr + 1, emp_hdr + 25),
            CellIsRule(operator="greaterThan", formula=["7"],
                       font=Font(color="9C0006", bold=True, size=9),
                       fill=PatternFill("solid", fgColor="FFC7CE")))
        dv_emp = DataValidation(type="list", allow_blank=True, showDropDown=False,
                                formula1='"Emprestado,Devolvido,Atrasado,Baixado"')
        wq.add_data_validation(dv_emp)
        dv_emp.add("H{0}:H{1}".format(emp_hdr + 1, emp_hdr + 25))

        widths(wq, {"A": 22, "B": 18, "C": 22, "D": 26, "E": 30, "F": 18,
                    "G": 20, "H": 15, "I": 14, "J": 30})
        wq.freeze_panes = "A{0}".format(sol_hdr + 1)

    # ===========================================================================
    # ABA DE APOIO - CONCILIACAO ASTREA
    # ===========================================================================
    if DEPTO in (None, "Jurídico"):
        wk = wb.create_sheet("Conciliação Astrea")
        titulo(wk, "CONCILIAÇÃO ASTREA — plataforma do fornecedor x SIENGE",
               "O valor total confere nos dois lados (R$ 6.731,40), mas as datas não. "
               "Duas parcelas debitadas no cartão em 2025 só foram lançadas no SIENGE "
               "em 2026 — conferir com o financeiro.", 6)

        r = 4
        header(wk, r, ["Vencimento / débito no cartão", "Descrição", "Valor",
                       "", "", ""], fill="1F3864")
        wk.cell(row=r, column=1, value="PLATAFORMA ASTREA — cartão Visa 4957")
        r += 1
        for d, desc, v in CONC_ASTREA_PLAT:
            wk.cell(row=r, column=1, value=d)
            wk.cell(row=r, column=2, value=desc)
            c = wk.cell(row=r, column=3, value=v)
            c.number_format = MOEDA
            for col in range(1, 4):
                wk.cell(row=r, column=col).font = Font(size=9)
                wk.cell(row=r, column=col).border = BORDA
            r += 1
        wk.cell(row=r, column=2, value="TOTAL PLATAFORMA").font = Font(bold=True, size=9)
        c = wk.cell(row=r, column=3, value="=SUM(C5:C{0})".format(r - 1))
        c.number_format = MOEDA
        c.font = Font(bold=True, size=10)
        c.border = BORDA
        r += 2

        header(wk, r, ["Data de pagamento", "Documento", "Valor", "", "", ""],
               fill="7B3F00")
        wk.cell(row=r, column=1, value="SIENGE — contas pagas")
        r += 1
        ini_si = r
        for d, doc, v in CONC_ASTREA_SIENGE:
            wk.cell(row=r, column=1, value=d)
            wk.cell(row=r, column=2, value=doc)
            c = wk.cell(row=r, column=3, value=v)
            c.number_format = MOEDA
            for col in range(1, 4):
                wk.cell(row=r, column=col).font = Font(size=9)
                wk.cell(row=r, column=col).border = BORDA
            r += 1
        wk.cell(row=r, column=2, value="TOTAL SIENGE").font = Font(bold=True, size=9)
        c = wk.cell(row=r, column=3, value="=SUM(C{0}:C{1})".format(ini_si, r - 1))
        c.number_format = MOEDA
        c.font = Font(bold=True, size=10)
        c.border = BORDA
        r += 2

        wk.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
        c = wk.cell(row=r, column=1, value="O QUE NÃO BATE")
        c.font = Font(bold=True, size=11, color=BRANCO)
        c.fill = PatternFill("solid", fgColor="9C0006")
        c.alignment = Alignment(indent=1, vertical="center")
        wk.row_dimensions[r].height = 22
        r += 1
        notas = [
            ("Total", "Confere: R$ 6.731,40 nos dois lados. O problema é só de data."),
            ("Exercício", "Na plataforma, 2 das 5 parcelas (R$ 2.692,56) foram debitadas "
                          "em nov e dez/2025. No SIENGE, as 5 aparecem lançadas em 2026."),
            ("Concentração", "A plataforma cobra 1 parcela por mês, de nov/25 a mar/26. "
                             "O SIENGE registra 3 pagamentos, todos em jan e fev/26 — "
                             "sendo R$ 4.038,84 (3 parcelas) num único lançamento em 10/02."),
            ("Provável causa", "O financeiro lança pela data da fatura do cartão, não pela "
                               "data do débito de cada parcela. Confirmar com o financeiro."),
            ("Impacto", "Nenhum no total do ano nem no valor da linha. Afeta a distribuição "
                        "mês a mês e, se o critério for competência, o exercício de "
                        "R$ 2.692,56 que pertence a 2025."),
        ]
        for lab, txt in notas:
            wk.cell(row=r, column=1, value=lab).font = Font(bold=True, size=9)
            wk.merge_cells(start_row=r, start_column=2, end_row=r, end_column=6)
            cc = wk.cell(row=r, column=2, value=txt)
            cc.font = Font(size=9)
            cc.alignment = Alignment(wrap_text=True, vertical="top")
            for col in range(1, 7):
                wk.cell(row=r, column=col).border = BORDA
            wk.row_dimensions[r].height = 30
            r += 1

        widths(wk, {"A": 30, "B": 30, "C": 16, "D": 16, "E": 16, "F": 16})

    # ===========================================================================
    # ABAS DE APOIO - CONTAS PAGAS (extrato do financeiro)
    # ===========================================================================
    cc_alvo = CC_DO_DEPTO.get(DEPTO)
    lanc = [r for r in EXTRATO_LANC
            if DEPTO is None or r["cc"] == cc_alvo]

    if lanc:
        MX = EXTRATO_MESES
        rotulo = {m: MESES[int(m[5:7]) - 1] for m in MX}

        # ---- resumo por credor ----
        wx = wb.create_sheet("Contas Pagas (resumo)")
        ncx = 3 + len(MX) + 2
        titulo(wx, "CONTAS PAGAS — RESUMO POR CREDOR  ({0})".format(SUF),
               "Extrato do financeiro, centro de custo \"{0}\". ABA DE APOIO: o centro de custo "
               "destes itens ainda não foi decidido, então nada aqui entra no Planejado, no "
               "Realizado nem no Painel. A coluna final aponta o que provavelmente já está "
               "no orçamento — confira e remova as duplicidades à mão."
               .format(cc_alvo or "Jurídico + T.I"), ncx)

        header(wx, 4, ["Credor", "Centro de Custo", "Nº lanç."] +
               [rotulo[m] for m in MX] + ["TOTAL", "Já está no orçamento?"],
               fill="7B3F00")

        por_credor = {}
        for r in lanc:
            k = (r["credor"], r["cc"])
            por_credor.setdefault(k, {m: 0.0 for m in MX})
            por_credor[k][r["mes"]] += r["valor"]
        ordem = sorted(por_credor, key=lambda k: -sum(por_credor[k].values()))

        rr = 5
        for (credor, cc), vals in ((k, por_credor[k]) for k in ordem):
            dup = de_para(credor)
            n = sum(1 for r in lanc if r["credor"] == credor and r["cc"] == cc)
            wx.cell(row=rr, column=1, value=credor)
            wx.cell(row=rr, column=2, value=cc)
            wx.cell(row=rr, column=3, value=n)
            for j, m in enumerate(MX):
                wx.cell(row=rr, column=4 + j, value=vals[m] or None)
            wx.cell(row=rr, column=4 + len(MX), value=sum(vals.values()))
            wx.cell(row=rr, column=5 + len(MX), value=dup or None)
            for col in range(1, ncx + 1):
                c = wx.cell(row=rr, column=col)
                c.font = Font(size=9, bold=(col == 4 + len(MX)))
                c.border = BORDA
                c.fill = PatternFill("solid", fgColor="FFF2CC" if dup else BRANCO)
                if 4 <= col <= 4 + len(MX):
                    c.number_format = MOEDA
                if col == 3:
                    c.alignment = Alignment(horizontal="center")
                if col == 5 + len(MX):
                    c.font = Font(size=8, bold=True, color="9C0006")
                    c.alignment = Alignment(wrap_text=True, vertical="center")
            wx.row_dimensions[rr].height = 22
            rr += 1

        wx.cell(row=rr, column=1, value="TOTAL")
        for col in range(1, ncx + 1):
            c = wx.cell(row=rr, column=col)
            c.font = Font(bold=True, size=10, color=BRANCO)
            c.fill = PatternFill("solid", fgColor="7B3F00")
            c.border = BORDA
        for col in range(4, 5 + len(MX)):
            L = get_column_letter(col)
            c = wx.cell(row=rr, column=col,
                        value="=SUM({0}5:{0}{1})".format(L, rr - 1))
            c.number_format = MOEDA
            c.font = Font(bold=True, size=10, color=BRANCO)
            c.fill = PatternFill("solid", fgColor="7B3F00")
            c.border = BORDA

        wx.column_dimensions["A"].width = 58
        wx.column_dimensions["B"].width = 14
        wx.column_dimensions["C"].width = 9
        for col in range(4, 5 + len(MX)):
            wx.column_dimensions[get_column_letter(col)].width = 13
        wx.column_dimensions[get_column_letter(5 + len(MX))].width = 30
        wx.freeze_panes = "D5"
        wx.auto_filter.ref = "A4:{0}{1}".format(get_column_letter(ncx), rr - 1)

        # ---- detalhe lancamento a lancamento ----
        wd = wb.create_sheet("Contas Pagas (detalhe)")
        titulo(wd, "CONTAS PAGAS — DETALHE  ({0})".format(SUF),
               "Um lançamento por linha, como veio do financeiro. Use o filtro do cabeçalho "
               "para conferir credor, empreendimento ou mês.", 8)
        header(wd, 4, ["Mês", "Data de Pagamento", "Credor", "Documento", "Título",
                       "Empreendimento", "Centro de Custo", "Valor Líquido"],
               fill="7B3F00")
        rr = 5
        for r in sorted(lanc, key=lambda x: (x["mes"], x["credor"])):
            for col, val in enumerate(
                    [rotulo[r["mes"]], r["dtpag"], r["credor"], r["doc"],
                     r["titulo"], r["empresa"], r["cc"], r["valor"]], start=1):
                c = wd.cell(row=rr, column=col, value=val)
                c.font = Font(size=8)
                c.border = BORDA
                if col == 8:
                    c.number_format = MOEDA
            rr += 1
        wd.cell(row=rr, column=7, value="TOTAL").font = Font(bold=True, size=9)
        ct = wd.cell(row=rr, column=8, value="=SUM(H5:H{0})".format(rr - 1))
        ct.number_format = MOEDA
        ct.font = Font(bold=True, size=10)
        widths(wd, {"A": 10, "B": 17, "C": 56, "D": 26, "E": 14,
                    "F": 18, "G": 14, "H": 15})
        wd.freeze_panes = "A5"
        wd.auto_filter.ref = "A4:H{0}".format(rr - 1)

    # ===========================================================================
    # ABA 8 - COMO USAR
    # ===========================================================================
    wu = wb.create_sheet("Como usar")
    titulo(wu, "COMO USAR ESTA PLANILHA", "Rotina mensal de fechamento em 5 passos.", 3)

    PASSOS = [
        ("Rotina mensal", ""),
        ("1", "Extraia do SIENGE o relatório do centro de custo do departamento, no mês "
              "que fechou. A fonte do realizado é o SIENGE — nada é digitado de cabeça."),
        ("2", "Lance na aba REALIZADO, nas células amarelas, o valor de cada linha do "
              "orçamento. Item sem gasto no mês: digite 0 — deixar em branco significa "
              "'ainda não lancei'. Use a coluna 'Fonte do dado' para registrar de qual "
              "relatório o número saiu, com a data da extração."),
        ("3", "Vá na aba COMPARATIVO e selecione o mês em B3. Todas as demais abas "
              "acompanham essa escolha."),
        ("4", "Confira o PAINEL: ele mostra o desvio por departamento e os 5 maiores "
              "estouros do acumulado. É a tela para levar à diretoria."),
        ("5", "Atualize a aba PENDÊNCIAS conforme as decisões forem sendo tomadas."),
        ("", ""),
        ("Padrão de descrição", ""),
        ("Rubricas genéricas", "Em linhas que agrupam itens variados (peças de manutenção, "
                               "equipamentos diversos), detalhe o item na descrição do "
                               "lançamento no SIENGE, sempre no mesmo padrão: "
                               "'Peças – mouse', 'Peças – tela'. O orçamento fica numa "
                               "linha só e o detalhe sai por filtro quando precisar."),
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
    order += [n for n in wb.sheetnames if n not in order]
    wb._sheets = [wb[n] for n in order]
    wb.active = 0

    wb.save(OUT)
    print("Salvo em", OUT)


BASE = "/home/user/Comit-/orcamento/"
if __name__ == "__main__":
    gerar("Jurídico", BASE + "Orcamento_JURIDICO_2026.xlsx")
    gerar("TI", BASE + "Orcamento_TI_2026.xlsx")
    gerar(None, BASE + "Orcamento_Planejado_x_Realizado_2026.xlsx")
