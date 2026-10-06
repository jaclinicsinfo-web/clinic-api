import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { dataDeIso, dinheiro, hojeCivil } from '../lib/datas';
import { arredondarDinheiro } from '../lib/financeiro';
import { StatusEnvio } from '../lib/integracoes/constantes';
import { podeAvancarStatus } from '../lib/integracoes/regras';

const incluir = {
  agendamento: {
    select: {
      id: true,
      data: true,
      horaInicio: true,
      status: true,
      paciente: { select: { id: true, nome: true } },
      profissional: { select: { id: true, nome: true } },
    },
  },
  regra: { select: { id: true, nome: true, tipo: true } },
  template: { select: { id: true, nome: true, canal: true } },
} satisfies Prisma.EnvioLembreteInclude;

export type EnvioCompleto = Prisma.EnvioLembreteGetPayload<{ include: typeof incluir }>;

export interface FiltroEnvios {
  clinicaId: string;
  de?: Date;
  ate?: Date;
  canal?: string;
  status?: string;
  tipo?: string;
  profissionalId?: string;
  vazio?: boolean;
}

function whereFiltro(filtro: FiltroEnvios): Prisma.EnvioLembreteWhereInput {
  return {
    clinicaId: filtro.clinicaId,
    ...(filtro.canal ? { canal: filtro.canal } : {}),
    ...(filtro.status ? { status: filtro.status } : {}),
    ...(filtro.tipo ? { tipoLembrete: filtro.tipo } : {}),
    ...(filtro.de || filtro.ate
      ? {
          criadoEm: {
            ...(filtro.de ? { gte: filtro.de } : {}),
            ...(filtro.ate ? { lte: filtro.ate } : {}),
          },
        }
      : {}),
    ...(filtro.profissionalId ? { agendamento: { profissionalId: filtro.profissionalId } } : {}),
    ...(filtro.vazio ? { id: { in: [] } } : {}),
  };
}

export async function listarEnvios(filtro: FiltroEnvios, take = 200): Promise<EnvioCompleto[]> {
  return prisma.envioLembrete.findMany({
    where: whereFiltro(filtro),
    include: incluir,
    orderBy: { criadoEm: 'desc' },
    take,
  });
}

export async function buscarEnvio(id: string, clinicaId: string) {
  return prisma.envioLembrete.findFirst({
    where: { id, clinicaId },
    include: incluir,
  });
}

export async function buscarPorChave(clinicaId: string, chaveIdempotencia: string) {
  return prisma.envioLembrete.findUnique({
    where: { clinicaId_chaveIdempotencia: { clinicaId, chaveIdempotencia } },
  });
}

export async function criarEnvioSeNovo(dados: Prisma.EnvioLembreteUncheckedCreateInput) {
  try {
    return await prisma.envioLembrete.create({ data: dados });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return null;
    }
    throw err;
  }
}

export async function listarPendentes(agora = new Date(), take = 50, clinicaId?: string) {
  return prisma.envioLembrete.findMany({
    where: {
      status: 'pendente',
      processarEm: { lte: agora },
      ...(clinicaId ? { clinicaId } : {}),
    },
    orderBy: { processarEm: 'asc' },
    take,
  });
}

export async function reivindicarEnvio(id: string, clinicaId: string) {
  const resultado = await prisma.envioLembrete.updateMany({
    where: { id, clinicaId, status: 'pendente' },
    data: { status: 'processando', tentativas: { increment: 1 } },
  });
  if (resultado.count === 0) return null;
  return prisma.envioLembrete.findFirst({ where: { id, clinicaId } });
}

export async function atualizarEnvio(
  id: string,
  clinicaId: string,
  dados: Prisma.EnvioLembreteUpdateInput,
) {
  return prisma.envioLembrete.update({ where: { id, clinicaId }, data: dados });
}

