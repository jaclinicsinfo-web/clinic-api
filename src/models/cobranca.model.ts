import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { transacao } from '../lib/tenant';
import { dataCivil, dataDeIso, hojeCivil } from '../lib/datas';
import { adicionarMesesIso, arredondarDinheiro } from '../lib/financeiro';

const incluir = {
  paciente: { select: { id: true, nome: true, telefone: true } },
  convenio: { select: { id: true, nome: true } },
  parcelas: { orderBy: { numero: 'asc' as const } },
} satisfies Prisma.CobrancaInclude;

export type CobrancaCompleta = Prisma.CobrancaGetPayload<{ include: typeof incluir }>;

export interface DadosCobranca {
  clinicaId: string;
  unidadeId: string;
  pacienteId: string;
  agendamentoId?: string | null;
  descricao: string;
  valor: number;
  formaPagamento?: string | null;
  convenioId?: string | null;
  status?: string;
  vencimento: Date;
  observacoes?: string | null;
}

export async function listarPorClinica(clinicaId: string, pacienteId?: string): Promise<CobrancaCompleta[]> {
  return prisma.cobranca.findMany({
    where: { clinicaId, ...(pacienteId ? { pacienteId } : {}) },
    include: incluir,
    orderBy: [{ vencimento: 'desc' }, { criadoEm: 'desc' }],
  });
}

export async function buscarPorIdEClinica(id: string, clinicaId: string): Promise<CobrancaCompleta | null> {
  return prisma.cobranca.findFirst({
    where: { id, clinicaId },
    include: incluir,
  });
}

export async function buscarPorAgendamento(agendamentoId: string, clinicaId: string) {
  return prisma.cobranca.findFirst({
    where: { agendamentoId, clinicaId },
    include: incluir,
  });
}

export async function criar(dados: DadosCobranca): Promise<CobrancaCompleta> {
  return prisma.cobranca.create({
    data: {
      clinicaId: dados.clinicaId,
      unidadeId: dados.unidadeId,
      pacienteId: dados.pacienteId,
      agendamentoId: dados.agendamentoId ?? null,
      descricao: dados.descricao,
      valor: dados.valor,
      formaPagamento: dados.formaPagamento ?? null,
      convenioId: dados.convenioId ?? null,
      status: dados.status ?? 'pendente',
      vencimento: dados.vencimento,
      observacoes: dados.observacoes ?? null,
    },
    include: incluir,
  });
}

export async function registrarPagamento(params: {
  id: string;
  clinicaId: string;
  formaPagamento: string;
  pagoEm: Date;
  observacoes?: string | null;
}): Promise<CobrancaCompleta> {
  return prisma.cobranca.update({
    where: { id: params.id, clinicaId: params.clinicaId },
    data: {
      status: 'pago',
      formaPagamento: params.formaPagamento,
      pagoEm: params.pagoEm,
      observacoes: params.observacoes,
    },
    include: incluir,
  });
}

export async function cancelar(id: string, clinicaId: string): Promise<CobrancaCompleta> {
  return prisma.cobranca.update({
    where: { id, clinicaId },
    data: { status: 'cancelado' },
    include: incluir,
  });
}

