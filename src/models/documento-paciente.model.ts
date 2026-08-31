import { prisma } from '../config/database';

export async function listarPorPaciente(pacienteId: string, clinicaId: string) {
  return prisma.documentoPaciente.findMany({
    where: { pacienteId, clinicaId },
    select: {
      id: true,
      nome: true,
      tipo: true,
      origem: true,
      mimeType: true,
      tamanhoKb: true,
      criadoEm: true,
    },
    orderBy: { criadoEm: 'desc' },
  });
}

export async function criar(dados: {
  clinicaId: string;
  pacienteId: string;
  atendimentoId?: string | null;
  nome: string;
  tipo: string;
  origem: string;
  mimeType: string;
  tamanhoKb: number;
  conteudo: Uint8Array;
  criadoPorId: string;
}) {
  return prisma.documentoPaciente.create({
    data: {
      clinicaId: dados.clinicaId,
      pacienteId: dados.pacienteId,
      atendimentoId: dados.atendimentoId ?? null,
      nome: dados.nome,
      tipo: dados.tipo,
      origem: dados.origem,
      mimeType: dados.mimeType,
      tamanhoKb: dados.tamanhoKb,
      conteudo: Buffer.from(dados.conteudo),
      criadoPorId: dados.criadoPorId,
    } as Parameters<typeof prisma.documentoPaciente.create>[0]['data'],
    select: {
      id: true,
      nome: true,
      tipo: true,
      origem: true,
      mimeType: true,
      tamanhoKb: true,
      criadoEm: true,
    },
  });
}

export async function buscarPorId(id: string, pacienteId: string, clinicaId: string) {
  return prisma.documentoPaciente.findFirst({
    where: { id, pacienteId, clinicaId },
  });
}

export async function remover(id: string) {
  await prisma.documentoPaciente.delete({ where: { id } });
}
