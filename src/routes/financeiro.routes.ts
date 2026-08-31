import { Router } from 'express';
import {
  aprovarComissao,
  atualizarDespesa,
  calcularComissoes,
  cancelarCobranca,
  criarCobranca,
  criarDespesa,
  criarLote,
  enviarLote,
  fecharFolha,
  listarCobrancas,
  listarComissoes,
  listarDespesas,
  listarLotes,
  obterFluxoCaixa,
  pagarCobranca,
  pagarComissao,
  pagarDespesa,
  pagarParcelaCobranca,
  parcelarCobranca,
  reconciliarLote,
  removerDespesa,
  visaoGeral,
} from '../controllers/financeiro.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('financeiro', 'visualizar'));

router.get('/', visaoGeral);
router.get('/fluxo-caixa', obterFluxoCaixa);

router.get('/cobrancas', listarCobrancas);
router.post('/cobrancas', exigirPermissao('financeiro', 'criar'), criarCobranca);
router.patch('/cobrancas/:id/pagar', exigirPermissao('financeiro', 'criar'), pagarCobranca);
router.patch('/cobrancas/:id/parcelar', exigirPermissao('financeiro', 'editar'), parcelarCobranca);
router.patch('/cobrancas/:id/cancelar', exigirPermissao('financeiro', 'editar'), cancelarCobranca);
router.patch('/cobrancas/:id/parcelas/:numero/pagar', exigirPermissao('financeiro', 'criar'), pagarParcelaCobranca);

router.get('/despesas', listarDespesas);
router.post('/despesas', exigirPermissao('financeiro', 'criar'), criarDespesa);
router.patch('/despesas/:id', exigirPermissao('financeiro', 'editar'), atualizarDespesa);
router.patch('/despesas/:id/pagar', exigirPermissao('financeiro', 'criar'), pagarDespesa);
router.delete('/despesas/:id', exigirPermissao('financeiro', 'excluir'), removerDespesa);

router.get('/lotes', listarLotes);
router.post('/lotes', exigirPermissao('financeiro', 'criar'), criarLote);
router.patch('/lotes/:id/enviar', exigirPermissao('financeiro', 'editar'), enviarLote);
router.patch('/lotes/:id/reconciliar', exigirPermissao('financeiro', 'editar'), reconciliarLote);

router.get('/comissoes', listarComissoes);
router.post('/comissoes/calcular', exigirPermissao('financeiro', 'criar'), calcularComissoes);
router.post('/comissoes/fechar-folha', exigirPermissao('financeiro', 'editar'), fecharFolha);
router.patch('/comissoes/:id/aprovar', exigirPermissao('financeiro', 'editar'), aprovarComissao);
router.patch('/comissoes/:id/pagar', exigirPermissao('financeiro', 'editar'), pagarComissao);

export default router;
