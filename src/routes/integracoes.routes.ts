import { Router } from 'express';
import {
  atualizarConfiguracaoIntegracoes,
  atualizarRegraLembrete,
  atualizarTemplateMensagem,
  criarRegraLembrete,
  criarTemplateMensagem,
  excluirRegraLembrete,
  excluirTemplateMensagem,
  obterConfiguracaoIntegracoes,
  obterCustos,
  obterDashboardIntegracoes,
  obterEnvio,
  obterHistoricoEnvios,
  obterRegras,
  obterTemplates,
  processarIntegracoes,
  testarEmail,
  testarWhatsapp,
} from '../controllers/integracoes.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('integracoes', 'visualizar'));

router.get('/', obterDashboardIntegracoes);
router.get('/configuracao', obterConfiguracaoIntegracoes);
router.patch('/configuracao', exigirPermissao('integracoes', 'editar'), atualizarConfiguracaoIntegracoes);
router.post('/whatsapp/teste', exigirPermissao('integracoes', 'editar'), testarWhatsapp);
router.post('/email/teste', exigirPermissao('integracoes', 'editar'), testarEmail);

router.get('/regras', obterRegras);
router.post('/regras', exigirPermissao('integracoes', 'criar'), criarRegraLembrete);
router.patch('/regras/:id', exigirPermissao('integracoes', 'editar'), atualizarRegraLembrete);
router.delete('/regras/:id', exigirPermissao('integracoes', 'excluir'), excluirRegraLembrete);

router.get('/templates', obterTemplates);
router.post('/templates', exigirPermissao('integracoes', 'criar'), criarTemplateMensagem);
router.patch('/templates/:id', exigirPermissao('integracoes', 'editar'), atualizarTemplateMensagem);
router.delete('/templates/:id', exigirPermissao('integracoes', 'excluir'), excluirTemplateMensagem);

router.get('/custos', obterCustos);

router.get('/envios', obterHistoricoEnvios);
router.get('/envios/:id', obterEnvio);
router.post('/processar', exigirPermissao('integracoes', 'editar'), processarIntegracoes);

export default router;
