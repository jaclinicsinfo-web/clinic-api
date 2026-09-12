import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export async function listarRegras(clinicaId: string) {
  return prisma.regraLembrete.findMany({
    where: { clinicaId },
    include: {
      templateWhatsapp: true,
      templateEmail: true,
    },
    orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
  });
}

export async function listarRegrasAtivas(clinicaId: string, tipo?: string) {
  return prisma.regraLembrete.findMany({
    where: {
      clinicaId,
      ativo: true,
      ...(tipo ? { tipo } : {}),
    },
    include: {
      templateWhatsapp: true,
      templateEmail: true,
    },
    orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
  });
}

export async function buscarRegra(id: string, clinicaId: string) {
  return prisma.regraLembrete.findFirst({
    where: { id, clinicaId },
    include: { templateWhatsapp: true, templateEmail: true },
  });
}

export async function criarRegra(dados: Prisma.RegraLembreteUncheckedCreateInput) {
  return prisma.regraLembrete.create({
    data: dados,
    include: { templateWhatsapp: true, templateEmail: true },
  });
}

export async function atualizarRegra(id: string, clinicaId: string, dados: Prisma.RegraLembreteUncheckedUpdateInput) {
  await prisma.regraLembrete.updateMany({ where: { id, clinicaId }, data: dados });
  return buscarRegra(id, clinicaId);
}

export async function excluirRegra(id: string, clinicaId: string) {
  return prisma.regraLembrete.deleteMany({ where: { id, clinicaId } });
}
