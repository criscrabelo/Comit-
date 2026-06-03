/* ===== ALL VIEWS / CRUD MODULES ===== */

// Classe de cor por estágio (painel "Status das Notificações")
function estagioColorClass(label) {
  const s = (label || '').toLowerCase();
  if (/resolvid|unidade retomada|re-?compra/.test(s))            return 'is-green';
  if (/judicial|michele|protesto|despej|desist/.test(s))         return 'is-red';
  if (/aguardando|prazo|sem retorno/.test(s))                    return 'is-amber';
  if (/tratativa|enviar|enviado|retomar|distrat|termo/.test(s))  return 'is-blue';
  return '';
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  const cid    = DB.getActiveComite()?.id;
  const comite = DB.getActiveComite();
  if (!cid) { setView('<div class="content"><div class="alert alert-info">ℹ️ Crie um comitê mensal clicando em <strong>+ Mês</strong> na barra lateral.</div></div>'); return; }

  const notifs  = DB.forComite('notificacoes', cid);
  const conts   = DB.forComite('contratos', cid);
  const ret     = DB.forComite('retomadas', cid);
  const dist    = DB.forComite('distratos', cid);
  const proc    = DB.forComite('processos', cid).filter(p => !p.interno);
  const procInt = DB.forComite('processos', cid).filter(p => p.interno);
  const fatos   = DB.forComite('fatos', cid);

  const notifRes = notifs.filter(n => n.estagio === 'Resolvida').length;
  const notifAnd = notifs.filter(n => n.estagio === 'Em Andamento').length;
  const tempoMedio = (() => {
    const resolved = notifs.filter(n => n.data_solucao && n.data_notificacao);
    if (!resolved.length) return '—';
    const avg = resolved.reduce((s, n) => s + daysBetween(n.data_notificacao, n.data_solucao), 0) / resolved.length;
    return Math.round(avg) + ' dias';
  })();

  // Detalhamento por estágio — coluna ESTÁGIOS do quadro (JUR) NOTIFICAÇÕES CLIENTES.
  const mesRef = comite.ref || '';
  const estagioCount = {};
  notifs.forEach(n => {
    if (mesRef && n.data_notificacao && !n.data_notificacao.startsWith(mesRef)) return;
    const e = n.estagio_detalhe;
    if (!e) return;
    estagioCount[e] = (estagioCount[e] || 0) + 1;
  });
  const estagioTotal = Object.values(estagioCount).reduce((a,b) => a + b, 0);
  const estagioRows = Object.entries(estagioCount)
    .sort((a,b) => b[1] - a[1])
    .map(([label,count]) => `
      <div class="estagio-item ${estagioColorClass(label)}">
        <span class="estagio-name">${esc(label)}</span>
        <span class="estagio-count">${count}</span>
      </div>`).join('');

  setView(`
    <div class="page-header">
      <div>
        <div class="page-title">📊 Dashboard — ${esc(comite.label)}</div>
        <div class="page-sub">Visão consolidada do período</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="Router.navigate('comite')">📑 Gerar Apresentação</button>
      </div>
    </div>
    <div class="content">

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Fatos Relevantes</div>
          <div class="kpi-value">${fatos.length}</div>
          <div class="kpi-sub">${DB.getEmpreendimentos().filter(e => fatos.some(f=>f.empreendimento_id===e.id)).length} empreendimentos</div>
        </div>
        <div class="kpi-card orange">
          <div class="kpi-label">Notificações</div>
          <div class="kpi-value">${notifs.length}</div>
          <div class="kpi-sub">${notifAnd} em andamento · ${notifRes} resolvidas</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">Contratos</div>
          <div class="kpi-value">${conts.length}</div>
          <div class="kpi-sub">${conts.filter(c=>c.status==='Assinado').length} assinados</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-label">Distratos</div>
          <div class="kpi-value">${dist.length}</div>
          <div class="kpi-sub">${ret.length} retomadas vinculadas</div>
        </div>
        <div class="kpi-card purple">
          <div class="kpi-label">Processos Judiciais</div>
          <div class="kpi-value">${proc.length}</div>
          <div class="kpi-sub">${proc.filter(p=>p.status==='Acompanhando').length} acompanhando</div>
        </div>
        <div class="kpi-card yellow">
          <div class="kpi-label">Processos Internos</div>
          <div class="kpi-value">${procInt.length}</div>
          <div class="kpi-sub">${procInt.filter(p=>p.status==='Finalizado').length} finalizados</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Tempo Médio Notif.</div>
          <div class="kpi-value" style="font-size:20px;">${tempoMedio}</div>
          <div class="kpi-sub">resolução</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">Retomadas</div>
          <div class="kpi-value">${ret.length}</div>
          <div class="kpi-sub">no período</div>
        </div>
      </div>

      <div class="estagio-panel">
        <div class="estagio-panel-title">Notificações por Estágio · ${esc(comite.label)} · ${estagioTotal}</div>
        ${estagioTotal
          ? `<div class="estagio-breakdown">${estagioRows}</div>`
          : '<div class="estagio-empty">Sincronize com o Monday para carregar os estágios da coluna ESTÁGIOS.</div>'}
      </div>

      <div class="chart-card" style="margin-bottom:20px;">
        <div class="chart-title">Notificações por Mês — 2026 (jan–mai)</div>
        <div class="chart-wrap"><canvas id="ch_notifMes"></canvas></div>
      </div>

      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-title">Notificações por Grupo</div>
          <div class="chart-wrap"><canvas id="ch_notifGrupo"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">Notificações por Modelo</div>
          <div class="chart-wrap"><canvas id="ch_notifModelo"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">Contratos por Tipo</div>
          <div class="chart-wrap"><canvas id="ch_contTipo"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">Processos por Empreendimento</div>
          <div class="chart-wrap"><canvas id="ch_procEmpr"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">Distratos — Motivo</div>
          <div class="chart-wrap"><canvas id="ch_distMotivo"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">Processos — Posição</div>
          <div class="chart-wrap"><canvas id="ch_procPos"></canvas></div>
        </div>
      </div>

      <!-- Fatos resumo -->
      <div class="section-card">
        <div class="section-card-head">
          <div class="section-card-title">📌 Últimos Fatos Relevantes</div>
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('fatos')">Ver todos →</button>
        </div>
        <div class="section-card-body" style="padding:0;">
          <table><thead><tr>
            <th>Data</th><th>Empreendimento</th><th>Título</th>
          </tr></thead><tbody>
          ${fatos.slice(-6).reverse().map(f => `<tr>
            <td>${fmtDate(f.data)}</td>
            <td><span class="empr-chip">${esc(emprName(f.empreendimento_id))}</span></td>
            <td>${esc(f.titulo)}</td>
          </tr>`).join('') || '<tr class="empty-row"><td colspan="3">Nenhum fato cadastrado</td></tr>'}
          </tbody></table>
        </div>
      </div>

    </div>
  `);

  // render charts after DOM
  setTimeout(() => {
    // Notificações por mês — dados do quadro (JUR) NOTIFICAÇÕES CLIENTES do Monday
    // (contagem por grupo mensal do Monday; snapshot de 19/05/2026)
    ChartManager.bar('ch_notifMes',
      ['Jan','Fev','Mar','Abr','Mai'],
      [{ data: [51, 65, 23, 52, 45] }]);

    const ng = mapToLabelData(countBy(notifs,'grupo'));
    ChartManager.bar('ch_notifGrupo', ng.labels, [{data: ng.data}], {horizontal: true});

    const nm = mapToLabelData(countBy(notifs,'modelo'));
    ChartManager.donut('ch_notifModelo', nm.labels, nm.data);

    const ct = mapToLabelData(countBy(conts,'tipo'));
    ChartManager.bar('ch_contTipo', ct.labels, [{data: ct.data}]);

    const pe = mapToLabelData(countBy(proc.map(p => ({...p, _en: emprName(p.empreendimento_id)})), '_en'));
    ChartManager.donut('ch_procEmpr', pe.labels, pe.data);

    const dm = mapToLabelData(countBy(dist,'motivo'));
    ChartManager.donut('ch_distMotivo', dm.labels, dm.data, {pie: true});

    const pp = mapToLabelData(countBy(proc,'posicao'));
    ChartManager.donut('ch_procPos', pp.labels, pp.data, {pie: true});
  }, 50);
}

// ============================================================
// EMPREENDIMENTOS
// ============================================================
const TIPOS_EMPR = ['Vertical','Horizontal','Loteamento','Imobiliária','Em constituição','Outro'];

