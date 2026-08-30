import { Plano } from '@prisma/client';
import { UsuarioCompleto } from '../models/usuario.model';
import { UsoUsuarios } from '../models/plano.model';

export function unidadeResumo(unidade: { id: string; nome: string; cidade: string }) {
  return { id: unidade.id, nome: unidade.nome, cidade: unidade.cidade };
}

export function planoResumo(plano: Plano) {
  return {
    codigo: plano.codigo,
    nome: plano.nome,
    limiteUsuarios: plano.limiteUsuarios,
  };
}

export function usuarioResumo(usuario: UsuarioCompleto) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfilId: usuario.perfilId,
    perfilNome: usuario.perfil.nome,
    unidadesAcesso: usuario.usuarioUnidades.map((uu) => uu.unidadeId),
    status: usuario.status,
    ultimoAcesso: usuario.ultimoAcesso ? usuario.ultimoAcesso.toISOString() : null,
  };
}

/**
 * Payload de sessão compartilhado entre login e cadastro pós-compra.
 */
export function montarSessao(params: {
  token: string;
  usuario: UsuarioCompleto;
  unidadeAtualId: string | null;
  uso: UsoUsuarios;
}) {
  const { token, usuario, unidadeAtualId, uso } = params;
  const unidades = usuario.usuarioUnidades.map((uu) => unidadeResumo(uu.unidade));

  return {
    token,
    usuario: usuarioResumo(usuario),
    unidades,
    unidadeAtualId,
    plano: planoResumo(usuario.clinica.plano),
    usoUsuarios: { usados: uso.usados, limite: uso.limite },
  };
}

export function montarMe(params: {
  usuario: UsuarioCompleto;
  unidadeAtualId: string | null;
  uso: UsoUsuarios;
}) {
  const { usuario, unidadeAtualId, uso } = params;
  const unidades = usuario.usuarioUnidades.map((uu) => unidadeResumo(uu.unidade));

  return {
    usuario: usuarioResumo(usuario),
    unidades,
    unidadeAtualId,
    perfil: {
      id: usuario.perfil.id,
      nome: usuario.perfil.nome,
      permissoes: usuario.perfil.permissoes,
    },
    plano: planoResumo(usuario.clinica.plano),
    usoUsuarios: { usados: uso.usados, limite: uso.limite },
  };
}

export function montarSelecaoUnidade(params: {
  token: string;
  unidade: { id: string; nome: string; cidade: string };
}) {
  return {
    token: params.token,
    unidadeAtualId: params.unidade.id,
    unidade: unidadeResumo(params.unidade),
  };
}

export function montarLogout() {
  return { ok: true };
}
