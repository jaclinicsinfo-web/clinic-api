import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const incluirPonto = {
  usuario: { select: { id: true, nome: true, email: true, status: true, perfil: { select: { nome: true } } } },
  registradoPor: { select: { id: true, nome: true } },
} satisfies Prisma.RegistroPontoInclude;

const incluirHolerite = {
  usuario: { select: { id: true, nome: true, email: true, status: true, perfil: { select: { nome: true } } } },
  criadoPor: { select: { id: true, nome: true } },
} satisfies Prisma.HoleriteInclude;

export type RegistroPontoCompleto = Prisma.RegistroPontoGetPayload<{ include: typeof incluirPonto }>;
export type HoleriteCompleto = Prisma.HoleriteGetPayload<{ include: typeof incluirHolerite }>;
export type HoleriteArquivo = Prisma.HoleriteGetPayload<object>;

export interface UsuarioRh {
  id: string;
  nome: string;
  email: string;
  status: string;
  perfilNome: string;
}

export interface DadosPonto {
  clinicaId: string;
  usuarioId: string;
  data: Date;
  entrada: string | null;
  saidaIntervalo: string | null;
  retornoIntervalo: string | null;
  saida: string | null;
  observacao: string | null;
  origem: string;
  registradoPorId: string;
}

export interface DadosHolerite {
  clinicaId: string;
  usuarioId: string;
  competencia: string;
  nomeArquivo: string;
  mimeType: string;
  tamanhoKb: number;
  conteudo: Uint8Array;
  criadoPorId: string;
}

export async function listarUsuariosRh(clinicaId: string): Promise<UsuarioRh[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { clinicaId },
    select: {
      id: true,
      nome: true,
      email: true,
      status: true,
      perfil: { select: { nome: true } },
    },
    orderBy: { nome: 'asc' },
  });

  return usuarios.map((usuario) => ({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    status: usuario.status,
    perfilNome: usuario.perfil.nome,
  }));
}

export async function usuarioPertenceAClinica(id: string, clinicaId: string) {
  return prisma.usuario.findFirst({
    where: { id, clinicaId },
    select: { id: true, status: true },
  });
}

export async function listarRegistrosPonto(params: {
  clinicaId: string;
  inicio: Date;
  fim: Date;
  usuarioId?: string;
}): Promise<RegistroPontoCompleto[]> {
  return prisma.registroPonto.findMany({
    where: {
      clinicaId: params.clinicaId,
      data: { gte: params.inicio, lte: params.fim },
      ...(params.usuarioId ? { usuarioId: params.usuarioId } : {}),
    },
    include: incluirPonto,
    orderBy: [{ data: 'desc' }, { usuario: { nome: 'asc' } }],
  });
}

export async function buscarRegistroPonto(id: string, clinicaId: string) {
  return prisma.registroPonto.findFirst({
    where: { id, clinicaId },
    include: incluirPonto,
  });
}

export async function buscarPontoDoDia(clinicaId: string, usuarioId: string, data: Date) {
  return prisma.registroPonto.findFirst({
    where: { clinicaId, usuarioId, data },
    include: incluirPonto,
  });
}

export async function criarRegistroPonto(dados: DadosPonto) {
  return prisma.registroPonto.create({
    data: dados,
    include: incluirPonto,
  });
}

export async function atualizarRegistroPonto(
  id: string,
  dados: Omit<DadosPonto, 'clinicaId' | 'usuarioId' | 'data' | 'origem' | 'registradoPorId'> & {
    origem?: string;
    registradoPorId?: string;
  },
) {
  return prisma.registroPonto.update({
    where: { id },
    data: dados,
    include: incluirPonto,
  });
}

export async function removerRegistroPonto(id: string) {
  await prisma.registroPonto.delete({ where: { id } });
}

export async function listarHolerites(params: {
  clinicaId: string;
  competencia?: string;
  usuarioId?: string;
}): Promise<HoleriteCompleto[]> {
  return prisma.holerite.findMany({
    where: {
      clinicaId: params.clinicaId,
      ...(params.competencia ? { competencia: params.competencia } : {}),
      ...(params.usuarioId ? { usuarioId: params.usuarioId } : {}),
    },
    include: incluirHolerite,
    orderBy: [{ competencia: 'desc' }, { usuario: { nome: 'asc' } }],
  });
}

export async function listarCompetenciasHolerite(clinicaId: string, usuarioId?: string) {
  const itens = await prisma.holerite.findMany({
    where: {
      clinicaId,
      ...(usuarioId ? { usuarioId } : {}),
    },
    select: { competencia: true },
    distinct: ['competencia'],
    orderBy: { competencia: 'desc' },
  });
  return itens.map((item) => item.competencia);
}

export async function buscarHolerite(id: string, clinicaId: string) {
  return prisma.holerite.findFirst({
    where: { id, clinicaId },
    include: incluirHolerite,
  });
}

export async function buscarHoleriteArquivo(id: string, clinicaId: string) {
  return prisma.holerite.findFirst({ where: { id, clinicaId } });
}

export async function buscarHoleritePorCompetencia(clinicaId: string, usuarioId: string, competencia: string) {
  return prisma.holerite.findFirst({
    where: { clinicaId, usuarioId, competencia },
    select: { id: true },
  });
}

export async function criarHolerite(dados: DadosHolerite) {
  return prisma.holerite.create({
    data: {
      clinicaId: dados.clinicaId,
      usuarioId: dados.usuarioId,
      competencia: dados.competencia,
      nomeArquivo: dados.nomeArquivo,
      mimeType: dados.mimeType,
      tamanhoKb: dados.tamanhoKb,
      conteudo: Buffer.from(dados.conteudo),
      criadoPorId: dados.criadoPorId,
    },
    include: incluirHolerite,
  });
}

export async function removerHolerite(id: string) {
  await prisma.holerite.delete({ where: { id } });
}
