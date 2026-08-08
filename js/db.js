/* ===== DB — ADAPTADOR SOBRE A API =====

   A fonte da verdade é o PostgreSQL. Este arquivo existe para que `views.js` e
   `comite.js` continuem chamando a mesma interface de sempre enquanto os dados
   passam a viver no servidor.

       views.js ──► DB (aqui) ──► /api/dados ──► PostgreSQL

   O que mudou, e por quê:

   1. NENHUM DADO DE NEGÓCIO NO NAVEGADOR. O cache abaixo é uma variável em
      memória. Recarregar a página o esvazia, e ele volta a ser preenchido pela
      API. Não há `localStorage.setItem` de dado de negócio em lugar nenhum
      deste arquivo — há um teste que falha se voltar a haver.

   2. LEITURA CONTINUA SÍNCRONA. `getAll`, `getById`, `where` e `forComite` leem
      o cache. Era a única forma de inverter a fonte da verdade sem reescrever
      as onze telas de uma vez.

   3. ESCRITA É ASSÍNCRONA E HONESTA. `insert`, `update` e `remove` aplicam a
      mudança no cache e a enviam à API. Se o servidor recusar, a mudança é
      DESFEITA e a tela é redesenhada com o motivo. Nada fica "salvo" na tela
      sem estar salvo no banco.

   4. CONCORRÊNCIA NÃO É SILENCIOSA. Toda edição informa a versão que leu. Se
      alguém alterou no intervalo, o servidor devolve 409 e a tela mostra o
      conflito em vez de sobrescrever.

   5. SEM CONEXÃO, NADA É FINGIDO. A operação é recusada com estado explícito.
      Não há fila oculta que finja gravação concluída.

   Preferências de interface (mês aberto, tema) continuam no navegador, pelo
   catálogo de `Migracao` — são escolha de visualização, não dado de negócio.
================================================================ */

