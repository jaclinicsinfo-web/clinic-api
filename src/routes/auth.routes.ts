import { Router } from 'express';
import {
  login,
  selecionarUnidade,
  me,
  logout,
  solicitarRecuperacao,
  redefinirSenha,
} from '../controllers/auth.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { limiteLogin, limiteRecuperacao } from '../middlewares/rate-limit.middleware';

const router = Router();

router.post('/login', limiteLogin, login);
router.post('/recuperar-senha', limiteRecuperacao, solicitarRecuperacao);
router.post('/redefinir-senha', limiteRecuperacao, redefinirSenha);
router.post('/selecionar-unidade', autenticar, selecionarUnidade);
router.get('/me', autenticar, me);
router.post('/logout', autenticar, logout);

export default router;
