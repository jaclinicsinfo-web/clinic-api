import { Router } from 'express';
import {
  ativarProcedimento,
  atualizarProcedimento,
  criarProcedimento,
  inativarProcedimento,
  listarProcedimentos,
} from '../controllers/procedimentos.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('configuracoes', 'visualizar'));

router.get('/', listarProcedimentos);
router.post('/', exigirPermissao('configuracoes', 'criar'), criarProcedimento);
router.patch('/:id', exigirPermissao('configuracoes', 'editar'), atualizarProcedimento);
router.patch('/:id/inativar', exigirPermissao('configuracoes', 'editar'), inativarProcedimento);
router.patch('/:id/ativar', exigirPermissao('configuracoes', 'editar'), ativarProcedimento);

export default router;
