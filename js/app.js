/* ===== APP ROUTER & BOOTSTRAP ===== */

const Router = (() => {
  const routes = {
    dashboard:       renderDashboard,
    empreendimentos: renderEmpreendimentos,
    fatos:           renderFatos,
    notificacoes:    renderNotificacoes,
    contratos:       renderContratos,
    retomadas:       renderRetomadas,
    distratos:       renderDistratos,
    processos:       renderProcessos,
    unidades:        renderUnidades,
    risco:           renderRisco,
    regulatorio:     renderRegulatorio,
    comite:          renderComite,
    backup:          renderBackup,
  };

  let current = 'dashboard';

  function navigate(route) {
    current = route;
    const fn = routes[route];
    if (fn) fn();
    else setView(`<div class="content"><div class="alert alert-danger">Rota não encontrada: ${esc(route)}</div></div>`);

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === route);
    });

    // Scroll to top
    document.getElementById('main').scrollTop = 0;
    updateStorageInfo();
  }

  return { navigate, get current() { return current; } };
})();

// ---- Sidebar nav clicks ----
document.querySelectorAll('.nav-item[data-route]').forEach(el => {
  el.addEventListener('click', () => Router.navigate(el.dataset.route));
});

// ---- Month selector change ----
document.getElementById('monthSelector').addEventListener('change', function() {
  if (!this.value) return;
  DB.setActiveComite(this.value);
  Router.navigate('dashboard');
});

// ---- New month button ----
document.getElementById('btnNewMonth').addEventListener('click', openNewMonthModal);

// ---- Bootstrap: aguarda o banco carregar do servidor antes de renderizar ----
DB.ready.then(() => {
  seedIfEmpty();             // Insere dados demo se banco estiver vazio
  populateMonthSelector();   // Preenche o seletor de mês
  updateStorageInfo();       // Exibe uso de armazenamento
  Router.navigate('dashboard'); // Abre o dashboard
});
