import { Router } from 'express';
import {
  alterarStatusAgendamento,
  atualizarAgendamento,
  criarAgendamento,
  criarBloqueioAgenda,
  criarItemEspera,
  encaixarEspera,
  marcarLembreteAgendamento,
  obterAgenda,
  reagendarAgendamento,
  removerBloqueioAgenda,
  removerItemEspera,
} from '../controllers/agenda.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('agenda', 'visualizar'));

router.get('/', obterAgenda);
router.post('/', exigirPermissao('agenda', 'criar'), criarAgendamento);
router.patch('/:id', exigirPermissao('agenda', 'editar'), atualizarAgendamento);
router.patch('/:id/status', exigirPermissao('agenda', 'editar'), alterarStatusAgendamento);
router.patch('/:id/reagendar', exigirPermissao('agenda', 'editar'), reagendarAgendamento);
router.patch('/:id/lembrete', exigirPermissao('agenda', 'editar'), marcarLembreteAgendamento);

router.post('/bloqueios', exigirPermissao('agenda', 'criar'), criarBloqueioAgenda);
router.delete('/bloqueios/:id', exigirPermissao('agenda', 'excluir'), removerBloqueioAgenda);

router.post('/espera', exigirPermissao('agenda', 'criar'), criarItemEspera);
router.patch('/espera/:id/encaixar', exigirPermissao('agenda', 'editar'), encaixarEspera);
router.delete('/espera/:id', exigirPermissao('agenda', 'excluir'), removerItemEspera);

export default router;
