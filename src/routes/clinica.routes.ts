import { Router } from 'express';
import {
  ativarUnidadeClinica,
  atualizarClinica,
  atualizarUnidadeClinica,
  criarUnidadeClinica,
  enviarLogo,
  excluirLogo,
  inativarUnidadeClinica,
  obterClinica,
  obterLogo,
} from '../controllers/clinica.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';
import { tratarUploadLogo } from '../middlewares/upload.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('configuracoes', 'visualizar'));

router.get('/', obterClinica);
router.patch('/', exigirPermissao('configuracoes', 'editar'), atualizarClinica);

router.get('/logo', obterLogo);
router.post('/logo', exigirPermissao('configuracoes', 'editar'), tratarUploadLogo, enviarLogo);
router.delete('/logo', exigirPermissao('configuracoes', 'editar'), excluirLogo);

router.post('/unidades', exigirPermissao('configuracoes', 'criar'), criarUnidadeClinica);
router.patch('/unidades/:id', exigirPermissao('configuracoes', 'editar'), atualizarUnidadeClinica);
router.patch('/unidades/:id/inativar', exigirPermissao('configuracoes', 'editar'), inativarUnidadeClinica);
router.patch('/unidades/:id/ativar', exigirPermissao('configuracoes', 'editar'), ativarUnidadeClinica);

export default router;