function renderEmpreendimentos() {
  const list = DB.getEmpreendimentos();
  setView(`
    <div class="page-header">
      <div><div class="page-title">🏗️ Empreendimentos</div><div class="page-sub">Base cadastral de empreendimentos do grupo</div></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openEmprModal()">+ Novo Empreendimento</button></div>
    </div>
    <div class="content">
      <div class="table-wrap">
        <table><thead><tr>
          <th>Nome</th><th>Tipo</th><th>Ações</th>
        </tr></thead><tbody id="emprTbody">
        ${list.map(e => `<tr>
          <td><strong>${esc(e.nome)}</strong></td>
          <td>${badge(e.tipo, 'blue')}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="openEmprModal('${e.id}')">✏️ Editar</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteEmpr('${e.id}')">🗑️</button>
          </td>
        </tr>`).join('') || '<tr class="empty-row"><td colspan="3">Nenhum empreendimento cadastrado</td></tr>'}
        </tbody></table>
      </div>
    </div>
  `);
}

function openEmprModal(id) {
  const e = id ? DB.getById('empreendimentos', id) : null;
  openModal(e ? 'Editar Empreendimento' : 'Novo Empreendimento',
    `<div class="form-grid cols-1">
      <div class="form-group"><label class="field-label">Nome *</label>
        <input type="text" id="em_nome" value="${esc(e?.nome||'')}" placeholder="Ex: Jardim Paulista" /></div>
      <div class="form-group"><label class="field-label">Tipo</label>
        <select id="em_tipo">${opts(TIPOS_EMPR, e?.tipo)}</select></div>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveEmpr('${id||''}')">Salvar</button>`
  );
}

function saveEmpr(id) {
  const nome = document.getElementById('em_nome').value.trim();
  const tipo = document.getElementById('em_tipo').value;
  if (!nome) { toast('Nome obrigatório','error'); return; }
  if (id) { DB.update('empreendimentos', id, { nome, tipo }); toast('Empreendimento atualizado!','success'); }
  else { DB.insert('empreendimentos', { nome, tipo }); toast('Empreendimento cadastrado!','success'); }
  closeModal();
  renderEmpreendimentos();
  populateMonthSelector();
}

function deleteEmpr(id) {
  const e = DB.getById('empreendimentos', id);
  confirmDelete(`Excluir <strong>${esc(e?.nome)}</strong>?`, `()=>{ DB.remove('empreendimentos','${id}'); toast('Excluído!'); renderEmpreendimentos(); }`);
}

