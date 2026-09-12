import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export async function listarTemplates(clinicaId: string) {
  return prisma.templateMensagem.findMany({
    where: { clinicaId },
    orderBy: [{ canal: 'asc' }, { tipo: 'asc' }, { nome: 'asc' }],
  });
}

export async function buscarTemplate(id: string, clinicaId: string) {
  return prisma.templateMensagem.findFirst({ where: { id, clinicaId } });
}

export async function criarTemplate(dados: Prisma.TemplateMensagemUncheckedCreateInput) {
  return prisma.templateMensagem.create({ data: dados });
}

export async function atualizarTemplate(
  id: string,
  clinicaId: string,
  dados: Prisma.TemplateMensagemUncheckedUpdateInput,
) {
  await prisma.templateMensagem.updateMany({ where: { id, clinicaId }, data: dados });
  return buscarTemplate(id, clinicaId);
}

export async function excluirTemplate(id: string, clinicaId: string) {
  return prisma.templateMensagem.deleteMany({ where: { id, clinicaId, sistema: false } });
}