export async function parcelar(params: {
  id: string;
  clinicaId: string;
  quantidade: number;
  vencimentoBase: string;
  valorTotal: number;
  formaPagamento?: string | null;
}): Promise<CobrancaCompleta> {
  const quantidade = params.quantidade;
  const base = arredondarDinheiro(params.valorTotal / quantidade);
  const parcelas = Array.from({ length: quantidade }, (_, index) => {
    const ultima = index === quantidade - 1;
    return {
      numero: index + 1,
      valor: ultima ? arredondarDinheiro(params.valorTotal - base * (quantidade - 1)) : base,
      vencimento: dataDeIso(adicionarMesesIso(params.vencimentoBase, index)) as Date,
      status: 'pendente',
    };
  });

  await transacao(async (tx) => {
    const cobranca = await tx.cobranca.findFirst({
      where: { id: params.id, clinicaId: params.clinicaId },
      select: { id: true },
    });
    if (!cobranca) throw new Error('Cobrança não encontrada após parcelar.');

    await tx.parcelaCobranca.deleteMany({ where: { cobrancaId: cobranca.id } });
    await tx.parcelaCobranca.createMany({
      data: parcelas.map((parcela) => ({ cobrancaId: cobranca.id, ...parcela })),
    });
    await tx.cobranca.update({
      where: { id: cobranca.id, clinicaId: params.clinicaId },
      data: { status: 'parcelado', formaPagamento: params.formaPagamento ?? undefined },
    });
  });

  const atualizada = await prisma.cobranca.findFirst({
    where: { id: params.id, clinicaId: params.clinicaId },
    include: incluir,
  });
  if (!atualizada) throw new Error('Cobrança não encontrada após parcelar.');
  return atualizada;
}

export async function pagarParcela(params: {
  cobrancaId: string;
  clinicaId: string;
  numero: number;
  formaPagamento: string;
  pagoEm: Date;
}): Promise<CobrancaCompleta> {
  const existente = await prisma.cobranca.findFirst({
    where: { id: params.cobrancaId, clinicaId: params.clinicaId },
    select: { id: true },
  });
  if (!existente) throw new Error('Cobrança não encontrada após pagar parcela.');

  await prisma.parcelaCobranca.updateMany({
    where: { cobrancaId: existente.id, numero: params.numero },
    data: { status: 'pago', pagoEm: params.pagoEm, formaPagamento: params.formaPagamento },
  });

  const cobranca = await prisma.cobranca.findFirst({
    where: { id: params.cobrancaId, clinicaId: params.clinicaId },
    include: incluir,
  });
  if (!cobranca) throw new Error('Cobrança não encontrada após pagar parcela.');

  const todasPagas = cobranca.parcelas.every((parcela) => parcela.status === 'pago');
  if (todasPagas) {
    return prisma.cobranca.update({
      where: { id: params.cobrancaId, clinicaId: params.clinicaId },
      data: { status: 'pago', formaPagamento: params.formaPagamento, pagoEm: params.pagoEm },
      include: incluir,
    });
  }

  return cobranca;
}

export async function marcarPagas(ids: string[], clinicaId: string, formaPagamento: string, pagoEm: Date) {
  if (ids.length === 0) return;
  await prisma.cobranca.updateMany({
    where: { id: { in: ids }, clinicaId },
    data: { status: 'pago', formaPagamento, pagoEm },
  });
}

export async function saldosPorPaciente(clinicaId: string, pacienteIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (pacienteIds.length === 0) return mapa;

  const cobrancas = await prisma.cobranca.findMany({
    where: {
      clinicaId,
      pacienteId: { in: pacienteIds },
      status: { in: ['pendente', 'parcelado'] },
    },
    select: {
      pacienteId: true,
      valor: true,
      status: true,
      vencimento: true,
      parcelas: { select: { status: true, valor: true, vencimento: true } },
    },
  });

  for (const cobranca of cobrancas) {
    let aberto = 0;
    if (cobranca.parcelas.length > 0) {
      aberto = cobranca.parcelas
        .filter((parcela) => parcela.status !== 'pago')
        .reduce((total, parcela) => total + Number(parcela.valor), 0);
    } else {
      aberto = Number(cobranca.valor);
    }
    mapa.set(cobranca.pacienteId, arredondarDinheiro((mapa.get(cobranca.pacienteId) ?? 0) + aberto));
  }

  return mapa;
}

