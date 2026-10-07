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

export const limiteAssinatura = criarLimiter(
  8,
  'Muitas tentativas de assinatura. Tente novamente em alguns minutos.',
);

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

export const limiteRecuperacao = criarLimiter(
  5,
  'Muitas tentativas de recuperação de senha. Tente novamente em alguns minutos.',
);

export const limiteWebhookWhatsapp = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(montarErro('Muitas requisições no webhook. Tente novamente em instantes.'));
  },
});
