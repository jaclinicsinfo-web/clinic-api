import { Prisma, Usuario, PrismaClient } from '@prisma/client';
import { prisma } from '../config/database';
import { gerarHash } from '../lib/password';
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
 * Este é o ponto único de criação de contas, usado pelo cadastro e pelo endpoint
 * interno futuro de gestão de usuários.
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
