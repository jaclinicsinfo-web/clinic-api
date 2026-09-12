import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { custoDaPlataforma, custosDaPlataforma } from '../lib/integracoes/custos-plataforma';

export async function sincronizarCustosDaPlataforma(clinicaId: string) {
  const tabela = custosDaPlataforma();
  for (const item of tabela) {
    await prisma.custoEnvio.upsert({
      where: {
        clinicaId_canal_categoria: { clinicaId, canal: item.canal, categoria: item.categoria },
      },
      create: {
        clinicaId,
        canal: item.canal,
        categoria: item.categoria,
        valor: new Prisma.Decimal(item.valor),
        ativo: true,
      },
      update: { valor: new Prisma.Decimal(item.valor), ativo: true },
    });
  }
}

export async function listarCustos(clinicaId: string) {
  await sincronizarCustosDaPlataforma(clinicaId);
  return prisma.custoEnvio.findMany({
    where: { clinicaId },
    orderBy: [{ canal: 'asc' }, { categoria: 'asc' }],
  });
}

export async function custoDoEnvio(_clinicaId: string, canal: string, categoria?: string | null): Promise<number> {
  return custoDaPlataforma(canal, categoria);
}
