import { Router } from 'express';

import {
  acessoGratuito,
  assinaturaDaClinica,
  checkout,
  checkoutClinica,
  confirmarLocal,
  reenviarAcessoPedido,
  sincronizar,
  sincronizarClinica,
  webhookMercadoPago,
} from '../controllers/assinatura.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { validarChaveLanding } from '../middlewares/landing.middleware';
import { exigirOrigemLanding } from '../middlewares/origem-landing.middleware';
import {
  limiteAssinatura,
  limiteSincronizacao,
  limiteWebhookMercadoPago,
} from '../middlewares/rate-limit.middleware';

const router = Router();

// Clínica nova: começa no site público.
router.post('/gratuito', limiteAssinatura, exigirOrigemLanding, acessoGratuito);
router.post('/checkout', limiteAssinatura, exigirOrigemLanding, checkout);
router.post('/sincronizar', limiteSincronizacao, exigirOrigemLanding, sincronizar);
router.post('/confirmar', limiteAssinatura, exigirOrigemLanding, confirmarLocal);

// Clínica que já existe: teste → pago e renovação, de dentro do sistema.
router.get('/clinica', autenticar, assinaturaDaClinica);
router.post('/clinica/checkout', limiteAssinatura, checkoutClinica);
router.post('/clinica/sincronizar', limiteSincronizacao, sincronizarClinica);

// Painel interno.
router.post('/pedidos/:id/reenviar-acesso', validarChaveLanding, reenviarAcessoPedido);

router.post('/mercadopago', limiteWebhookMercadoPago, webhookMercadoPago);

export default router;
