import { Plano } from '@prisma/client';
import { UsuarioCompleto } from '../models/usuario.model';
import { UsoUsuarios } from '../models/plano.model';
import { permissoesEfetivas } from '../lib/permissoes';
import { limiteUnidadesDoPlano, modulosDoPlano } from '../lib/modulos-plano';

export function unidadeResumo(unidade: { id: string; nome: string; cidade: string; ativo?: boolean }) {
  return {
    id: unidade.id,
    nome: unidade.nome,
    cidade: unidade.cidade,
    ativo: unidade.ativo ?? true,
  };
}

function unidadesAtivasDoUsuario(usuario: UsuarioCompleto) {
  return usuario.usuarioUnidades
    .filter((item) => item.unidade.ativo)
    .map((item) => unidadeResumo(item.unidade));
}

export function planoResumo(plano: Plano) {
  return {
    codigo: plano.codigo,
    nome: plano.nome,
    limiteUsuarios: plano.limiteUsuarios,
    limiteUnidades: limiteUnidadesDoPlano(plano.codigo),
    modulos: [...modulosDoPlano(plano.codigo)],
  };
}

export function perfilResumo(
  perfil: { id: string; nome: string; permissoes: unknown; isolarDados: boolean },
  codigoPlano: string,
) {
  return {
    id: perfil.id,
    nome: perfil.nome,
    isolarDados: perfil.isolarDados,
    permissoes: permissoesEfetivas(perfil, codigoPlano),
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
    tema: usuario.tema === 'escuro' ? 'escuro' : 'claro',
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
  const unidades = unidadesAtivasDoUsuario(usuario);

  return {
    token,
    usuario: usuarioResumo(usuario),
    unidades,
    unidadeAtualId,
    clinicaNome: usuario.clinica.nomeFantasia,
    clinicaId: usuario.clinicaId,
    perfil: perfilResumo(usuario.perfil, usuario.clinica.plano.codigo),
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
  const unidades = unidadesAtivasDoUsuario(usuario);

  return {
    usuario: usuarioResumo(usuario),
    unidades,
    unidadeAtualId,
    clinicaNome: usuario.clinica.nomeFantasia,
    clinicaId: usuario.clinicaId,
    perfil: perfilResumo(usuario.perfil, usuario.clinica.plano.codigo),
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
