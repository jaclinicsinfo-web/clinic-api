import { Router } from 'express';
import { atualizar, listar } from '../controllers/perfis.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirAdministrador } from '../middlewares/admin.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);
router.get('/', exigirPermissao('configuracoes', 'visualizar'), listar);
router.patch('/:id', exigirAdministrador, atualizar);

export default router;
