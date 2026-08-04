/* ===== APP ROUTER & BOOTSTRAP ===== */

const Router = (() => {
  const routes = {
    dashboard:       renderDashboard,
    empreendimentos: renderEmpreendimentos,
    fatos:           renderFatos,
    notificacoes:    renderNotificacoes,
    distratos:       renderDistratosRetomadas,
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

// ---- Estado da fonte de dados na barra lateral ----
// O rodapé passa a informar a situação da sincronização com o servidor. Antes
// mostrava o tamanho do localStorage — métrica que deixou de existir, porque
// não há mais dado de negócio no navegador.
DB.aoMudarEstado(() => updateStorageInfo());

// ---- Bootstrap ----
//
// Nada é desenhado antes de o servidor responder. Enquanto o dado vinha do
// navegador, abrir sem servidor era possível; agora, abrir sem servidor
// significaria mostrar uma base vazia como se fosse a base real.
DB.ready.then((inicio) => {
  if (!inicio.autenticado) {
    const estado = DB.estado();
    Login.mostrar(
      estado.nome === DB.ESTADOS.SEM_CONEXAO
        ? 'Sem conexão com o servidor. Verifique a rede e tente novamente.'
        : (inicio.erro || null),
    );
    return;
  }

  populateMonthSelector();   // Preenche o seletor de mês
  updateStorageInfo();       // Exibe o estado da sincronização
  Router.navigate('dashboard');

  // Dados de versões anteriores no navegador: oferece a migração para o
  // PostgreSQL. Não apaga nada por conta própria — pergunta antes, e só remove
  // depois de o servidor confirmar a gravação.
  if (typeof Migracao !== 'undefined') {
    setTimeout(() => Migracao.verificarAoCarregar(), 1200);
  }
});
