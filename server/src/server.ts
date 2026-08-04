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
  if (!config.sienge.habilitado) {
    logger.info('Conector Sienge desligado (SIENGE_HABILITADO=false), como previsto para a Fase 1.');
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