const DB = (() => {
  'use strict';

  const API = '/api/dados';

  /** Entidades que a interface conhece. Espelha ENTIDADES no servidor. */
  const TABLES = [
    'comites', 'empreendimentos', 'fatos', 'notificacoes', 'contratos',
    'retomadas', 'distratos', 'processos', 'unidades', 'riscos', 'regulatorios',
    'projetos',
  ];

  /* ── Cache de trabalho: EM MEMÓRIA, nunca persistido ─────────── */
  const _cache = {};
  TABLES.forEach((t) => { _cache[t] = []; });

  /* ── Estado observável pela interface ────────────────────────── */
  const ESTADOS = {
    CARREGANDO: 'carregando',
    PRONTO: 'pronto',
    SALVANDO: 'salvando',
    SALVO: 'salvo',
    ERRO: 'erro',
    SEM_CONEXAO: 'sem_conexao',
    SEM_PERMISSAO: 'sem_permissao',
    SEM_SESSAO: 'sem_sessao',
    CONFLITO: 'conflito',
    SEM_DADOS: 'sem_dados',
    MIGRACAO_PENDENTE: 'migracao_pendente',
    SINCRONIZACAO_PARCIAL: 'sincronizacao_parcial',
  };

  let _estado = ESTADOS.CARREGANDO;
  let _detalheEstado = '';
  let _comiteAtivo = null;
  let _truncadas = [];
  const _ouvintes = [];

  function _definirEstado(estado, detalhe) {
    _estado = estado;
    _detalheEstado = detalhe || '';
    _ouvintes.forEach((fn) => { try { fn(estado, _detalheEstado); } catch (e) { /* ouvinte não derruba o app */ } });
  }

  function aoMudarEstado(fn) { _ouvintes.push(fn); return () => {
    const i = _ouvintes.indexOf(fn); if (i >= 0) _ouvintes.splice(i, 1);
  }; }

  function estado() { return { nome: _estado, detalhe: _detalheEstado, pendentes: _fila.length + (_processando ? 1 : 0) }; }

  /* ── Utilidades ───────────────────────────────────────────────── */

  /**
   * Identificador provisório, usado só até o servidor devolver o seu.
   * O `id` definitivo é o uuid do PostgreSQL.
   */
  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'tmp-' + window.crypto.randomUUID();
    }
    return 'tmp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  const ehProvisorio = (id) => typeof id === 'string' && id.startsWith('tmp-');

  /** Remove os metadados do adaptador antes de enviar ao servidor. */
  function semMeta(registro) {
    const saida = {};
    Object.keys(registro || {}).forEach((k) => {
      if (k === 'id' || k === 'versao' || k.startsWith('_')) return;
      saida[k] = registro[k];
    });
    return saida;
  }

  function _linhas(tabela) {
    if (!_cache[tabela]) _cache[tabela] = [];
    return _cache[tabela];
  }

  function _indice(tabela, id) {
    return _linhas(tabela).findIndex((r) => r.id === id);
  }

  function _trocar(tabela, id, novo) {
    const i = _indice(tabela, id);
    if (i >= 0) _linhas(tabela)[i] = novo;
    else _linhas(tabela).push(novo);
  }

  function _tirar(tabela, id) {
    const i = _indice(tabela, id);
    if (i >= 0) _linhas(tabela).splice(i, 1);
  }

  /* ── Equivalência entre id provisório e id do banco ───────────────
     `monday-sync.js` cria um empreendimento e, na mesma volta, insere unidades
     que o referenciam — antes de o servidor ter devolvido o id real. Sem esta
     tabela de equivalência, o filho seria enviado apontando para um id que não
     existe no banco, e a chave estrangeira recusaria.                        */
  const _equivalencias = {};

  function _reapontar(provisorio, real) {
    _equivalencias[provisorio] = real;
    // Atualiza também o que já está no cache, para a tela não continuar
    // exibindo vínculo por um id que deixou de existir.
    TABLES.forEach((t) => {
      _linhas(t).forEach((r) => {
        Object.keys(r).forEach((k) => {
          if (r[k] === provisorio && k !== 'id') r[k] = real;
        });
      });
    });
  }

  function _resolverCorpo(corpo) {
    if (!corpo) return corpo;
    const saida = {};
    Object.keys(corpo).forEach((k) => {
      const v = corpo[k];
      saida[k] = (typeof v === 'string' && _equivalencias[v]) ? _equivalencias[v] : v;
    });
    return saida;
  }

  function _redesenhar() {
    if (typeof Router !== 'undefined' && Router.current) {
      try { Router.navigate(Router.current); } catch (e) { /* rota inválida não derruba */ }
    }
  }

  function _avisar(mensagem, tipo) {
    if (typeof toast === 'function') toast(mensagem, tipo || 'error');
    else console.warn('[DB]', mensagem);
  }

  /* ── Fila de escrita ──────────────────────────────────────────────
     Serial de propósito: duas gravações concorrentes sobre o mesmo
     registro produziriam versões cruzadas e um 409 que a pessoa não
     causou. Operações de criação seguidas, na mesma entidade, são
     agrupadas num lote — é o que torna a sincronização do Monday uma
     requisição em vez de centenas.                                    */

  const _fila = [];
  let _processando = false;

  function _enfileirar(operacao) {
    _fila.push(operacao);
    if (!_processando) _processar();
    return operacao.promessa;
  }

  /**
   * O corpo ainda cita algum id provisório que este mesmo lote vai criar?
   *
   * `monday-sync.js` cria o empreendimento e, na volta seguinte, as unidades e
   * processos que o referenciam. Se os dois caírem no mesmo lote, o filho é
   * enviado apontando para um `tmp-...` que ainda não virou uuid — e o
   * PostgreSQL recusa com "sintaxe de entrada inválida para tipo uuid".
   * Foi exatamente o que derrubou a primeira sincronização real.
   *
   * A equivalência só existe DEPOIS que o lote anterior volta do servidor.
   * Por isso a checagem é feita no fechamento do lote, e não no envio.
   */
  function _citaProvisorioPendente(corpo) {
    if (!corpo) return false;
    return Object.keys(corpo).some((k) => {
      const v = corpo[k];
      return typeof v === 'string' && ehProvisorio(v) && !_equivalencias[v];
    });
  }

  function _proximoLote() {
    const primeira = _fila.shift();
    // Comitê cria competência junto e é sempre um por vez — o servidor recusa
    // comitê em lote de propósito.
    if (primeira.tipo !== 'criar' || primeira.tabela === 'comites') return [primeira];

    const lote = [primeira];
    while (_fila.length && _fila[0].tipo === 'criar' && _fila[0].tabela === primeira.tabela && lote.length < 500) {
      // Uma operação que ainda aponta para id provisório não resolvido fecha o
      // lote aqui. Ela entra no próximo, quando a equivalência já existir.
      if (_citaProvisorioPendente(_fila[0].corpo)) break;
      lote.push(_fila.shift());
    }
    return lote;
  }

  async function _processar() {
    _processando = true;

    while (_fila.length) {
      const lote = _proximoLote();
      try {
        if (lote.length > 1) await _executarLoteDeCriacao(lote);
        else await lote[0].executar();

        lote.forEach((op) => op.resolver());
        // Criação troca o id provisório (`tmp-...`) pelo definitivo no cache
        // (_trocar/_reapontar), mas a tela já tinha desenhado botões com o id
        // provisório embutido no onclick. Sem redesenhar aqui, esses botões
        // continuam apontando para um id que não existe mais assim que o
        // servidor confirma — editar ou excluir o registro recém-criado falha
        // até a próxima navegação. Atualização e exclusão não trocam id;
        // redesenhar sempre seria refazer trabalho sem motivo.
        if (lote.some((op) => op.tipo === 'criar')) _redesenhar();
        if (!_fila.length) _definirEstado(ESTADOS.SALVO);
        else _definirEstado(ESTADOS.SALVANDO);
      } catch (erro) {
        // Desfaz tudo o que este lote havia aplicado ao cache.
        lote.forEach((op) => { try { op.desfazer(); } catch (e) { /* ignora */ } });
        _tratarFalha(erro, lote);
        lote.forEach((op) => op.rejeitar(erro));
      }
    }

    _processando = false;
  }

  async function _executarLoteDeCriacao(lote) {
    const resposta = await Sessao.requisitar(API + '/' + lote[0].tabela + '/lote', {
      metodo: 'POST',
      corpo: { registros: lote.map((op) => _resolverCorpo(op.corpo)) },
    });
    const criados = (resposta && resposta.registros) || [];
    lote.forEach((op, i) => {
      if (criados[i]) {
        _trocar(op.tabela, op.idProvisorio, criados[i]);
        _reapontar(op.idProvisorio, criados[i].id);
      } else _tirar(op.tabela, op.idProvisorio);
    });
  }

  /**
   * Traduz a falha em estado de tela.
   *
   * Cada caso tem tratamento próprio porque cada um pede uma ação diferente da
   * pessoa: reconectar, pedir acesso, recarregar e comparar, ou entrar de novo.
   */
  function _tratarFalha(erro, lote) {
    const onde = lote.length > 1
      ? lote.length + ' registro(s) de ' + lote[0].tabela
      : lote[0].tabela;

    if (erro.semConexao) {
      _definirEstado(ESTADOS.SEM_CONEXAO, onde);
      _avisar('Sem conexão com o servidor. A alteração NÃO foi gravada e foi desfeita na tela.');
    } else if (erro.semSessao) {
      _definirEstado(ESTADOS.SEM_SESSAO, onde);
      _avisar('Sua sessão expirou. Entre novamente — nada foi gravado.');
    } else if (erro.semPermissao) {
      _definirEstado(ESTADOS.SEM_PERMISSAO, onde);
      _avisar('Seu perfil não permite esta operação. Nada foi gravado.');
    } else if (erro.conflito) {
      _definirEstado(ESTADOS.CONFLITO, onde);
      // O servidor devolve o registro atual: traz para o cache, para a pessoa
      // ver com o que está conflitando em vez de perder o que digitou no vazio.
      const atual = erro.detalhe && erro.detalhe.registro;
      if (atual && lote[0].tabela) _trocar(lote[0].tabela, atual.id, atual);
      _avisar(erro.message, 'warning');
    } else if (erro.naoEncontrado) {
      _definirEstado(ESTADOS.ERRO, onde);
      _avisar('Este registro não existe mais no servidor. A tela foi atualizada.');
    } else {
      _definirEstado(ESTADOS.ERRO, onde);
      _avisar(erro.message || 'Falha ao gravar. Nada foi alterado no servidor.');
    }

    _redesenhar();
  }

  /** Cria a operação com promessa própria, para quem quiser aguardar. */
  function _operacao(tipo, tabela, corpo) {
    const op = { tipo: tipo, tabela: tabela, corpo: corpo };
    op.promessa = new Promise((resolver, rejeitar) => {
      op.resolver = resolver;
      op.rejeitar = rejeitar;
    });
    // Rejeição já tratada em _tratarFalha; sem este catch o navegador registra
    // "unhandled rejection" para quem chamou de forma síncrona.
    op.promessa.catch(() => {});
    return op;
  }

  /* ── Carga ────────────────────────────────────────────────────── */

  async function _carregar(comiteId) {
    _definirEstado(ESTADOS.CARREGANDO);

    const caminho = API + '/carga-inicial' + (comiteId ? '?comite_id=' + encodeURIComponent(comiteId) : '');
    const resposta = await Sessao.requisitar(caminho);

    TABLES.forEach((t) => {
      _cache[t] = (resposta.entidades && resposta.entidades[t]) || [];
    });
    _comiteAtivo = resposta.comite_id || null;
    _truncadas = resposta.truncadas || [];

    if (_truncadas.length) {
      _definirEstado(ESTADOS.SINCRONIZACAO_PARCIAL, _truncadas.join(', '));
    } else if (TABLES.every((t) => _cache[t].length === 0)) {
      _definirEstado(ESTADOS.SEM_DADOS);
    } else {
      _definirEstado(ESTADOS.PRONTO);
    }

    return resposta;
  }

  /**
   * Leitura dupla, só para DETECTAR pendência de migração.
   *
   * Enquanto puder existir dado de versão anterior neste navegador, vale a pena
   * comparar as quantidades. O localStorage nunca é usado como fonte: se
   * divergir, o servidor registra uma inconsistência e a pessoa decide. Nada é
   * apagado, nada é sobrescrito, dos dois lados.
   */
  async function _conferirLegado() {
    if (typeof Migracao === 'undefined' || !Migracao.existemDadosLegados()) return;

    _definirEstado(ESTADOS.MIGRACAO_PENDENTE);

    const divergencias = [];
    for (const tabela of TABLES) {
      const local = Migracao.contarLegado(tabela);
      if (local === null) continue;
      const servidor = _linhas(tabela).length;
      if (local !== servidor) divergencias.push({ tabela: tabela, local: local, servidor: servidor });
    }

    for (const d of divergencias) {
      try {
        await Sessao.requisitar(API + '/divergencia-local', {
          metodo: 'POST',
          corpo: {
            entidade: d.tabela,
            registros_no_navegador: d.local,
            registros_no_servidor: d.servidor,
          },
        });
      } catch (erro) {
        // Falta de permissão para registrar inconsistência não pode impedir a
        // pessoa de usar o sistema. Fica no console e na próxima carga.
        console.info('[DB] divergência não registrada:', erro.message);
      }
    }

    if (divergencias.length) {
      console.warn('[DB] Dados de versão anterior divergem do servidor:', divergencias);
    }
  }

  /**
   * Inicialização.
   *
   * Nunca rejeita: o bootstrap de `app.js` depende dela para desenhar alguma
   * coisa, e uma promessa rejeitada deixaria a tela em branco sem explicação.
   * O motivo da falha fica no estado.
   */
  const ready = (async () => {
    try {
      const usuario = await Sessao.verificar();
      if (!usuario) {
        _definirEstado(ESTADOS.SEM_SESSAO);
        return { autenticado: false };
      }

      const preferido = typeof Migracao !== 'undefined'
        ? Migracao.lerPreferencia('comiteAtivo')
        : null;

      await _carregar(preferido);

      // Se a preferência apontava para um comitê que não existe mais, o
      // servidor devolveu o recorte vazio: cai para o comitê mais recente.
      if (preferido && !getById('comites', preferido)) {
        const primeiro = getComites()[0];
        if (primeiro) await trocarComite(primeiro.id);
      }

      await _conferirLegado();
      return { autenticado: true };
    } catch (erro) {
      if (erro.semConexao) _definirEstado(ESTADOS.SEM_CONEXAO);
      else if (erro.semSessao) _definirEstado(ESTADOS.SEM_SESSAO);
      else _definirEstado(ESTADOS.ERRO, erro.message);
      console.error('[DB] falha na carga inicial:', erro.message);
      return { autenticado: false, erro: erro.message };
    }
  })();

  /** Recarrega do servidor. Usado na troca de mês e ao voltar para a aba. */
  async function recarregar() {
    await _aguardarFila();
    await _carregar(_comiteAtivo);
  }

  function _aguardarFila() {
    if (!_processando && !_fila.length) return Promise.resolve();
    return new Promise((r) => {
      const checar = () => {
        if (!_processando && !_fila.length) r();
        else setTimeout(checar, 50);
      };
      checar();
    });
  }

  // Ao voltar para a aba, recarrega — outra pessoa pode ter alterado. Não
  // recarrega durante sincronização do Monday nem com gravação pendente: seria
  // sobrescrever o cache com dado que ainda não chegou ao banco.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || window.__SYNC_ACTIVE) return;
    if (_fila.length || _processando) return;
    if (_estado === ESTADOS.SEM_SESSAO) return;

    recarregar().then(_redesenhar).catch((erro) => {
      console.info('[DB] recarga adiada:', erro.message);
    });
  });

  /* ── Leitura (síncrona, sobre o cache) ────────────────────────── */

  function getAll(tabela) { return _linhas(tabela).slice(); }

  function getById(tabela, id) {
    return _linhas(tabela).find((r) => r.id === id) || null;
  }

  function where(tabela, predicado) { return _linhas(tabela).filter(predicado); }

  function forComite(tabela, comiteId) {
    return where(tabela, (r) => r.comite_id === comiteId);
  }

  function getComites() {
    return getAll('comites').sort((a, b) => String(b.ref).localeCompare(String(a.ref)));
  }

  function getEmpreendimentos() {
    return getAll('empreendimentos')
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
  }

  function getActiveComite() {
    if (_comiteAtivo) {
      const c = getById('comites', _comiteAtivo);
      if (c) return c;
    }
    return getComites()[0] || null;
  }

  function comiteRef(comite) { return comite ? comite.ref : null; }

  /** Consulta direta ao servidor, para quem precisa do dado fresco. */
  async function consultar(tabela, id) {
    const registro = await Sessao.requisitar(API + '/' + tabela + '/' + id);
    _trocar(tabela, id, registro);
    return registro;
  }

  /* ── Escrita (assíncrona por baixo, compatível por cima) ──────── */

  function insert(tabela, registro) {
    const corpo = semMeta(registro);
    const provisorio = Object.assign({}, registro, {
      id: registro && registro.id ? registro.id : uid(),
      versao: 0,
      _pendente: true,
    });
    // Um id vindo da tela é provisório do mesmo jeito: quem manda no
    // identificador é o banco.
    if (!ehProvisorio(provisorio.id)) provisorio.id = uid();

    _linhas(tabela).push(provisorio);
    _definirEstado(ESTADOS.SALVANDO, tabela);

    const op = _operacao('criar', tabela, corpo);
    op.idProvisorio = provisorio.id;
    op.desfazer = () => _tirar(tabela, provisorio.id);
    op.executar = async () => {
      const salvo = await Sessao.requisitar(API + '/' + tabela, {
        metodo: 'POST',
        corpo: _resolverCorpo(corpo),
      });
      _trocar(tabela, provisorio.id, salvo);
      _reapontar(provisorio.id, salvo.id);
    };

    _enfileirar(op);
    return provisorio;
  }

  function update(tabela, id, alteracoes) {
    const atual = getById(tabela, id);
    if (!atual) return null;

    const anterior = Object.assign({}, atual);
    const otimista = Object.assign({}, atual, alteracoes, { _pendente: true });
    _trocar(tabela, id, otimista);
    _definirEstado(ESTADOS.SALVANDO, tabela);

    const corpo = semMeta(alteracoes);

    const op = _operacao('atualizar', tabela, corpo);
    op.desfazer = () => _trocar(tabela, id, anterior);
    op.executar = async () => {
      const alvo = _equivalencias[id] || id;
      // A versão é lida no momento do envio, não no do enfileiramento: entre os
      // dois pode ter havido a criação deste mesmo registro na fila. Continua
      // sendo controle otimista — se OUTRA pessoa alterou, a versão em cache
      // está vencida e o servidor recusa.
      const emCache = getById(tabela, id);
      const versao = emCache ? emCache.versao : anterior.versao;

      const salvo = await Sessao.requisitar(API + '/' + tabela + '/' + alvo, {
        metodo: 'PATCH',
        corpo: Object.assign(_resolverCorpo(corpo), { versao: versao }),
      });
      _trocar(tabela, id, salvo);
    };

    _enfileirar(op);
    return otimista;
  }

  function remove(tabela, id) {
    const anterior = getById(tabela, id);
    if (!anterior) return;

    _tirar(tabela, id);
    _definirEstado(ESTADOS.SALVANDO, tabela);

    const op = _operacao('excluir', tabela, null);
    op.desfazer = () => _trocar(tabela, id, anterior);
    op.executar = async () => {
      const alvo = _equivalencias[id] || id;
      await Sessao.requisitar(API + '/' + tabela + '/' + alvo, { metodo: 'DELETE' });
    };

    _enfileirar(op);
  }

  /** Exclusão em lote — uma requisição em vez de N. */
  function removerLote(tabela, ids) {
    const anteriores = ids.map((id) => getById(tabela, id)).filter(Boolean);
    if (!anteriores.length) return Promise.resolve();

    anteriores.forEach((r) => _tirar(tabela, r.id));
    _definirEstado(ESTADOS.SALVANDO, tabela);

    const op = _operacao('excluir_lote', tabela, null);
    op.desfazer = () => anteriores.forEach((r) => _trocar(tabela, r.id, r));
    op.executar = async () => {
      await Sessao.requisitar(API + '/' + tabela + '/excluir', {
        metodo: 'POST',
        corpo: { ids: anteriores.map((r) => _equivalencias[r.id] || r.id) },
      });
    };

    return _enfileirar(op);
  }

  /* ── Comitê ativo ─────────────────────────────────────────────── */

  async function trocarComite(id) {
    _comiteAtivo = id;
    if (typeof Migracao !== 'undefined') Migracao.definirPreferencia('comiteAtivo', id);
    await _carregar(id);
    return getActiveComite();
  }

  /**
   * Mantém a assinatura síncrona que `app.js` e `utils.js` já usam. A recarga
   * acontece em seguida e redesenha a tela quando chega.
   */
  function setActiveComite(id) {
    trocarComite(id).then(_redesenhar).catch((erro) => {
      _definirEstado(erro.semConexao ? ESTADOS.SEM_CONEXAO : ESTADOS.ERRO, erro.message);
      _avisar('Não foi possível abrir este mês: ' + erro.message);
    });
  }

  /* ── Exportar / importar ──────────────────────────────────────── */

  /**
   * Passou a devolver Promise. O dump vem do servidor, com autorização
   * aplicada e exportação registrada na trilha — o navegador não tem mais a
   * base inteira para serializar.
   */
  async function exportAll() {
    const dump = await Sessao.requisitar(API + '/exportar');
    return JSON.stringify(dump, null, 2);
  }

  /**
   * Passou a devolver Promise e a delegar ao fluxo de migração, que classifica,
   * versiona e audita. Restaurar não repovoa o navegador.
   */
  async function importAll(json) {
    const dump = JSON.parse(json);
    const chaves = {};
    Object.keys(dump).forEach((t) => {
      if (t.startsWith('_')) return;
      chaves['jur_comite_' + t] = JSON.stringify(dump[t]);
    });

    const resultado = await Sessao.requisitar('/api/migracao/importar', {
      metodo: 'POST',
      corpo: { chaves: chaves, versao: '1.0', navegador: navigator.userAgent.slice(0, 300) },
    });

    await recarregar();
    return resultado;
  }

  /** Rodapé da barra lateral. Não há mais armazenamento local para medir. */
  function storageSize() {
    const total = TABLES.reduce((s, t) => s + _linhas(t).length, 0);
    const rotulo = {
      carregando: 'carregando…',
      pronto: 'sincronizado',
      salvando: 'salvando…',
      salvo: 'salvo',
      erro: 'erro',
      sem_conexao: 'sem conexão',
      sem_permissao: 'sem permissão',
      sem_sessao: 'sessão expirada',
      conflito: 'conflito de edição',
      sem_dados: 'sem dados',
      migracao_pendente: 'migração pendente',
      sincronizacao_parcial: 'sincronização parcial',
    }[_estado] || _estado;

    return total + ' registros · ' + rotulo;
  }

  return {
    ready, ESTADOS,
    uid, getAll, getById, insert, update, remove, where, forComite,
    getComites, getActiveComite, setActiveComite, comiteRef,
    getEmpreendimentos, exportAll, importAll, storageSize,
    // Novos, para quem precisa do comportamento assíncrono explícito.
    estado, aoMudarEstado, recarregar, trocarComite, consultar,
    removerLote, aguardar: _aguardarFila,
  };
})();