export async function listarInadimplentes(clinicaId: string) {
  const cobrancas = await prisma.cobranca.findMany({
    where: { clinicaId, status: { in: ['pendente', 'parcelado'] } },
    include: {
      paciente: { select: { id: true, nome: true, telefone: true } },
      parcelas: { select: { status: true, valor: true, vencimento: true } },
    },
  });

  const hoje = hojeCivil();
  const porPaciente = new Map<string, { id: string; nome: string; telefone: string; valorEmAberto: number }>();

  for (const cobranca of cobrancas) {
    const atrasada =
      cobranca.status === 'pendente'
        ? (dataCivil(cobranca.vencimento) ?? '') < hoje
        : cobranca.parcelas.some(
            (parcela) => parcela.status !== 'pago' && (dataCivil(parcela.vencimento) ?? '') < hoje,
          );
    if (!atrasada) continue;

    let aberto = 0;
    if (cobranca.parcelas.length > 0) {
      aberto = cobranca.parcelas
        .filter((parcela) => parcela.status !== 'pago')
        .reduce((total, parcela) => total + Number(parcela.valor), 0);
    } else {
      aberto = Number(cobranca.valor);
    }

    const atual = porPaciente.get(cobranca.pacienteId);
    if (atual) {
      atual.valorEmAberto = arredondarDinheiro(atual.valorEmAberto + aberto);
    } else {
      porPaciente.set(cobranca.pacienteId, {
        id: cobranca.paciente.id,
        nome: cobranca.paciente.nome,
        telefone: cobranca.paciente.telefone,
        valorEmAberto: arredondarDinheiro(aberto),
      });
    }
  }

  return [...porPaciente.values()].sort((a, b) => b.valorEmAberto - a.valorEmAberto);
}

export async function movimentosRecebidos(clinicaId: string, inicio: Date, fim: Date) {
  const [simples, parcelas] = await Promise.all([
    prisma.cobranca.findMany({
      where: {
        clinicaId,
        status: 'pago',
        parcelas: { none: {} },
        pagoEm: { gte: inicio, lte: fim },
      },
      select: { valor: true, pagoEm: true, convenioId: true },
    }),
    prisma.parcelaCobranca.findMany({
      where: {
        status: 'pago',
        pagoEm: { gte: inicio, lte: fim },
        cobranca: { clinicaId },
      },
      select: { valor: true, pagoEm: true, cobranca: { select: { convenioId: true } } },
    }),
  ]);

  return [
    ...simples.map((item) => ({
      valor: Number(item.valor),
      pagoEm: item.pagoEm,
      convenioId: item.convenioId,
    })),
    ...parcelas.map((item) => ({
      valor: Number(item.valor),
      pagoEm: item.pagoEm,
      convenioId: item.cobranca.convenioId,
    })),
  ];
}

export async function idsEmLote(cobrancaIds: string[], clinicaId: string): Promise<Set<string>> {
  if (cobrancaIds.length === 0) return new Set();
  const guias = await prisma.loteGuia.findMany({
    where: { cobrancaId: { in: cobrancaIds }, cobranca: { clinicaId } },
    select: { cobrancaId: true },
  });
  return new Set(guias.map((item) => item.cobrancaId));
}

export async function garantirDoAgendamento(params: {
  clinicaId: string;
  unidadeId: string;
  pacienteId: string;
  agendamentoId: string;
  descricao: string;
  valor: number;
  convenioId: string | null;
  particular: boolean;
  vencimento: Date;
}) {
  const existente = await prisma.cobranca.findFirst({
    where: { agendamentoId: params.agendamentoId, clinicaId: params.clinicaId },
    select: { id: true },
  });
  if (existente) return;

  await prisma.cobranca.create({
    data: {
      clinicaId: params.clinicaId,
      unidadeId: params.unidadeId,
      pacienteId: params.pacienteId,
      agendamentoId: params.agendamentoId,
      descricao: params.descricao,
      valor: params.valor,
      convenioId: params.convenioId,
      formaPagamento: params.particular ? null : 'convenio',
      status: 'pendente',
      vencimento: params.vencimento,
    },
  });
}
