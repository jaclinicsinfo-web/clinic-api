import { Prisma, Clinica, PrismaClient } from '@prisma/client';
import { prisma } from '../config/database';
import { criarUnidade } from './unidade.model';
import { criarPerfisPadrao } from './perfil-acesso.model';
import { criarUsuario, buscarPorId as buscarUsuarioPorId, UsuarioCompleto } from './usuario.model';
import { NOME_PERFIL_ADMINISTRADOR } from '../lib/perfis-padrao';
import { AppError } from '../lib/erros';

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

export async function criarClinica(
  dados: {
    nomeFantasia: string;
    razaoSocial: string;
    cnpj: string;
    telefone: string;
    email: string;
    planoId: string;
  },
  tx: ClientePrisma = prisma,
): Promise<Clinica> {
  return tx.clinica.create({ data: dados });
}

export async function buscarPorCnpj(cnpj: string): Promise<Clinica | null> {
  return prisma.clinica.findUnique({ where: { cnpj } });
}

export async function buscarPorId(id: string): Promise<Clinica | null> {
  return prisma.clinica.findUnique({ where: { id } });
}

export async function sistemaPrecisaSetup(): Promise<boolean> {
  const total = await prisma.clinica.count();
  return total === 0;
}

export interface DadosCadastro {
  planoId: string;
  clinica: {
    nomeFantasia: string;
    razaoSocial: string;
    cnpj: string;
    telefone: string;
    email: string;
  };
  unidade: { nome: string; cidade: string };
  usuario: { nome: string; email: string; senha: string };
}

export interface ResultadoCadastro {
  clinica: Clinica;
  usuario: UsuarioCompleto;
}

const LOCK_SETUP_INICIAL = 872_341;

/**
 * Cadastro pós-compra (landing) ou setup do primeiro acesso.
 * Cria em uma única transação:
 * Clínica → Unidade → 5 Perfis de sistema → 1 Usuário Administrador (ativo).
 */
export async function criarCadastroPosCompra(
  dados: DadosCadastro,
  opcoes: { somenteSistemaVazio?: boolean } = {},
): Promise<ResultadoCadastro> {
  const { clinicaId, usuarioId } = await prisma.$transaction(async (tx) => {
    if (opcoes.somenteSistemaVazio) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_SETUP_INICIAL})`;
      const existentes = await tx.clinica.count();
      if (existentes > 0) {
        throw new AppError(409, 'O sistema já foi configurado. Entre com sua conta.');
      }
    }

    const clinica = await criarClinica(
      {
        nomeFantasia: dados.clinica.nomeFantasia,
        razaoSocial: dados.clinica.razaoSocial,
        cnpj: dados.clinica.cnpj,
        telefone: dados.clinica.telefone,
        email: dados.clinica.email,
        planoId: dados.planoId,
      },
      tx,
    );

    const unidade = await criarUnidade(
      { clinicaId: clinica.id, nome: dados.unidade.nome, cidade: dados.unidade.cidade },
      tx,
    );

    const perfis = await criarPerfisPadrao(clinica.id, tx);
    const perfilAdmin = perfis.find((p) => p.nome === NOME_PERFIL_ADMINISTRADOR);
    if (!perfilAdmin) {
      throw new AppError(500, 'Falha ao criar os perfis de acesso.');
    }

    const usuario = await criarUsuario(
      {
        clinicaId: clinica.id,
        nome: dados.usuario.nome,
        email: dados.usuario.email,
        senha: dados.usuario.senha,
        perfilId: perfilAdmin.id,
        unidadeIds: [unidade.id],
        status: 'ativo',
      },
      tx,
    );

    return { clinicaId: clinica.id, usuarioId: usuario.id };
  });

  const clinica = await buscarPorId(clinicaId);
  const usuario = await buscarUsuarioPorId(usuarioId);

  if (!clinica || !usuario) {
    throw new AppError(500, 'Falha ao concluir o cadastro.');
  }

  return { clinica, usuario };
}

/** Primeiro acesso no painel: só conclui se ainda não existir nenhuma clínica. */
export async function criarSetupInicial(dados: DadosCadastro): Promise<ResultadoCadastro> {
  return criarCadastroPosCompra(dados, { somenteSistemaVazio: true });
}
