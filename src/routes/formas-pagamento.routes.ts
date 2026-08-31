import { Router } from 'express';
import { listarFormasPagamento, salvarFormasPagamento } from '../controllers/financeiro.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);

router.get('/', listarFormasPagamento);
router.put('/', exigirPermissao('configuracoes', 'editar'), salvarFormasPagamento);

export default router;
