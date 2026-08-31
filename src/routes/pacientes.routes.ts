import { Router } from 'express';
import {
  arquivarPaciente,
  atualizarPaciente,
  criarPaciente,
  listarPacientes,
  obterPaciente,
  opcoesPacientes,
} from '../controllers/pacientes.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('pacientes', 'visualizar'));

router.get('/', listarPacientes);
router.get('/opcoes', opcoesPacientes);
router.post('/', exigirPermissao('pacientes', 'criar'), criarPaciente);
router.get('/:id', obterPaciente);
router.patch('/:id', exigirPermissao('pacientes', 'editar'), atualizarPaciente);
router.patch('/:id/arquivar', exigirPermissao('pacientes', 'editar'), arquivarPaciente);

export default router;
