import { UsuarioCompleto } from '../models/usuario.model';
import { UsoUsuarios } from '../models/plano.model';
import { montarSessao } from './auth.view';

export function montarStatusSetup(precisaSetup: boolean) {
  return { precisaSetup };
}

export function montarSetup(params: {
  token: string;
  usuario: UsuarioCompleto;
  unidadeAtualId: string | null;
  uso: UsoUsuarios;
}) {
  return montarSessao(params);
}
