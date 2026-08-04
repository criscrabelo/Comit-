/**
 * Ponto de entrada. Sobe o servidor e encerra com ordem.
 */
import { criarApp } from './app.js';
import { config } from './config.js';
import { logger } from './logging.js';
import { fecharBanco, verificarBanco } from './db/pool.js';

async function principal(): Promise<void> {
  // Falha na partida se o banco nao responder: subir sem banco so adiaria o
  // erro para a primeira requisicao do usuario.
  const banco = await verificarBanco();
  if (!banco.ok) {
    logger.fatal({ erro: banco.erro }, 'Banco de dados inacessivel. Verifique DATABASE_URL.');
    process.exit(1);
  }
  logger.info({ versao: banco.versao?.split(' ').slice(0, 2).join(' ') }, 'Banco conectado');

  if (!config.monday.habilitado) {
    logger.warn('MONDAY_TOKEN ausente — integracao com o Monday desligada.');
  }
  // Recarrega as confirmacoes de endpoint gravadas no banco. Sem isto, um
  // reinicio destravaria endpoints ja confirmados ou deixaria a memoria do
  // processo divergir do banco.
  const { carregarHomologacao } = await import('./integracoes/sienge/rotas.js');
  const confirmados = await carregarHomologacao();

  if (!config.sienge.habilitado) {
    logger.info(
      { endpoints_confirmados: confirmados },
      'Conector Sienge desligado: endpoints ainda nao confirmados no ambiente da Coevo.',
    );
  } else if (confirmados === 0) {
    logger.warn(
      'SIENGE_HABILITADO=true mas nenhum endpoint confirmado. A ingestao continua travada.',
    );
  }

  const app = await criarApp();

  await app.listen({ port: config.porta, host: '0.0.0.0' });
  logger.info({ porta: config.porta, ambiente: config.ambiente }, 'Patrono backend no ar');

  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;
    logger.info({ sinal }, 'Encerrando');
    try {
      await app.close();
      await fecharBanco();
      process.exit(0);
    } catch (erro) {
      logger.error({ erro: erro instanceof Error ? erro.message : String(erro) }, 'Falha ao encerrar');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void encerrar('SIGTERM'));
  process.on('SIGINT', () => void encerrar('SIGINT'));
}

principal().catch((erro) => {
  logger.fatal({ erro: erro instanceof Error ? erro.message : String(erro) }, 'Falha na partida');
  process.exit(1);
});
