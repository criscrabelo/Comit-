/* ===== GERADOR DO COMITÊ DO MÊS ===== */

function renderComite() {
  const cid    = DB.getActiveComite()?.id;
  const comite = DB.getActiveComite();
  if (!cid) { noComiteAlert(); return; }

  // Fetch all data for this comite
  const fatos      = DB.forComite('fatos', cid).sort((a,b)=>a.data.localeCompare(b.data));
  const notifs     = DB.forComite('notificacoes', cid);
  const conts      = DB.forComite('contratos', cid);
  const rets       = DB.forComite('retomadas', cid);
  const dists      = DB.forComite('distratos', cid);
  const procsExt   = DB.forComite('processos', cid).filter(p=>!p.interno);
  const procsInt   = DB.forComite('processos', cid).filter(p=>p.interno);
  const riscos     = DB.forComite('riscos', cid);
  const regs       = DB.forComite('regulatorios', cid);

  // Group fatos by empreendimento
  const fatosByEmpr = {};
  fatos.forEach(f => {
    if (!fatosByEmpr[f.empreendimento_id]) fatosByEmpr[f.empreendimento_id] = [];
    fatosByEmpr[f.empreendimento_id].push(f);
  });

  // KPI helpers
  const notifRes = notifs.filter(n=>n.estagio==='Resolvida').length;
  const notifAnd = notifs.filter(n=>n.estagio==='Em Andamento').length;
  const tempos   = notifs.filter(n=>n.data_solucao).map(n=>daysBetween(n.data_notificacao,n.data_solucao));
  const tMedNot  = tempos.length ? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : null;

  const retMed   = rets.length ? Math.round(rets.reduce((s,r)=>s+(r.tempo_dias||0),0)/rets.length) : null;
  const distMed  = dists.length ? Math.round(dists.reduce((s,d)=>s+(d.tempo_dias||0),0)/dists.length) : null;

  // Processos — resumo do mês (POSIÇÃO/CIÊNCIA): mesmo critério da tela
  const procAll  = procsExt.concat(procsInt);
  const mesProc  = procAll.filter(p => (p.ciencia || '').slice(0,7) === comite.ref);
  const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const [cy, cmth] = (comite.ref || '').split('-').map(Number);
  const resumoLabel = (cy && cmth) ? `${MESES_FULL[cmth-1]} ${cy}` : (comite.label || 'Resumo');

  // Notificações — painel de estágios (mesma lógica da tela)
  const estagioCount = {};
  notifs.forEach(n => {
    if (comite.ref && n.data_notificacao && !n.data_notificacao.startsWith(comite.ref)) return;
    const e = n.estagio_detalhe; if (!e) return;
    estagioCount[e] = (estagioCount[e] || 0) + 1;
  });
  const estagioTotal = Object.values(estagioCount).reduce((a,b)=>a+b,0);
  const estagioRows = Object.entries(estagioCount).sort((a,b)=>b[1]-a[1])
    .map(([label,count]) => `<div class="estagio-item ${estagioColorClass(label)}"><span class="estagio-name">${esc(label)}</span><span class="estagio-count">${count}</span></div>`).join('');
  const notifEstagioHtml = `<div class="estagio-panel" style="margin-bottom:16px;">
    <div class="estagio-panel-title">Status das Notificações · ${esc(comite.label)} · ${estagioTotal}</div>
    ${estagioTotal ? `<div class="estagio-breakdown">${estagioRows}</div>` : '<div class="estagio-empty">Sem dados de estágio.</div>'}</div>`;

  setView(`
    <div class="page-header" style="border-bottom:1px solid var(--gray-200);">
      <div>
        <div class="page-title">📑 Comitê do Mês — ${esc(comite.label)}</div>
        <div class="page-sub">Prévia da apresentação • Use Ctrl+P para exportar em PDF</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" onclick="window.print()">🖨️ Imprimir / PDF</button>
        <button class="btn btn-primary" onclick="Router.navigate('dashboard')">← Voltar</button>
      </div>
    </div>

    <!-- SLIDES PREVIEW (screen) -->
    <div class="content" id="slidesPreview">

      <!-- SLIDE 1: CAPA -->
      <div class="slide-preview-card">
        <div class="slide-tag">Slide 1 · Capa</div>
        <div style="background:#1E2A3B;color:#fff;border-radius:8px;padding:40px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">⚖️</div>
          <div style="font-size:32px;font-weight:900;letter-spacing:-1px;">COMITÊ ${esc(comite.label.toUpperCase())}</div>
          <div style="font-size:16px;opacity:.7;margin-top:8px;">Relatório Jurídico e Operacional</div>
          <div style="margin-top:20px;background:#2563EB;display:inline-block;padding:8px 28px;border-radius:99px;font-size:15px;font-weight:700;">${esc(comite.label)}</div>
        </div>
      </div>

      <!-- SLIDES 2-4: FATOS RELEVANTES -->
      ${buildFatosSlides(fatosByEmpr)}

      <!-- SLIDE 5: NOTIFICAÇÕES -->
      ${buildKpiSlide('Notificações', comite.label, [
        {label:'Total de Notificações', value: notifs.length},
        {label:'Tempo Médio de Resolução', value: tMedNot!==null?tMedNot+' dias':'—'},
      ], [
        {id:'ch_c_notif_grupo', label:'Motivo'},
        {id:'ch_c_notif_empr',  label:'Empreendimento'},
        {id:'ch_c_notif_mes',   label:'Notificações por Mês — 2026 (jan–mai)', full:true},
      ], notifEstagioHtml)}

      <!-- SLIDE 6: CONTRATOS -->
      ${buildKpiSlide('Contratos', comite.label, [
        {label:'Total',                  value: conts.length, color:'green'},
        {label:'Contratos Clientes',     value: conts.filter(c=>catOfCont(c)==='clientes').length},
        {label:'Prestadores de Serviços',value: conts.filter(c=>catOfCont(c)==='prestadores').length, color:'purple'},
        {label:'Obra',                   value: conts.filter(c=>catOfCont(c)==='obra').length, color:'orange'},
      ], [
        {id:'ch_c_cont_tipo', label:'Por Tipo', full:true},
        {id:'ch_c_cont_empr', label:'Por Empreendimento', full:true},
        {id:'ch_c_cont_mes',  label:'Evolução do Total de Contratos — 2026 (jan–mai)', full:true},
      ])}

      <!-- SLIDE 7: RETOMADAS -->
      ${buildKpiSlide('Retomadas', comite.label, [
        {label:'Total Retomadas',       value: rets.length, color:'green'},
        {label:'Tempo Médio',           value: retMed!==null?retMed+' dias':'—', color:'orange'},
        {label:'Empreendimentos',       value: new Set(rets.map(r=>r.empreendimento_id)).size},
      ], [
        {id:'ch_c_ret_motivo', label:'Por Motivo'},
        {id:'ch_c_ret_equipe', label:'Por Equipe'},
      ])}

      <!-- SLIDE 8: DISTRATOS -->
      ${buildKpiSlide('Distratos', comite.label, [
        {label:'Total Distratos',       value: dists.length, color:'red'},
        {label:'Tempo Médio',           value: distMed!==null?distMed+' dias':'—', color:'orange'},
        {label:'Empreendimentos',       value: new Set(dists.map(d=>d.empreendimento_id)).size},
      ], [
        {id:'ch_c_dist_motivo', label:'Por Motivo'},
        {id:'ch_c_dist_empr',   label:'Por Empreendimento'},
        {id:'ch_c_dist_equipe', label:'Por Equipe'},
        {id:'ch_c_dist_mes',    label:'Evolução de Distratos por Mês', full:true},
      ])}

      <!-- REGULATÓRIO (se houver) -->
      ${regs.map(r => buildRegSlide(r)).join('')}

      <!-- PROCESSOS: RESUMO DO MÊS -->
      ${buildKpiSlide('Processos Judiciais — ' + resumoLabel, comite.label, [
        {label:'Total',     value: mesProc.length},
        {label:'Externos',  value: mesProc.filter(p=>!p.interno).length, color:'blue'},
        {label:'Internos',  value: mesProc.filter(p=>p.interno).length, color:'purple'},
      ], [
        {id:'ch_c_pres_ei',  label:'Externos × Internos'},
        {id:'ch_c_pres_emp', label:'Por Empreendimento'},
        {id:'ch_c_pres_mot', label:'Por Motivo'},
        {id:'ch_c_pres_pos', label:'Por Posição'},
      ])}

      <!-- SLIDE 10: PROCESSOS JUDICIAIS (EXTERNOS) -->
      ${buildProcessosSlide('Processos Judiciais', comite.label, procsExt, false)}

      <!-- SLIDE 11: PROCESSOS INTERNOS -->
      ${buildProcessosSlide('Processos Judiciais Internos', comite.label, procsInt, true)}

      <!-- SLIDE 12: OBRIGADA -->
      <div class="slide-preview-card">
        <div class="slide-tag">Encerramento</div>
        <div style="background:#1E2A3B;color:#fff;border-radius:8px;padding:60px;text-align:center;">
          <div style="font-size:48px;font-weight:900;">OBRIGADA</div>
          <div style="font-size:16px;opacity:.6;margin-top:10px;">${esc(comite.label)} · Departamento Jurídico</div>
        </div>
      </div>

      <!-- SLIDES ANÁLISE DE RISCO (ANEXOS) -->
      ${riscos.map(r => buildRiscoSlides(r)).join('')}

    </div>

    <!-- VERSÃO PRINT -->
    <div id="printSlides" style="display:none;">
      ${buildPrintSlides(comite, fatosByEmpr, notifs, conts, rets, dists, procsExt, procsInt, riscos, regs)}
    </div>
  `);

  // render charts
  setTimeout(() => {
    const ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

    // ── Notificações ──
    const ng = mapToLabelData(countBy(notifs,'grupo'));
    ChartManager.donut('ch_c_notif_grupo', ng.labels, ng.data, {pie:true});
    const nemp = mapToLabelData(countBy(notifs.map(n=>({_en:emprName(n.empreendimento_id)})),'_en'));
    ChartManager.donut('ch_c_notif_empr', nemp.labels, nemp.data);
    ChartManager.bar('ch_c_notif_mes', ['Jan','Fev','Mar','Abr','Mai'], [{data:[51,65,23,52,45]}]);

    // ── Contratos ──
    const ctS = Object.entries(countBy(conts,'tipo')).sort((a,b)=>a[1]-b[1]);
    ChartManager.bar('ch_c_cont_tipo', ctS.map(e=>e[0]), [{data:ctS.map(e=>e[1])}], {horizontal:true, dataLabels:true});
    const ceS = Object.entries(countBy(conts.map(c=>({_en:emprName(c.empreendimento_id)})),'_en')).sort((a,b)=>a[1]-b[1]);
    ChartManager.bar('ch_c_cont_empr', ceS.map(e=>e[0]), [{data:ceS.map(e=>e[1]), color:'#16A34A'}], {horizontal:true, dataLabels:true});
    ChartManager.line('ch_c_cont_mes', ['Jan','Fev','Mar','Abr','Mai'], [{label:'Contratos', data:[62,82,74,95,52]}], {dataLabels:true});

    // ── Retomadas ──
    const rm = mapToLabelData(countBy(rets,'motivo'));
    ChartManager.donut('ch_c_ret_motivo', rm.labels, rm.data, {pie:true});
    const re = mapToLabelData(countBy(rets,'equipe'));
    ChartManager.bar('ch_c_ret_equipe', re.labels, [{data:re.data}]);

    // ── Distratos ──
    const dm = mapToLabelData(countBy(dists,'motivo'));
    ChartManager.donut('ch_c_dist_motivo', dm.labels, dm.data, {pie:true});
    const de = mapToLabelData(countBy(dists.map(d=>({_en:emprName(d.empreendimento_id)})),'_en'));
    ChartManager.donut('ch_c_dist_empr', de.labels, de.data);
    const deq = mapToLabelData(countBy(dists,'equipe'));
    ChartManager.donut('ch_c_dist_equipe', deq.labels, deq.data, {pie:true});
    const evol = comite.distratos_evolucao || {};
    const mesesD = [];
    if (cy && cmth) for (let m=1; m<=cmth; m++) mesesD.push(`${cy}-${String(m).padStart(2,'0')}`);
    ChartManager.bar('ch_c_dist_mes', mesesD.map(ym=>{const[y,m]=ym.split('-');return `${ABBR[(+m)-1]}/${y}`;}),
      [{label:'Distratos', data: mesesD.map(m=>evol[m]||0)}], {dataLabels:true});

    // ── Processos: resumo do mês ──
    ChartManager.donut('ch_c_pres_ei', ['Externos','Internos'],
      [mesProc.filter(p=>!p.interno).length, mesProc.filter(p=>p.interno).length], {pie:true});
    const presEmp = mapToLabelData(countBy(mesProc.map(p=>({_en:emprName(p.empreendimento_id)})),'_en'));
    ChartManager.donut('ch_c_pres_emp', presEmp.labels, presEmp.data);
    const presMot = mapToLabelData(countBy(mesProc,'motivo'));
    ChartManager.donut('ch_c_pres_mot', presMot.labels, presMot.data, {pie:true});
    const presPos = mapToLabelData(countBy(mesProc,'posicao'));
    ChartManager.donut('ch_c_pres_pos', presPos.labels, presPos.data, {pie:true});

    // ── Processos externos ──
    const peEmp = mapToLabelData(countBy(procsExt.map(p=>({_en:emprName(p.empreendimento_id)})),'_en'));
    ChartManager.donut('ch_c_proc_empr', peEmp.labels, peEmp.data);
    const peMot = mapToLabelData(countBy(procsExt,'motivo'));
    ChartManager.donut('ch_c_proc_mot', peMot.labels, peMot.data, {pie:true});
    const pePos = mapToLabelData(countBy(procsExt,'posicao'));
    ChartManager.donut('ch_c_proc_pos', pePos.labels, pePos.data, {pie:true});
    const evoExt = evolucaoMensalCitacao(procsExt);
    ChartManager.bar('ch_c_proc_mes', evoExt.labels, [{label:'Externos', data:evoExt.data}], {dataLabels:false});

    // ── Processos internos ──
    const piEmp = mapToLabelData(countBy(procsInt.map(p=>({_en:emprName(p.empreendimento_id)})),'_en'));
    ChartManager.donut('ch_c_proci_empr', piEmp.labels, piEmp.data);
    const piMot = mapToLabelData(countBy(procsInt,'motivo'));
    ChartManager.donut('ch_c_proci_mot', piMot.labels, piMot.data, {pie:true});
    const evoInt = evolucaoMensalCitacao(procsInt);
    ChartManager.bar('ch_c_proci_mes', evoInt.labels, [{label:'Internos', data:evoInt.data}], {dataLabels:false});
  }, 80);
}

