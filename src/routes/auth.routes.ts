import { Router } from 'express';
import {
  login,
  selecionarUnidade,
  me,
  logout,
} from '../controllers/auth.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { limiteLogin } from '../middlewares/rate-limit.middleware';

const router = Router();

router.post('/login', limiteLogin, login);
router.post('/selecionar-unidade', autenticar, selecionarUnidade);
router.get('/me', autenticar, me);
router.post('/logout', autenticar, logout);

export default router;
