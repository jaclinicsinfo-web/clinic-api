import { Router } from 'express';
import healthRoutes from './health.routes';
import planosRoutes from './planos.routes';
import authRoutes from './auth.routes';
import cadastroRoutes from './cadastro.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/planos', planosRoutes);
router.use('/auth', authRoutes);
router.use('/cadastro', cadastroRoutes);

export default router;
