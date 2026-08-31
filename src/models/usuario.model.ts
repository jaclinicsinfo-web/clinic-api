import { Prisma, Usuario, PrismaClient } from '@prisma/client';
import { prisma } from '../config/database';
import { gerarHash } from '../lib/password';
import { NOME_PERFIL_ADMINISTRADOR, NOME_PERFIL_PROFISSIONAL_SAUDE } from '../lib/perfis-padrao';
import { AppError } from '../lib/erros';
import { assertPodeAdicionarUsuario } from './plano.model';

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

const incluirRelacoes = {
  perfil: true,
  clinica: { include: { plano: true } },
  usuarioUnidades: { include: { unidade: true } },
} satisfies Prisma.UsuarioInclude;

export type UsuarioCompleto = Prisma.UsuarioGetPayload<{
  include: typeof incluirRelacoes;
}>;

export async function buscarPorEmail(email: string): Promise<UsuarioCompleto | null> {
  return prisma.usuario.findUnique({
    where: { email },
    include: incluirRelacoes,
  });
}

export async function buscarPorId(id: string): Promise<UsuarioCompleto | null> {
  return prisma.usuario.findUnique({
    where: { id },
    include: incluirRelacoes,
  });
}

export interface DadosNovoUsuario {
  clinicaId: string;
  nome: string;
  email: string;
  senha: string;
  perfilId: string;
  unidadeIds: string[];
  status?: 'ativo' | 'inativo';
}

/**
 * Cria um usuário. SEMPRE valida o limite de contas do plano ANTES de persistir.
 * Ponto único de criação de contas: setup, cadastro pós-compra e gestão em Configurações.
 */
export async function criarUsuario(
  dados: DadosNovoUsuario,
  tx: ClientePrisma = prisma,
): Promise<Usuario> {
  const status = dados.status ?? 'ativo';

  if (status === 'ativo') {
    await assertPodeAdicionarUsuario(dados.clinicaId, tx);
  }

  const senhaHash = await gerarHash(dados.senha);

  return tx.usuario.create({
    data: {
      clinicaId: dados.clinicaId,
      nome: dados.nome,
      email: dados.email,
      senhaHash,
      perfilId: dados.perfilId,
      status,
      usuarioUnidades: {
        create: dados.unidadeIds.map((unidadeId) => ({ unidadeId })),
      },
    },
  });
}

export async function listarPorClinica(clinicaId: string): Promise<UsuarioCompleto[]> {
  return prisma.usuario.findMany({
    where: { clinicaId },
    include: incluirRelacoes,
    orderBy: { criadoEm: 'desc' },
  });
}

export async function alterarStatus(
  id: string,
  status: 'ativo' | 'inativo',
): Promise<UsuarioCompleto> {
  if (status === 'ativo') {
    const atual = await buscarPorId(id);
    if (!atual) {
      throw new AppError(404, 'Usuário não encontrado.');
    }
    await assertPodeAdicionarUsuario(atual.clinicaId);
  }

  await prisma.usuario.update({ where: { id }, data: { status } });

  const atualizado = await buscarPorId(id);
  if (!atualizado) {
    throw new AppError(404, 'Usuário não encontrado.');
  }
  return atualizado;
}

export async function contarAdminsAtivos(
  clinicaId: string,
  excetoId?: string,
): Promise<number> {
  return prisma.usuario.count({
    where: {
      clinicaId,
      status: 'ativo',
      perfil: { nome: NOME_PERFIL_ADMINISTRADOR },
      ...(excetoId ? { id: { not: excetoId } } : {}),
    },
  });
}

export async function registrarAcesso(id: string): Promise<void> {
  await prisma.usuario.update({
    where: { id },
    data: { ultimoAcesso: new Date() },
  });
}

export async function possuiAcessoUnidade(
  usuarioId: string,
  unidadeId: string,
): Promise<boolean> {
  const vinculo = await prisma.usuarioUnidade.findUnique({
    where: { usuarioId_unidadeId: { usuarioId, unidadeId } },
  });
  return vinculo !== null;
}

export async function listarUsuariosSaude(clinicaId: string, excetoUsuarioId?: string) {
  return prisma.usuario.findMany({
    where: {
      clinicaId,
      status: 'ativo',
      perfil: { nome: NOME_PERFIL_PROFISSIONAL_SAUDE },
      ...(excetoUsuarioId ? { id: { not: excetoUsuarioId } } : {}),
    },
    select: {
      id: true,
      nome: true,
      email: true,
      profissional: { select: { id: true } },
    },
    orderBy: { nome: 'asc' },
  });
}

export async function buscarUsuarioDaClinica(id: string, clinicaId: string) {
  return prisma.usuario.findFirst({
    where: { id, clinicaId, status: 'ativo' },
    select: { id: true, nome: true, email: true, perfil: { select: { nome: true } } },
  });
}
