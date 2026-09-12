import { criarApp } from './app';
import { env } from './config/env';
import { conectarBanco, desconectarBanco } from './config/database';
import { aplicarMigracoes } from './lib/migracoes';
import { iniciarProcessadorLembretes } from './lib/integracoes/processador';

async function iniciar(): Promise<void> {
  const noRender = process.env.RENDER === 'true' || env.NODE_ENV === 'production';

  if (noRender) {
    try {
      aplicarMigracoes();
    } catch (err) {
      console.error(
        'Falha ao aplicar migrações do banco.',
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  }

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

  const processador = iniciarProcessadorLembretes(env.INTEGRACOES_INTERVALO_MS);

  const encerrar = async (sinal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`\nRecebido ${sinal}, encerrando...`);
    server.close(async () => {
      clearInterval(processador);
      await desconectarBanco();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void encerrar('SIGINT'));
  process.on('SIGTERM', () => void encerrar('SIGTERM'));
}

void iniciar();