export async function cancelarPendentesDoAgendamento(params: {
  clinicaId: string;
  agendamentoId: string;
  tipo?: string;
}) {
  return prisma.envioLembrete.updateMany({
    where: {
      clinicaId: params.clinicaId,
      agendamentoId: params.agendamentoId,
      status: { in: ['pendente', 'processando'] },
      ...(params.tipo ? { tipoLembrete: params.tipo } : {}),
    },
    data: { status: 'cancelado', erro: 'Agendamento não permite mais este lembrete.' },
  });
}

export async function atualizarPorProvedor(params: {
  clinicaId?: string;
  provedorMessageId: string;
  status: StatusEnvio;
  erro?: string | null;
}) {
  const envio = await prisma.envioLembrete.findFirst({
    where: {
      provedorMessageId: params.provedorMessageId,
      ...(params.clinicaId ? { clinicaId: params.clinicaId } : {}),
    },
  });
  if (!envio) return null;
  if (!podeAvancarStatus(envio.status, params.status) && envio.status !== params.status) {
    return envio;
  }

  const agora = new Date();
  return prisma.envioLembrete.update({
    where: { id: envio.id, clinicaId: envio.clinicaId },
    data: {
      status: params.status,
      erro: params.erro ?? envio.erro,
      ...(params.status === 'enviado' && !envio.enviadoEm ? { enviadoEm: agora } : {}),
      ...(params.status === 'entregue' ? { entregueEm: agora } : {}),
      ...(params.status === 'lido' ? { lidoEm: agora } : {}),
    },
  });
}

export async function marcarLembreteAgendamento(agendamentoId: string, clinicaId: string) {
  return prisma.agendamento.update({
    where: { id: agendamentoId, clinicaId },
    data: { lembreteEnviado: true },
  });
}

export async function resumoDashboard(filtro: FiltroEnvios) {
  const where = whereFiltro(filtro);
  const hojeInicio = dataDeIso(hojeCivil()) as Date;

  const [total, hoje, agrupadoStatus, agrupadoCanal, custoAggs, agendamentos] = await Promise.all([
    prisma.envioLembrete.count({ where }),
    prisma.envioLembrete.count({
      where: { ...where, criadoEm: { gte: hojeInicio } },
    }),
    prisma.envioLembrete.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
    prisma.envioLembrete.groupBy({
      by: ['canal'],
      where,
      _count: { _all: true },
      _sum: { custo: true },
    }),
    prisma.envioLembrete.aggregate({
      where,
      _sum: { custo: true },
    }),
    prisma.envioLembrete.findMany({
      where,
      distinct: ['agendamentoId'],
      select: { agendamentoId: true },
    }),
  ]);

  const porStatus = Object.fromEntries(agrupadoStatus.map((item) => [item.status, item._count._all]));
  const enviados = (porStatus.enviado ?? 0) + (porStatus.entregue ?? 0) + (porStatus.lido ?? 0);
  const falhos = porStatus.falhou ?? 0;
  const pendentes = (porStatus.pendente ?? 0) + (porStatus.processando ?? 0);
  const custoTotal = arredondarDinheiro(dinheiro(custoAggs._sum.custo));
  const whatsapp = agrupadoCanal.find((item) => item.canal === 'whatsapp');
  const email = agrupadoCanal.find((item) => item.canal === 'email');

  return {
    total,
    hoje,
    whatsapp: whatsapp?._count._all ?? 0,
    email: email?._count._all ?? 0,
    enviados,
    entregues: (porStatus.entregue ?? 0) + (porStatus.lido ?? 0),
    falhos,
    pendentes,
    cancelados: porStatus.cancelado ?? 0,
    lidos: porStatus.lido ?? 0,
    custoTotal,
    custoWhatsapp: arredondarDinheiro(dinheiro(whatsapp?._sum.custo)),
    custoEmail: arredondarDinheiro(dinheiro(email?._sum.custo)),
    custoMedio: total > 0 ? arredondarDinheiro(custoTotal / total) : 0,
    taxaSucesso: total > 0 ? arredondarDinheiro((enviados / total) * 100) : 0,
    taxaFalha: total > 0 ? arredondarDinheiro((falhos / total) * 100) : 0,
    agendamentosImpactados: agendamentos.length,
  };
}
