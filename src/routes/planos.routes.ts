import { Router } from 'express';
import { listar } from '../controllers/planos.controller';

const router = Router();

router.get('/', listar);

export default router;
