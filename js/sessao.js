/* ===== SESSÃO E TRANSPORTE =====
   Toda chamada à API passa por aqui.

   O token de sessão NÃO fica no navegador ao alcance do JavaScript: o servidor
   o entrega num cookie httpOnly, e este arquivo nunca o lê nem o guarda.
   `Sessao.usuario()` devolve nome, perfil e escopo — informação de tela — e
   nada que sirva para autenticar.

   As permissões que este módulo expõe servem para montar o menu. Quem decide
   é o servidor, a cada requisição.
================================================================ */

const Sessao = (() => {
  'use strict';

  /** Cabeçalho que o servidor exige nas escritas: barra CSRF. */
  const CABECALHO_APP = 'X-Patrono-App';

  let _usuario = null;
  let _permissoes = new Set();
  let _escopo = null;

  /* ── Erro de API, com o suficiente para a tela reagir ─────────── */
  class ErroApi extends Error {
    constructor(status, codigo, mensagem, detalhe) {
      super(mensagem);
      this.name = 'ErroApi';
      this.status = status;
      this.codigo = codigo;
      this.detalhe = detalhe || {};
    }

    /** Falha de rede: não sabemos se o servidor recebeu. */
    get semConexao() { return this.status === 0; }
    get semSessao() { return this.status === 401; }
    get semPermissao() { return this.status === 403; }
    get naoEncontrado() { return this.status === 404; }
    get conflito() { return this.status === 409; }
    get parcial() { return this.status === 207; }
  }

  /**
   * Requisição à API.
   *
   * Distingue os casos que a interface precisa tratar de forma diferente —
   * 401, 403, 404, 409 e falha de rede não são "deu erro".
   */
  async function requisitar(caminho, opcoes) {
    const cfg = opcoes || {};
    const metodo = cfg.metodo || (cfg.corpo ? 'POST' : 'GET');
    const cabecalhos = {};

    if (cfg.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    // Só nas escritas: o servidor exige e é o que impede um formulário de
    // outro site de usar o cookie da sessão.
    if (metodo !== 'GET' && metodo !== 'HEAD') cabecalhos[CABECALHO_APP] = '1';

    let resposta;
    try {
      resposta = await fetch(caminho, {
        method: metodo,
        credentials: 'same-origin',
        headers: cabecalhos,
        body: cfg.corpo === undefined ? undefined : JSON.stringify(cfg.corpo),
        signal: cfg.signal,
      });
    } catch (erro) {
      throw new ErroApi(0, 'sem_conexao',
        'Sem conexão com o servidor. Nada foi gravado.', { causa: erro.message });
    }

    // 204 e afins não têm corpo.
    const bruto = await resposta.text();
    let dados = null;
    if (bruto) {
      try { dados = JSON.parse(bruto); }
      catch (e) { dados = null; }
    }

    if (!resposta.ok) {
      const erro = (dados && dados.erro) || {};
      throw new ErroApi(
        resposta.status,
        erro.codigo || 'erro_' + resposta.status,
        erro.mensagem || `Falha na operação (HTTP ${resposta.status}).`,
        erro.detalhe || {},
      );
    }

    // 207 é sucesso parcial: quem chamou precisa saber.
    if (resposta.status === 207 && dados) dados._parcial = true;
    return dados;
  }

  /* ── Identidade ───────────────────────────────────────────────── */
  async function carregar() {
    const r = await requisitar('/api/auth/eu');
    _usuario = r.usuario;
    _permissoes = new Set(r.permissoes || []);
    _escopo = r.escopo || null;
    return _usuario;
  }

  async function entrar(usuario, senha) {
    await requisitar('/api/auth/login', {
      metodo: 'POST',
      corpo: { usuario: usuario, senha: senha },
    });
    // O token ficou no cookie httpOnly. Não há nada para guardar aqui.
    return carregar();
  }

  async function sair() {
    try { await requisitar('/api/auth/logout', { metodo: 'POST' }); }
    finally {
      _usuario = null;
      _permissoes = new Set();
      _escopo = null;
    }
  }

  /**
   * Verifica se há sessão. Devolve o usuário ou null.
   * Não lança: a ausência de sessão é um estado normal, não um erro.
   */
  async function verificar() {
    try { return await carregar(); }
    catch (erro) {
      if (erro.semSessao) return null;
      throw erro;
    }
  }

  function usuario()   { return _usuario; }
  function escopo()    { return _escopo; }
  function pode(modulo, acao) { return _permissoes.has(modulo + ':' + acao); }
  function permissoes() { return [..._permissoes]; }

  return {
    ErroApi,
    requisitar, entrar, sair, verificar, carregar,
    usuario, escopo, pode, permissoes,
  };
})();
