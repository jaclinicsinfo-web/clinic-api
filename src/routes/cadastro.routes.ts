import { Router } from 'express';
import { cadastrar } from '../controllers/cadastro.controller';
import { validarChaveLanding } from '../middlewares/landing.middleware';
import { limiteCadastro } from '../middlewares/rate-limit.middleware';

const router = Router();

router.post('/', limiteCadastro, validarChaveLanding, cadastrar);

export default router;
