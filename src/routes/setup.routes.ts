import { Router } from 'express';
import { status, concluir } from '../controllers/setup.controller';
import { limiteSetup } from '../middlewares/rate-limit.middleware';

const router = Router();

router.get('/status', status);
router.post('/', limiteSetup, concluir);

export default router;
