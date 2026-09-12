import { Router } from 'express';
import {
  atualizarPonto,
  baixarHolerite,
  baterPonto,
  criarPonto,
  enviarHolerite,
  excluirHoleriteRh,
  excluirPonto,
  listarHoleritesRh,
  listarPonto,
  visaoRh,
} from '../controllers/rh.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';
import { tratarUpload } from '../middlewares/upload.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('rh', 'visualizar'));

router.get('/', visaoRh);
router.get('/ponto', listarPonto);
router.post('/ponto', exigirPermissao('rh', 'criar'), criarPonto);
router.post('/ponto/bater', exigirPermissao('rh', 'criar'), baterPonto);
router.patch('/ponto/:id', exigirPermissao('rh', 'editar'), atualizarPonto);
router.delete('/ponto/:id', exigirPermissao('rh', 'excluir'), excluirPonto);

router.get('/holerites', listarHoleritesRh);
router.post('/holerites', exigirPermissao('rh', 'criar'), tratarUpload, enviarHolerite);
router.get('/holerites/:id/arquivo', baixarHolerite);
router.delete('/holerites/:id', exigirPermissao('rh', 'excluir'), excluirHoleriteRh);

export default router;
