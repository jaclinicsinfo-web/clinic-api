import { UsuarioCompleto } from '../models/usuario.model';
import { UsoUsuarios } from '../models/plano.model';
import { montarSessao } from './auth.view';

/**
 * Retorno do cadastro pós-compra: mesmo shape do login (sessão completa,
 * incluindo plano e uso de usuários).
 */
export function montarCadastro(params: {
  token: string;
  usuario: UsuarioCompleto;
  unidadeAtualId: string | null;
  uso: UsoUsuarios;
}) {
  return montarSessao(params);
}
