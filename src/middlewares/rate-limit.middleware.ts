import rateLimit from 'express-rate-limit';
import { montarErro } from '../views/error.view';

const JANELA_15_MIN = 15 * 60 * 1000;

function criarLimiter(max: number, mensagem: string) {
  return rateLimit({
    windowMs: JANELA_15_MIN,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(montarErro(mensagem));
    },
  });
}

export const limiteCadastro = criarLimiter(
  5,
  'Muitas tentativas de cadastro. Tente novamente em alguns minutos.',
);

export const limiteLogin = criarLimiter(
  10,
  'Muitas tentativas de login. Tente novamente em alguns minutos.',
);

export const limiteSetup = criarLimiter(
  5,
  'Muitas tentativas de configuração inicial. Tente novamente em alguns minutos.',
);
