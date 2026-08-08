/* ===== TÊMIS — assistente de IA do Departamento Jurídico =====
   Fonte: design_handoff_comites_juridicos/README.md, seção "Têmis".

   FAB fixo, presente em toda tela (a marcação vive fora de #view, direto no
   body — Router.navigate nunca a substitui). Oculta na impressão via
   css/print.css.

   Sem chave de IA configurada no servidor, GET /api/ia/estado devolve
   habilitada:false e o painel mostra o aviso "assistente precisa da
   plataforma online" documentado no handoff, em vez de travar ou inventar
   resposta. */
const Temis = (() => {
  'use strict';

  let aberto = false;
  let carregando = false;
  let habilitada = null; // null = ainda não verificado
  const mensagens = []; // {papel:'usuario'|'assistente', texto}

  const SUGESTOES = [
    'Quantos processos estão em andamento neste comitê?',
    'Como está a distribuição de notificações por estágio?',
    'Quais empreendimentos têm mais distratos neste mês?',
  ];

  /** Resumo textual da carteira do comitê ativo — vira o contexto da conversa. */
  function montarContexto() {
    const comite = DB.getActiveComite();
    if (!comite) return '';
    const cid = comite.id;

    const proc = DB.forComite('processos', cid);
    const notif = DB.forComite('notificacoes', cid);
    const distr = DB.forComite('distratos', cid);
    const ret = DB.forComite('retomadas', cid);

    const contarPor = (lista, campo) => {
      const m = {};
      lista.forEach((r) => { const v = r[campo]; if (v) m[v] = (m[v] || 0) + 1; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };

    const linhas = [`Comitê de referência: ${comite.label}.`];

    linhas.push(`Processos judiciais: ${proc.length} no total, ${proc.filter(p => !p.interno).length} externos e ${proc.filter(p => p.interno).length} internos.`);
    const porStatus = contarPor(proc, 'status');
    if (porStatus.length) linhas.push(`Por status: ${porStatus.map(([s, n]) => `${s} (${n})`).join(', ')}.`);

    linhas.push(`Notificações: ${notif.length} no total.`);
    const porEstagio = contarPor(notif, 'estagio');
    if (porEstagio.length) linhas.push(`Por estágio: ${porEstagio.map(([s, n]) => `${s} (${n})`).join(', ')}.`);

    if (distr.length) linhas.push(`Distratos no período: ${distr.length}.`);
    if (ret.length) linhas.push(`Retomadas no período: ${ret.length}.`);

    return linhas.join(' ');
  }

  function elFab() { return document.getElementById('temisFab'); }
  function elPainel() { return document.getElementById('temisPainel'); }

  function bolha(m) {
    if (m.aviso) return `<div class="temis-bolha aviso">${esc(m.texto)}</div>`;
    return `<div class="temis-bolha ${m.papel === 'usuario' ? 'user' : 'bot'}">${esc(m.texto)}</div>`;
  }

  function painelHtml() {
    const corpo = mensagens.length
      ? mensagens.map(bolha).join('')
      : `
        <div class="temis-bolha bot">Olá! Sou a Têmis, assistente do Departamento Jurídico. Posso ajudar com dúvidas sobre a carteira deste comitê.
          <div class="temis-sugestoes">
            ${SUGESTOES.map((s) => `<button onclick="Temis.perguntar(${esc(JSON.stringify(s))})">${esc(s)}</button>`).join('')}
          </div>
        </div>`;

    return `
      <div class="temis-painel" id="temisPainel">
        <div class="temis-painel-head">
          <div class="temis-fab-avatar"><img src="img/temis.png" alt="Têmis" /></div>
          <div>
            <div class="temis-fab-nome">Têmis</div>
            <div class="temis-fab-sub">Assistente jurídica</div>
          </div>
          <button class="temis-painel-fechar" onclick="Temis.fechar()">×</button>
        </div>
        <div class="temis-painel-corpo" id="temisCorpo">
          ${corpo}
          ${carregando ? '<div class="temis-bolha bot">Têmis está pensando…</div>' : ''}
        </div>
        <div class="temis-painel-rodape">
          <input type="text" id="temisInput" placeholder="Pergunte à Têmis…" ${carregando ? 'disabled' : ''}
            onkeydown="if(event.key==='Enter')Temis.enviar()" />
          <button onclick="Temis.enviar()" ${carregando ? 'disabled' : ''} title="Enviar">➤</button>
        </div>
      </div>`;
  }

  function render() {
    const existente = elPainel();
    if (existente) existente.remove();

    const fab = elFab();
    if (fab) fab.classList.toggle('oculto', aberto);

    if (aberto) {
      document.body.insertAdjacentHTML('beforeend', painelHtml());
      const corpo = document.getElementById('temisCorpo');
      if (corpo) corpo.scrollTop = corpo.scrollHeight;
      const input = document.getElementById('temisInput');
      if (input && !carregando) input.focus();
    }
  }

  function toggle() {
    aberto = !aberto;
    render();
  }
  function fechar() {
    aberto = false;
    render();
  }

  async function verificarEstado() {
    try {
      const r = await Sessao.requisitar('/api/ia/estado');
      habilitada = Boolean(r && r.habilitada);
    } catch (erro) {
      // Sem permissão ou sem sessão: trata como indisponível, sem travar a tela.
      habilitada = false;
    }
  }

  async function enviarTexto(texto) {
    if (!texto || carregando) return;
    mensagens.push({ papel: 'usuario', texto });
    carregando = true;
    render();

    try {
      if (habilitada === null) await verificarEstado();
      if (!habilitada) {
        mensagens.push({
          papel: 'assistente', aviso: true,
          texto: 'A Têmis precisa de uma chave de IA configurada no servidor para responder. Peça para o administrador configurar IA_API_KEY no ambiente da plataforma.',
        });
      } else {
        const corpo = { mensagens: mensagens.filter((m) => !m.aviso).map((m) => ({ papel: m.papel, texto: m.texto })) };
        const contexto = montarContexto();
        if (contexto) corpo.contexto = contexto;
        const r = await Sessao.requisitar('/api/ia/temis', { metodo: 'POST', corpo });
        mensagens.push({ papel: 'assistente', texto: r.resposta });
      }
    } catch (erro) {
      mensagens.push({
        papel: 'assistente', aviso: true,
        texto: erro && erro.conflito
          ? 'A Têmis precisa de uma chave de IA configurada no servidor para responder.'
          : erro && erro.semPermissao
            ? 'Seu perfil não tem acesso à Têmis.'
            : 'A Têmis não respondeu desta vez. Tente novamente em um instante.',
      });
    } finally {
      carregando = false;
      render();
    }
  }

  function enviar() {
    const input = document.getElementById('temisInput');
    if (!input) return;
    const texto = input.value.trim();
    input.value = '';
    enviarTexto(texto);
  }

  function perguntar(texto) { enviarTexto(texto); }

  function init() {
    if (document.getElementById('temisFab')) return; // idempotente
    document.body.insertAdjacentHTML('beforeend', `
      <button class="temis-fab-btn" id="temisFab" onclick="Temis.toggle()" title="Têmis — assistente jurídica">
        <div class="temis-fab-avatar"><img src="img/temis.png" alt="Têmis" /></div>
        <div class="temis-fab-texto">
          <div class="temis-fab-nome">Têmis</div>
          <div class="temis-fab-sub">Assistente jurídica</div>
        </div>
      </button>`);
    verificarEstado();
  }

  return { init, toggle, fechar, enviar, perguntar };
})();
