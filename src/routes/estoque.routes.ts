import { Router } from 'express';
import {
  atualizarProdutoEstoque,
  criarMovimentacaoEstoque,
  criarProdutoEstoque,
  inativarProdutoEstoque,
  listarEstoque,
} from '../controllers/estoque.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('estoque', 'visualizar'));

router.get('/', listarEstoque);
router.post('/produtos', exigirPermissao('estoque', 'criar'), criarProdutoEstoque);
router.patch('/produtos/:id', exigirPermissao('estoque', 'editar'), atualizarProdutoEstoque);
router.patch('/produtos/:id/ativo', exigirPermissao('estoque', 'editar'), inativarProdutoEstoque);
router.post('/movimentacoes', exigirPermissao('estoque', 'criar'), criarMovimentacaoEstoque);

export default router;
