import { Router } from 'express';

import {
  acessoGratuito,
  checkout,
  confirmarLocal,
  sincronizar,
  webhookMercadoPago,
} from '../controllers/assinatura.controller';
import { limiteAssinatura } from '../middlewares/rate-limit.middleware';

const router = Router();

router.post('/gratuito', limiteAssinatura, acessoGratuito);
router.post('/checkout', limiteAssinatura, checkout);
router.post('/sincronizar', limiteAssinatura, sincronizar);
router.post('/confirmar', limiteAssinatura, confirmarLocal);
router.post('/mercadopago', webhookMercadoPago);

export default router;
