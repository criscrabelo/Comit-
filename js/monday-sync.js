/* ===== MONDAY.COM SYNC MODULE =====
   Puxa dados dos boards do Monday.com e salva no localStorage da plataforma.
   Token armazenado em localStorage sob a chave jur_monday_token.
================================================================ */

const MondaySync = (() => {
  'use strict';

  const API_URL   = 'https://api.monday.com/v2';
  const TOKEN_KEY = 'jur_monday_token';

  /* ── Board IDs ─────────────────────────────────────────────── */
  const BOARDS = {
    processos:    5959705266,
    distratos:    18404493605,   // (JUR) DISTRATOS E DESISTÊNCIAS
    retomadas:    18413057491,   // (JUR) RETOMADAS
    notificacoes: 5630368737,    // (JUR) NOTIFICAÇÕES CLIENTES
    carpedie:     18410779605,   // CONTROLE DE ENTREGA CARPE DIEM
    contratosClientes:    5821473011,  // (JUR) CONTRATOS PARA CLIENTES
    contratosObra:        5800267760,  // (JUR) OBRA - CONTRATO DE PRESTAÇÃO DE SERVIÇO
    contratosPrestadores: 8734722297,  // (JUR) CONTRATOS PRESTADORES DE SERVIÇOS
  };

  /* ── Token helpers ─────────────────────────────────────────── */
  function getToken()      { return localStorage.getItem(TOKEN_KEY) || ''; }
  function hasToken()      { return !!getToken(); }

  /* ── GraphQL call ──────────────────────────────────────────── */
  async function gql(query, variables = {}) {
    const token = getToken();
    if (!token) throw new Error('Token Monday.com não configurado. Use ⚙️ Configurar Token.');

    let res;
    try {
      res = await fetch(API_URL, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token,
          'API-Version':  '2024-10',
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (netErr) {
      throw new Error('Falha de rede: ' + netErr.message +
        '. Verifique conexão e permissões CORS (tente abrir via servidor local).');
    }

    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
    return json.data;
  }

  /* ── Pagination fetch: returns ALL items from a board ──────── */
  async function fetchAllItems(boardId) {
    const QUERY = `
      query($boardId: ID!, $limit: Int!, $cursor: String) {
        boards(ids: [$boardId]) {
          items_page(limit: $limit, cursor: $cursor) {
            cursor
            items {
              id
              name
              created_at
              group { id title }
              column_values {
                id
                text
                ... on MirrorValue { display_value }
                ... on FormulaValue { display_value }
              }
            }
          }
        }
      }`;

    let all    = [];
    let cursor = null;

    do {
      const vars = { boardId: String(boardId), limit: 200, cursor };
      const data = await gql(QUERY, vars);
      const page = data.boards[0].items_page;
      all    = all.concat(page.items);
      cursor = page.cursor || null;
    } while (cursor);

    return all;
  }

  /* ── Column value by ID ────────────────────────────────────── */
  function cv(item, id) {
    if (!id) return '';
    const col = (item.column_values || []).find(c => c.id === id);
    if (!col) return '';
    // Para colunas espelho (mirror), o .text vem vazio — usar display_value
    return (col.text || col.display_value || '').trim();
  }

  /* ── Map "Column Title" → column id (case-insensitive) ─────── */
  async function fetchColumnMap(boardId) {
    const QUERY = `query($boardId: ID!) {
      boards(ids: [$boardId]) { columns { id title type } }
    }`;
    const data = await gql(QUERY, { boardId: String(boardId) });
    const cols = data.boards?.[0]?.columns || [];
    // Se mais de uma coluna tem o mesmo título (ex: EMPREENDIMENTO status + EMPREENDIMENTO mirror),
    // preferimos a que NÃO é mirror (mirrors costumam vir vazias via column_values.text).
    const map = {};
    cols.forEach(c => {
      const key = (c.title || '').toUpperCase().trim();
      if (!key) return;
      const prev = map[key];
      if (!prev || prev.type === 'mirror') {
        map[key] = { id: c.id, type: c.type };
      }
    });
    const flat = {};
    Object.keys(map).forEach(k => { flat[k] = map[k].id; });
    return flat;
  }
  function colId(map, ...titles) {
    for (const t of titles) {
      const id = map[t.toUpperCase().trim()];
      if (id) return id;
    }
    return null;
  }

  /* ── Find or create empreendimento by name ─────────────────── */
  function findOrMakeEmpr(name) {
    if (!name) return null;
    const norm = name.trim().toUpperCase();
    const all  = DB.getEmpreendimentos();
    let empr   = all.find(e => e.nome.toUpperCase() === norm);
    if (!empr) {
      DB.insert('empreendimentos', {
        nome:   name.trim(),
        tipo:   'Residencial',
        cidade: '',
        status: 'Ativo',
      });
      empr = DB.getEmpreendimentos().find(e => e.nome.toUpperCase() === norm);
    }
    return empr?.id || null;
  }

  /* ── Month range helper ────────────────────────────────────── */
  function mesRange(mesRef) {
    // mesRef = "YYYY-MM"
    const [y, m] = mesRef.split('-').map(Number);
    const start  = `${mesRef}-01`;
    const last   = new Date(y, m, 0).getDate();
    const end    = `${mesRef}-${String(last).padStart(2, '0')}`;
    return { start, end };
  }

  function inRange(isoDate, start, end) {
    return isoDate && isoDate >= start && isoDate <= end;
  }

  /* ── Processos: map Monday status → platform status ─────────── */
  function mapProcStatus(s) {
    const tbl = {
      'EM ANDAMENTO':     'Acompanhando',
      'FINALIZADO':       'Finalizado',
      'ACORDO':           'Em Acordo',
      'SUSPENSO - TRT':   'Arq. Provisório',
      'BAIXA DEFINITIVA': 'Baixa Definitiva',
    };
    return tbl[(s || '').toUpperCase()] || 'Acompanhando';
  }

  /* ── Prazo: "DEZEMBRO 2025" → "2025-12-31" ─────────────────── */
  const PT_MONTH = {
    JANEIRO:'01',FEVEREIRO:'02','MARÇO':'03',ABRIL:'04',
    MAIO:'05',JUNHO:'06',JULHO:'07',AGOSTO:'08',
    SETEMBRO:'09',OUTUBRO:'10',NOVEMBRO:'11',DEZEMBRO:'12',
  };

  function parsePrazo(label) {
    if (!label || label === 'NÃO VENDIDA') return null;
    const parts = label.trim().toUpperCase().split(/\s+/);
    if (parts.length < 2) return null;
    const mm   = PT_MONTH[parts[0]];
    const yyyy = parts[1];
    if (!mm || !yyyy) return null;
    const last = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
    return `${yyyy}-${mm}-${String(last).padStart(2, '0')}`;
  }

  function addDays(iso, days) {
    if (!iso) return null;
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  /* ═══════════════════════════════════════════════════════════
     SYNC FUNCTIONS
  ═══════════════════════════════════════════════════════════ */

  /* ── 1. Processos Judiciais ───────────────────────────────── */
  async function syncProcessos(comiteId) {
    log('Buscando Processos Judiciais…', 'wait');
    const items = await fetchAllItems(BOARDS.processos);

    // Wipe existing for this comitê
    DB.forComite('processos', comiteId).forEach(p => DB.remove('processos', p.id));

    let count = 0;
    items.forEach(item => {
      const emprId = findOrMakeEmpr(cv(item, 'status__1'));
      const local  = cv(item, 'status3') || '';
      const interno = local.toUpperCase() === 'INTERNO';
      const status  = mapProcStatus(cv(item, 'status84__1'));
      const tipo    = cv(item, 'status8') || '';
      // Extract year from process number  e.g. "4004991-92.2025.8.26.0577"
      const anoMatch = item.name.match(/\.(\d{4})\./);
      const ano      = anoMatch ? anoMatch[1] : String(new Date().getFullYear());

      DB.insert('processos', {
        comite_id:        comiteId,
        empreendimento_id: emprId,
        motivo:   tipo || 'Cível',
        posicao:  cv(item, 'status') || 'Não definido',
        status,
        local,
        ano,
        interno,
        // extra Monday fields (displayed in view as-is)
        numero:   item.name,
        tipo,
        acao:     cv(item, 'status4'),
        data_aud: cv(item, 'data6'),
        ciencia:  cv(item, 'data__1'),
        acomp:    cv(item, 'status5'),
      });
      count++;
    });

    log(`${count} processos importados (${items.filter(i=>{
      const l = (i.column_values||[]).find(c=>c.id==='status3');
      return (l?.text||'').toUpperCase() === 'INTERNO';
    }).length} internos)`, 'ok');
    return count;
  }

  /* ── 2. Distratos (board JUR DISTRATOS E DESISTÊNCIAS) ─────
     Apenas distratos/desistências entram aqui. Retomadas vêm do board
     dedicado (JUR) RETOMADAS via syncRetomadas().

     Filtro de mês usa a coluna DATA DA SOLICITAÇÃO (resolvida dinamicamente
     por título via fetchColumnMap), não o created_at do item — alinhado
     com o comportamento de syncRetomadas. Mantém fallback para IDs
     hardcoded antigos (compatibilidade com versões mais antigas do board). */
  async function syncDistratosRetomadas(comiteId, mesRef) {
    log('Buscando Distratos…', 'wait');

    // Resolve colunas pelo título — robusto a mudanças de ID no board
    const colMap = await fetchColumnMap(BOARDS.distratos);
    const idEmpr     = colId(colMap, 'EMPREENDIMENTO');
    const idMotivo   = colId(colMap, 'MOTIVO');
    const idDataSol  = colId(colMap, 'DATA DA SOLICITAÇÃO', 'DATA SOLICITAÇÃO', 'SOLICITAÇÃO');
    const idDataDist = colId(colMap, 'DATA DO DISTRATO', 'DATA DISTRATO',
                                     'DATA DA FINALIZAÇÃO', 'DATA DE FINALIZAÇÃO', 'FINALIZAÇÃO');
    const idDataVenda= colId(colMap, 'DATA DA VENDA', 'DATA VENDA');
    const idDias     = colId(colMap, 'PERÍODO (DIAS)', 'PERIODO (DIAS)', 'DIAS', 'TEMPO');
    const idEquipe   = colId(colMap, 'EQUIPE', 'TIME');

    try {
      console.log('[Distratos] colunas resolvidas:', {
        empr: idEmpr, motivo: idMotivo, dataSol: idDataSol,
        dataDist: idDataDist, dataVenda: idDataVenda, dias: idDias
      });
    } catch(_) {}

    const items = await fetchAllItems(BOARDS.distratos);
    const { start, end } = mesRange(mesRef);

    // Filtra por DATA DA SOLICITAÇÃO; se vazia, cai para created_at
    const filtered = items.filter(item => {
      const dataSol = cv(item, idDataSol);
      const ca = (item.created_at || '').substring(0, 10);
      return inRange(dataSol, start, end) || (!dataSol && inRange(ca, start, end));
    });

    DB.forComite('distratos', comiteId).forEach(d => DB.remove('distratos', d.id));

    let ndist = 0, nretSkip = 0;
    filtered.forEach(item => {
      const grupoTit    = (item.group?.title || '').toUpperCase();
      const isRetomada  = grupoTit.includes('RETOMADA');
      if (isRetomada) { nretSkip++; return; } // retomadas vêm de syncRetomadas()

      // Fallback: lookup por título primeiro, depois IDs antigos hardcoded
      const emprNome    = cv(item, idEmpr)     || cv(item, 'color_mm28cam9');
      const motivo      = cv(item, idMotivo)   || cv(item, 'color_mm1km2gz') || 'Outros';
      const dataSol     = cv(item, idDataSol);
      const dataDist    = cv(item, idDataDist) || cv(item, 'data') || '';
      const dataVenda   = cv(item, idDataVenda)|| cv(item, 'date_mm1zzqfm') || '';
      const tempoDias   = parseInt(cv(item, idDias) || cv(item, 'formula_mm1tmz3a')) || 0;
      const equipe      = cv(item, idEquipe) || cv(item, 'color_mm1kctx7') || '';
      const emprId      = findOrMakeEmpr(emprNome);

      DB.insert('distratos', {
        comite_id:         comiteId,
        empreendimento_id: emprId,
        motivo,
        equipe,
        data_solicitacao:  dataSol,
        data_venda:        dataVenda,
        data_distrato:     dataDist || dataSol,
        tempo_dias:        tempoDias,
        unidade:           item.name,
      });
      ndist++;
    });

    // Evolução mensal: histograma de TODOS os distratos do board por mês
    // (DATA DA SOLICITAÇÃO, fallback created_at). Persistido no comitê para
    // alimentar o gráfico de tendência, independente do mês ativo.
    const evolucao = {};
    items.forEach(item => {
      const grupoTit = (item.group?.title || '').toUpperCase();
      if (grupoTit.includes('RETOMADA')) return;
      const ds  = cv(item, idDataSol);
      const ca  = (item.created_at || '').substring(0, 10);
      const ref = (ds || ca).slice(0, 7); // YYYY-MM
      if (/^\d{4}-\d{2}$/.test(ref)) evolucao[ref] = (evolucao[ref] || 0) + 1;
    });
    DB.update('comites', comiteId, { distratos_evolucao: evolucao });

    log(`${ndist} distratos (filtrado por DATA DA SOLICITAÇÃO no mês ${mesRef}; ${nretSkip} itens "Retomada" ignorados)`,
        ndist > 0 ? 'ok' : 'warn');
    return { ndist };
  }

  /* ── 2b. Retomadas (quadro dedicado) ──────────────────────── */
  async function syncRetomadas(comiteId, mesRef) {
    log('Buscando Retomadas…', 'wait');
    // Descobre IDs das colunas pelo nome (board pode ter sido duplicado, IDs mudam)
    const colMap = await fetchColumnMap(BOARDS.retomadas);
    const idEmpr    = colId(colMap, 'EMPREENDIMENTO');
    const idMotivo  = colId(colMap, 'MOTIVO');
    const idEquipe  = colId(colMap, 'EQUIPE');
    const idCliente = colId(colMap, 'CLIENTE');
    const idDataSol = colId(colMap, 'DATA DA SOLICITAÇÃO', 'DATA SOLICITAÇÃO', 'SOLICITAÇÃO');
    const idDataRet = colId(colMap, 'DATA DA RETOMADA', 'DATA RETOMADA',
                                    'DATA DA FINALIZAÇÃO', 'DATA DE FINALIZAÇÃO', 'FINALIZAÇÃO');
    const idDataVenda = colId(colMap, 'DATA DA VENDA', 'DATA VENDA');
    const idDias    = colId(colMap, 'PERÍODO (DIAS)', 'PERIODO (DIAS)', 'DIAS', 'TEMPO');

    const items = await fetchAllItems(BOARDS.retomadas);
    const { start, end } = mesRange(mesRef);

    // Mês de referência: usa DATA DA SOLICITAÇÃO, com fallback no created_at
    const filtered = items.filter(item => {
      const dataSol = cv(item, idDataSol);
      const ca = (item.created_at || '').substring(0, 10);
      return inRange(dataSol, start, end) || (!dataSol && inRange(ca, start, end));
    });

    DB.forComite('retomadas', comiteId).forEach(r => DB.remove('retomadas', r.id));

    // Diagnóstico (uma vez por sync): mostra os títulos das colunas e o 1o item
    try {
      console.log('[Retomadas] colunas do quadro:', colMap);
      console.log('[Retomadas] idEmpr resolvido:', idEmpr);
      if (filtered[0]) {
        console.log('[Retomadas] 1o item (apos filtro de mes):', filtered[0].name, filtered[0].column_values);
      } else if (items[0]) {
        console.log('[Retomadas] 1o item (geral, nenhum no mes):', items[0].name, items[0].column_values);
      }
    } catch(_) {}

    // Fallback: extrai empreendimento do nome da unidade (ex: "MORATTA 205A" → "MORATTA")
    function emprFromName(name) {
      if (!name) return '';
      // Primeiro grupo alfabético com 3+ letras; junta palavra seguinte se também for alfabética
      const m = name.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,})(?:\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ]+))?/i);
      if (!m) return '';
      let nome = m[1].toUpperCase();
      // junta "GRAN PARK", "JD PAULISTA", etc. — palavra seguinte se for alfabética e não for "TORRE/APTO"
      if (m[2] && !/^(TORRE|APTO|APT|BLOCO)$/i.test(m[2])) nome += ' ' + m[2].toUpperCase();
      return nome;
    }

    let viaColuna = 0, viaNome = 0, semNada = 0;
    filtered.forEach(item => {
      const emprViaCol = cv(item, idEmpr);
      const emprViaName = emprViaCol ? '' : emprFromName(item.name);
      let emprNome = emprViaCol || emprViaName;
      // Última garantia: se ainda vazio, usa o próprio nome do item
      if (!emprNome) emprNome = item.name;
      const emprBase = emprNome.replace(/\s+TORRE\s+[A-Z]$/i, '').trim();
      const emprId   = findOrMakeEmpr(emprBase || emprNome);

      if (emprViaCol)        viaColuna++;
      else if (emprViaName)  viaNome++;
      else                   semNada++;

      try { console.log('[Retomadas]', item.name, '→ col:', JSON.stringify(emprViaCol),
                        '| nome:', JSON.stringify(emprViaName),
                        '| salvo:', emprBase, '| id:', emprId); } catch(_){}

      const dataSol  = cv(item, idDataSol);
      const dataRet  = cv(item, idDataRet);
      const dataVenda = cv(item, idDataVenda);
      const dias     = parseInt(cv(item, idDias)) || 0;

      DB.insert('retomadas', {
        comite_id:         comiteId,
        empreendimento_id: emprId,
        motivo:            cv(item, idMotivo)  || 'Outros',
        equipe:            cv(item, idEquipe)  || 'Jurídico',
        data_inicio:       dataVenda || dataSol,
        data_retomada:     dataRet   || dataSol,
        tempo_dias:        dias,
        unidade:           item.name,
        cliente:           cv(item, idCliente),
      });
    });
    if (filtered.length > 0) {
      log(`Empreendimentos: ${viaColuna} via coluna, ${viaNome} via nome do item, ${semNada} não identificados`,
          (viaColuna + viaNome) === filtered.length ? 'ok' : 'warn');
    }

    const n = filtered.length;
    log(`${n} retomada${n !== 1 ? 's' : ''} importada${n !== 1 ? 's' : ''} (mês ${mesRef})`,
        n > 0 ? 'ok' : 'warn');
    return n;
  }

  /* ── 3. Notificações ─────────────────────────────────────── */
  async function syncNotificacoes(comiteId, mesRef) {
    log('Buscando Notificações…', 'wait');
    const items = await fetchAllItems(BOARDS.notificacoes);
    const { start, end } = mesRange(mesRef);

    // Try to match by date0 (DATA DA NOTIFICAÇÃO) or by nome_m_s, or created_at
    const filtered = items.filter(item => {
      const d0 = cv(item, 'date0');
      const nm = cv(item, 'nome_m_s');
      const ca = (item.created_at || '').substring(0, 10);
      return inRange(d0, start, end) || inRange(nm, start, end) || inRange(ca, start, end);
    });

    DB.forComite('notificacoes', comiteId).forEach(n => DB.remove('notificacoes', n.id));

    filtered.forEach(item => {
      const emprNome = cv(item, 'color_mky02302') || cv(item, 'empreendimento') || '';
      // Normaliza torre: "AURORA TORRE B" → "AURORA", "MORATTA TORRE C" → "MORATTA"
      const emprBase = emprNome.replace(/\s+TORRE\s+[A-Z]$/i, '').trim();
      const emprId = findOrMakeEmpr(emprBase || emprNome);

      // Extrai torre: "AURORA TORRE B" → "TORRE B"
      const torMatch = emprNome.match(/\bTORRE\s+([A-Z])\b/i);
      const torre = torMatch ? `TORRE ${torMatch[1].toUpperCase()}` : '';

      // Extrai unidade: remove prefixo do empreendimento do nome do item
      // ex: "AURORA 1105B" → "1105B" | "MORATTA APTO 703A" → "APTO 703A"
      const escapedBase = emprBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const unidade = item.name.replace(new RegExp('^' + escapedBase + '\\s*', 'i'), '').trim() || item.name;

      // Normaliza estágio para os valores do platform (Resolvida / Em Andamento)
      const estagioRaw = cv(item, 'color_mky1txdp') || cv(item, 'status1') || '';
      const resolvidoRE = /resolvid|unidade retomada/i;
      const estagio = resolvidoRE.test(estagioRaw) ? 'Resolvida' : 'Em Andamento';

      // data_solucao só para itens resolvidos (evita calcular tempo p/ itens em aberto)
      const dataSol = estagio === 'Resolvida' ? (cv(item, 'data9') || '') : '';

      DB.insert('notificacoes', {
        comite_id:        comiteId,
        empreendimento_id: emprId,
        grupo:            cv(item, 'status6')        || 'Outros',
        modelo:           cv(item, 'status5')        || 'E-MAIL E WHATSAPP',
        estagio,
        estagio_detalhe:  estagioRaw                 || estagio,
        data_notificacao: cv(item, 'date0')          || (item.created_at||'').substring(0,10),
        data_solucao:     dataSol,
        cliente:          item.name,
        torre,
        unidade,
      });
    });

    const n = filtered.length;
    log(`${n} notificação${n !== 1 ? 'ões' : ''} importada${n !== 1 ? 's' : ''}`,
        n > 0 ? 'ok' : 'warn');
    return n;
  }

  /* ── 4. Unidades Carpe Diem ──────────────────────────────── */
  async function syncCarpedie(comiteId) {
    log('Buscando Unidades Carpe Diem…', 'wait');
    const items = await fetchAllItems(BOARDS.carpedie);

    // Find/create Carpe Diem empreendimento
    let carpeId = findOrMakeEmpr('Carpe Diem');

    // Replace all units for Carpe Diem (not comitê-scoped)
    DB.where('unidades', u => u.empreendimento_id === carpeId)
      .forEach(u => DB.remove('unidades', u.id));

    let count = 0;
    items.forEach(item => {
      const prazoLabel = cv(item, 'color_mm2wa10k');
      if (prazoLabel === 'NÃO VENDIDA') return;  // skip unsold units

      const prazo = parsePrazo(prazoLabel);
      DB.insert('unidades', {
        empreendimento_id: carpeId,
        numero:           item.name,
        prazo_habite_se:  prazo,
        prazo_180:        addDays(prazo, 180),
        previsao_entrega: null,
        cliente:          cv(item, 'texto__1'),
        status_jur:       cv(item, 'status'),
        tipo_fin:         cv(item, 'status8__1'),
      });
      count++;
    });

    log(`${count} unidades Carpe Diem importadas`, 'ok');
    return count;
  }

  /* ── 5. Contratos ─────────────────────────────────────────── */

  // CONFECÇÃO (board Clientes) → status da plataforma
  function mapStatusContCliente(confeccao) {
    const s = (confeccao || '').toUpperCase();
    if (s === 'FINALIZADA')                         return 'Assinado';
    if (s === 'EM ESPERA' || s === 'EM PROGRESSO')  return 'Em análise';
    if (s === 'NÃO FOI NECESSÁRIO')                 return 'Cancelado';
    return 'Pendente';
  }

  // CONFECÇÃO (board Obra) → status da plataforma
  function mapStatusContObra(confeccao) {
    const s = (confeccao || '').toUpperCase();
    if (s === 'FINALIZADO')                         return 'Assinado';
    if (s === 'EM ANDAMENTO' || s === 'VALIDAÇÃO')  return 'Em análise';
    if (s === 'CANCELADO')                          return 'Cancelado';
    return 'Pendente';
  }

  async function syncContratos(comiteId, mesRef) {
    log('Buscando Contratos…', 'wait');
    const { start, end } = mesRange(mesRef);

    // Substitui os contratos deste comitê
    DB.forComite('contratos', comiteId).forEach(c => DB.remove('contratos', c.id));

    let nCli = 0, nObra = 0, nPrest = 0;

    // 5a. Contratos para Clientes — filtro: SOLICITAÇÃO (data8) no mês
    const itensCli = await fetchAllItems(BOARDS.contratosClientes);
    itensCli.forEach(item => {
      const dataSol = cv(item, 'data8');
      if (!inRange(dataSol, start, end)) return;
      DB.insert('contratos', {
        comite_id:         comiteId,
        empreendimento_id: findOrMakeEmpr(cv(item, 'status7')),
        categoria:         'clientes',
        tipo:              cv(item, 'status6') || 'Outros',
        data_solicitacao:  dataSol,
        status:            mapStatusContCliente(cv(item, 'status01')),
      });
      nCli++;
    });

    // 5b. Obra — Contrato de Prestação de Serviço — filtro: SOLICITAÇÃO (data) no mês
    const itensObra = await fetchAllItems(BOARDS.contratosObra);
    itensObra.forEach(item => {
      const dataSol = cv(item, 'data');
      if (!inRange(dataSol, start, end)) return;
      DB.insert('contratos', {
        comite_id:         comiteId,
        empreendimento_id: findOrMakeEmpr(cv(item, 'color_mm1a2z53')),
        categoria:         'obra',
        tipo:              cv(item, 'status42') || 'Obra - Prest. de Serviços',
        data_solicitacao:  dataSol,
        status:            mapStatusContObra(cv(item, 'status82')),
      });
      nObra++;
    });

    // 5c. Prestadores de Serviços — filtro: SOLICITAÇÃO (data8) no mês
    const itensPrest = await fetchAllItems(BOARDS.contratosPrestadores);
    itensPrest.forEach(item => {
      const dataSol = cv(item, 'data8');
      if (!inRange(dataSol, start, end)) return;
      DB.insert('contratos', {
        comite_id:         comiteId,
        empreendimento_id: findOrMakeEmpr(cv(item, 'status7')),
        categoria:         'prestadores',
        tipo:              cv(item, 'status6') || 'Prestação de Serviços',
        data_solicitacao:  dataSol,
        status:            mapStatusContCliente(cv(item, 'status01')),
      });
      nPrest++;
    });

    const total = nCli + nObra + nPrest;
    log(`${total} contrato${total !== 1 ? 's' : ''} importado${total !== 1 ? 's' : ''}` +
        ` (${nCli} clientes, ${nObra} obra, ${nPrest} prestadores) — mês ${mesRef}`,
        total > 0 ? 'ok' : 'warn');
    return total;
  }

  /* ═══════════════════════════════════════════════════════════
     LOG / PROGRESS UI
  ═══════════════════════════════════════════════════════════ */
  let _logEl = null;

  function log(msg, type) {
    const icons = { wait: '⏳', ok: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
    const icon  = icons[type] || '•';
    if (_logEl) {
      _logEl.innerHTML +=
        `<div class="sync-line sync-${type||'info'}">${icon} ${esc(msg)}</div>`;
      _logEl.scrollTop = _logEl.scrollHeight;
    }
  }

  function clearLog() {
    if (_logEl) _logEl.innerHTML = '';
  }

  /* ═══════════════════════════════════════════════════════════
     MAIN ORCHESTRATOR
  ═══════════════════════════════════════════════════════════ */
  async function syncAll(comiteId, mesRef) {
    clearLog();
    log(`Iniciando sincronização — Comitê ${mesRef}`, 'info');

    let ok = 0, fail = 0;

    const run = async (label, fn) => {
      try { await fn(); ok++; }
      catch (e) { log(`${label}: ${e.message}`, 'error'); fail++; }
    };

    await run('Processos',          () => syncProcessos(comiteId));
    await run('Distratos',          () => syncDistratosRetomadas(comiteId, mesRef));
    await run('Retomadas',          () => syncRetomadas(comiteId, mesRef));
    await run('Notificações',       () => syncNotificacoes(comiteId, mesRef));
    await run('Carpe Diem',         () => syncCarpedie(comiteId));
    await run('Contratos',          () => syncContratos(comiteId, mesRef));

    log(fail === 0
      ? '🎉 Sincronização concluída com sucesso!'
      : `Concluído com ${fail} erro(s). Verifique os itens marcados com ❌.`,
      fail === 0 ? 'ok' : 'warn'
    );

    // Enable close / navigate
    const btnClose = document.getElementById('btn-sync-close');
    const btnStart = document.getElementById('btn-sync-start');
    if (btnClose) btnClose.disabled = false;
    if (btnStart) btnStart.disabled = false;

    // Refresh current view
    updateStorageInfo();
  }

  /* ═══════════════════════════════════════════════════════════
     UI: TOKEN SETTINGS MODAL
  ═══════════════════════════════════════════════════════════ */
  function openTokenSettings() {
    openModal('⚙️ Configurar Token Monday.com',
      `<div class="form-grid">
        <div class="form-group span-full">
          <label class="field-label">API Token pessoal</label>
          <input type="password" id="mx_token"
                 value="${esc(getToken())}"
                 placeholder="eyJhbGciOiJIUzI1NiJ9…"
                 style="font-family:monospace;font-size:12px;" />
          <div class="field-hint">
            Acesse: <strong>Monday.com → seu avatar → Administração → API</strong><br>
            Copie o token pessoal e cole aqui. Ele fica salvo neste navegador.
          </div>
        </div>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="MondaySync.saveToken()">💾 Salvar Token</button>`
    );
    setTimeout(() => document.getElementById('mx_token')?.focus(), 80);
  }

  function saveToken() {
    const val = (document.getElementById('mx_token')?.value || '').trim();
    if (!val) { toast('Token não pode ser vazio', 'error'); return; }
    localStorage.setItem(TOKEN_KEY, val);
    closeModal();
    toast('Token salvo!', 'success');
    _updateSyncBtn();
  }

  /* ═══════════════════════════════════════════════════════════
     UI: SYNC MODAL
  ═══════════════════════════════════════════════════════════ */
  function openSyncModal() {
    const comite = DB.getActiveComite();
    if (!comite) { toast('Selecione um comitê antes de sincronizar.', 'error'); return; }

    if (!hasToken()) {
      openModal('🔄 Sincronizar Monday.com',
        `<div class="alert alert-warning" style="margin-bottom:0">
          ⚠️ Token não configurado.<br>
          Configure o token antes de sincronizar.
        </div>`,
        `<button class="btn btn-outline" onclick="closeModal()">Fechar</button>
         <button class="btn btn-primary" onclick="closeModal(); MondaySync.openTokenSettings()">
           ⚙️ Configurar Token
         </button>`
      );
      return;
    }

    openModal('🔄 Sincronizar Monday.com',
      `<div class="sync-modal-wrap">
        <div class="sync-info-bar">
          <span>📅 Comitê: <strong>${esc(comite.label)}</strong></span>
          <span style="color:var(--gray-500);font-size:12px;">${comite.ref}</span>
        </div>
        <div class="sync-warn-box">
          ⚠️ Os dados de <strong>Processos, Distratos, Retomadas, Notificações, Unidades e Contratos</strong>
          serão substituídos pelos dados atuais do Monday.com.<br>
          <strong>Fatos Relevantes</strong> e análises manuais não são alterados.
        </div>
        <div id="sync-log" class="sync-log"></div>
      </div>`,
      `<button class="btn btn-outline" id="btn-sync-close" disabled onclick="closeModal(); Router.navigate('dashboard')">✖ Fechar</button>
       <button class="btn btn-primary"  id="btn-sync-start" onclick="MondaySync._run()">▶ Iniciar Sincronização</button>`
    );
    _logEl = document.getElementById('sync-log');
  }

  async function _run() {
    const comite = DB.getActiveComite();
    if (!comite) return;
    document.getElementById('btn-sync-start').disabled = true;
    document.getElementById('btn-sync-close').disabled = true;
    await syncAll(comite.id, comite.ref);
  }

  /* ── Sidebar token indicator ───────────────────────────────── */
  function _updateSyncBtn() {
    const indicator = document.getElementById('monday-token-dot');
    if (!indicator) return;
    indicator.style.background = hasToken() ? 'var(--green)' : 'var(--orange)';
    indicator.title = hasToken() ? 'Token configurado' : 'Token não configurado';
  }

  // Run on load
  setTimeout(_updateSyncBtn, 200);

  /* ── Public API ─────────────────────────────────────────────── */
  return {
    openSyncModal,
    openTokenSettings,
    saveToken,
    hasToken,
    _run,
    _updateSyncBtn,
  };
})();
