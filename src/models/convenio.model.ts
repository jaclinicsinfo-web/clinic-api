import { prisma } from '../config/database';

export async function listarAtivosPorClinica(clinicaId: string) {
  return prisma.convenio.findMany({
    where: { clinicaId, status: 'ativo' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  });
}

export async function buscarPorIdEClinica(id: string, clinicaId: string) {
  return prisma.convenio.findFirst({
    where: { id, clinicaId },
    select: { id: true, nome: true, status: true },
  });
}
