-- Up Migration
-- ============================================================================
-- Cadastro: empreendimentos, unidades, clientes, contratos, reservas.
--
-- Corrige um problema estrutural da base atual: findOrMakeEmpr
-- (js/monday-sync.js:129-144) casa empreendimento por igualdade estrita de
-- texto em maiusculas. Qualquer variacao de grafia cria um empreendimento
-- duplicado e fragmenta o historico do mesmo ativo. Aqui a correspondencia
-- passa a ser por identificador de origem, em tabela propria.
-- ============================================================================

CREATE TABLE empreendimentos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                  text NOT NULL,
  nome_normalizado      text NOT NULL,
  empresa               text,
  cidade                text,
  torres                text[] NOT NULL DEFAULT '{}',
  blocos                text[] NOT NULL DEFAULT '{}',
  qtd_unidades          integer,
  -- Enum de status conforme schemas/empreendimento.schema.json
  status                text NOT NULL DEFAULT 'em_vendas',
  ativo_para_importacao boolean NOT NULL DEFAULT true,
  data_inicio_historico date,
  data_encerramento     date,
  origem_cadastro       text NOT NULL DEFAULT 'integracao',
  CONSTRAINT empr_status_valido CHECK (status IN (
    'planejamento','lancamento','em_vendas','em_construcao','entregue',
    'carteira_em_encerramento','encerrado','inativo','arquivado'
  )),
  CONSTRAINT empr_origem_valida CHECK (origem_cadastro IN ('integracao','manual','carga_historica'))
);
SELECT aplicar_proveniencia('empreendimentos');
SELECT aplicar_trilha('empreendimentos');

CREATE UNIQUE INDEX ux_empreendimentos_normalizado ON empreendimentos (nome_normalizado);

COMMENT ON COLUMN empreendimentos.nome_normalizado IS
  'Sem acento, sem pontuacao, sem espaco duplo, maiusculas. Chave de deduplicacao.';


-- ============================================================================
-- Correspondencia de identificadores entre fontes
--
-- references/patrono-retencao-20-anos.md: "nunca usar apenas o ID atual do
-- sistema externo como chave historica permanente". A correspondencia tem
-- vigencia, para que um ID trocado na origem nao quebre o historico.
-- ============================================================================
CREATE TABLE empreendimentos_fontes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empreendimento_id uuid NOT NULL REFERENCES empreendimentos(id) ON DELETE CASCADE,
  fonte             fonte_dado NOT NULL,
  id_externo        text NOT NULL,
  rotulo_externo    text,
  vigente_de        date NOT NULL DEFAULT CURRENT_DATE,
  vigente_ate       date,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empr_fonte_vigencia CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de)
);

CREATE UNIQUE INDEX ux_empr_fonte_vigente ON empreendimentos_fontes (fonte, id_externo)
  WHERE vigente_ate IS NULL;
CREATE INDEX ix_empr_fonte_empr ON empreendimentos_fontes (empreendimento_id);

-- Agora que empreendimentos existe, a FK do escopo de autorizacao pode fechar.
ALTER TABLE escopos_empreendimento
  ADD CONSTRAINT fk_escopo_empreendimento
  FOREIGN KEY (empreendimento_id) REFERENCES empreendimentos(id) ON DELETE CASCADE;


CREATE TABLE unidades (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empreendimento_id uuid NOT NULL REFERENCES empreendimentos(id),
  torre             text,
  bloco             text,
  unidade           text NOT NULL,
  situacao          text,
  prazo_habite_se   date,
  prazo_180         date,
  previsao_entrega  date,
  status_juridico   text,
  tipo_financiamento text
);
SELECT aplicar_proveniencia('unidades');
SELECT aplicar_trilha('unidades');

CREATE UNIQUE INDEX ux_unidades_local ON unidades
  (empreendimento_id, coalesce(torre,''), coalesce(bloco,''), unidade);


-- ============================================================================
-- Clientes
--
-- CPF/CNPJ e validado por digito verificador, nao por comprimento. Documento
-- com tamanho certo e digito errado NAO vincula: entra com valido=false e gera
-- inconsistencia cpf_cnpj_invalido.
-- ============================================================================
CREATE TABLE clientes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text NOT NULL,
  nome_normalizado  text NOT NULL,
  cpf_cnpj          text,
  cpf_cnpj_valido   boolean,
  tipo_pessoa       text,
  CONSTRAINT cliente_tipo_valido CHECK (tipo_pessoa IS NULL OR tipo_pessoa IN ('PF','PJ')),
  -- So digitos: a formatacao da origem fica em valor_original.
  CONSTRAINT cliente_documento_digitos CHECK (cpf_cnpj IS NULL OR cpf_cnpj ~ '^[0-9]+$')
);
SELECT aplicar_proveniencia('clientes');
SELECT aplicar_trilha('clientes');

-- Documento validado e identidade unica. Documento invalido nao unifica ninguem.
CREATE UNIQUE INDEX ux_clientes_documento_valido ON clientes (cpf_cnpj)
  WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj_valido = true;
CREATE INDEX ix_clientes_nome_normalizado ON clientes (nome_normalizado);

COMMENT ON COLUMN clientes.cpf_cnpj_valido IS
  'Resultado da validacao por digito verificador. false => nao serve como chave de vinculo.';


CREATE TABLE contratos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        uuid REFERENCES clientes(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  unidade_id        uuid REFERENCES unidades(id),
  numero_contrato   text,
  numero_normalizado text,
  situacao_reserva  text,
  situacao          text,
  data_contrato     date,
  valor_contrato    numeric(18,2)
);
SELECT aplicar_proveniencia('contratos');
SELECT aplicar_trilha('contratos');

CREATE UNIQUE INDEX ux_contratos_numero ON contratos (numero_normalizado)
  WHERE numero_normalizado IS NOT NULL;
CREATE INDEX ix_contratos_cliente ON contratos (cliente_id);
CREATE INDEX ix_contratos_empreendimento ON contratos (empreendimento_id);


-- Reservas: origem CVCRM. Modelo preparado; conector nao implementado na Fase 1.
CREATE TABLE reservas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id    uuid REFERENCES contratos(id),
  cliente_id     uuid REFERENCES clientes(id),
  unidade_id     uuid REFERENCES unidades(id),
  situacao       text,
  data_venda     date,
  data_distrato  date,
  motivo_distrato text
);
SELECT aplicar_proveniencia('reservas');
SELECT aplicar_trilha('reservas');

COMMENT ON TABLE reservas IS
  'Preparada para CVCRM. Conector fora do escopo da Fase 1 (decisao registrada em DECISOES.md).';


-- Down Migration
ALTER TABLE escopos_empreendimento DROP CONSTRAINT IF EXISTS fk_escopo_empreendimento;
DROP TABLE IF EXISTS reservas;
DROP TABLE IF EXISTS contratos;
DROP TABLE IF EXISTS clientes;
DROP TABLE IF EXISTS unidades;
DROP TABLE IF EXISTS empreendimentos_fontes;
DROP TABLE IF EXISTS empreendimentos;
DELETE FROM tabelas_de_negocio
  WHERE nome_tabela IN ('empreendimentos','unidades','clientes','contratos','reservas');
