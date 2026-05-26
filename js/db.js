/* ===== DATABASE (localStorage + sincronização com servidor) ===== */
const DB = (() => {
  const PREFIX = 'jur_comite_';
  const TABLES = [
    'comites','empreendimentos','fatos','notificacoes','contratos',
    'retomadas','distratos','processos','unidades','riscos','regulatorios'
  ];

  // ── Storage primitivo ─────────────────────────────────────────
  function _key(table)  { return PREFIX + table; }

  function _read(table) {
    try { return JSON.parse(localStorage.getItem(_key(table)) || '[]'); }
    catch(e) { return []; }
  }

  // ── Sincronização com servidor ────────────────────────────────
  const _SERVER = window.location.origin + '/api/db';
  let _syncTimer = null;
  let _serverAvailable = false;

  function _write(table, data) {
    localStorage.setItem(_key(table), JSON.stringify(data));
    if (_serverAvailable) {
      clearTimeout(_syncTimer);
      _syncTimer = setTimeout(_pushToServer, 400);
    }
  }

  function _pushToServer() {
    const dump = {};
    TABLES.forEach(t => { dump[t] = _read(t); });
    dump._meta = {
      active_comite: localStorage.getItem(PREFIX + 'active_comite') || '',
      saved: new Date().toISOString(),
    };
    fetch(_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dump),
    }).catch(() => {});
  }

  // Carrega dados do servidor na inicialização
  // Resolve imediatamente se servidor estiver offline (usa localStorage)
  const ready = (async function _loadFromServer() {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(_SERVER, { signal: ctrl.signal });
      clearTimeout(timeout);

      if (!res.ok) return;
      const dump = await res.json();
      _serverAvailable = true;

      // Verifica se o servidor tem dados reais (pelo menos um registro em alguma tabela)
      const totalRows = TABLES.reduce((sum, t) => sum + (Array.isArray(dump[t]) ? dump[t].length : 0), 0);

      if (totalRows === 0) {
        // Servidor vazio — sobe os dados locais
        console.log('[DB] Servidor sem dados, enviando dados locais...');
        _pushToServer();
        return;
      }

      // Sobrescreve localStorage com dados do servidor
      TABLES.forEach(t => {
        if (Array.isArray(dump[t])) localStorage.setItem(_key(t), JSON.stringify(dump[t]));
      });
      if (dump._meta?.active_comite) {
        localStorage.setItem(PREFIX + 'active_comite', dump._meta.active_comite);
      }
      console.log('[DB] ✅ Dados carregados do servidor');

    } catch (e) {
      // Servidor offline ou timeout — continua com localStorage
      console.log('[DB] Servidor offline, usando dados locais.');
    }
  })();

  // Recarrega ao voltar para a aba (sincroniza alterações de outros usuários)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _serverAvailable) {
      _loadFromServer().then(() => {
        if (typeof Router !== 'undefined') Router.navigate(Router.current || 'dashboard');
      });
    }
  });

  // ── CRUD genérico ──────────────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function getAll(table) { return _read(table); }

  function getById(table, id) {
    return _read(table).find(r => r.id === id) || null;
  }

  function insert(table, record) {
    const rows = _read(table);
    const newRec = { ...record, id: record.id || uid(), _created: Date.now() };
    rows.push(newRec);
    _write(table, rows);
    return newRec;
  }

  function update(table, id, changes) {
    const rows = _read(table);
    const idx  = rows.findIndex(r => r.id === id);
    if (idx < 0) return null;
    rows[idx] = { ...rows[idx], ...changes, _updated: Date.now() };
    _write(table, rows);
    return rows[idx];
  }

  function remove(table, id) {
    const rows = _read(table).filter(r => r.id !== id);
    _write(table, rows);
  }

  function where(table, pred) {
    return _read(table).filter(pred);
  }

  // ── Comitês ────────────────────────────────────────────────────
  function getComites() {
    return getAll('comites').sort((a, b) => b.ref.localeCompare(a.ref));
  }

  function getActiveComite() {
    const active = localStorage.getItem(PREFIX + 'active_comite');
    if (active) {
      const c = getById('comites', active);
      if (c) return c;
    }
    return getComites()[0] || null;
  }

  function setActiveComite(id) {
    localStorage.setItem(PREFIX + 'active_comite', id);
    if (_serverAvailable) _pushToServer();
  }

  function comiteRef(comite) { return comite ? comite.ref : null; }

  // ── Empreendimentos ────────────────────────────────────────────
  function getEmpreendimentos() {
    return getAll('empreendimentos').sort((a, b) => a.nome.localeCompare(b.nome));
  }

  // ── Filtro por comitê ──────────────────────────────────────────
  function forComite(table, comiteId) {
    return where(table, r => r.comite_id === comiteId);
  }

  // ── Export / Import ────────────────────────────────────────────
  function exportAll() {
    const dump = {};
    TABLES.forEach(t => { dump[t] = _read(t); });
    dump._exported = new Date().toISOString();
    return JSON.stringify(dump, null, 2);
  }

  function importAll(json) {
    const dump = JSON.parse(json);
    Object.keys(dump).forEach(t => {
      if (t.startsWith('_')) return;
      _write(t, dump[t]);
    });
  }

  function storageSize() {
    let total = 0;
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(PREFIX)) total += (localStorage.getItem(k) || '').length;
    });
    return (total / 1024).toFixed(1) + ' KB';
  }

  return {
    ready,
    uid, getAll, getById, insert, update, remove, where, forComite,
    getComites, getActiveComite, setActiveComite, comiteRef,
    getEmpreendimentos, exportAll, importAll, storageSize,
  };
})();
