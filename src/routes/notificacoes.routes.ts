import { Router } from 'express';
import {
  listarNotificacoes,
  marcarNotificacaoLida,
  marcarNotificacoesLidas,
} from '../controllers/notificacoes.controller';
import { autenticar } from '../middlewares/auth.middleware';

const router = Router();

router.use(autenticar);

router.get('/', listarNotificacoes);
router.post('/lidas', marcarNotificacoesLidas);
router.patch('/:id/lida', marcarNotificacaoLida);

export default router;
