import { Router } from 'express';
import { listar, criar, inativar, ativar, atualizarPerfil } from '../controllers/usuarios.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirAdministrador, exigirAdminOuGestor } from '../middlewares/admin.middleware';

const router = Router();

router.use(autenticar);
router.get('/', exigirAdminOuGestor, listar);
router.post('/', exigirAdministrador, criar);
router.patch('/:id/perfil', exigirAdminOuGestor, atualizarPerfil);
router.patch('/:id/inativar', exigirAdministrador, inativar);
router.patch('/:id/ativar', exigirAdministrador, ativar);

export default router;
