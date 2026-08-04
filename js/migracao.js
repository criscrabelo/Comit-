/* ===== MIGRAÇÃO DO localStorage =====
   Detecta dados de versões anteriores no navegador, mostra o que existe, pede
   confirmação, importa para o PostgreSQL e só então apaga as chaves antigas.

   Ordem, que é a garantia:
     1. detectar        — nada é enviado ainda
     2. inspecionar     — o servidor classifica e devolve prévia mascarada
     3. confirmar       — a pessoa decide, vendo quantidade e módulos
     4. importar        — snapshot no servidor + upsert idempotente
     5. confirmar remoção — só as chaves cuja persistência foi confirmada
     6. remover         — apaga do navegador

   Nada é apagado antes do passo 5. Interromper em qualquer ponto é seguro:
   repetir continua de onde parou, sem duplicar.
================================================================ */

const Migracao = (() => {
  'use strict';

  const API = '/api/migracao';
  const PREFIXO_PREFERENCIA = 'patrono.pref.v1.';

  /* Chaves que NUNCA saem do navegador nem são enviadas ao servidor. */
  const PREFIXOS_LEGADOS = ['jur_comite_', 'patrono_'];

  /* ── Coleta o dump, sem enviar nada ─────────────────────────── */
  function coletarDump() {
    const chaves = {};

    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (!chave) continue;

      // Preferências no formato novo não fazem parte da migração.
      if (chave.startsWith(PREFIXO_PREFERENCIA)) continue;

      // Só o que tem prefixo conhecido: não varremos o navegador inteiro, que
      // pode conter dados de outros sistemas na mesma origem.
      if (!PREFIXOS_LEGADOS.some((p) => chave.startsWith(p))) continue;

      chaves[chave] = localStorage.getItem(chave) || '';
    }

    return {
      chaves,
      versao: '1.0',
      navegador: navigator.userAgent.slice(0, 300),
    };
  }

  function existemDadosLegados() {
    return Object.keys(coletarDump().chaves).length > 0;
  }

  /* ── Chamadas ao backend ────────────────────────────────────── */
  async function chamar(caminho, corpo) {
    const resposta = await fetch(API + caminho, {
      method: corpo ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    });

    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      const erro = dados && dados.erro;
      throw new Error((erro && erro.mensagem) || `HTTP ${resposta.status}`);
    }
    return dados;
  }

  /* ── 1 e 2. Detectar e inspecionar ──────────────────────────── */
  async function verificar() {
    if (!existemDadosLegados()) return null;
    return chamar('/inspecionar', coletarDump());
  }

  /* ── 3. Tela de confirmação ─────────────────────────────────── */
  function abrirModal(inspecao) {
    const t = inspecao.totais;

    const linhas = inspecao.chaves
      .map((c) => {
        const rotuloClasse = {
          migrar: '<span style="color:var(--green)">migrar</span>',
          preferencia: '<span style="color:var(--gray-500)">preferência</span>',
          excluir: '<span style="color:var(--orange)">excluir</span>',
          cache: '<span style="color:var(--gray-500)">cache</span>',
          revisao: '<span style="color:var(--orange)">revisão</span>',
        }[c.classe] || c.classe;

        const alerta = c.erroFormato
          ? `<div style="color:var(--red);font-size:11px">⚠ ${esc(c.erroFormato)}</div>`
          : '';
        const pessoal = c.contemDadoPessoal
          ? '<span title="contém dado pessoal" style="color:var(--orange)">●</span> '
          : '';

        return `<tr>
          <td>${pessoal}${esc(c.modulo)}<div style="font-size:11px;color:var(--gray-500)">${esc(c.chave)}</div>${alerta}</td>
          <td style="text-align:right">${c.registros}</td>
          <td style="text-align:right">${c.demonstrativos || '—'}</td>
          <td>${rotuloClasse}</td>
        </tr>`;
      })
      .join('');

    openModal(
      '📦 Dados de uma versão anterior',
      `<div>
        <p style="margin-top:0">${esc(inspecao.resumo_para_usuario)}</p>

        <table class="data-table" style="font-size:13px">
          <thead><tr>
            <th>Módulo</th><th style="text-align:right">Registros</th>
            <th style="text-align:right">Exemplo</th><th>Destino</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>

        <div class="alert alert-info" style="margin-top:14px;font-size:12px">
          Os dados são copiados para o servidor primeiro. As chaves antigas só
          são apagadas deste navegador <strong>depois</strong> de a gravação ser
          confirmada. Repetir a operação não duplica nada.
          ${t.demonstrativos > 0
            ? `<br><br>${t.demonstrativos} registro(s) de exemplo serão marcados como demonstrativos e nunca aparecerão como dado real.`
            : ''}
          ${t.em_revisao > 0
            ? `<br><br>${t.em_revisao} chave(s) não reconhecida(s) permanecerão no navegador até revisão — não serão migradas nem apagadas.`
            : ''}
        </div>

        <div id="migracao-resultado" style="margin-top:14px"></div>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Agora não</button>
       <button class="btn btn-primary" id="btn-migrar" onclick="Migracao.executar()">
         Migrar ${t.registros} registro(s)
       </button>`,
    );
  }

  /* ── 4, 5 e 6. Importar, confirmar e remover ────────────────── */
  async function executar() {
    const botao = document.getElementById('btn-migrar');
    const destino = document.getElementById('migracao-resultado');
    if (botao) { botao.disabled = true; botao.textContent = 'Migrando…'; }

    try {
      const resultado = await chamar('/importar', coletarDump());

      destino.innerHTML = `
        <table class="data-table" style="font-size:13px">
          <tbody>
            <tr><td>Incluídos</td><td style="text-align:right"><strong>${resultado.incluidos}</strong></td></tr>
            <tr><td>Atualizados</td><td style="text-align:right">${resultado.atualizados}</td></tr>
            <tr><td>Ignorados</td><td style="text-align:right">${resultado.ignorados}</td></tr>
            <tr><td>Conflitantes</td><td style="text-align:right">${resultado.conflitantes}</td></tr>
            <tr><td>Com erro</td><td style="text-align:right">${resultado.com_erro}</td></tr>
          </tbody>
        </table>`;

      if (!resultado.persistencia_confirmada) {
        destino.innerHTML += `
          <div class="alert alert-warning" style="margin-top:10px;font-size:12px">
            A gravação não foi totalmente confirmada. <strong>Nenhuma chave foi
            apagada</strong> deste navegador. Seus dados continuam aqui e a
            migração pode ser repetida.
          </div>`;
        if (botao) { botao.disabled = false; botao.textContent = 'Tentar novamente'; }
        return;
      }

      // Só agora o servidor diz quais chaves podem sair do navegador.
      const remocao = await chamar(`/${resultado.id}/confirmar-remocao`, {});

      let removidas = 0;
      remocao.pode_remover.forEach((chave) => {
        localStorage.removeItem(chave);
        removidas++;
      });

      // O comitê selecionado vira preferência no formato novo, sem dado de negócio.
      const comiteAtivo = localStorage.getItem('jur_comite_active_comite');
      if (comiteAtivo) {
        localStorage.setItem(PREFIXO_PREFERENCIA + 'comite_ativo', comiteAtivo);
        localStorage.removeItem('jur_comite_active_comite');
      }

      destino.innerHTML += `
        <div class="alert alert-success" style="margin-top:10px;font-size:12px">
          ✅ Migração concluída. ${removidas} chave(s) removida(s) deste navegador.
          ${remocao.nao_remover.length
            ? `<br>${remocao.nao_remover.length} chave(s) mantida(s): ${esc(remocao.motivo || '')}`
            : ''}
        </div>`;

      if (botao) {
        botao.textContent = 'Concluído';
        botao.onclick = () => { closeModal(); location.reload(); };
        botao.disabled = false;
      }
    } catch (erro) {
      destino.innerHTML = `
        <div class="alert alert-error" style="font-size:12px">
          Falha na migração: ${esc(erro.message)}<br>
          <strong>Nenhum dado foi apagado deste navegador.</strong>
        </div>`;
      if (botao) { botao.disabled = false; botao.textContent = 'Tentar novamente'; }
    }
  }

  /* ── Verificação automática na carga ────────────────────────── */
  async function verificarAoCarregar() {
    if (!existemDadosLegados()) return;

    try {
      const inspecao = await verificar();
      // Só abre a tela quando há algo a migrar de fato.
      if (inspecao && inspecao.totais.a_migrar > 0) abrirModal(inspecao);
    } catch (erro) {
      // Sem sessão ou backend indisponível: não incomoda o usuário, e nada é
      // apagado. A verificação acontece de novo na próxima carga.
      console.info('[Migração] verificação adiada:', erro.message);
    }
  }

  /* ── Preferências ───────────────────────────────────────────── */
  const PREFERENCIAS = {
    tema: 'tema',
    menuRecolhido: 'menu_recolhido',
    abaSelecionada: 'aba_selecionada',
    densidadeTabela: 'densidade_tabela',
    comiteAtivo: 'comite_ativo',
    ultimaVisualizacao: 'ultima_visualizacao',
  };

  /**
   * Grava preferência. Recusa qualquer chave fora do catálogo — é o que impede
   * alguém de voltar a guardar dado de negócio no navegador por conveniência.
   */
  function definirPreferencia(nome, valor) {
    const sufixo = PREFERENCIAS[nome];
    if (!sufixo) {
      console.warn(`[Preferência] "${nome}" não está no catálogo e não será gravada.`);
      return false;
    }
    localStorage.setItem(PREFIXO_PREFERENCIA + sufixo, String(valor));
    return true;
  }

  function lerPreferencia(nome) {
    const sufixo = PREFERENCIAS[nome];
    if (!sufixo) return null;
    return localStorage.getItem(PREFIXO_PREFERENCIA + sufixo);
  }

  return {
    verificar,
    verificarAoCarregar,
    executar,
    existemDadosLegados,
    definirPreferencia,
    lerPreferencia,
    PREFIXO_PREFERENCIA,
  };
})();
