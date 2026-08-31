import { Request } from 'express';
import { buscarPorId, UsuarioCompleto } from '../models/usuario.model';
import { buscarPorUsuarioId } from '../models/profissional.model';
import { NOME_PERFIL_PROFISSIONAL_SAUDE } from './perfis-padrao';
import { AppError } from './erros';

const PERFIS_PRONTUARIO = new Set(['Administrador', 'Gestor', NOME_PERFIL_PROFISSIONAL_SAUDE]);

export function ehProfissionalSaude(perfilNome: string) {
  return perfilNome === NOME_PERFIL_PROFISSIONAL_SAUDE;
}

export function podeVerProntuario(perfilNome: string) {
  return PERFIS_PRONTUARIO.has(perfilNome);
}

export function podeRegistrarProntuario(perfilNome: string) {
  return PERFIS_PRONTUARIO.has(perfilNome);
}

export async function carregarUsuario(req: Request): Promise<UsuarioCompleto> {
  const usuario = await buscarPorId(req.auth!.sub);
  if (!usuario || usuario.status !== 'ativo') {
    throw new AppError(401, 'Sessão expirada. Entre novamente.');
  }
  return usuario;
}

export async function carregarContextoClinico(req: Request) {
  const usuario = await carregarUsuario(req);
  const profissional = ehProfissionalSaude(usuario.perfil.nome)
    ? await buscarPorUsuarioId(usuario.id, usuario.clinicaId)
    : null;

  return {
    usuario,
    profissional,
    somenteProprios: ehProfissionalSaude(usuario.perfil.nome),
    profissionalIdEscopo: ehProfissionalSaude(usuario.perfil.nome) ? (profissional?.id ?? null) : null,
  };
}

export function exigirProfissionalVinculado(somenteProprios: boolean, profissionalIdEscopo: string | null) {
  if (somenteProprios && !profissionalIdEscopo) {
    throw new AppError(403, 'Seu login não está vinculado a um cadastro clínico de profissional.');
  }
}

export function exigirUnidade(req: Request): string {
  const unidadeId = req.auth!.unidadeAtualId;
  if (!unidadeId) {
    throw new AppError(400, 'Selecione uma unidade para continuar.');
  }
  return unidadeId;
}
