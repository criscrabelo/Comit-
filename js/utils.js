/* ===== UTILITIES ===== */

// ---- Date helpers ----
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function fmtMonthYear(ref) {
  if (!ref) return '—';
  const [y, m] = ref.split('-');
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${months[parseInt(m,10)-1]}/${y}`;
}
function isoToday() { return new Date().toISOString().slice(0,10); }
function daysBetween(a, b) {
  const da = new Date(a), db = new Date(b);
  return Math.round((db - da) / 86400000);
}

// ---- Exportação CSV (do que está na tela, já filtrado) ----
function baixarCsv(nomeArquivo, cabecalho, linhas) {
  const csv = [cabecalho, ...linhas]
    .map((linha) => linha.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- DOM helpers ----
function el(selector, ctx) { return (ctx || document).querySelector(selector); }
function els(selector, ctx) { return [...(ctx || document).querySelectorAll(selector)]; }
function html(id, content) {
  const e = document.getElementById(id);
  if (e) e.innerHTML = content;
}
function setView(content) { html('view', content); }

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ---- Toast ----
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2500);
}

// ---- Modal ----
function openModal(title, bodyHtml, footHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFoot').innerHTML = footHtml || '';
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});

// ---- Empreendimento helpers ----
function emprName(id) {
  const e = DB.getById('empreendimentos', id);
  return e ? e.nome : id || '—';
}
function emprOptions(selectedId) {
  return DB.getEmpreendimentos().map(e =>
    `<option value="${esc(e.id)}" ${e.id === selectedId ? 'selected' : ''}>${esc(e.nome)}</option>`
  ).join('');
}

// ---- Select options from array ----
function opts(arr, selected) {
  return arr.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

// ---- Badge ----
const BADGE_COLORS = {
  'Acompanhando': 'blue', 'Finalizado': 'green', 'Em Acordo': 'purple',
  'Acordo': 'purple', 'Baixa Definitiva': 'gray', 'Arq. Provisório': 'yellow',
  'Resolvida': 'green', 'Em Andamento': 'orange',
  'Assinado': 'green', 'Em análise': 'yellow',
  'Réu': 'red', 'Autor': 'blue', 'Terceiro': 'gray',
  'Inadimplência': 'red', 'Distrato': 'orange', 'Desistência': 'yellow',
  'Dificuldade Financeira': 'red', 'Insatisfação': 'orange', 'Falha de Serviço': 'purple',
  'publicado': 'green', 'rascunho': 'yellow',
};
function badge(text, colorOverride) {
  if (!text) return '';
  const c = colorOverride || BADGE_COLORS[text] || 'gray';
  return `<span class="badge badge-${c}">${esc(text)}</span>`;
}

// ---- Number format ----
function num(n) { return (n || 0).toLocaleString('pt-BR'); }

// ---- Storage size in sidebar ----
function updateStorageInfo() {
  const el = document.getElementById('storageInfo');
  // Nao ha mais armazenamento local de dado de negocio para medir. O rodape
  // passa a informar quantos registros estao carregados e como esta a
  // sincronizacao com o servidor.
  if (el) el.textContent = 'Dados: ' + DB.storageSize();
}

// ---- Confirm delete ----
function confirmDelete(msg, cb) {
  openModal('Confirmar exclusão',
    `<p style="font-size:14px;color:var(--gray-700);">${msg}</p>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="closeModal();(${cb})()">Excluir</button>`
  );
}

// ---- Month selector population ----
// O <select> nativo continua sendo o que app.js escuta (evento 'change');
// o painel abaixo só espelha a mesma lista visualmente, no formato do
// handoff ("Julho · 2026" + código mono "07/26").
function mesCodigo(ref) {
  const [y, m] = (ref || '').split('-');
  return (y && m) ? `${m}/${y.slice(2)}` : '';
}

function populateMonthSelector() {
  const sel = document.getElementById('monthSelector');
  const comites = DB.getComites();
  const active  = DB.getActiveComite();
  sel.innerHTML = comites.length
    ? comites.map(c => `<option value="${c.id}" ${active && c.id === active.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')
    : '<option value="">— nenhum —</option>';

  const painel = document.getElementById('monthPanel');
  const label  = document.getElementById('monthTriggerLabel');
  const codigo = document.getElementById('monthTriggerCode');
  if (!painel) return;

  painel.innerHTML = comites.length
    ? comites.map(c => `
        <div class="month-item ${active && c.id === active.id ? 'selected' : ''}" onclick="selecionarMes('${c.id}')">
          <span class="month-item-dot"></span>${esc(c.label)}
          <span style="margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--texto-esc-3)">${mesCodigo(c.ref)}</span>
        </div>`).join('')
    : '<div class="month-item">— nenhum —</div>';

  label.textContent  = active ? active.label : '— nenhum —';
  codigo.textContent = active ? mesCodigo(active.ref) : '';
}

function toggleMonthPanel() {
  document.getElementById('monthPanel').classList.toggle('hidden');
}

function selecionarMes(id) {
  document.getElementById('monthPanel').classList.add('hidden');
  const sel = document.getElementById('monthSelector');
  if (sel.value === id) return;
  sel.value = id;
  sel.dispatchEvent(new Event('change'));
}

// Fecha o painel ao clicar fora — mesmo padrão de popover usado nos filtros.
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('monthDropdown');
  if (dropdown && !dropdown.contains(e.target)) {
    document.getElementById('monthPanel')?.classList.add('hidden');
  }
});

