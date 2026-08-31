import { Router } from 'express';
import { obterDashboard } from '../controllers/dashboard.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('dashboard', 'visualizar'));

router.get('/', obterDashboard);

export default router;
