import path from 'path';
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import rotas from './routes';
import { notFound, tratarErros } from './middlewares/error.middleware';
import { AppError } from './lib/erros';

export function criarApp(): Application {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        // Permite requisições sem origem (ex.: curl, apps server-to-server como a landing).
        if (!origin || env.CORS_ORIGIN.includes(origin)) {
          return callback(null, true);
        }
        return callback(new AppError(403, 'Origem não permitida pelo CORS.'));
      },
      credentials: true,
    }),
  );

  app.use(
    express.json({
      verify(req, _res, buf) {
        if (req.url?.includes('/webhooks/whatsapp')) {
          (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));

  app.disable('x-powered-by');
  // Atrás do proxy do Dokploy: o IP real do visitante vem em X-Forwarded-For (limite de tentativas por pessoa).
  app.set('trust proxy', 1);

  app.use('/api', rotas);

  app.get('/favicon.ico', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/favicon.ico'));
  });

  app.use(notFound);
  app.use(tratarErros);

  return app;
}
