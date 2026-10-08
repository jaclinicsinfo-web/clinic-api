import { Router } from 'express';

import {
  acessoGratuito,
  checkout,
  confirmarLocal,
  sincronizar,
  webhookMercadoPago,
} from '../controllers/assinatura.controller';
import { exigirOrigemLanding } from '../middlewares/origem-landing.middleware';
import { limiteAssinatura } from '../middlewares/rate-limit.middleware';

const router = Router();

router.post('/gratuito', limiteAssinatura, exigirOrigemLanding, acessoGratuito);
router.post('/checkout', limiteAssinatura, exigirOrigemLanding, checkout);
router.post('/sincronizar', limiteAssinatura, exigirOrigemLanding, sincronizar);
router.post('/confirmar', limiteAssinatura, exigirOrigemLanding, confirmarLocal);
router.post('/mercadopago', webhookMercadoPago);

export default router;