// ============================================================
// FATOS RELEVANTES
// ============================================================
function renderFatos() {
  const cid    = DB.getActiveComite()?.id;
  const comite = DB.getActiveComite();
  if (!cid) { noComiteAlert(); return; }
  const fatos = DB.forComite('fatos', cid)
    .sort((a,b) => a.data.localeCompare(b.data));
  const emprs = [...new Set(fatos.map(f => f.empreendimento_id))]
    .sort((a, b) => emprName(a).localeCompare(emprName(b), 'pt-BR'));

  setView(`
    <div class="page-header">
      <div><div class="page-title">📌 Fatos Relevantes</div><div class="page-sub">${esc(comite.label)}</div></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openFatoModal()">+ Novo Fato</button></div>
    </div>
    <div class="content">
      ${emprs.length === 0 ? '<div class="alert alert-info">ℹ️ Nenhum fato cadastrado neste período.</div>' : ''}
      ${emprs.map(eid => {
        const fatosDe = fatos.filter(f => f.empreendimento_id === eid);
        return `<div class="section-card">
          <div class="section-card-head">
            <div class="section-card-title"><span class="empr-chip">${esc(emprName(eid))}</span></div>
            <button class="btn btn-ghost btn-sm" onclick="openFatoModal(null,'${eid}')">+ Fato</button>
          </div>
          <div class="section-card-body">
            ${fatosDe.map(f => `
              <div class="fato-card">
                <div class="fato-actions">
                  <button class="btn btn-ghost btn-sm" onclick="openFatoModal('${f.id}')">✏️</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteFato('${f.id}')">🗑️</button>
                </div>
                <div class="fato-header">
                  <span class="fato-date">📅 ${fmtDate(f.data)}</span>
                  ${f.titulo ? `<strong style="font-size:13px;">${esc(f.titulo)}</strong>` : ''}
                </div>
                <div class="fato-body">${esc(f.descricao)}</div>
              </div>
            `).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>
  `);
}

function openFatoModal(id, defaultEmpr) {
  const f = id ? DB.getById('fatos', id) : null;
  const cid = DB.getActiveComite()?.id;
  openModal(f ? 'Editar Fato Relevante' : 'Novo Fato Relevante',
    `<div class="form-grid">
      <div class="form-group"><label class="field-label">Empreendimento *</label>
        <select id="ft_empr">${emprOptions(f?.empreendimento_id || defaultEmpr)}</select></div>
      <div class="form-group"><label class="field-label">Data *</label>
        <input type="date" id="ft_data" value="${f?.data || isoToday()}" /></div>
      <div class="form-group span-full"><label class="field-label">Título</label>
        <input type="text" id="ft_titulo" value="${esc(f?.titulo||'')}" placeholder="Resumo curto" /></div>
      <div class="form-group span-full"><label class="field-label">Descrição *</label>
        <textarea id="ft_desc" rows="5">${esc(f?.descricao||'')}</textarea></div>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveFato('${id||''}','${cid}')">Salvar</button>`
  );
}

function saveFato(id, cid) {
  const empr  = document.getElementById('ft_empr').value;
  const data  = document.getElementById('ft_data').value;
  const titulo= document.getElementById('ft_titulo').value.trim();
  const desc  = document.getElementById('ft_desc').value.trim();
  if (!empr || !data || !desc) { toast('Preencha os campos obrigatórios','error'); return; }
  if (id) { DB.update('fatos', id, { empreendimento_id: empr, data, titulo, descricao: desc }); toast('Fato atualizado!','success'); }
  else { DB.insert('fatos', { comite_id: cid, empreendimento_id: empr, data, titulo, descricao: desc }); toast('Fato adicionado!','success'); }
  closeModal(); renderFatos();
}

function deleteFato(id) {
  confirmDelete('Excluir este fato relevante?', `()=>{ DB.remove('fatos','${id}'); toast('Excluído!'); renderFatos(); }`);
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================
const GRUPOS_NOT   = ['Cobrança','Inadimplência','Obra','Entrega','Outros'];
const MODELOS_NOT  = ['Extrajudicial','E-mail','WhatsApp','Carta','Outros'];
const ESTAGIOS_NOT = ['Em Andamento','Resolvida'];

function renderNotificacoes() {
  const cid    = DB.getActiveComite()?.id;
  const comite = DB.getActiveComite();
  if (!cid) { noComiteAlert(); return; }
  const list = DB.forComite('notificacoes', cid);
  const tempos = list.filter(n=>n.data_solucao).map(n=>daysBetween(n.data_notificacao,n.data_solucao));
  const tMedia = tempos.length ? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : null;

  // Detalhamento por estágio — coluna ESTÁGIOS do quadro (JUR) NOTIFICAÇÕES CLIENTES.
  // Considera apenas as notificações do mês do comitê ativo.
  const mesRef = comite.ref || '';
  const estagioCount = {};
  list.forEach(n => {
    if (mesRef && n.data_notificacao && !n.data_notificacao.startsWith(mesRef)) return;
    const e = n.estagio_detalhe;
    if (!e) return;
    estagioCount[e] = (estagioCount[e] || 0) + 1;
  });
  const estagioTotal = Object.values(estagioCount).reduce((a,b) => a + b, 0);
  const estagioRows = Object.entries(estagioCount)
    .sort((a,b) => b[1] - a[1])
    .map(([label,count]) => `
      <div class="estagio-item ${estagioColorClass(label)}">
        <span class="estagio-name">${esc(label)}</span>
        <span class="estagio-count">${count}</span>
      </div>`).join('');

  setView(`
    <div class="page-header">
      <div><div class="page-title">📨 Notificações</div><div class="page-sub">${esc(comite.label)}</div></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openNotifModal()">+ Nova Notificação</button></div>
    </div>
    <div class="content">
      <div class="stat-row">
        <div class="stat-card">
          <div class="stat-icon blue">📨</div>
          <div class="stat-info">
            <div class="stat-label">Total de Notificações</div>
            <div class="stat-value">${list.length}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon amber">⏱️</div>
          <div class="stat-info">
            <div class="stat-label">Tempo Médio de Resolução</div>
            <div class="stat-value">${tMedia !== null ? tMedia + ' dias' : '—'}</div>
          </div>
        </div>
      </div>
      <div class="estagio-panel">
        <div class="estagio-panel-title">Status das Notificações · ${esc(comite.label)} · ${estagioTotal}</div>
        ${estagioTotal
          ? `<div class="estagio-breakdown">${estagioRows}</div>`
          : '<div class="estagio-empty">Sincronize com o Monday para carregar os estágios da coluna ESTÁGIOS.</div>'}
      </div>

      <div class="charts-grid">
        <div class="chart-card"><div class="chart-title">Motivo</div><div class="chart-wrap"><canvas id="ch_ng2"></canvas></div></div>
        <div class="chart-card"><div class="chart-title">Empreendimento</div><div class="chart-wrap"><canvas id="ch_nm2"></canvas></div></div>
      </div>

      <div class="chart-card" style="margin-bottom:20px;">
        <div class="chart-title">Notificações por Mês — 2026 (jan–mai)</div>
        <div class="chart-wrap"><canvas id="ch_notifMes2"></canvas></div>
      </div>

      <div class="block-title">Lista de Notificações</div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Empreendimento</th><th>Torre</th><th>Unidade</th><th>Grupo</th><th>Modelo</th><th>Estágio</th>
          <th>Data Notif.</th><th>Data Solução</th><th>Ações</th>
        </tr></thead><tbody>
        ${list.map(n => `<tr>
          <td><span class="empr-chip">${esc(emprName(n.empreendimento_id))}</span></td>
          <td>${n.torre ? `<span style="font-size:11px;font-weight:600;color:var(--gray-600)">${esc(n.torre)}</span>` : '<span style="color:var(--gray-400)">—</span>'}</td>
          <td>${n.unidade ? `<code style="font-size:11px">${esc(n.unidade)}</code>` : (n.cliente ? `<code style="font-size:11px">${esc(n.cliente)}</code>` : '—')}</td>
          <td>${badge(n.grupo,'orange')}</td>
          <td>${esc(n.modelo)}</td>
          <td>${badge(n.estagio)}</td>
          <td>${fmtDate(n.data_notificacao)}</td>
          <td>${fmtDate(n.data_solucao)}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="openNotifModal('${n.id}')">✏️</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteNotif('${n.id}')">🗑️</button>
          </td>
        </tr>`).join('') || '<tr class="empty-row"><td colspan="9">Nenhuma notificação cadastrada</td></tr>'}
        </tbody></table>
      </div>
    </div>
  `);
  setTimeout(() => {
    // Notificações por mês — dados do quadro (JUR) NOTIFICAÇÕES CLIENTES do Monday
    // (contagem por grupo mensal do Monday; snapshot de 19/05/2026)
    ChartManager.bar('ch_notifMes2',
      ['Jan','Fev','Mar','Abr','Mai'],
      [{ data: [51, 65, 23, 52, 45] }]);

    const ng = mapToLabelData(countBy(list,'grupo'));
    ChartManager.donut('ch_ng2', ng.labels, ng.data, {pie: true});
    const nm = mapToLabelData(countBy(list.map(n => ({ _empr: emprName(n.empreendimento_id) })), '_empr'));
    ChartManager.donut('ch_nm2', nm.labels, nm.data);
  }, 50);
}

function openNotifModal(id) {
  const n = id ? DB.getById('notificacoes', id) : null;
  const cid = DB.getActiveComite()?.id;
  openModal(n ? 'Editar Notificação' : 'Nova Notificação',
    `<div class="form-grid">
      <div class="form-group"><label class="field-label">Empreendimento *</label><select id="nt_empr">${emprOptions(n?.empreendimento_id)}</select></div>
      <div class="form-group"><label class="field-label">Torre</label><input type="text" id="nt_torre" value="${esc(n?.torre||'')}" placeholder="Ex: TORRE B" /></div>
      <div class="form-group"><label class="field-label">Unidade</label><input type="text" id="nt_unidade" value="${esc(n?.unidade||n?.cliente||'')}" placeholder="Ex: 1105B" /></div>
      <div class="form-group"><label class="field-label">Grupo *</label><select id="nt_grupo">${opts(GRUPOS_NOT, n?.grupo)}</select></div>
      <div class="form-group"><label class="field-label">Modelo *</label><select id="nt_modelo">${opts(MODELOS_NOT, n?.modelo)}</select></div>
      <div class="form-group"><label class="field-label">Estágio</label><select id="nt_estagio">${opts(ESTAGIOS_NOT, n?.estagio)}</select></div>
      <div class="form-group"><label class="field-label">Data da Notificação *</label><input type="date" id="nt_data" value="${n?.data_notificacao||isoToday()}" /></div>
      <div class="form-group"><label class="field-label">Data de Solução</label><input type="date" id="nt_sol" value="${n?.data_solucao||''}" /></div>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveNotif('${id||''}','${cid}')">Salvar</button>`
  );
}

function saveNotif(id, cid) {
  const d = {
    empreendimento_id: document.getElementById('nt_empr').value,
    torre:   document.getElementById('nt_torre').value.trim(),
    unidade: document.getElementById('nt_unidade').value.trim(),
    grupo: document.getElementById('nt_grupo').value,
    modelo: document.getElementById('nt_modelo').value,
    estagio: document.getElementById('nt_estagio').value,
    data_notificacao: document.getElementById('nt_data').value,
    data_solucao: document.getElementById('nt_sol').value,
  };
  if (!d.empreendimento_id||!d.data_notificacao) { toast('Campos obrigatórios ausentes','error'); return; }
  if (id) { DB.update('notificacoes',id,d); toast('Notificação atualizada!','success'); }
  else { DB.insert('notificacoes',{comite_id:cid,...d}); toast('Notificação adicionada!','success'); }
  closeModal(); renderNotificacoes();
}
function deleteNotif(id) {
  confirmDelete('Excluir esta notificação?', `()=>{ DB.remove('notificacoes','${id}'); toast('Excluído!'); renderNotificacoes(); }`);
}

// ============================================================
// CONTRATOS
// ============================================================
const TIPOS_CONT_CLIENTES    = ['Compra e Venda','Locação','Permuta','Financiamento'];
const TIPOS_CONT_PRESTADORES = ['Prestadores de Serviços'];
const TIPOS_CONT_OBRA        = ['Obra - Prest. de Serviços'];
const TIPOS_CONT_OUTROS      = ['Outros'];
const TIPOS_CONT = [
  ...TIPOS_CONT_CLIENTES,
  ...TIPOS_CONT_PRESTADORES,
  ...TIPOS_CONT_OBRA,
  ...TIPOS_CONT_OUTROS,
];
const STATUS_CONT = ['Em análise','Assinado','Cancelado','Pendente'];

// Selects com optgroup por categoria
function optsContTipo(sel) {
  const grupos = [
    { label: '── Contratos Clientes ──',    tipos: TIPOS_CONT_CLIENTES    },
    { label: '── Prestadores de Serviços ──', tipos: TIPOS_CONT_PRESTADORES },
    { label: '── Obra ──',                   tipos: TIPOS_CONT_OBRA        },
    { label: '── Outros ──',                 tipos: TIPOS_CONT_OUTROS      },
  ];
  return grupos.map(g =>
    `<optgroup label="${esc(g.label)}">` +
    g.tipos.map(t => `<option value="${esc(t)}" ${t===sel?'selected':''}>${esc(t)}</option>`).join('') +
    `</optgroup>`
  ).join('');
}

// Cat de um tipo (por string)
function catCont(tipo) {
  if (TIPOS_CONT_CLIENTES.includes(tipo))    return 'clientes';
  if (TIPOS_CONT_PRESTADORES.includes(tipo)) return 'prestadores';
  if (TIPOS_CONT_OBRA.includes(tipo))        return 'obra';
  return 'outros';
}
// Cat de um objeto contrato — respeita campo explícito "categoria" (sincronizado do Monday)
function catOfCont(c) {
  if (c.categoria && ['clientes','prestadores','obra'].includes(c.categoria)) return c.categoria;
  return catCont(c.tipo || '');
}

function renderContratos() {
  const cid    = DB.getActiveComite()?.id;
  const comite = DB.getActiveComite();
  if (!cid) { noComiteAlert(); return; }
  const all = DB.forComite('contratos', cid);

  const tabAtiva = window._contTab || 'todos';
  const list = tabAtiva === 'todos' ? all : all.filter(c => catOfCont(c) === tabAtiva);

  const tabCounts = {
    todos:       all.length,
    clientes:    all.filter(c=>catOfCont(c)==='clientes').length,
    prestadores: all.filter(c=>catOfCont(c)==='prestadores').length,
    obra:        all.filter(c=>catOfCont(c)==='obra').length,
  };

  const tabLabel = { todos:'Todos', clientes:'Contratos Clientes', prestadores:'Prestadores de Serviços', obra:'Obra' };

  const renderTabBtn = (key) =>
    `<button class="tab-btn ${tabAtiva===key?'active':''}" onclick="window._contTab='${key}';renderContratos()">
      ${tabLabel[key]} (${tabCounts[key]})
    </button>`;

  setView(`
    <div class="page-header">
      <div><div class="page-title">📄 Contratos</div><div class="page-sub">${esc(comite.label)}</div></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openContModal()">+ Novo Contrato</button></div>
    </div>
    <div class="content">
      <div class="tabs">
        ${renderTabBtn('todos')}
        ${renderTabBtn('clientes')}
        ${renderTabBtn('prestadores')}
        ${renderTabBtn('obra')}
      </div>

      <div class="kpi-grid">
        <div class="kpi-card green"><div class="kpi-label">Total</div><div class="kpi-value">${all.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Contratos Clientes</div><div class="kpi-value">${tabCounts.clientes}</div></div>
        <div class="kpi-card purple"><div class="kpi-label">Prestadores de Serviços</div><div class="kpi-value">${tabCounts.prestadores}</div></div>
        <div class="kpi-card orange"><div class="kpi-label">Obra</div><div class="kpi-value">${tabCounts.obra}</div></div>
      </div>
      <div class="charts-grid">
        <div class="chart-card" style="grid-column:1/-1"><div class="chart-title">Por Tipo</div><div class="chart-wrap" style="height:360px"><canvas id="ch_ct2"></canvas></div></div>
        <div class="chart-card" style="grid-column:1/-1"><div class="chart-title">Por Empreendimento</div><div class="chart-wrap" style="height:320px"><canvas id="ch_ce2"></canvas></div></div>
        <div class="chart-card" style="grid-column:1/-1"><div class="chart-title">Evolução do Total de Contratos — 2026 (jan–mai)</div><div class="chart-wrap" style="height:280px"><canvas id="ch_cmes"></canvas></div></div>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Empreendimento</th><th>Categoria</th><th>Tipo</th><th>Data Solicitação</th><th>Status</th><th>Ações</th>
        </tr></thead><tbody>
        ${list.map(c => {
          const cat = catOfCont(c);
          const catColors = {clientes:'blue', prestadores:'purple', obra:'orange', outros:'gray'};
          const catNomes  = {clientes:'Clientes', prestadores:'Prestadores', obra:'Obra', outros:'Outros'};
          return `<tr>
            <td><span class="empr-chip">${esc(emprName(c.empreendimento_id))}</span></td>
            <td>${badge(catNomes[cat], catColors[cat])}</td>
            <td><small>${esc(c.tipo)}</small></td>
            <td>${fmtDate(c.data_solicitacao)}</td>
            <td>${badge(c.status)}</td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="openContModal('${c.id}')">✏️</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteCont('${c.id}')">🗑️</button>
            </td>
          </tr>`;
        }).join('') || '<tr class="empty-row"><td colspan="6">Nenhum contrato nesta categoria</td></tr>'}
        </tbody></table>
      </div>
    </div>
  `);
  setTimeout(() => {
    const ctSorted = Object.entries(countBy(list,'tipo')).sort((a,b) => a[1]-b[1]);
    ChartManager.bar('ch_ct2', ctSorted.map(e=>e[0]), [{data: ctSorted.map(e=>e[1])}],
      { horizontal: true, dataLabels: true });
    const ceSorted = Object.entries(countBy(list.map(c=>({...c,_en:emprName(c.empreendimento_id)})),'_en'))
      .sort((a,b) => a[1]-b[1]);
    ChartManager.bar('ch_ce2', ceSorted.map(e=>e[0]),
      [{data: ceSorted.map(e=>e[1]), color: '#16A34A'}],
      { horizontal: true, dataLabels: true });

    // Evolução mensal — snapshot fixo do Monday em 19/05/2026 (não atualiza sozinho)
    ChartManager.line('ch_cmes', ['Jan','Fev','Mar','Abr','Mai'],
      [{label:'Contratos', data:[62,82,74,95,52]}], { dataLabels: true });
  }, 50);
}

function openContModal(id) {
  const c = id ? DB.getById('contratos', id) : null;
  const cid = DB.getActiveComite()?.id;
  openModal(c ? 'Editar Contrato' : 'Novo Contrato',
    `<div class="form-grid">
      <div class="form-group"><label class="field-label">Empreendimento *</label><select id="co_empr">${emprOptions(c?.empreendimento_id)}</select></div>
      <div class="form-group"><label class="field-label">Tipo *</label>
        <select id="co_tipo">${optsContTipo(c?.tipo)}</select>
      </div>
      <div class="form-group"><label class="field-label">Data Solicitação</label><input type="date" id="co_data" value="${c?.data_solicitacao||isoToday()}" /></div>
      <div class="form-group"><label class="field-label">Status</label><select id="co_status">${opts(STATUS_CONT,c?.status||'Em análise')}</select></div>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveCont('${id||''}','${cid}')">Salvar</button>`
  );
}

function saveCont(id, cid) {
  const d = {
    empreendimento_id: document.getElementById('co_empr').value,
    tipo: document.getElementById('co_tipo').value,
    data_solicitacao: document.getElementById('co_data').value,
    status: document.getElementById('co_status').value,
  };
  if (!d.empreendimento_id||!d.tipo) { toast('Campos obrigatórios ausentes','error'); return; }
  if (id) { DB.update('contratos',id,d); toast('Contrato atualizado!','success'); }
  else { DB.insert('contratos',{comite_id:cid,...d}); toast('Contrato adicionado!','success'); }
  closeModal(); renderContratos();
}
function deleteCont(id) {
  confirmDelete('Excluir este contrato?', `()=>{ DB.remove('contratos','${id}'); toast('Excluído!'); renderContratos(); }`);
}

// ============================================================


// DISTRATOS
// ============================================================
const MOTIVOS_DIST = ['Dificuldade Financeira','Insatisfação','Falha de Serviço','Outros'];

function renderDistratos() {
  const cid    = DB.getActiveComite()?.id;
  const comite = DB.getActiveComite();
  if (!cid) { noComiteAlert(); return; }
  const list = DB.forComite('distratos', cid);
  const tMed = list.length ? Math.round(list.reduce((s,d)=>s+(d.tempo_dias||0),0)/list.length) : null;

  setView(`
    <div class="page-header">
      <div><div class="page-title">❌ Distratos</div><div class="page-sub">${esc(comite.label)}</div></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openDistModal()">+ Novo Distrato</button></div>
    </div>
    <div class="content">
      <div class="kpi-grid">
        <div class="kpi-card red"><div class="kpi-label">Total Distratos</div><div class="kpi-value">${list.length}</div></div>
        <div class="kpi-card orange"><div class="kpi-label">Tempo Médio</div><div class="kpi-value" style="font-size:20px">${tMed!==null?tMed+' dias':'—'}</div></div>
        <div class="kpi-card"><div class="kpi-label">Empreendimentos</div><div class="kpi-value">${new Set(list.map(d=>d.empreendimento_id)).size}</div></div>
      </div>
      <div class="charts-grid">
        <div class="chart-card"><div class="chart-title">Por Motivo</div><div class="chart-wrap"><canvas id="ch_dm"></canvas></div></div>
        <div class="chart-card"><div class="chart-title">Por Empreendimento</div><div class="chart-wrap"><canvas id="ch_de"></canvas></div></div>
        <div class="chart-card"><div class="chart-title">Por Equipe</div><div class="chart-wrap"><canvas id="ch_deq"></canvas></div></div>
        <div class="chart-card"><div class="chart-title">Distratos por Mês</div><div class="chart-wrap"><canvas id="ch_dmes"></canvas></div></div>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Unidade</th><th>Empreendimento</th><th>Motivo</th><th>Equipe</th><th>Solicitação</th><th>Data Venda</th><th>Data Distrato</th><th>Dias</th><th>Ações</th>
        </tr></thead><tbody>
        ${list.map(d => `<tr>
          <td>${d.unidade ? `<code style="font-size:11px">${esc(d.unidade)}</code>` : '—'}</td>
          <td><span class="empr-chip">${esc(emprName(d.empreendimento_id))}</span></td>
          <td>${badge(d.motivo,'red')}</td>
          <td>${d.equipe ? badge(d.equipe,'blue') : '—'}</td>
          <td>${fmtDate(d.data_solicitacao)}</td>
          <td>${fmtDate(d.data_venda)}</td>
          <td>${fmtDate(d.data_distrato)}</td>
          <td>${d.tempo_dias||'—'}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="openDistModal('${d.id}')">✏️</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteDist('${d.id}')">🗑️</button>
          </td>
        </tr>`).join('') || '<tr class="empty-row"><td colspan="9">Nenhum distrato cadastrado</td></tr>'}
        </tbody></table>
      </div>
    </div>
  `);
  setTimeout(() => {
    const dm = mapToLabelData(countBy(list,'motivo'));
    ChartManager.donut('ch_dm', dm.labels, dm.data, {pie:true});
    const de = mapToLabelData(countBy(list.map(d=>({...d,_en:emprName(d.empreendimento_id)})),'_en'));
    ChartManager.donut('ch_de', de.labels, de.data);
    const deq = mapToLabelData(countBy(list,'equipe'));
    ChartManager.donut('ch_deq', deq.labels, deq.data, {pie:true});
    // Evolução: nº de distratos por mês (DATA DA SOLICITAÇÃO)
    const MESES_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    const byMes = {};
    list.forEach(d => {
      const m = (d.data_solicitacao || d.data_distrato || '').slice(0,7); // YYYY-MM
      if (/^\d{4}-\d{2}$/.test(m)) byMes[m] = (byMes[m] || 0) + 1;
    });
    const meses = Object.keys(byMes).sort();
    const mesLabels = meses.map(ym => { const [y,mm] = ym.split('-'); return `${MESES_ABBR[(+mm)-1]}/${y}`; });
    ChartManager.bar('ch_dmes', mesLabels, [{label:'Distratos', data: meses.map(m=>byMes[m])}], {dataLabels:true});
  }, 50);
}

function openDistModal(id) {
  const d = id ? DB.getById('distratos', id) : null;
  const cid = DB.getActiveComite()?.id;
  openModal(d?'Editar Distrato':'Novo Distrato',
    `<div class="form-grid">
      <div class="form-group"><label class="field-label">Empreendimento *</label><select id="di_empr">${emprOptions(d?.empreendimento_id)}</select></div>
      <div class="form-group"><label class="field-label">Motivo</label><select id="di_motivo">${opts(MOTIVOS_DIST,d?.motivo)}</select></div>
      <div class="form-group"><label class="field-label">Data da Solicitação</label><input type="date" id="di_sol" value="${d?.data_solicitacao||''}" /></div>
      <div class="form-group"><label class="field-label">Data da Venda</label><input type="date" id="di_venda" value="${d?.data_venda||''}" /></div>
      <div class="form-group"><label class="field-label">Data do Distrato</label><input type="date" id="di_dist" value="${d?.data_distrato||isoToday()}" /></div>
      <div class="form-group"><label class="field-label">Dias até Distrato</label><input type="number" id="di_dias" value="${d?.tempo_dias||''}" min="0" /></div>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveDist('${id||''}','${cid}')">Salvar</button>`
  );
}

function saveDist(id, cid) {
  const d = {
    empreendimento_id: document.getElementById('di_empr').value,
    motivo: document.getElementById('di_motivo').value,
    data_solicitacao: document.getElementById('di_sol').value,
    data_venda: document.getElementById('di_venda').value,
    data_distrato: document.getElementById('di_dist').value,
    tempo_dias: parseInt(document.getElementById('di_dias').value)||0,
  };
  if (!d.empreendimento_id) { toast('Empreendimento obrigatório','error'); return; }
  if (id) { DB.update('distratos',id,d); toast('Distrato atualizado!','success'); }
  else { DB.insert('distratos',{comite_id:cid,...d}); toast('Distrato adicionado!','success'); }
  closeModal(); renderDistratos();
}
function deleteDist(id) {
  confirmDelete('Excluir este distrato?', `()=>{ DB.remove('distratos','${id}'); toast('Excluído!'); renderDistratos(); }`);
}

// ============================================================
// RETOMADAS
// ============================================================
const MOTIVOS_RET = ['Inadimplência','Distrato','Desistência','Outros'];
const EQUIPES_RET = ['Equipe A','Equipe B','Jurídico','Outros'];

function renderRetomadas() {
  const cid    = DB.getActiveComite()?.id;
  const comite = DB.getActiveComite();
  if (!cid) { noComiteAlert(); return; }
  const list = DB.forComite('retomadas', cid);
  const tMed = list.length ? Math.round(list.reduce((s,r)=>s+(r.tempo_dias||0),0)/list.length) : null;

  setView(`
    <div class="page-header">
      <div><div class="page-title">🔁 Retomadas</div><div class="page-sub">${esc(comite.label)}</div></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openRetModal()">+ Nova Retomada</button></div>
    </div>
    <div class="content">
      <div class="kpi-grid">
        <div class="kpi-card green"><div class="kpi-label">Total Retomadas</div><div class="kpi-value">${list.length}</div></div>
        <div class="kpi-card orange"><div class="kpi-label">Tempo Médio</div><div class="kpi-value" style="font-size:20px">${tMed!==null?tMed+' dias':'—'}</div></div>
        <div class="kpi-card"><div class="kpi-label">Empreendimentos</div><div class="kpi-value">${new Set(list.map(r=>r.empreendimento_id)).size}</div></div>
      </div>
      <div class="charts-grid">
        <div class="chart-card"><div class="chart-title">Por Motivo</div><div class="chart-wrap"><canvas id="ch_rm"></canvas></div></div>
        <div class="chart-card"><div class="chart-title">Por Equipe</div><div class="chart-wrap"><canvas id="ch_re"></canvas></div></div>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Unidade</th><th>Empreendimento</th><th>Motivo</th><th>Equipe</th><th>Data Início</th><th>Data Retomada</th><th>Dias</th><th>Ações</th>
        </tr></thead><tbody>
        ${list.map(r => `<tr>
          <td>${r.unidade ? `<code style="font-size:11px">${esc(r.unidade)}</code>` : '—'}</td>
          <td><span class="empr-chip">${esc(emprName(r.empreendimento_id))}</span></td>
          <td>${badge(r.motivo,'orange')}</td>
          <td>${esc(r.equipe||'—')}</td>
          <td>${fmtDate(r.data_inicio)}</td>
          <td>${fmtDate(r.data_retomada)}</td>
          <td>${r.tempo_dias||'—'}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="openRetModal('${r.id}')">✏️</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteRet('${r.id}')">🗑️</button>
          </td>
        </tr>`).join('') || '<tr class="empty-row"><td colspan="8">Nenhuma retomada cadastrada</td></tr>'}
        </tbody></table>
      </div>
    </div>
  `);
  setTimeout(() => {
    const rm = mapToLabelData(countBy(list,'motivo'));
    ChartManager.donut('ch_rm', rm.labels, rm.data, {pie:true});
    const re = mapToLabelData(countBy(list,'equipe'));
    ChartManager.bar('ch_re', re.labels, [{data: re.data}]);
  }, 50);
}

function openRetModal(id) {
  const r = id ? DB.getById('retomadas', id) : null;
  const cid = DB.getActiveComite()?.id;
  openModal(r?'Editar Retomada':'Nova Retomada',
    `<div class="form-grid">
      <div class="form-group"><label class="field-label">Empreendimento *</label><select id="re_empr">${emprOptions(r?.empreendimento_id)}</select></div>
      <div class="form-group"><label class="field-label">Unidade</label><input type="text" id="re_unidade" value="${esc(r?.unidade||'')}" placeholder="Ex: 205A" /></div>
      <div class="form-group"><label class="field-label">Motivo</label><select id="re_motivo">${opts(MOTIVOS_RET,r?.motivo)}</select></div>
      <div class="form-group"><label class="field-label">Equipe</label><select id="re_equipe">${opts(EQUIPES_RET,r?.equipe)}</select></div>
      <div class="form-group"><label class="field-label">Data de Início</label><input type="date" id="re_inicio" value="${r?.data_inicio||''}" /></div>
      <div class="form-group"><label class="field-label">Data da Retomada</label><input type="date" id="re_retomada" value="${r?.data_retomada||isoToday()}" /></div>
      <div class="form-group span-2"><label class="field-label">Dias até Retomada</label><input type="number" id="re_dias" value="${r?.tempo_dias||''}" min="0" /></div>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveRet('${id||''}','${cid}')">Salvar</button>`
  );
}

function saveRet(id, cid) {
  const d = {
    empreendimento_id: document.getElementById('re_empr').value,
    unidade:       document.getElementById('re_unidade').value.trim(),
    motivo:        document.getElementById('re_motivo').value,
    equipe:        document.getElementById('re_equipe').value,
    data_inicio:   document.getElementById('re_inicio').value,
    data_retomada: document.getElementById('re_retomada').value,
    tempo_dias:    parseInt(document.getElementById('re_dias').value)||0,
  };
  if (!d.empreendimento_id) { toast('Empreendimento obrigatório','error'); return; }
  if (id) { DB.update('retomadas',id,d); toast('Retomada atualizada!','success'); }
  else { DB.insert('retomadas',{comite_id:cid,...d}); toast('Retomada adicionada!','success'); }
  closeModal(); renderRetomadas();
}

function deleteRet(id) {
  confirmDelete('Excluir esta retomada?', `()=>{ DB.remove('retomadas','${id}'); toast('Excluído!'); renderRetomadas(); }`);
}

// ============================================================
// PROCESSOS JUDICIAIS
// ============================================================
const MOTIVOS_PROC = ['Trabalhista','Consumidor','Cível','Ambiental','Outros'];
const POSICOES     = ['Réu','Autor','Terceiro'];
const STATUS_PROC  = ['Acompanhando','Finalizado','Em Acordo','Baixa Definitiva','Arq. Provisório'];

function renderProcessos() {
  const cid    = DB.getActiveComite()?.id;
  const comite = DB.getActiveComite();
  if (!cid) { noComiteAlert(); return; }
  const ext = DB.forComite('processos', cid).filter(p => !p.interno);
  const int = DB.forComite('processos', cid).filter(p =>  p.interno);

  let tabAtiva = window._procTab || 'externos';

  const renderTab = (list, tipo) => {
    return `
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">Total</div><div class="kpi-value">${list.length}</div></div>
        <div class="kpi-card blue"><div class="kpi-label">Acompanhando</div><div class="kpi-value">${list.filter(p=>p.status==='Acompanhando').length}</div></div>
        <div class="kpi-card green"><div class="kpi-label">Finalizados</div><div class="kpi-value">${list.filter(p=>p.status==='Finalizado').length}</div></div>
        <div class="kpi-card purple"><div class="kpi-label">Em Acordo</div><div class="kpi-value">${list.filter(p=>p.status==='Em Acordo').length}</div></div>
        ${tipo==='externos'?`
        <div class="kpi-card gray"><div class="kpi-label">Baixa Definitiva</div><div class="kpi-value">${list.filter(p=>p.status==='Baixa Definitiva').length}</div></div>
        <div class="kpi-card yellow"><div class="kpi-label">Arq. Provisório</div><div class="kpi-value">${list.filter(p=>p.status==='Arq. Provisório').length}</div></div>
        ` : ''}
      </div>
      <div class="charts-grid">
        <div class="chart-card"><div class="chart-title">Por Empreendimento</div><div class="chart-wrap"><canvas id="ch_pe_${tipo}"></canvas></div></div>
        <div class="chart-card"><div class="chart-title">Por Motivo</div><div class="chart-wrap"><canvas id="ch_pm_${tipo}"></canvas></div></div>
        ${tipo==='externos'?`<div class="chart-card"><div class="chart-title">Por Posição</div><div class="chart-wrap"><canvas id="ch_pp_ext"></canvas></div></div>`:''}
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Nº Processo</th><th>Empreendimento</th><th>Tipo</th><th>Status</th><th>Local</th><th>Ano</th><th>Ações</th>
        </tr></thead><tbody>
        ${list.map(p => `<tr>
          <td style="font-family:monospace;font-size:11px">${esc(p.numero||'—')}</td>
          <td><span class="empr-chip">${esc(emprName(p.empreendimento_id))}</span></td>
          <td><span title="${esc(p.tipo||p.motivo)}">${badge(p.motivo,'purple')}</span></td>
          <td>${badge(p.status)}</td>
          <td><small>${esc(p.local)}</small></td>
          <td>${esc(p.ano)}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="openProcModal('${p.id}')">✏️</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteProc('${p.id}')">🗑️</button>
          </td>
        </tr>`).join('') || '<tr class="empty-row"><td colspan="7">Nenhum processo cadastrado</td></tr>'}
        </tbody></table>
      </div>
    `;
  };

  setView(`
    <div class="page-header">
      <div><div class="page-title">⚖️ Processos Judiciais</div><div class="page-sub">${esc(comite.label)}</div></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openProcModal()">+ Novo Processo</button></div>
    </div>
    <div class="content">
      <div class="tabs">
        <button class="tab-btn ${tabAtiva==='externos'?'active':''}" onclick="window._procTab='externos';renderProcessos()">Externos (${ext.length})</button>
        <button class="tab-btn ${tabAtiva==='internos'?'active':''}" onclick="window._procTab='internos';renderProcessos()">Internos (${int.length})</button>
      </div>
      <div id="proc_content">
        ${tabAtiva==='externos' ? renderTab(ext,'externos') : renderTab(int,'internos')}
      </div>
    </div>
  `);

  setTimeout(() => {
    const list = tabAtiva === 'externos' ? ext : int;
    const tipo = tabAtiva;
    const pe = mapToLabelData(countBy(list.map(p=>({...p,_en:emprName(p.empreendimento_id)})),'_en'));
    ChartManager.donut(`ch_pe_${tipo}`, pe.labels, pe.data);
    const pm = mapToLabelData(countBy(list,'motivo'));
    ChartManager.donut(`ch_pm_${tipo}`, pm.labels, pm.data, {pie:true});
    if (tipo==='externos') {
      const pp = mapToLabelData(countBy(list,'posicao'));
      ChartManager.donut('ch_pp_ext', pp.labels, pp.data, {pie:true});
    }
  }, 50);
}

function openProcModal(id) {
  const p = id ? DB.getById('processos', id) : null;
  const cid = DB.getActiveComite()?.id;
  openModal(p?'Editar Processo':'Novo Processo',
    `<div class="form-grid">
      <div class="form-group"><label class="field-label">Empreendimento *</label><select id="pr_empr">${emprOptions(p?.empreendimento_id)}</select></div>
      <div class="form-group"><label class="field-label">Motivo</label><select id="pr_motivo">${opts(MOTIVOS_PROC,p?.motivo)}</select></div>
      <div class="form-group"><label class="field-label">Posição</label><select id="pr_pos">${opts(POSICOES,p?.posicao)}</select></div>
      <div class="form-group"><label class="field-label">Status</label><select id="pr_status">${opts(STATUS_PROC,p?.status||'Acompanhando')}</select></div>
      <div class="form-group"><label class="field-label">Local</label><input type="text" id="pr_local" value="${esc(p?.local||'SP')}" /></div>
      <div class="form-group"><label class="field-label">Ano</label><input type="text" id="pr_ano" value="${esc(p?.ano||new Date().getFullYear())}" /></div>
      <div class="form-group span-full"><label class="field-label">Tipo</label>
        <select id="pr_interno">
          <option value="false" ${!p?.interno?'selected':''}>Externo</option>
          <option value="true"  ${p?.interno?'selected':''}>Interno</option>
        </select>
      </div>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveProc('${id||''}','${cid}')">Salvar</button>`
  );
}

function saveProc(id, cid) {
  const d = {
    empreendimento_id: document.getElementById('pr_empr').value,
    motivo: document.getElementById('pr_motivo').value,
    posicao: document.getElementById('pr_pos').value,
    status: document.getElementById('pr_status').value,
    local: document.getElementById('pr_local').value,
    ano: document.getElementById('pr_ano').value,
    interno: document.getElementById('pr_interno').value === 'true',
  };
  if (!d.empreendimento_id) { toast('Empreendimento obrigatório','error'); return; }
  if (id) { DB.update('processos',id,d); toast('Processo atualizado!','success'); }
  else { DB.insert('processos',{comite_id:cid,...d}); toast('Processo adicionado!','success'); }
  closeModal(); renderProcessos();
}
function deleteProc(id) {
  confirmDelete('Excluir este processo?', `()=>{ DB.remove('processos','${id}'); toast('Excluído!'); renderProcessos(); }`);
}

// ============================================================
// UNIDADES / HABITE-SE
// ============================================================
function renderUnidades() {
  const emprs = DB.getEmpreendimentos();
  let filtroEmpr = window._unidadesEmpr || (emprs[0]?.id || '');

  const list = DB.where('unidades', u => u.empreendimento_id === filtroEmpr)
    .sort((a,b) => a.numero - b.numero)
    .map(u => {
      const dias = u.prazo_180 && u.previsao_entrega
        ? daysBetween(u.prazo_180, u.previsao_entrega) : null;
      return { ...u, dias_atraso: dias };
    });

  const atrasadas = list.filter(u => u.dias_atraso > 0).length;
  const noPrazo   = list.filter(u => u.dias_atraso <= 0).length;

  setView(`
    <div class="page-header">
      <div><div class="page-title">🏠 Unidades / Habite-se</div><div class="page-sub">Cronograma de entrega por empreendimento</div></div>
      <div class="page-actions">
        <button class="btn btn-outline" onclick="openUnidadeModal()">+ Unidade</button>
        <button class="btn btn-primary" onclick="openImportUnidadesModal()">📥 Importar Lote</button>
      </div>
    </div>
    <div class="content">
      <div class="filter-bar">
        <select onchange="window._unidadesEmpr=this.value;renderUnidades()">
          ${emprs.map(e=>`<option value="${esc(e.id)}" ${e.id===filtroEmpr?'selected':''}>${esc(e.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">Total Unidades</div><div class="kpi-value">${list.length}</div></div>
        <div class="kpi-card red"><div class="kpi-label">Em Atraso</div><div class="kpi-value">${atrasadas}</div></div>
        <div class="kpi-card green"><div class="kpi-label">No Prazo</div><div class="kpi-value">${noPrazo}</div></div>
        <div class="kpi-card orange"><div class="kpi-label">Max. Atraso</div>
          <div class="kpi-value" style="font-size:20px">${list.filter(u=>u.dias_atraso>0).reduce((m,u)=>Math.max(m,u.dias_atraso),0) || '—'} ${atrasadas?'dias':''}</div>
        </div>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Unidade</th><th>Prazo Habite-se</th><th>+ 180 dias</th>
          <th>Previsão Entrega</th><th>Dias Atraso</th><th>Ações</th>
        </tr></thead><tbody>
        ${list.map(u => `<tr>
          <td><strong>${u.numero}</strong></td>
          <td>${fmtDate(u.prazo_habite_se)}</td>
          <td>${fmtDate(u.prazo_180)}</td>
          <td>${fmtDate(u.previsao_entrega)}</td>
          <td class="${u.dias_atraso > 0 ? 'atraso-pos' : 'atraso-neg'}">${u.dias_atraso !== null ? (u.dias_atraso > 0 ? '+'+u.dias_atraso : u.dias_atraso) : '—'}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="openUnidadeModal('${u.id}')">✏️</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteUnidade('${u.id}')">🗑️</button>
          </td>
        </tr>`).join('') || '<tr class="empty-row"><td colspan="6">Nenhuma unidade cadastrada para este empreendimento</td></tr>'}
        </tbody></table>
      </div>
    </div>
  `);
}

function openUnidadeModal(id) {
  const u = id ? DB.getById('unidades', id) : null;
  const emprAtual = window._unidadesEmpr;
  openModal(u?'Editar Unidade':'Nova Unidade',
    `<div class="form-grid">
      <div class="form-group"><label class="field-label">Empreendimento *</label><select id="un_empr">${emprOptions(u?.empreendimento_id||emprAtual)}</select></div>
      <div class="form-group"><label class="field-label">Número da Unidade *</label><input type="number" id="un_num" value="${u?.numero||''}" min="1" /></div>
      <div class="form-group"><label class="field-label">Prazo Habite-se</label><input type="date" id="un_habite" value="${u?.prazo_habite_se||''}" /></div>
      <div class="form-group"><label class="field-label">Habite-se + 180 dias</label><input type="date" id="un_180" value="${u?.prazo_180||''}" /></div>
      <div class="form-group span-2"><label class="field-label">Previsão de Entrega</label><input type="date" id="un_entrega" value="${u?.previsao_entrega||''}" /></div>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveUnidade('${id||''}')">Salvar</button>`
  );
}

function saveUnidade(id) {
  const d = {
    empreendimento_id: document.getElementById('un_empr').value,
    numero: parseInt(document.getElementById('un_num').value)||0,
    prazo_habite_se: document.getElementById('un_habite').value,
    prazo_180: document.getElementById('un_180').value,
    previsao_entrega: document.getElementById('un_entrega').value,
  };
  if (!d.empreendimento_id||!d.numero) { toast('Campos obrigatórios ausentes','error'); return; }
  if (id) { DB.update('unidades',id,d); toast('Unidade atualizada!','success'); }
  else { DB.insert('unidades',d); toast('Unidade adicionada!','success'); }
  window._unidadesEmpr = d.empreendimento_id;
  closeModal(); renderUnidades();
}

function deleteUnidade(id) {
  confirmDelete('Excluir esta unidade?', `()=>{ DB.remove('unidades','${id}'); toast('Excluído!'); renderUnidades(); }`);
}

function openImportUnidadesModal() {
  const emprAtual = window._unidadesEmpr;
  openModal('Importar Unidades em Lote',
    `<div class="alert alert-info">ℹ️ Cole a lista de unidades no formato CSV:<br><strong>numero,prazo_habite_se,prazo_180,previsao_entrega</strong><br>Ex: 101,2025-12-31,2026-06-29,2026-08-31</div>
     <div class="form-group">
       <label class="field-label">Empreendimento</label>
       <select id="imp_empr">${emprOptions(emprAtual)}</select>
     </div>
     <div class="form-group mt-2">
       <label class="field-label">Dados CSV</label>
       <textarea id="imp_csv" rows="8" placeholder="101,2025-12-31,2026-06-29,2026-08-31&#10;102,2025-12-31,2026-06-29,2026-08-31"></textarea>
     </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="importUnidadesCSV()">Importar</button>`
  );
}

function importUnidadesCSV() {
  const empr = document.getElementById('imp_empr').value;
  const csv  = document.getElementById('imp_csv').value.trim();
  if (!empr || !csv) { toast('Preencha todos os campos','error'); return; }
  let count = 0;
  csv.split('\n').forEach(line => {
    const parts = line.split(',').map(s=>s.trim());
    if (parts.length < 1 || !parts[0]) return;
    DB.insert('unidades', {
      empreendimento_id: empr,
      numero: parseInt(parts[0]),
      prazo_habite_se: parts[1]||'',
      prazo_180: parts[2]||'',
      previsao_entrega: parts[3]||'',
    });
    count++;
  });
  window._unidadesEmpr = empr;
  closeModal();
  toast(`${count} unidades importadas!`, 'success');
  renderUnidades();
}

// ============================================================
// ANÁLISE DE RISCO CONTRATUAL
// ============================================================
function renderRisco() {
  const cid    = DB.getActiveComite()?.id;
  const comite = DB.getActiveComite();
  if (!cid) { noComiteAlert(); return; }
  const riscos = DB.forComite('riscos', cid);

  setView(`
    <div class="page-header">
      <div><div class="page-title">🏦 Análise de Risco Contratual</div><div class="page-sub">${esc(comite.label)}</div></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openRiscoModal()">+ Nova Análise</button></div>
    </div>
    <div class="content">
      ${riscos.length === 0 ? '<div class="alert alert-info">ℹ️ Nenhuma análise de risco cadastrada.</div>' : ''}
      ${riscos.map(r => `
        <div class="section-card">
          <div class="section-card-head">
            <div>
              <div class="section-card-title">🏦 ${esc(r.contrato_ref)}</div>
              <div style="font-size:12px;color:var(--gray-500);margin-top:2px;"><span class="empr-chip">${esc(emprName(r.empreendimento_id))}</span></div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-ghost btn-sm" onclick="openRiscoModal('${r.id}')">✏️ Editar</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteRisco('${r.id}')">🗑️</button>
            </div>
          </div>
          <div class="section-card-body">
            ${r.alerta ? `<div class="alert alert-danger">⚠️ ${esc(r.alerta)}</div>` : ''}

            <div style="font-weight:700;margin-bottom:10px;font-size:13px;">📅 Cronograma Contratual</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:16px;">
              ${(r.cronograma||[]).map(c => `
                <div style="background:var(--gray-50);border-radius:8px;padding:12px;border-left:3px solid var(--blue);">
                  <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;">${esc(c.marco)}</div>
                  <div style="font-size:15px;font-weight:700;margin:4px 0;">${esc(c.prazo)}</div>
                  <div style="font-size:11px;color:var(--gray-400);">${esc(c.base)} · ${esc(c.pagina)}</div>
                </div>
              `).join('')}
            </div>

            <div style="font-weight:700;margin-bottom:10px;font-size:13px;">⚠️ Riscos Identificados</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;margin-bottom:16px;">
              ${(r.riscos_lista||[]).map(ri => `
                <div class="risco-item">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <span class="risco-num">${ri.num}</span>
                    <strong style="font-size:13px;">${esc(ri.titulo)}</strong>
                  </div>
                  <div style="font-size:12px;color:var(--gray-700);line-height:1.5;margin-bottom:6px;">${esc(ri.descricao)}</div>
                  <div style="font-size:11px;color:var(--gray-400);">📋 ${esc(ri.base)} · ${esc(ri.pagina)}</div>
                </div>
              `).join('')}
            </div>

            ${r.recomendacoes?.length ? `
              <div style="font-weight:700;margin-bottom:10px;font-size:13px;">✅ Recomendações Estratégicas</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">
                ${r.recomendacoes.map(rc => `
                  <div style="background:var(--blue-lt);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:8px;">
                    <span style="font-size:18px;font-weight:900;color:var(--blue);">${esc(rc.num)}</span>
                    <span style="font-size:12px;color:var(--gray-700);">${esc(rc.texto)}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `);
}

function openRiscoModal(id) {
  const r = id ? DB.getById('riscos', id) : null;
  const cid = DB.getActiveComite()?.id;
  openModal(r?'Editar Análise de Risco':'Nova Análise de Risco',
    `<div class="form-grid">
      <div class="form-group"><label class="field-label">Empreendimento *</label><select id="ri_empr">${emprOptions(r?.empreendimento_id)}</select></div>
      <div class="form-group"><label class="field-label">Contrato/Referência *</label>
        <input type="text" id="ri_ref" value="${esc(r?.contrato_ref||'')}" placeholder="Ex: CCB nº 14678323 – Banco ABC" /></div>
      <div class="form-group span-full"><label class="field-label">Alerta / Urgência</label>
        <textarea id="ri_alerta" rows="3">${esc(r?.alerta||'')}</textarea></div>
      <div class="form-group span-full">
        <label class="field-label">Riscos (um por linha: Título|Descrição|Base|Página)</label>
        <textarea id="ri_riscos" rows="6" placeholder="Vencimento Antecipado|Atraso > 90 dias leva ao vencimento|Cl. 4.4|Pág. 6">${
          (r?.riscos_lista||[]).map((ri,i)=>`${ri.titulo}|${ri.descricao}|${ri.base}|${ri.pagina}`).join('\n')
        }</textarea>
      </div>
      <div class="form-group span-full">
        <label class="field-label">Recomendações (uma por linha)</label>
        <textarea id="ri_recs" rows="4" placeholder="Atualizar cronograma&#10;Negociar aditivo">${
          (r?.recomendacoes||[]).map(rc=>rc.texto).join('\n')
        }</textarea>
      </div>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveRisco('${id||''}','${cid}')">Salvar</button>`
  );
}

function saveRisco(id, cid) {
  const empr    = document.getElementById('ri_empr').value;
  const ref     = document.getElementById('ri_ref').value.trim();
  const alerta  = document.getElementById('ri_alerta').value.trim();
  const rLines  = document.getElementById('ri_riscos').value.trim().split('\n').filter(Boolean);
  const recLines= document.getElementById('ri_recs').value.trim().split('\n').filter(Boolean);
  if (!empr||!ref) { toast('Campos obrigatórios ausentes','error'); return; }
  const riscos_lista = rLines.map((l,i) => {
    const [titulo='',descricao='',base='',pagina=''] = l.split('|');
    return {num:i+1, titulo:titulo.trim(), descricao:descricao.trim(), base:base.trim(), pagina:pagina.trim()};
  });
  const recomendacoes = recLines.map((t,i) => ({num:String(i+1).padStart(2,'0'), texto:t.trim()}));
  const d = { empreendimento_id:empr, contrato_ref:ref, alerta, riscos_lista, recomendacoes };
  if (id) { DB.update('riscos',id,d); toast('Análise atualizada!','success'); }
  else { DB.insert('riscos',{id:DB.uid(), comite_id:cid,...d}); toast('Análise adicionada!','success'); }
  closeModal(); renderRisco();
}

function deleteRisco(id) {
  confirmDelete('Excluir esta análise de risco?', `()=>{ DB.remove('riscos','${id}'); toast('Excluído!'); renderRisco(); }`);
}

// ============================================================
// TEMAS REGULATÓRIOS
// ============================================================
function renderRegulatorio() {
  const cid    = DB.getActiveComite()?.id;
  const comite = DB.getActiveComite();
  if (!cid) { noComiteAlert(); return; }
  const list = DB.forComite('regulatorios', cid);

  setView(`
    <div class="page-header">
      <div><div class="page-title">📋 Temas Regulatórios</div><div class="page-sub">${esc(comite.label)}</div></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openRegModal()">+ Novo Tema</button></div>
    </div>
    <div class="content">
      ${list.length===0 ? '<div class="alert alert-info">ℹ️ Nenhum tema regulatório neste período.</div>' : ''}
      ${list.map(r => `
        <div class="section-card">
          <div class="section-card-head">
            <div>
              <div class="section-card-title">📋 ${esc(r.titulo)}</div>
              ${r.data_vigencia ? `<div style="font-size:12px;color:var(--red);font-weight:600;margin-top:2px;">⏰ Vigência: ${fmtDate(r.data_vigencia)}</div>` : ''}
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-ghost btn-sm" onclick="openRegModal('${r.id}')">✏️</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteReg('${r.id}')">🗑️</button>
            </div>
          </div>
          <div class="section-card-body">
            ${r.destaque ? `<div class="alert alert-warning">🚨 ${esc(r.destaque)}</div>` : ''}
            ${r.descricao ? `<p style="font-size:13px;color:var(--gray-700);margin-bottom:16px;">${esc(r.descricao)}</p>` : ''}
            ${r.checklist?.length ? `
              <div style="font-weight:700;font-size:13px;margin-bottom:10px;">✅ Checklist de Adequação</div>
              <ul class="checklist">
                ${r.checklist.map(c => `<li>
                  <span class="check-icon">☑️</span>
                  <div class="check-text">
                    <strong>${esc(c.item)}</strong>
                    <small>${esc(c.descricao)}</small>
                  </div>
                </li>`).join('')}
              </ul>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `);
}

function openRegModal(id) {
  const r = id ? DB.getById('regulatorios', id) : null;
  const cid = DB.getActiveComite()?.id;
  openModal(r?'Editar Tema Regulatório':'Novo Tema Regulatório',
    `<div class="form-grid">
      <div class="form-group span-full"><label class="field-label">Título *</label>
        <input type="text" id="rg_titulo" value="${esc(r?.titulo||'')}" placeholder="Ex: NR-1 / SST / DDS" /></div>
      <div class="form-group"><label class="field-label">Data de Vigência</label>
        <input type="date" id="rg_vig" value="${r?.data_vigencia||''}" /></div>
      <div class="form-group span-full"><label class="field-label">Destaque / Alerta</label>
        <input type="text" id="rg_dest" value="${esc(r?.destaque||'')}" /></div>
      <div class="form-group span-full"><label class="field-label">Descrição</label>
        <textarea id="rg_desc" rows="3">${esc(r?.descricao||'')}</textarea></div>
      <div class="form-group span-full">
        <label class="field-label">Checklist (um por linha: Item|Descrição)</label>
        <textarea id="rg_check" rows="6" placeholder="Identificar Riscos|Mapeamento completo...">${
          (r?.checklist||[]).map(c=>`${c.item}|${c.descricao}`).join('\n')
        }</textarea>
      </div>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveReg('${id||''}','${cid}')">Salvar</button>`
  );
}

function saveReg(id, cid) {
  const titulo   = document.getElementById('rg_titulo').value.trim();
  const vig      = document.getElementById('rg_vig').value;
  const dest     = document.getElementById('rg_dest').value.trim();
  const desc     = document.getElementById('rg_desc').value.trim();
  const checkRaw = document.getElementById('rg_check').value.trim().split('\n').filter(Boolean);
  if (!titulo) { toast('Título obrigatório','error'); return; }
  const checklist = checkRaw.map(l => { const [item='',descricao=''] = l.split('|'); return {item:item.trim(),descricao:descricao.trim()}; });
  const d = { titulo, data_vigencia:vig, destaque:dest, descricao:desc, checklist };
  if (id) { DB.update('regulatorios',id,d); toast('Tema atualizado!','success'); }
  else { DB.insert('regulatorios',{comite_id:cid,...d}); toast('Tema adicionado!','success'); }
  closeModal(); renderRegulatorio();
}
function deleteReg(id) {
  confirmDelete('Excluir este tema?', `()=>{ DB.remove('regulatorios','${id}'); toast('Excluído!'); renderRegulatorio(); }`);
}

// ============================================================
// BACKUP / RESTAURAR
// ============================================================
function renderBackup() {
  setView(`
    <div class="page-header">
      <div><div class="page-title">💾 Backup / Restaurar</div><div class="page-sub">Exportar e importar todos os dados</div></div>
    </div>
    <div class="content">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div class="section-card">
          <div class="section-card-head"><div class="section-card-title">⬇️ Exportar Dados</div></div>
          <div class="section-card-body">
            <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">
              Baixa todos os dados da plataforma em formato JSON. Salve o arquivo como backup periódico.
            </p>
            <button class="btn btn-primary" onclick="exportarDados()">⬇️ Baixar Backup JSON</button>
          </div>
        </div>
        <div class="section-card">
          <div class="section-card-head"><div class="section-card-title">⬆️ Restaurar Dados</div></div>
          <div class="section-card-body">
            <div class="alert alert-danger">⚠️ <strong>Atenção:</strong> Restaurar substituirá TODOS os dados atuais.</div>
            <label class="upload-zone" for="jsonImport" style="margin-top:10px;">
              <div>📁 Clique para selecionar o arquivo JSON de backup</div>
              <input type="file" id="jsonImport" accept=".json" onchange="restaurarDados(this)" />
            </label>
          </div>
        </div>
      </div>
      <div class="section-card" style="margin-top:20px;">
        <div class="section-card-head"><div class="section-card-title">🗑️ Zona de Perigo</div></div>
        <div class="section-card-body">
          <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">Limpa completamente todos os dados da plataforma (irreversível).</p>
          <button class="btn btn-danger" onclick="limparTudo()">🗑️ Limpar Todos os Dados</button>
        </div>
      </div>
    </div>
  `);
}

function exportarDados() {
  const json = DB.exportAll();
  const blob = new Blob([json], {type: 'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `comite_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup exportado!', 'success');
}

function restaurarDados(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      DB.importAll(e.target.result);
      toast('Dados restaurados!', 'success');
      populateMonthSelector();
      Router.navigate('dashboard');
    } catch(err) {
      toast('Erro ao importar: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function limparTudo() {
  confirmDelete('Isso irá apagar TODOS os dados da plataforma. Tem certeza absoluta?',
    `()=>{ Object.keys(localStorage).filter(k=>k.startsWith('jur_comite_')).forEach(k=>localStorage.removeItem(k)); toast('Dados apagados'); populateMonthSelector(); Router.navigate('dashboard'); }`
  );
}

// ============================================================
// HELPERS
// ============================================================
function noComiteAlert() {
  setView(`<div class="content"><div class="alert alert-info" style="margin-top:20px;">ℹ️ Selecione ou crie um comitê mensal na barra lateral.</div></div>`);
}

