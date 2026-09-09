import { Router } from 'express';
import {
  arquivarPaciente,
  atualizarPaciente,
  baixarDocumento,
  criarPaciente,
  enviarDocumento,
  excluirDocumento,
  listarPacientes,
  obterPaciente,
  opcoesClinicasPaciente,
  opcoesPacientes,
  registrarEvolucao,
} from '../controllers/pacientes.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { exigirPermissao } from '../middlewares/permissao.middleware';
import { tratarUpload } from '../middlewares/upload.middleware';

const router = Router();

router.use(autenticar);
router.use(exigirPermissao('pacientes', 'visualizar'));

router.get('/', listarPacientes);
router.get('/opcoes', opcoesPacientes);
router.post('/', exigirPermissao('pacientes', 'criar'), criarPaciente);
router.get('/:id', obterPaciente);
router.get('/:id/opcoes-clinicas', opcoesClinicasPaciente);
router.patch('/:id', exigirPermissao('pacientes', 'editar'), atualizarPaciente);
router.patch('/:id/arquivar', exigirPermissao('pacientes', 'excluir'), arquivarPaciente);
router.post('/:id/atendimentos', exigirPermissao('pacientes', 'editar'), registrarEvolucao);
router.post('/:id/documentos', exigirPermissao('pacientes', 'editar'), tratarUpload, enviarDocumento);
router.get('/:id/documentos/:docId/arquivo', baixarDocumento);
router.delete('/:id/documentos/:docId', exigirPermissao('pacientes', 'excluir'), excluirDocumento);

export default router;