// ---- Contagem ao vivo na nav (bolinha + número, grupo "Cadastros do Mês") ----
// A maioria das entidades deste grupo tem comite_id: o cache já vem
// recortado pelo mês ativo. `honorarios` e `transferencias` são cadastro
// contínuo, sem recorte de mês — contam o total.
function updateNavCounts() {
  els('.nav-count[data-count]').forEach((el) => {
    const tabela = el.dataset.count;
    el.textContent = DB.getAll(tabela).length;
  });
}

// ---- New month dialog ----
function openNewMonthModal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2,'0');
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  openModal('Novo Comitê Mensal',
    `<div class="form-grid cols-2">
      <div class="form-group">
        <label class="field-label">Mês</label>
        <select id="nm_mes">${monthNames.map((n,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${String(i+1).padStart(2,'0')===m?'selected':''}>${n}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="field-label">Ano</label>
        <input type="number" id="nm_ano" value="${y}" min="2020" max="2050" />
      </div>
      <div class="form-group span-2">
        <label class="field-label">Data da Apresentação</label>
        <input type="date" id="nm_data" value="${y}-${m}-${now.getDate().toString().padStart(2,'0')}" />
      </div>
    </div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="createNewMonth()">Criar</button>`
  );
}

async function createNewMonth() {
  const mes  = document.getElementById('nm_mes').value;
  const ano  = document.getElementById('nm_ano').value;
  const data = document.getElementById('nm_data').value;
  const ref  = `${ano}-${mes}`;
  const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const label = `${monthNames[parseInt(mes,10)-1]} ${ano}`;
  if (DB.getComites().find(c => c.ref === ref)) {
    toast('Já existe um comitê para esse mês!', 'error'); return;
  }
  DB.insert('comites', { ref, label, data_apresentacao: data, status: 'rascunho' });

  // Espera a confirmacao do servidor antes de abrir o mes: o id definitivo e o
  // do PostgreSQL, e anunciar "criado" antes disso seria anunciar o que ainda
  // pode nao ter acontecido.
  await DB.aguardar();

  const criado = DB.getComites().find(c => c.ref === ref);
  if (!criado || String(criado.id).indexOf('tmp-') === 0) {
    // O adaptador ja mostrou o motivo (sem conexao, sem permissao, conflito).
    return;
  }

  await DB.trocarComite(criado.id);
  closeModal();
  populateMonthSelector();
  document.getElementById('monthSelector').value = criado.id;
  toast(`Comitê ${label} criado!`, 'success');
  Router.navigate('dashboard');
}
