import { Router } from 'express';
import {
  ativarProfissional,
  atualizarProfissional,
  criarProfissional,
  inativarProfissional,
  listarProfissionais,
  obterProfissional,
  opcoesProfissionais,
} from '../controllers/profissionais.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('profissionais', 'visualizar'));

router.get('/', listarProfissionais);
router.get('/opcoes', opcoesProfissionais);
router.post('/', exigirPermissao('profissionais', 'criar'), criarProfissional);
router.get('/:id', obterProfissional);
router.patch('/:id', exigirPermissao('profissionais', 'editar'), atualizarProfissional);
router.patch('/:id/inativar', exigirPermissao('profissionais', 'editar'), inativarProfissional);
router.patch('/:id/ativar', exigirPermissao('profissionais', 'editar'), ativarProfissional);

export default router;
