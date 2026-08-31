import { Router } from 'express';
import healthRoutes from './health.routes';
import planosRoutes from './planos.routes';
import authRoutes from './auth.routes';
import cadastroRoutes from './cadastro.routes';
import setupRoutes from './setup.routes';
import usuariosRoutes from './usuarios.routes';
import perfisRoutes from './perfis.routes';
import pacientesRoutes from './pacientes.routes';
import conveniosRoutes from './convenios.routes';
import procedimentosRoutes from './procedimentos.routes';
import profissionaisRoutes from './profissionais.routes';
import agendaRoutes from './agenda.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/planos', planosRoutes);
router.use('/auth', authRoutes);
router.use('/cadastro', cadastroRoutes);
router.use('/setup', setupRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/perfis', perfisRoutes);
router.use('/pacientes', pacientesRoutes);
router.use('/convenios', conveniosRoutes);
router.use('/procedimentos', procedimentosRoutes);
router.use('/profissionais', profissionaisRoutes);
router.use('/agenda', agendaRoutes);

export default router;
