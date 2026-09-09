import { Router } from 'express';
import {
  ativarConvenio,
  atualizarConvenio,
  criarConvenio,
  inativarConvenio,
  listarConvenios,
  obterConvenio,
  salvarTabelaConvenio,
} from '../controllers/convenios.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('convenios', 'visualizar'));

router.get('/', listarConvenios);
router.post('/', exigirPermissao('convenios', 'criar'), criarConvenio);
router.get('/:id', obterConvenio);
router.patch('/:id', exigirPermissao('convenios', 'editar'), atualizarConvenio);
router.patch('/:id/inativar', exigirPermissao('convenios', 'excluir'), inativarConvenio);
router.patch('/:id/ativar', exigirPermissao('convenios', 'excluir'), ativarConvenio);
router.put('/:id/tabela', exigirPermissao('convenios', 'editar'), salvarTabelaConvenio);

export default router;