// ---- Build helpers ----

function buildFatosSlides(fatosByEmpr) {
  const eids = Object.keys(fatosByEmpr);
  if (!eids.length) return `<div class="slide-preview-card"><div class="slide-tag">Slides 2-4 · Fatos Relevantes</div>
    <div class="alert alert-info">Nenhum fato relevante cadastrado.</div></div>`;

  // Split into groups of 3 empreendimentos per slide
  const slides = [];
  for (let i = 0; i < eids.length; i += 3) {
    slides.push(eids.slice(i, i+3));
  }
  return slides.map((group, si) => `
    <div class="slide-preview-card">
      <div class="slide-tag">Slide ${si+2} · Fatos Relevantes</div>
      <div class="slide-preview-body">
        <div class="slide-preview-title">FATOS RELEVANTES <span style="font-size:14px;font-weight:400;">${esc(DB.getActiveComite()?.label)}</span></div>
        ${group.map(eid => `
          <div style="margin-bottom:14px;">
            <div style="font-size:13px;font-weight:800;color:var(--blue);text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--gray-200);padding-bottom:4px;margin-bottom:8px;">
              ${esc(emprName(eid))}
            </div>
            ${fatosByEmpr[eid].map(f => `
              <div style="display:flex;gap:10px;margin-bottom:6px;">
                <span style="font-size:12px;font-weight:700;color:var(--gray-700);white-space:nowrap;">${fmtDate(f.data)}</span>
                <span style="font-size:12px;color:var(--gray-700);line-height:1.5;">${f.titulo ? `<strong>${esc(f.titulo)}</strong> — ` : ''}${esc(f.descricao)}</span>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function buildKpiSlide(titulo, mes, kpis, charts, extraHtml) {
  return `
    <div class="slide-preview-card">
      <div class="slide-tag">Slide · ${titulo}</div>
      <div class="slide-preview-body">
        <div class="slide-preview-title">${esc(titulo).toUpperCase()} <span style="font-size:14px;font-weight:400;">${esc(mes)}</span></div>
        <div class="kpi-grid" style="margin-bottom:16px;">
          ${kpis.map(k => `
            <div class="kpi-card ${k.color||''}">
              <div class="kpi-label">${esc(k.label)}</div>
              <div class="kpi-value" style="font-size:${String(k.value).length > 4 ? '18px' : '28px'}">${esc(String(k.value))}</div>
            </div>
          `).join('')}
        </div>
        ${extraHtml || ''}
        <div class="charts-grid">
          ${charts.map(c => `<div class="chart-card"${c.full?' style="grid-column:1/-1"':''}><div class="chart-title">${esc(c.label)}</div><div class="chart-wrap"><canvas id="${c.id}"></canvas></div></div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function buildProcessosSlide(titulo, mes, list, interno) {
  const sfx = interno ? '_proci' : '_proc';
  const STATUS_ORDER = ['Acompanhando','Finalizado','Em Acordo','Arq. Provisório','Baixa Definitiva'];
  const STATUS_COLOR = {'Acompanhando':'blue','Finalizado':'green','Em Acordo':'purple','Arq. Provisório':'yellow','Baixa Definitiva':'gray'};
  const STATUS_LABEL = {'Finalizado':'Finalizados'};

  let kpiCards;
  if (interno) {
    // Cards dinâmicos: Total + um por status presente (igual à aba Internos)
    const presentes = STATUS_ORDER.filter(s => list.some(p => p.status === s));
    list.forEach(p => { if (p.status && !presentes.includes(p.status)) presentes.push(p.status); });
    kpiCards = `<div class="kpi-card"><div class="kpi-label">Total</div><div class="kpi-value">${list.length}</div></div>` +
      presentes.map(s => `<div class="kpi-card ${STATUS_COLOR[s]||'gray'}"><div class="kpi-label">${STATUS_LABEL[s]||s}</div><div class="kpi-value">${list.filter(p=>p.status===s).length}</div></div>`).join('');
  } else {
    kpiCards = `
      <div class="kpi-card"><div class="kpi-label">Total</div><div class="kpi-value">${list.length}</div></div>
      <div class="kpi-card blue"><div class="kpi-label">Acompanhando</div><div class="kpi-value">${list.filter(p=>p.status==='Acompanhando').length}</div></div>
      <div class="kpi-card green"><div class="kpi-label">Finalizados</div><div class="kpi-value">${list.filter(p=>p.status==='Finalizado').length}</div></div>
      <div class="kpi-card purple"><div class="kpi-label">Em Acordo</div><div class="kpi-value">${list.filter(p=>p.status==='Em Acordo').length}</div></div>
      <div class="kpi-card gray"><div class="kpi-label">Baixa Definitiva</div><div class="kpi-value">${list.filter(p=>p.status==='Baixa Definitiva').length}</div></div>
      <div class="kpi-card yellow"><div class="kpi-label">Arq. Provisório</div><div class="kpi-value">${list.filter(p=>p.status==='Arq. Provisório').length}</div></div>`;
  }

  const charts = interno ? `
          <div class="chart-card"><div class="chart-title">Por Empreendimento</div><div class="chart-wrap"><canvas id="ch_c${sfx}_empr"></canvas></div></div>
          <div class="chart-card"><div class="chart-title">Por Motivo</div><div class="chart-wrap"><canvas id="ch_c${sfx}_mot"></canvas></div></div>
          <div class="chart-card" style="grid-column:1/-1"><div class="chart-title">Evolução por Mês</div><div class="chart-wrap"><canvas id="ch_c${sfx}_mes"></canvas></div></div>
  ` : `
          <div class="chart-card"><div class="chart-title">Por Empreendimento</div><div class="chart-wrap"><canvas id="ch_c${sfx}_empr"></canvas></div></div>
          <div class="chart-card"><div class="chart-title">Por Motivo</div><div class="chart-wrap"><canvas id="ch_c${sfx}_mot"></canvas></div></div>
          <div class="chart-card"><div class="chart-title">Por Posição</div><div class="chart-wrap"><canvas id="ch_c${sfx}_pos"></canvas></div></div>
          <div class="chart-card" style="grid-column:1/-1"><div class="chart-title">Evolução por Mês</div><div class="chart-wrap"><canvas id="ch_c${sfx}_mes"></canvas></div></div>
  `;

  return `
    <div class="slide-preview-card">
      <div class="slide-tag">Slide · ${titulo}</div>
      <div class="slide-preview-body">
        <div class="slide-preview-title">${esc(titulo).toUpperCase()} <span style="font-size:14px;font-weight:400;">${esc(mes)}</span></div>
        <div class="kpi-grid" style="margin-bottom:16px;">${kpiCards}</div>
        <div class="charts-grid">${charts}</div>
      </div>
    </div>
  `;
}

function buildRegSlide(r) {
  return `
    <div class="slide-preview-card">
      <div class="slide-tag">Slide · Tema Regulatório</div>
      <div class="slide-preview-body">
        <div class="slide-preview-title">${esc(r.titulo).toUpperCase()}</div>
        ${r.destaque ? `<div class="alert alert-warning" style="margin-bottom:16px;">🚨 ${esc(r.destaque)}</div>` : ''}
        ${r.checklist?.length ? `
          <ul class="checklist">
            ${r.checklist.map(c=>`<li>
              <span class="check-icon">☑️</span>
              <div class="check-text"><strong>${esc(c.item)}</strong><small>${esc(c.descricao)}</small></div>
            </li>`).join('')}
          </ul>
        ` : ''}
      </div>
    </div>
  `;
}

function buildRiscoSlides(r) {
  // Slide capa
  let html = `
    <div class="slide-preview-card" style="border-color:var(--red);">
      <div class="slide-tag" style="background:var(--red);color:#fff;">Anexo · Análise de Risco — ${esc(emprName(r.empreendimento_id))}</div>
      <div style="background:#1E2A3B;color:#fff;border-radius:8px;padding:32px;">
        <div style="font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;">ANÁLISE JURÍDICA</div>
        <div style="font-size:20px;font-weight:900;">${esc(emprName(r.empreendimento_id)).toUpperCase()}</div>
        <div style="font-size:14px;opacity:.7;margin-top:4px;">Riscos Contratuais — ${esc(r.contrato_ref)}</div>
      </div>
    </div>
  `;

  // Slide cronograma
  if (r.cronograma?.length) {
    html += `
      <div class="slide-preview-card" style="border-color:var(--red);">
        <div class="slide-tag" style="background:var(--red);color:#fff;">Anexo · Cronograma Contratual</div>
        <div class="slide-preview-body">
          <div class="slide-preview-title">CRONOGRAMA CONTRATUAL</div>
          ${r.alerta ? `<div class="alert alert-danger" style="margin-bottom:16px;">⚠️ ${esc(r.alerta)}</div>` : ''}
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
            ${r.cronograma.map(c=>`
              <div style="background:var(--gray-50);border-radius:8px;padding:14px;border-left:3px solid var(--blue);">
                <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;">${esc(c.marco)}</div>
                <div style="font-size:18px;font-weight:700;margin:4px 0;">${esc(c.prazo)}</div>
                <div style="font-size:11px;color:var(--gray-400);">${esc(c.base)} · ${esc(c.pagina)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Slides de riscos (2 por slide)
  const lista = r.riscos_lista || [];
  for (let i = 0; i < lista.length; i += 2) {
    const pair = lista.slice(i, i+2);
    html += `
      <div class="slide-preview-card" style="border-color:var(--red);">
        <div class="slide-tag" style="background:var(--red);color:#fff;">Anexo · Riscos ${i+1}–${Math.min(i+2,lista.length)}</div>
        <div class="slide-preview-body">
          <div class="slide-preview-title">RISCOS IDENTIFICADOS</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            ${pair.map(ri=>`
              <div class="risco-item">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                  <span class="risco-num">${ri.num}</span>
                  <strong style="font-size:14px;">${esc(ri.titulo)}</strong>
                </div>
                <p style="font-size:13px;color:var(--gray-700);line-height:1.5;margin-bottom:8px;">${esc(ri.descricao)}</p>
                <div style="font-size:11px;color:var(--gray-400);">📋 ${esc(ri.base)} · ${esc(ri.pagina)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Recomendações
  if (r.recomendacoes?.length) {
    html += `
      <div class="slide-preview-card" style="border-color:var(--red);">
        <div class="slide-tag" style="background:var(--red);color:#fff;">Anexo · Recomendações Estratégicas</div>
        <div class="slide-preview-body">
          <div class="slide-preview-title">RECOMENDAÇÕES ESTRATÉGICAS</div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:16px;">
            ${r.recomendacoes.map(rc=>`
              <div style="background:var(--blue-lt);border-radius:8px;padding:16px 20px;display:flex;align-items:center;gap:12px;flex:1;min-width:200px;">
                <span style="font-size:24px;font-weight:900;color:var(--blue);">${esc(rc.num)}</span>
                <span style="font-size:13px;font-weight:600;color:var(--gray-700);">${esc(rc.texto)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  return html;
}

// ---- Print slides (hidden, for @media print) ----
function buildPrintSlides(comite, fatosByEmpr, notifs, conts, rets, dists, procsExt, procsInt, riscos, regs) {
  const eids = Object.keys(fatosByEmpr);
  const fatoGroups = [];
  for (let i = 0; i < eids.length; i+=3) fatoGroups.push(eids.slice(i,i+3));

  const notifRes = notifs.filter(n=>n.estagio==='Resolvida').length;
  const notifAnd = notifs.filter(n=>n.estagio==='Em Andamento').length;
  const tempos   = notifs.filter(n=>n.data_solucao).map(n=>daysBetween(n.data_notificacao,n.data_solucao));
  const tMedNot  = tempos.length ? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : null;
  const retMed   = rets.length ? Math.round(rets.reduce((s,r)=>s+(r.tempo_dias||0),0)/rets.length) : null;
  const distMed  = dists.length ? Math.round(dists.reduce((s,d)=>s+(d.tempo_dias||0),0)/dists.length) : null;

  let out = '';

  // CAPA
  out += `<div class="slide-page slide-capa">
    <div class="logo">⚖️</div>
    <h1>COMITÊ ${esc(comite.label.toUpperCase())}</h1>
    <h2>Relatório Jurídico e Operacional</h2>
    <div class="mes-badge">${esc(comite.label)}</div>
  </div>`;

  // FATOS
  fatoGroups.forEach((group, si) => {
    out += `<div class="slide-page slide-body">
      <div class="slide-title">FATOS RELEVANTES</div>
      <div class="slide-subtitle">${esc(comite.label)}</div>
      ${group.map(eid => `
        <div class="slide-empr-block">
          <div class="slide-empr-name">${esc(emprName(eid))}</div>
          ${fatosByEmpr[eid].map(f=>`
            <div class="slide-fato-row">
              <span class="slide-fato-date">${fmtDate(f.data)}</span>
              <span class="slide-fato-text">${f.titulo?`<strong>${esc(f.titulo)}</strong> — `:''} ${esc(f.descricao)}</span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>`;
  });

  // NOTIFICAÇÕES
  out += printKpiSlide('NOTIFICAÇÕES', comite.label, [
    {l:'Total de Notificações', v:notifs.length},
    {l:'Em Andamento',          v:notifAnd, c:'orange'},
    {l:'Resolvidas',            v:notifRes, c:'green'},
    {l:'Tempo Médio Resolução', v:tMedNot!==null?tMedNot+' dias':'—'},
  ], countBy(notifs,'grupo'), countBy(notifs,'modelo'));

  // CONTRATOS
  out += printKpiSlide('CONTRATOS', comite.label, [
    {l:'Total de Contratos',    v:conts.length},
    {l:'Empreendimentos',       v:new Set(conts.map(c=>c.empreendimento_id)).size, c:''},
    {l:'Assinados',             v:conts.filter(c=>c.status==='Assinado').length, c:'green'},
    {l:'Em Análise',            v:conts.filter(c=>c.status==='Em análise').length, c:''},
  ], countBy(conts,'tipo'), countBy(conts.map(c=>({...c,_en:emprName(c.empreendimento_id)})),'_en'));

  // RETOMADAS
  out += printKpiSlide('RETOMADAS', comite.label, [
    {l:'Total de Retomadas',    v:rets.length},
    {l:'Tempo Médio',           v:retMed!==null?retMed+' dias':'—', c:'orange'},
    {l:'Empreendimentos',       v:new Set(rets.map(r=>r.empreendimento_id)).size},
  ], countBy(rets,'motivo'), countBy(rets,'equipe'));

  // DISTRATOS
  out += printKpiSlide('DISTRATOS', comite.label, [
    {l:'Total de Distratos',    v:dists.length, c:'red'},
    {l:'Tempo Médio',           v:distMed!==null?distMed+' dias':'—', c:'orange'},
    {l:'Empreendimentos',       v:new Set(dists.map(d=>d.empreendimento_id)).size},
  ], countBy(dists,'motivo'), countBy(dists.map(d=>({...d,_en:emprName(d.empreendimento_id)})),'_en'));

  // REGULATÓRIO
  regs.forEach(r => {
    out += `<div class="slide-page slide-body">
      <div class="slide-title">${esc(r.titulo.toUpperCase())}</div>
      ${r.destaque ? `<div style="background:#FEF9C3;border:1px solid #FCD34D;border-radius:8px;padding:12px;margin-bottom:16px;font-weight:700;color:#92400E;">🚨 ${esc(r.destaque)}</div>` : ''}
      ${r.checklist?.length ? `<ul class="slide-check-list">
        ${r.checklist.map(c=>`<li class="slide-check-item">
          <span class="slide-check-icon">☑️</span>
          <div><strong style="font-size:13px;">${esc(c.item)}</strong><br><span style="font-size:12px;color:#6B7280;">${esc(c.descricao)}</span></div>
        </li>`).join('')}
      </ul>` : ''}
    </div>`;
  });

  // PROCESSOS EXTERNOS
  out += printProcSlide('PROCESSOS JUDICIAIS', comite.label, procsExt, false);
  // PROCESSOS INTERNOS
  out += printProcSlide('PROCESSOS JUDICIAIS INTERNOS', comite.label, procsInt, true);

  // ENCERRAMENTO
  out += `<div class="slide-page slide-fim">
    <h2>OBRIGADA</h2>
    <p>${esc(comite.label)} · Departamento Jurídico</p>
  </div>`;

  // RISCOS (ANEXOS)
  riscos.forEach(r => {
    // capa
    out += `<div class="slide-page slide-body" style="background:#1E2A3B;color:#fff;">
      <div style="margin-top:80px;text-align:center;">
        <div style="font-size:11px;opacity:.5;text-transform:uppercase;letter-spacing:.1em;">ANÁLISE JURÍDICA</div>
        <div style="font-size:32px;font-weight:900;margin:12px 0;">${esc(emprName(r.empreendimento_id)).toUpperCase()}</div>
        <div style="font-size:18px;opacity:.7;">RISCOS CONTRATUAIS</div>
        <div style="font-size:14px;opacity:.5;margin-top:8px;">${esc(r.contrato_ref)}</div>
      </div>
    </div>`;

    // cronograma
    if (r.cronograma?.length) {
      out += `<div class="slide-page slide-body">
        <div class="slide-title">CRONOGRAMA CONTRATUAL</div>
        ${r.alerta ? `<div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:#991B1B;">⚠️ ${esc(r.alerta)}</div>` : ''}
        <div class="slide-kpi-row">
          ${r.cronograma.map(c=>`<div class="slide-kpi">
            <div style="font-size:10px;color:#6B7280;text-transform:uppercase;">${esc(c.marco)}</div>
            <div style="font-size:16px;font-weight:700;margin:6px 0;">${esc(c.prazo)}</div>
            <div style="font-size:10px;color:#9CA3AF;">${esc(c.base)}</div>
          </div>`).join('')}
        </div>
      </div>`;
    }

    // riscos 2 a 2
    const lista = r.riscos_lista || [];
    for (let i=0; i<lista.length; i+=2) {
      const pair = lista.slice(i,i+2);
      out += `<div class="slide-page slide-body">
        <div class="slide-title">RISCOS IDENTIFICADOS</div>
        <div class="slide-risco-grid">
          ${pair.map(ri=>`<div class="slide-risco-box">
            <div class="slide-risco-num">${ri.num}</div>
            <div class="slide-risco-title">${esc(ri.titulo)}</div>
            <div class="slide-risco-text">${esc(ri.descricao)}</div>
            <div class="slide-risco-base">📋 ${esc(ri.base)} · ${esc(ri.pagina)}</div>
          </div>`).join('')}
        </div>
      </div>`;
    }

    // recomendações
    if (r.recomendacoes?.length) {
      out += `<div class="slide-page slide-body">
        <div class="slide-title">RECOMENDAÇÕES ESTRATÉGICAS</div>
        <div class="slide-rec-grid">
          ${r.recomendacoes.map(rc=>`<div class="slide-rec-box">
            <div class="slide-rec-num">${esc(rc.num)}</div>
            <div class="slide-rec-text">${esc(rc.texto)}</div>
          </div>`).join('')}
        </div>
      </div>`;
    }
  });

  return out;
}

function printKpiSlide(titulo, mes, kpis, chart1data, chart2data) {
  const toBar = (data) => {
    const keys = Object.keys(data);
    const vals = Object.values(data);
    if (!keys.length) return '<em style="font-size:11px;color:#9CA3AF;">Sem dados</em>';
    const max = Math.max(...vals) || 1;
    return keys.map((k,i) => `
      <div style="margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">
          <span>${esc(k)}</span><span style="font-weight:700;">${vals[i]}</span>
        </div>
        <div style="background:#E5E7EB;border-radius:99px;height:5px;">
          <div style="height:5px;border-radius:99px;background:#2563EB;width:${Math.round(vals[i]/max*100)}%;"></div>
        </div>
      </div>
    `).join('');
  };

  return `<div class="slide-page slide-body">
    <div class="slide-title">${esc(titulo)}</div>
    <div class="slide-subtitle">${esc(mes)}</div>
    <div class="slide-kpi-row">
      ${kpis.map(k=>`<div class="slide-kpi ${k.c||''}">
        <div class="slide-kpi-val">${esc(String(k.v))}</div>
        <div class="slide-kpi-lbl">${esc(k.l)}</div>
      </div>`).join('')}
    </div>
    <div class="slide-charts-row">
      <div class="slide-chart-box">
        <div class="slide-chart-label">Distribuição</div>
        ${toBar(chart1data)}
      </div>
      <div class="slide-chart-box">
        <div class="slide-chart-label">Por Categoria</div>
        ${toBar(chart2data)}
      </div>
    </div>
  </div>`;
}

function printProcSlide(titulo, mes, list, interno) {
  return `<div class="slide-page slide-body">
    <div class="slide-title">${esc(titulo)}</div>
    <div class="slide-subtitle">${esc(mes)}</div>
    <div class="slide-kpi-row">
      <div class="slide-kpi"><div class="slide-kpi-val">${list.length}</div><div class="slide-kpi-lbl">Total</div></div>
      <div class="slide-kpi"><div class="slide-kpi-val">${list.filter(p=>p.status==='Acompanhando').length}</div><div class="slide-kpi-lbl">Acompanhando</div></div>
      <div class="slide-kpi green"><div class="slide-kpi-val">${list.filter(p=>p.status==='Finalizado').length}</div><div class="slide-kpi-lbl">Finalizado</div></div>
      <div class="slide-kpi"><div class="slide-kpi-val">${list.filter(p=>p.status==='Em Acordo').length}</div><div class="slide-kpi-lbl">Em Acordo</div></div>
    </div>
    <table class="slide-table" style="margin-top:16px;">
      <thead><tr>
        <th>Empreendimento</th><th>Motivo</th><th>Posição</th><th>Status</th><th>Ano</th>
      </tr></thead>
      <tbody>
        ${list.slice(0,12).map(p=>`<tr>
          <td>${esc(emprName(p.empreendimento_id))}</td>
          <td>${esc(p.motivo)}</td>
          <td>${esc(p.posicao)}</td>
          <td>${esc(p.status)}</td>
          <td>${esc(p.ano)}</td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#9CA3AF;">Nenhum processo</td></tr>'}
      </tbody>
    </table>
  </div>`;
}
