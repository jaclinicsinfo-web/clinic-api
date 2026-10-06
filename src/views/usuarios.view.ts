import { PerfilAcesso, Plano, Unidade } from '@prisma/client';
import { UsuarioCompleto } from '../models/usuario.model';
import { UsoUsuarios } from '../models/plano.model';
import { montarPermissoesDoPerfil } from '../lib/permissoes';
import { planoResumo, unidadeResumo, usuarioResumo } from './auth.view';

export function perfilCompleto(perfil: PerfilAcesso) {
  return {
    id: perfil.id,
    nome: perfil.nome,
    descricao: perfil.descricao,
    sistema: perfil.sistema,
    isolarDados: perfil.isolarDados,
    permissoes: montarPermissoesDoPerfil(perfil),
  };
}

function montarUso(uso: UsoUsuarios) {
  return {
    usados: uso.usados,
    limite: uso.limite,
    podeAdicionar: uso.podeAdicionar,
  };
}

export function montarListaUsuarios(params: {
  usuarios: UsuarioCompleto[];
  perfis: PerfilAcesso[];
  unidades: Unidade[];
  plano: Plano;
  uso: UsoUsuarios;
}) {
  return {
    usuarios: params.usuarios.map(usuarioResumo),
    perfis: params.perfis.map(perfilCompleto),
    unidades: params.unidades.map(unidadeResumo),
    plano: planoResumo(params.plano),
    usoUsuarios: montarUso(params.uso),
  };
}

export function montarUsuarioMutacao(params: {
  usuario: UsuarioCompleto;
  uso: UsoUsuarios;
}) {
  return {
    usuario: usuarioResumo(params.usuario),
    usoUsuarios: montarUso(params.uso),
  };
}
