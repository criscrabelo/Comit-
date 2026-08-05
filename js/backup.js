/* ===== BACKUP E RESTAURAÇÃO =====

   Tela de continuidade. O que ela mostra, e por quê:

   - ESTADO: quantos backups recuperáveis existem, há quanto tempo foi o
     último, se a cifra e o agendamento estão configurados, e se alguma
     restauração já foi testada. Um backup nunca testado é hipótese, não
     garantia — e a tela diz isso com todas as letras.

   - HISTÓRICO: cada backup com tamanho, checksum e status. O checksum aparece
     porque é o que permite conferir, fora daqui, que o arquivo é o mesmo.

   - RESTAURAÇÃO: nunca em um clique. Primeiro a avaliação, que mostra o
     impacto medido tabela a tabela; só depois a confirmação. Em produção, a
     confirmação é uma frase digitada.

   O que a pessoa pode fazer depende do perfil, e o servidor decide. Esta tela
   apenas evita oferecer o que seria recusado.
================================================================ */

const Backup = (() => {
  'use strict';

  const API = '/api/backup';

  let _estado = null;
  let _historico = [];
  let _restauracoes = [];

  /* ── Formatação ───────────────────────────────────────────────── */

  function bytes(n) {
    if (n === null || n === undefined) return '—';
    const unidades = ['B', 'KiB', 'MiB', 'GiB'];
    let v = Number(n);
    let i = 0;
    while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i++; }
    return v.toFixed(i === 0 ? 0 : 1) + ' ' + unidades[i];
  }

  function quando(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function duracao(ms) {
    if (!ms) return '—';
    return ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s';
  }

  const CORES = {
    concluido: 'var(--green)',
    em_andamento: 'var(--gray-500)',
    erro: 'var(--red)',
    corrompido: 'var(--red)',
    expurgado: 'var(--gray-500)',
    concluida: 'var(--green)',
    concluida_com_ressalvas: 'var(--orange)',
    recusada: 'var(--orange)',
    interrompida: 'var(--red)',
  };

  const selo = (s) =>
    `<span style="color:${CORES[s] || 'var(--gray-500)'};font-weight:600">${esc(s.replace(/_/g, ' '))}</span>`;

  /* ── Carga ────────────────────────────────────────────────────── */

  async function carregar() {
    const [continuidade, lista, restauracoes] = await Promise.all([
      Sessao.requisitar(API + '/continuidade'),
      Sessao.requisitar(API + '?limite=50'),
      Sessao.requisitar(API + '/restauracoes'),
    ]);
    _estado = continuidade;
    _historico = lista.backups || [];
    _restauracoes = restauracoes.restauracoes || [];
  }

  /* ── Tela ─────────────────────────────────────────────────────── */

  async function render() {
    setView(`
      <div class="page-header">
        <div>
          <div class="page-title">💾 Backup e Restauração</div>
          <div class="page-sub">Continuidade dos dados</div>
        </div>
      </div>
      <div class="content"><p style="color:var(--gray-500)">Carregando…</p></div>
    `);

    try {
      await carregar();
    } catch (erro) {
      setView(`
        <div class="page-header">
          <div><div class="page-title">💾 Backup e Restauração</div></div>
        </div>
        <div class="content">
          <div class="alert alert-${erro.semPermissao ? 'warning' : 'error'}">
            ${erro.semPermissao
              ? 'Seu perfil não tem acesso à área de continuidade. Fale com a administração da plataforma.'
              : esc(erro.message)}
          </div>
        </div>`);
      return;
    }

    const podeGerar = Sessao.pode('sistema', 'backup');
    const podeRestaurar = Sessao.pode('sistema', 'restaurar');
    const podeRemover = Sessao.pode('sistema', 'remover');

    setView(`
      <div class="page-header">
        <div>
          <div class="page-title">💾 Backup e Restauração</div>
          <div class="page-sub">Continuidade dos dados — ambiente ${esc(_estado.ambiente)}</div>
        </div>
        ${podeGerar
          ? `<button class="btn btn-primary" onclick="Backup.gerar()">Gerar backup agora</button>`
          : ''}
      </div>
      <div class="content">
        ${cartaoEstado()}
        ${_estado.alertas.length ? cartaoAlertas() : ''}
        ${cartaoHistorico(podeRestaurar, podeRemover)}
        ${cartaoRestauracoes()}
        ${cartaoPolitica()}
      </div>
    `);
  }

  function cartaoEstado() {
    const e = _estado;
    const ultimo = e.ultimo_backup;
    const atraso = e.horas_desde_ultimo;

    const corAtraso = atraso === null ? 'var(--red)'
      : atraso > 48 ? 'var(--red)'
      : atraso > 26 ? 'var(--orange)'
      : 'var(--green)';

    return `
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Backups recuperáveis</div>
          <div class="kpi-value">${e.backups_recuperaveis}</div>
          <div class="kpi-sub">mínimo da política: ${e.politica ? e.politica.minimo_recuperaveis : '—'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Último backup</div>
          <div class="kpi-value" style="color:${corAtraso}">
            ${atraso === null ? 'nunca' : atraso.toFixed(1) + ' h'}
          </div>
          <div class="kpi-sub">${ultimo ? esc(ultimo.rotulo) : 'nenhum backup neste ambiente'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Restauração testada</div>
          <div class="kpi-value" style="color:${e.ultima_restauracao_testada ? 'var(--green)' : 'var(--red)'}">
            ${e.ultima_restauracao_testada ? 'sim' : 'não'}
          </div>
          <div class="kpi-sub">${e.ultima_restauracao_testada
            ? quando(e.ultima_restauracao_testada.iniciada_em)
            : 'backup não testado é hipótese, não garantia'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Proteções</div>
          <div class="kpi-value" style="font-size:15px;line-height:1.5">
            ${e.cifra_configurada ? '✅' : '❌'} cifra<br>
            ${e.agendamento_ativo ? '✅' : '❌'} agendamento<br>
            ${e.copia_redundante_configurada ? '✅' : '❌'} cópia redundante
          </div>
        </div>
      </div>`;
  }

  function cartaoAlertas() {
    return `
      <div class="alert alert-warning" style="margin-top:16px">
        <strong>Atenção à continuidade</strong>
        <ul style="margin:8px 0 0 18px;font-size:13px">
          ${_estado.alertas.map((a) => `<li>${esc(a)}</li>`).join('')}
        </ul>
      </div>`;
  }

  function cartaoHistorico(podeRestaurar, podeRemover) {
    if (!_historico.length) {
      return `
        <div class="section-card" style="margin-top:20px">
          <div class="section-card-head"><div class="section-card-title">Histórico</div></div>
          <div class="section-card-body">
            <p style="color:var(--gray-500);font-size:13px">
              Nenhum backup registrado. Gere o primeiro antes de qualquer operação de risco.
            </p>
          </div>
        </div>`;
    }

    const linhas = _historico.map((b) => `
      <tr>
        <td>
          ${b.protegido ? '🔒 ' : ''}<strong>${esc(b.rotulo)}</strong>
          <div style="font-size:11px;color:var(--gray-500)">
            ${esc(b.tipo)} · ${esc(b.origem)} · por ${esc(b.iniciado_por_nome)}
          </div>
        </td>
        <td>${quando(b.iniciado_em)}</td>
        <td style="text-align:right">${bytes(b.tamanho_bytes)}</td>
        <td style="text-align:right">${b.total_registros === null ? '—' : b.total_registros}</td>
        <td>${selo(b.status)}</td>
        <td style="font-size:11px">${esc(b.classe_retencao)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" title="Detalhes"
                  onclick="Backup.detalhar('${b.id}')">🔎</button>
          <button class="btn btn-ghost btn-sm" title="Conferir checksum"
                  onclick="Backup.verificar('${b.id}')">🧪</button>
          ${podeRestaurar && b.status === 'concluido'
            ? `<button class="btn btn-ghost btn-sm" title="Restaurar"
                       onclick="Backup.avaliarRestauracao('${b.id}')">♻️</button>
               <button class="btn btn-ghost btn-sm" title="Baixar (arquivo cifrado)"
                       onclick="Backup.baixar('${b.id}')">⬇️</button>`
            : ''}
          ${podeRemover
            ? `<button class="btn btn-ghost btn-sm" title="${b.protegido ? 'Desproteger' : 'Proteger'}"
                       onclick="Backup.alternarProtecao('${b.id}', ${!b.protegido})">${b.protegido ? '🔓' : '🔒'}</button>`
            : ''}
        </td>
      </tr>`).join('');

    return `
      <div class="section-card" style="margin-top:20px">
        <div class="section-card-head">
          <div class="section-card-title">Histórico de backups</div>
        </div>
        <div class="section-card-body" style="overflow-x:auto">
          <table class="data-table" style="font-size:13px">
            <thead><tr>
              <th>Backup</th><th>Quando</th>
              <th style="text-align:right">Tamanho</th>
              <th style="text-align:right">Registros</th>
              <th>Status</th><th>Retenção</th><th>Ações</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
      </div>`;
  }

  function cartaoRestauracoes() {
    if (!_restauracoes.length) return '';

    const linhas = _restauracoes.map((r) => {
      const divergencias = Array.isArray(r.divergencias) ? r.divergencias : [];
      return `
        <tr>
          <td>${esc(r.backup_rotulo)}</td>
          <td>${esc(r.destino)}<div style="font-size:11px;color:var(--gray-500)">${esc(r.banco_destino)}</div></td>
          <td>${quando(r.iniciada_em)}</td>
          <td>${esc(r.solicitada_por_nome)}</td>
          <td>${selo(r.status)}
            ${divergencias.length
              ? `<div style="font-size:11px;color:var(--orange)">${divergencias.length} divergência(s)</div>`
              : ''}
            ${r.erro ? `<div style="font-size:11px;color:var(--red)">${esc(String(r.erro).slice(0, 120))}</div>` : ''}
          </td>
          <td>${duracao(r.duracao_ms)}</td>
        </tr>`;
    }).join('');

    return `
      <div class="section-card" style="margin-top:20px">
        <div class="section-card-head">
          <div class="section-card-title">Restaurações</div>
        </div>
        <div class="section-card-body" style="overflow-x:auto">
          <table class="data-table" style="font-size:13px">
            <thead><tr>
              <th>Backup</th><th>Destino</th><th>Quando</th>
              <th>Solicitada por</th><th>Resultado</th><th>Duração</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
          </table>
          <p style="font-size:12px;color:var(--gray-500);margin-top:10px">
            Restaurações recusadas também aparecem aqui: uma tentativa barrada é
            informação, não ruído.
          </p>
        </div>
      </div>`;
  }

  function cartaoPolitica() {
    const p = _estado.politica;
    if (!p) return '';
    return `
      <div class="section-card" style="margin-top:20px">
        <div class="section-card-head"><div class="section-card-title">Política de retenção</div></div>
        <div class="section-card-body">
          <table class="data-table" style="font-size:13px;max-width:520px">
            <tbody>
              <tr><td>Backups diários mantidos</td><td style="text-align:right">${p.diarios_manter}</td></tr>
              <tr><td>Semanais mantidos</td><td style="text-align:right">${p.semanais_manter}</td></tr>
              <tr><td>Mensais mantidos</td><td style="text-align:right">${p.mensais_manter}</td></tr>
              <tr><td>Retenção mínima</td><td style="text-align:right">${p.retencao_minima_dias} dias</td></tr>
              <tr><td>Mínimo de recuperáveis</td><td style="text-align:right">${p.minimo_recuperaveis}</td></tr>
            </tbody>
          </table>
          <p style="font-size:12px;color:var(--gray-500);margin-top:10px">
            A retenção dos backups não se confunde com os 20 anos do dado histórico.
            O histórico vive no banco; o backup existe para recuperação e continuidade.
          </p>
        </div>
      </div>`;
  }

  /* ── Ações ────────────────────────────────────────────────────── */

  async function gerar() {
    openModal('Gerar backup',
      `<div class="form-group">
         <label class="field-label">Motivo (opcional)</label>
         <input type="text" id="bk_motivo" placeholder="Ex.: antes da homologação do Monday" />
       </div>
       <div class="alert alert-info" style="font-size:12px;margin-top:12px">
         O backup inclui o banco inteiro — usuários, permissões, proveniência,
         histórico, vínculos, inconsistências e trilha de auditoria. O arquivo é
         gravado cifrado; a chave nunca sai do servidor.
       </div>
       <div id="bk_resultado" style="margin-top:12px"></div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="bk_confirmar" onclick="Backup._gerar()">Gerar</button>`);
  }

  async function _gerar() {
    const botao = document.getElementById('bk_confirmar');
    const destino = document.getElementById('bk_resultado');
    const motivo = (document.getElementById('bk_motivo').value || '').trim();

    botao.disabled = true;
    botao.textContent = 'Gerando…';
    destino.innerHTML = '<p style="font-size:13px;color:var(--gray-500)">Isso pode levar alguns minutos.</p>';

    try {
      const r = await Sessao.requisitar(API, {
        metodo: 'POST',
        corpo: motivo ? { motivo } : {},
      });
      destino.innerHTML = `
        <div class="alert alert-success" style="font-size:12px">
          ✅ ${esc(r.rotulo)}<br>
          ${bytes(r.tamanho_bytes)} · ${r.total_registros} registro(s) · ${duracao(r.duracao_ms)}<br>
          <span style="font-family:monospace;font-size:11px">${esc(r.checksum)}</span>
        </div>`;
      botao.textContent = 'Concluído';
      botao.onclick = () => { closeModal(); render(); };
      botao.disabled = false;
    } catch (erro) {
      destino.innerHTML = `<div class="alert alert-error" style="font-size:12px">${esc(erro.message)}</div>`;
      botao.disabled = false;
      botao.textContent = 'Tentar novamente';
    }
  }

  async function verificar(id) {
    try {
      const r = await Sessao.requisitar(API + '/' + id + '/verificar');
      openModal('Conferência do arquivo',
        `<table class="data-table" style="font-size:13px">
           <tbody>
             <tr><td>Backup</td><td>${esc(r.rotulo)}</td></tr>
             <tr><td>Arquivo existe</td><td>${r.arquivo_existe ? 'sim' : 'NÃO'}</td></tr>
             <tr><td>Checksum confere</td><td>${r.checksum_confere ? 'sim' : 'NÃO'}</td></tr>
             <tr><td>Tamanho confere</td><td>${r.tamanho_confere ? 'sim' : 'não'}</td></tr>
           </tbody>
         </table>
         <div style="font-family:monospace;font-size:11px;margin-top:10px;word-break:break-all">
           esperado: ${esc(r.esperado || '—')}<br>
           obtido:&nbsp;&nbsp; ${esc(r.obtido || '—')}
         </div>
         <div class="alert alert-${r.checksum_confere ? 'success' : 'error'}" style="font-size:12px;margin-top:12px">
           ${esc(r.mensagem)}
         </div>`,
        `<button class="btn btn-outline" onclick="closeModal(); Backup.render()">Fechar</button>`);
    } catch (erro) {
      toast(erro.message, 'error');
    }
  }

  async function detalhar(id) {
    try {
      const b = await Sessao.requisitar(API + '/' + id);
      const contagens = b.contagens || {};
      const tabelas = Object.entries(contagens)
        .filter(([, n]) => n > 0)
        .sort((a, b2) => b2[1] - a[1]);

      openModal('Detalhes do backup',
        `<table class="data-table" style="font-size:13px">
           <tbody>
             <tr><td>Identificador</td><td style="font-family:monospace;font-size:11px">${esc(b.id)}</td></tr>
             <tr><td>Rótulo</td><td>${esc(b.rotulo)}</td></tr>
             <tr><td>Ambiente</td><td>${esc(b.ambiente)}</td></tr>
             <tr><td>Tipo / origem</td><td>${esc(b.tipo)} · ${esc(b.origem)}</td></tr>
             <tr><td>Início</td><td>${quando(b.iniciado_em)}</td></tr>
             <tr><td>Conclusão</td><td>${quando(b.concluido_em)}</td></tr>
             <tr><td>Duração</td><td>${duracao(b.duracao_ms)}</td></tr>
             <tr><td>Versão da aplicação</td><td>${esc(b.versao_aplicacao)}</td></tr>
             <tr><td>Versão do banco</td><td>PostgreSQL ${esc(b.versao_banco)}</td></tr>
             <tr><td>Versão do esquema</td><td style="font-family:monospace;font-size:11px">${esc(String(b.versao_esquema).slice(0, 16))}…</td></tr>
             <tr><td>Migrations</td><td>${(b.migracoes || []).length}</td></tr>
             <tr><td>Tamanho</td><td>${bytes(b.tamanho_bytes)} (${bytes(b.tamanho_claro_bytes)} sem cifra)</td></tr>
             <tr><td>Cifra</td><td>${esc(b.algoritmo_cifra || 'aes-256-gcm')}</td></tr>
             <tr><td>Local</td><td style="font-size:11px">${esc(b.local_armazenamento || '—')}</td></tr>
             <tr><td>Cópia redundante</td><td style="font-size:11px">${esc(b.copia_redundante || 'não configurada')}</td></tr>
             <tr><td>Retenção</td><td>${esc(b.classe_retencao)}${b.protegido ? ' · protegido' : ''}</td></tr>
             <tr><td>Verificado em</td><td>${quando(b.verificado_em)}</td></tr>
             <tr><td>Restauração testada</td><td>${quando(b.restauracao_testada_em)}</td></tr>
             <tr><td>Status</td><td>${selo(b.status)}</td></tr>
             ${b.erro ? `<tr><td>Erro</td><td style="color:var(--red)">${esc(b.erro)}</td></tr>` : ''}
           </tbody>
         </table>
         <div style="font-family:monospace;font-size:11px;margin-top:10px;word-break:break-all">
           checksum: ${esc(b.checksum || '—')}
         </div>
         ${tabelas.length ? `
           <details style="margin-top:12px">
             <summary style="cursor:pointer;font-size:13px">Conteúdo por tabela (${tabelas.length})</summary>
             <table class="data-table" style="font-size:12px;margin-top:8px">
               <tbody>${tabelas.map(([t, n]) =>
                 `<tr><td>${esc(t)}</td><td style="text-align:right">${n}</td></tr>`).join('')}</tbody>
             </table>
           </details>` : ''}`,
        `<button class="btn btn-outline" onclick="closeModal()">Fechar</button>`);
    } catch (erro) {
      toast(erro.message, 'error');
    }
  }

  function baixar(id) {
    // Navegação direta: o cookie de sessão acompanha, e o navegador cuida do
    // arquivo grande sem carregá-lo na memória do JavaScript.
    window.location.href = API + '/' + id + '/baixar';
    toast('O arquivo baixado está cifrado. Sem a chave do servidor, não abre.', 'info');
  }

  async function alternarProtecao(id, protegido) {
    try {
      await Sessao.requisitar(API + '/' + id + '/protecao', {
        metodo: 'PATCH',
        corpo: { protegido },
      });
      toast(protegido ? 'Backup protegido contra exclusão.' : 'Proteção removida.', 'success');
      render();
    } catch (erro) {
      toast(erro.message, 'error');
    }
  }

  /* ── Restauração: avaliar antes de confirmar ──────────────────── */

  async function avaliarRestauracao(id, destino) {
    const alvo = destino || 'isolado';
    openModal('Avaliando restauração', '<p style="color:var(--gray-500)">Conferindo o backup…</p>', '');

    let a;
    try {
      a = await Sessao.requisitar(API + '/' + id + '/avaliar', {
        metodo: 'POST',
        corpo: { destino: alvo },
      });
    } catch (erro) {
      openModal('Restauração', `<div class="alert alert-error">${esc(erro.message)}</div>`,
        `<button class="btn btn-outline" onclick="closeModal()">Fechar</button>`);
      return;
    }

    const marca = (ok) => ok ? '<span style="color:var(--green)">✓</span>' : '<span style="color:var(--red)">✗</span>';

    const corpo = `
      <div style="font-size:13px">
        <table class="data-table" style="font-size:13px">
          <tbody>
            <tr><td>Backup</td><td>${esc(a.backup.rotulo)}</td></tr>
            <tr><td>Origem</td><td>${esc(a.backup.ambiente)} · ${quando(a.backup.iniciado_em)}</td></tr>
            <tr><td>Destino</td><td><strong>${esc(a.destino)}</strong> — ${esc(a.banco_destino)}</td></tr>
          </tbody>
        </table>

        <div style="margin-top:14px">
          <strong>Validações</strong>
          <div style="margin-top:6px">
            ${marca(a.checksum.confere)} checksum — ${esc(a.checksum.mensagem)}<br>
            ${marca(a.esquema.compativel)} esquema e migrations<br>
            ${marca(a.ambiente.mesmo)} ambiente — ${esc(a.ambiente.alerta || 'mesmo ambiente')}
          </div>
        </div>

        <div class="alert alert-${a.destino === 'producao' ? 'danger' : 'info'}" style="margin-top:14px;font-size:12px">
          <strong>Impacto</strong><br>${esc(a.impacto.texto)}
        </div>

        ${a.impacto.tabelas_que_perdem.length ? `
          <details style="margin-top:8px">
            <summary style="cursor:pointer;font-size:13px">
              Tabelas que perdem registros (${a.impacto.tabelas_que_perdem.length})
            </summary>
            <table class="data-table" style="font-size:12px;margin-top:8px">
              <thead><tr><th>Tabela</th><th style="text-align:right">Hoje</th><th style="text-align:right">No backup</th></tr></thead>
              <tbody>${a.impacto.tabelas_que_perdem.map((t) =>
                `<tr><td>${esc(t.tabela)}</td><td style="text-align:right">${t.atual}</td><td style="text-align:right">${t.no_backup}</td></tr>`).join('')}
              </tbody>
            </table>
          </details>` : ''}

        ${a.esquema.ressalvas.length ? `
          <div class="alert alert-warning" style="margin-top:12px;font-size:12px">
            <strong>Ressalvas</strong>
            <ul style="margin:6px 0 0 18px">${a.esquema.ressalvas.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          </div>` : ''}

        ${a.impedimentos.length ? `
          <div class="alert alert-error" style="margin-top:12px;font-size:12px">
            <strong>Impedimentos</strong>
            <ul style="margin:6px 0 0 18px">${a.impedimentos.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
          </div>` : ''}

        ${a.pode_prosseguir && a.confirmacao_exigida ? `
          <div class="form-group" style="margin-top:14px">
            <label class="field-label">
              Para confirmar, digite: <code>${esc(a.confirmacao_exigida)}</code>
            </label>
            <input type="text" id="rs_confirmacao" autocomplete="off" />
          </div>
          <div class="form-group">
            <label class="field-label">Justificativa (obrigatória)</label>
            <textarea id="rs_justificativa" rows="3"
                      placeholder="Por que o banco em uso precisa ser substituído?"></textarea>
          </div>` : ''}

        <div id="rs_resultado" style="margin-top:12px"></div>
      </div>`;

    const rodape = `
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
      ${alvo === 'isolado' && a.pode_prosseguir
        ? `<button class="btn btn-outline" onclick="Backup.avaliarRestauracao('${id}','producao')">
             Ver impacto em produção
           </button>` : ''}
      ${a.pode_prosseguir
        ? `<button class="btn ${alvo === 'producao' ? 'btn-danger' : 'btn-primary'}" id="rs_confirmar"
                   onclick="Backup._restaurar('${id}','${alvo}')">
             ${alvo === 'producao' ? 'Substituir o banco em uso' : 'Restaurar em banco isolado'}
           </button>` : ''}`;

    openModal(alvo === 'producao' ? '⚠️ Restaurar sobre o banco em uso' : 'Restaurar em banco isolado',
      corpo, rodape);
  }

  async function _restaurar(id, destino) {
    const botao = document.getElementById('rs_confirmar');
    const alvo = document.getElementById('rs_resultado');
    const campoConfirmacao = document.getElementById('rs_confirmacao');
    const campoJustificativa = document.getElementById('rs_justificativa');

    botao.disabled = true;
    botao.textContent = 'Restaurando…';
    alvo.innerHTML = `<p style="font-size:13px;color:var(--gray-500)">
      ${destino === 'producao'
        ? 'Gerando o backup preventivo do estado atual antes de restaurar…'
        : 'Criando o banco isolado e restaurando…'}
    </p>`;

    try {
      const r = await Sessao.requisitar(API + '/' + id + '/restaurar', {
        metodo: 'POST',
        corpo: {
          destino,
          confirmacao: campoConfirmacao ? campoConfirmacao.value : undefined,
          justificativa: campoJustificativa ? campoJustificativa.value : undefined,
        },
      });

      const i = r.integridade || {};
      alvo.innerHTML = `
        <div class="alert alert-${r.status === 'concluida' ? 'success' : 'warning'}" style="font-size:12px">
          <strong>${r.status === 'concluida' ? '✅ Restauração concluída' : '⚠️ Concluída com ressalvas'}</strong><br>
          banco: ${esc(r.banco_destino)} · ${duracao(r.duracao_ms)}
        </div>
        <table class="data-table" style="font-size:12px;margin-top:8px">
          <tbody>
            <tr><td>Tabelas</td><td style="text-align:right">${i.tabelas}</td></tr>
            <tr><td>Registros restaurados</td><td style="text-align:right">${i.total_restaurado}</td></tr>
            <tr><td>Usuários ativos</td><td style="text-align:right">${i.usuarios_ativos}</td></tr>
            <tr><td>Permissões de perfil</td><td style="text-align:right">${i.permissoes_perfil}</td></tr>
            <tr><td>Trilha de auditoria</td><td style="text-align:right">${i.registros_auditoria}</td></tr>
            <tr><td>Tabelas de negócio</td><td style="text-align:right">${i.tabelas_de_negocio}</td></tr>
          </tbody>
        </table>
        ${r.divergencias.length ? `
          <div class="alert alert-warning" style="margin-top:8px;font-size:12px">
            <strong>Divergências</strong>
            <ul style="margin:6px 0 0 18px">${r.divergencias.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
          </div>` : ''}
        ${r.backup_preventivo ? `
          <div class="alert alert-info" style="margin-top:8px;font-size:12px">
            Estado anterior salvo em <strong>${esc(r.backup_preventivo.rotulo)}</strong>.
          </div>` : ''}
        ${r.como_reverter ? `<p style="font-size:12px;margin-top:8px">${esc(r.como_reverter)}</p>` : ''}`;

      botao.textContent = 'Concluído';
      botao.onclick = () => { closeModal(); render(); };
      botao.disabled = false;
    } catch (erro) {
      const impedimentos = (erro.detalhe && erro.detalhe.impedimentos) || [];
      alvo.innerHTML = `
        <div class="alert alert-error" style="font-size:12px">
          ${esc(erro.message)}
          ${impedimentos.length
            ? `<ul style="margin:6px 0 0 18px">${impedimentos.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
            : ''}
        </div>`;
      botao.disabled = false;
      botao.textContent = 'Tentar novamente';
    }
  }

  return {
    render, gerar, _gerar, verificar, detalhar, baixar,
    alternarProtecao, avaliarRestauracao, _restaurar,
  };
})();
