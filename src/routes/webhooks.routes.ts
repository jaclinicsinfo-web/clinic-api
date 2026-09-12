import { Router } from 'express';
import { receberWebhookWhatsapp, verificarWebhookWhatsapp } from '../controllers/webhooks-whatsapp.controller';
import { limiteWebhookWhatsapp } from '../middlewares/rate-limit.middleware';

const router = Router();

router.get('/whatsapp/:clinicaId', limiteWebhookWhatsapp, verificarWebhookWhatsapp);
router.post('/whatsapp/:clinicaId', limiteWebhookWhatsapp, receberWebhookWhatsapp);

export default router;
