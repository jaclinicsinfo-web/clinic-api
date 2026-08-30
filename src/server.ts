import { criarApp } from './app';
import { env } from './config/env';
import { conectarBanco, desconectarBanco } from './config/database';

async function iniciar(): Promise<void> {
  try {
    await conectarBanco();
    // eslint-disable-next-line no-console
    console.log('Conectado ao banco de dados.');
  } catch (err) {
    console.error('Falha ao conectar ao banco de dados.', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const app = criarApp();

  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`ClinicERP API rodando em http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
  });

  const encerrar = async (sinal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`\nRecebido ${sinal}, encerrando...`);
    server.close(async () => {
      await desconectarBanco();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void encerrar('SIGINT'));
  process.on('SIGTERM', () => void encerrar('SIGTERM'));
}

void iniciar();
