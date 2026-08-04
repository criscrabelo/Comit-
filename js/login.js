/* ===== TELA DE ENTRADA =====
   Sem sessão, não há dado. Esta tela existe porque a fonte da verdade passou a
   ser o servidor: antes, a plataforma abria direto no que estava no navegador.

   O token nunca chega ao JavaScript — fica num cookie httpOnly. Aqui só
   trafegam usuário e senha, uma vez, no envio.
================================================================ */

const Login = (() => {
  'use strict';

  function _escapar(t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mostrar(motivo) {
    document.body.classList.add('sem-sessao');

    const aviso = motivo
      ? `<div class="alert alert-warning" style="margin-bottom:16px">${_escapar(motivo)}</div>`
      : '';

    const alvo = document.getElementById('view');
    if (!alvo) return;

    alvo.innerHTML = `
      <div class="content" style="max-width:420px;margin:8vh auto">
        <div class="section-card">
          <div class="section-card-head">
            <div class="section-card-title">Entrar na plataforma</div>
          </div>
          <div class="section-card-body">
            ${aviso}
            <form id="form-login" autocomplete="on">
              <div class="form-group">
                <label class="field-label" for="login-usuario">Usuário</label>
                <input type="text" id="login-usuario" name="username"
                       autocomplete="username" autofocus required />
              </div>
              <div class="form-group mt-2">
                <label class="field-label" for="login-senha">Senha</label>
                <input type="password" id="login-senha" name="password"
                       autocomplete="current-password" required />
              </div>
              <div id="login-erro" style="margin-top:12px"></div>
              <button class="btn btn-primary mt-2" id="login-enviar" type="submit"
                      style="width:100%">Entrar</button>
            </form>
          </div>
        </div>
      </div>`;

    document.getElementById('form-login').addEventListener('submit', _enviar);
  }

  async function _enviar(evento) {
    evento.preventDefault();

    const botao = document.getElementById('login-enviar');
    const destino = document.getElementById('login-erro');
    const usuario = document.getElementById('login-usuario').value.trim();
    const senha = document.getElementById('login-senha').value;

    botao.disabled = true;
    botao.textContent = 'Entrando…';
    destino.innerHTML = '';

    try {
      await Sessao.entrar(usuario, senha);
      document.body.classList.remove('sem-sessao');
      // Recarrega para que a inicialização inteira aconteça com sessão —
      // é mais simples de auditar do que remontar o estado pela metade.
      location.reload();
    } catch (erro) {
      // A mensagem do servidor é a mesma para usuário inexistente e senha
      // errada, de propósito. Não a especializamos aqui.
      destino.innerHTML =
        `<div class="alert alert-error" style="font-size:13px">${_escapar(erro.message)}</div>`;
      botao.disabled = false;
      botao.textContent = 'Entrar';
      document.getElementById('login-senha').value = '';
      document.getElementById('login-senha').focus();
    }
  }

  return { mostrar };
})();
