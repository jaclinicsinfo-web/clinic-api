import { prisma, type ClientePrisma } from '../config/database';
import { FORMAS_PADRAO } from '../lib/financeiro';
import { transacao } from '../lib/tenant';

export async function criarPadrao(clinicaId: string, tx: ClientePrisma = prisma) {
  await tx.formaPagamento.createMany({
    data: FORMAS_PADRAO.map((item) => ({
      clinicaId,
      codigo: item.codigo,
      nome: item.nome,
      taxa: item.taxa,
      ordem: item.ordem,
      ativo: true,
    })),
  });
}

export async function listarPorClinica(clinicaId: string) {
  const existentes = await prisma.formaPagamento.findMany({
    where: { clinicaId },
    orderBy: { ordem: 'asc' },
  });
  if (existentes.length > 0) return existentes;
  await criarPadrao(clinicaId);
  return prisma.formaPagamento.findMany({
    where: { clinicaId },
    orderBy: { ordem: 'asc' },
  });
}

export async function substituir(
  clinicaId: string,
  itens: { codigo: string; nome: string; taxa: number; ativo: boolean; ordem: number }[],
) {
  await transacao(async (tx) => {
    const atuais = await tx.formaPagamento.findMany({ where: { clinicaId } });
    const porCodigo = new Map(atuais.map((item) => [item.codigo, item]));

    for (const item of itens) {
      const existente = porCodigo.get(item.codigo);
      if (existente) {
        await tx.formaPagamento.update({
          where: { id: existente.id, clinicaId },
          data: { nome: item.nome, taxa: item.taxa, ativo: item.ativo, ordem: item.ordem },
        });
        porCodigo.delete(item.codigo);
      } else {
        await tx.formaPagamento.create({
          data: {
            clinicaId,
            codigo: item.codigo,
            nome: item.nome,
            taxa: item.taxa,
            ativo: item.ativo,
            ordem: item.ordem,
          },
        });
      }
    }
  });

  return listarPorClinica(clinicaId);
}
