import { Router } from 'express';
import { listar, criar, inativar, ativar } from '../controllers/usuarios.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirAdministrador } from '../middlewares/admin.middleware';

const router = Router();

router.use(autenticar);
router.get('/', listar);
router.post('/', exigirAdministrador, criar);
router.patch('/:id/inativar', exigirAdministrador, inativar);
router.patch('/:id/ativar', exigirAdministrador, ativar);

export default router;
