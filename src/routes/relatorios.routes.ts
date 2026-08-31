import { Router } from 'express';
import { obterRelatorios } from '../controllers/relatorios.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('relatorios', 'visualizar'));

router.get('/', obterRelatorios);

export default router;
