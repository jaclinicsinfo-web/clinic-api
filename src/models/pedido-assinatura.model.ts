import { Prisma } from '@prisma/client';

import { prisma, type ClientePrisma } from '../config/database';
import { AppError } from '../lib/erros';
import { transacao } from '../lib/tenant';
import { valorMensalDe, type CicloCobranca, type ClinicaCobranca } from '../lib/assinatura';
import type { InscricaoInput } from '../validators/assinatura.validator';

/** Pedido em `processando` há mais tempo que isso é considerado abandonado (processo caiu no meio). */
const PROCESSANDO_EXPIRA_MS = 10 * 60 * 1000;

export interface DadosPedidoClinica {
  plano: string;
  ciclo: CicloCobranca;
  usuarioId: string;
}

export interface DadosPedidoTroca extends DadosPedidoClinica {
  troca: 'upgrade' | 'troca_ciclo';
}

/** O que o Mercado Pago informa do pagamento, gravado no pedido para o histórico e o recibo. */
export interface InfoPagamento {
  meio: string | null;
  parcelas: number | null;
  /** Com os juros do parcelamento, se houver. */
  totalPago: number | null;
}

/** O que a clínica tinha antes da troca: conferido na confirmação e restaurado no estorno. */
export interface SituacaoAnterior {
  planoCodigo: string;
  ciclo: CicloCobranca;
  pagoAte: Date | null;
}

export async function criarPedido(dados: InscricaoInput, valor: number) {
  return prisma.pedidoAssinatura.create({
    data: {
      tipo: 'nova_clinica',
      planoCodigo: dados.plano,
      ciclo: dados.ciclo === 'anual' ? 'anual' : 'mensal',
      valor,
      dados: dados as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function criarPedidoClinica(clinicaId: string, dados: DadosPedidoClinica, valor: number) {
  return prisma.pedidoAssinatura.create({
    data: {
      tipo: 'clinica_existente',
      clinicaId,
      planoCodigo: dados.plano,
      ciclo: dados.ciclo,
      valor,
      dados: dados as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function criarPedidoTroca(
  clinicaId: string,
  dados: DadosPedidoTroca,
  valor: number,
  anterior: SituacaoAnterior,
  credito: number | null,
) {
  return prisma.pedidoAssinatura.create({
    data: {
      tipo: 'troca_plano',
      clinicaId,
      planoCodigo: dados.plano,
      ciclo: dados.ciclo,
      valor,
      credito,
      planoAnteriorCodigo: anterior.planoCodigo,
      cicloAnterior: anterior.ciclo,
      pagoAteAnterior: anterior.pagoAte,
      dados: dados as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Cobrança automática aprovada vira um pedido como os outros. O id do pagamento já entra na criação:
 * o mesmo pagamento avisado duas vezes bate no índice único e devolve null.
 */
export async function criarPedidoRecorrente(dados: {
  clinicaId: string;
  assinaturaRecorrenteId: string;
  planoCodigo: string;
  ciclo: CicloCobranca;
  valor: number;
  pagamentoId: string;
}) {
  try {
    return await prisma.pedidoAssinatura.create({
      data: {
        tipo: 'recorrente',
        clinicaId: dados.clinicaId,
        assinaturaRecorrenteId: dados.assinaturaRecorrenteId,
        planoCodigo: dados.planoCodigo,
        ciclo: dados.ciclo,
        valor: dados.valor,
        pagamentoId: dados.pagamentoId,
        dados: { plano: dados.planoCodigo, ciclo: dados.ciclo } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

export async function buscarPedido(id: string) {
  return prisma.pedidoAssinatura.findUnique({ where: { id } });
}

export async function buscarPedidoPorPagamento(pagamentoId: string) {
  return prisma.pedidoAssinatura.findUnique({ where: { pagamentoId } });
}

export async function gravarPreferencia(id: string, preferenciaId: string) {
  return prisma.pedidoAssinatura.update({
    where: { id },
    data: { preferenciaId },
  });
}

export async function reservarPedido(id: string) {
  const abandonado = new Date(Date.now() - PROCESSANDO_EXPIRA_MS);
  const reservado = await prisma.pedidoAssinatura.updateMany({
    where: {
      id,
      OR: [
        // expirado: checkout abandonado, mas um Pix gerado antes ainda pode ser pago.
        { status: { in: ['pendente', 'revisao', 'expirado'] } },
        { status: 'processando', atualizadoEm: { lt: abandonado } },
      ],
    },
    data: { status: 'processando' },
  });
  return reservado.count === 1;
}

/** Trava a linha da clínica até o fim da transação: duas confirmações não se sobrescrevem. */
async function travarClinica(tx: ClientePrisma, clinicaId: string) {
  await tx.$queryRaw`SELECT id FROM clinicas WHERE id = ${clinicaId}::uuid FOR UPDATE`;
}

async function proximoNumeroRecibo(tx: ClientePrisma): Promise<number> {
  const [linha] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('pedidos_assinatura_recibo_seq') AS n`;
  return Number(linha.n);
}

export async function concluirPedido(
  id: string,
  dados: {
    clinicaId: string;
    pagamentoId: string | null;
    periodoInicio: Date;
    periodoFim: Date;
    info?: InfoPagamento | null;
  },
  tx: ClientePrisma = prisma,
) {
  return tx.pedidoAssinatura.update({
    where: { id },
    data: {
      status: 'pago',
      clinicaId: dados.clinicaId,
      pagamentoId: dados.pagamentoId,
      pagoEm: new Date(),
      periodoInicio: dados.periodoInicio,
      periodoFim: dados.periodoFim,
      meio: dados.info?.meio ?? null,
      parcelas: dados.info?.parcelas ?? null,
      totalPago: dados.info?.totalPago ?? null,
      numeroRecibo: await proximoNumeroRecibo(tx),
    },
  });
}

/**
 * Pagamento de período cheio de uma clínica que já existe: estende o vencimento e grava o pedido
 * como pago na mesma transação. `calcularPeriodo` recebe a clínica como está no banco.
 * O plano pago passa a valer e uma troca agendada é descartada (o pedido já trouxe o plano escolhido).
 */
export async function registrarPagamentoClinica(params: {
  pedidoId: string;
  clinicaId: string;
  planoCodigo: string;
  ciclo: CicloCobranca;
  pagamentoId: string | null;
  info?: InfoPagamento | null;
  calcularPeriodo: (clinica: ClinicaCobranca) => { inicio: Date; fim: Date };
}) {
  return transacao(async (tx) => {
    await travarClinica(tx, params.clinicaId);
    const clinica = await tx.clinica.findUnique({
      where: { id: params.clinicaId },
      select: { tipoAcesso: true, trialExpiraEm: true, pagoAte: true },
    });
    if (!clinica) throw new AppError(404, 'Clínica não encontrada.');
    const plano = await tx.plano.findUnique({ where: { codigo: params.planoCodigo } });
    if (!plano) throw new AppError(400, 'Plano inválido.');

    const { inicio, fim } = params.calcularPeriodo(clinica);
    await tx.clinica.update({
      where: { id: params.clinicaId },
      data: {
        tipoAcesso: 'pago',
        planoId: plano.id,
        cicloCobranca: params.ciclo,
        valorMensal: valorMensalDe(precos(plano), params.ciclo),
        situacaoCobranca: 'em_dia',
        pagoAte: fim,
        planoAgendadoId: null,
        cicloAgendado: null,
      },
    });
    await concluirPedido(
      params.pedidoId,
      {
        clinicaId: params.clinicaId,
        pagamentoId: params.pagamentoId,
        periodoInicio: inicio,
        periodoFim: fim,
        info: params.info,
      },
      tx,
    );
    return { inicio, fim };
  });
}

function precos(plano: { codigo: string; precoMensal: Prisma.Decimal; precoAnual: Prisma.Decimal }) {
  return { codigo: plano.codigo, precoMensal: Number(plano.precoMensal), precoAnual: Number(plano.precoAnual) };
}

export type ResultadoTrocaRegistrada =
  | { aplicada: true; inicio: Date; fim: Date }
  | { aplicada: false; motivo: string };

/**
 * Upgrade ou troca de ciclo: aplica o plano novo se a clínica ainda está como estava quando a troca
 * foi calculada (mesmo plano, ciclo e vencimento). Sem `pedidoId`, é a troca sem custo.
 * Upgrade mantém o vencimento e exige a clínica em dia; troca de ciclo começa um período novo
 * (`novoPeriodo`, contado de quando o crédito foi calculado).
 */
export async function registrarTrocaPlano(params: {
  pedidoId: string | null;
  clinicaId: string;
  planoCodigo: string;
  ciclo: CicloCobranca;
  esperado: SituacaoAnterior;
  novoPeriodo: { inicio: Date; fim: Date } | null;
  pagamentoId: string | null;
  info?: InfoPagamento | null;
}): Promise<ResultadoTrocaRegistrada> {
  return transacao(async (tx) => {
    await travarClinica(tx, params.clinicaId);
    const clinica = await tx.clinica.findUnique({
      where: { id: params.clinicaId },
      select: { pagoAte: true, cicloCobranca: true, plano: { select: { codigo: true } } },
    });
    if (!clinica) throw new AppError(404, 'Clínica não encontrada.');
    if (clinica.plano.codigo !== params.esperado.planoCodigo || clinica.cicloCobranca !== params.esperado.ciclo) {
      return { aplicada: false, motivo: `o plano mudou para ${clinica.plano.codigo} (${clinica.cicloCobranca}) depois da simulação` };
    }
    if ((clinica.pagoAte?.getTime() ?? null) !== (params.esperado.pagoAte?.getTime() ?? null)) {
      return { aplicada: false, motivo: 'o vencimento mudou depois da simulação (outro pagamento entrou)' };
    }
    if (!clinica.pagoAte) return { aplicada: false, motivo: 'a clínica não tem vencimento' };
    if (!params.novoPeriodo && clinica.pagoAte.getTime() <= Date.now()) {
      return { aplicada: false, motivo: 'a assinatura venceu antes da confirmação do upgrade' };
    }

    const plano = await tx.plano.findUnique({ where: { codigo: params.planoCodigo } });
    if (!plano) throw new AppError(400, 'Plano inválido.');
    const inicio = params.novoPeriodo?.inicio ?? new Date();
    const fim = params.novoPeriodo?.fim ?? clinica.pagoAte;

    await tx.clinica.update({
      where: { id: params.clinicaId },
      data: {
        planoId: plano.id,
        cicloCobranca: params.ciclo,
        valorMensal: valorMensalDe(precos(plano), params.ciclo),
        situacaoCobranca: 'em_dia',
        ...(params.novoPeriodo ? { pagoAte: params.novoPeriodo.fim } : {}),
        planoAgendadoId: null,
        cicloAgendado: null,
      },
    });
    if (params.pedidoId) {
      await concluirPedido(
        params.pedidoId,
        {
          clinicaId: params.clinicaId,
          pagamentoId: params.pagamentoId,
          periodoInicio: inicio,
          periodoFim: fim,
          info: params.info,
        },
        tx,
      );
    }
    return { aplicada: true, inicio, fim };
  });
}

/**
 * Estorno ou chargeback: o pedido sai de `pago` uma única vez.
 * Período cheio: o vencimento recua o tempo que aquele pagamento tinha dado.
 * Upgrade: volta o plano anterior e não mexe no vencimento.
 * Troca de ciclo: volta plano e ciclo, e o vencimento volta ao que era antes (mantendo pagamentos posteriores).
 */
export async function estornarPedido(id: string, pagamentoId: string): Promise<boolean> {
  return transacao(async (tx) => {
    const atual = await tx.pedidoAssinatura.findUnique({ where: { id }, select: { clinicaId: true } });
    if (atual?.clinicaId) await travarClinica(tx, atual.clinicaId);
    const marcado = await tx.pedidoAssinatura.updateMany({
      where: { id, pagamentoId, status: 'pago' },
      data: { status: 'estornado', estornadoEm: new Date() },
    });
    if (marcado.count !== 1) return false;

    const pedido = await tx.pedidoAssinatura.findUnique({ where: { id } });
    if (!pedido?.clinicaId || !pedido.periodoInicio || !pedido.periodoFim) return true;
    const clinica = await tx.clinica.findUnique({
      where: { id: pedido.clinicaId },
      select: { pagoAte: true, cicloCobranca: true, plano: { select: { codigo: true } } },
    });
    if (!clinica) return true;

    if (pedido.tipo === 'troca_plano') {
      const trocouCiclo = !ehUpgrade(pedido);
      const dados: Prisma.ClinicaUpdateInput = {};
      // Só desfaz o plano se ninguém trocou de novo depois deste pedido.
      if (pedido.planoAnteriorCodigo && clinica.plano.codigo === pedido.planoCodigo && clinica.cicloCobranca === pedido.ciclo) {
        const anterior = await tx.plano.findUnique({ where: { codigo: pedido.planoAnteriorCodigo } });
        const ciclo: CicloCobranca = pedido.cicloAnterior === 'anual' ? 'anual' : 'mensal';
        if (anterior) {
          dados.plano = { connect: { id: anterior.id } };
          dados.cicloCobranca = ciclo;
          dados.valorMensal = valorMensalDe(precos(anterior), ciclo);
        }
      }
      if (trocouCiclo && clinica.pagoAte) {
        const base = pedido.pagoAteAnterior ?? pedido.periodoInicio;
        dados.pagoAte = new Date(clinica.pagoAte.getTime() - (pedido.periodoFim.getTime() - base.getTime()));
      }
      if (Object.keys(dados).length > 0) await tx.clinica.update({ where: { id: pedido.clinicaId }, data: dados });
      return true;
    }

    if (!clinica.pagoAte) return true;
    const recuo = pedido.periodoFim.getTime() - pedido.periodoInicio.getTime();
    await tx.clinica.update({
      where: { id: pedido.clinicaId },
      data: { pagoAte: new Date(clinica.pagoAte.getTime() - recuo) },
    });
    return true;
  });
}

export async function marcarAcessoEnviado(id: string) {
  await prisma.pedidoAssinatura.update({
    where: { id },
    data: { acessoEnviadoEm: new Date() },
  });
}

export async function liberarPedido(id: string) {
  await prisma.pedidoAssinatura.updateMany({
    where: { id, status: 'processando' },
    data: { status: 'pendente' },
  });
}

/** Pagamento recebido que não pôde ser aplicado: guarda o pagamento para a equipe resolver. */
export async function marcarRevisao(id: string, pagamentoId?: string | null, info?: InfoPagamento | null) {
  await prisma.pedidoAssinatura.updateMany({
    where: { id, status: 'processando' },
    data: {
      status: 'revisao',
      ...(pagamentoId ? { pagamentoId } : {}),
      ...(info ? { meio: info.meio, parcelas: info.parcelas, totalPago: info.totalPago } : {}),
    },
  });
}

// ---------------------------------------------------------------- histórico

/** Pagos e estornados da clínica, do mais recente para o mais antigo. Pendentes não entram. */
export async function listarPagamentosClinica(clinicaId: string) {
  return prisma.pedidoAssinatura.findMany({
    where: { clinicaId, status: { in: ['pago', 'estornado'] } },
    orderBy: [{ pagoEm: 'desc' }, { criadoEm: 'desc' }],
  });
}

export async function buscarPagamentoClinica(id: string, clinicaId: string) {
  return prisma.pedidoAssinatura.findFirst({
    where: { id, clinicaId, status: { in: ['pago', 'estornado'] } },
  });
}

/**
 * Período em curso: o último pedido pago de período cheio que termina no vencimento atual.
 * Se o vencimento não bate com nenhum (estorno, ajuste manual), devolve null e a conta usa
 * o vencimento menos um ciclo.
 */
export async function periodoEmCurso(clinicaId: string, pagoAte: Date) {
  const candidatos = await prisma.pedidoAssinatura.findMany({
    where: { clinicaId, status: 'pago', periodoFim: pagoAte },
    orderBy: { pagoEm: 'desc' },
    take: 5,
  });
  // Upgrade também termina no vencimento, mas cobre só o resto do período: não serve de base.
  const pedido = candidatos.find((item) => !ehUpgrade(item));
  if (!pedido?.periodoInicio) return null;
  return {
    inicio: pedido.periodoInicio,
    planoCodigo: pedido.planoCodigo,
    ciclo: pedido.ciclo,
    /** Troca de ciclo: o período valeu o que foi pago mais o crédito usado. */
    valor: Number(pedido.valor) + Number(pedido.credito ?? 0),
  };
}

/** Pedido de troca que manteve o ciclo: cobrou só a diferença até o vencimento. */
export function ehUpgrade(pedido: { tipo: string; ciclo: string; cicloAnterior: string | null }) {
  return pedido.tipo === 'troca_plano' && (!pedido.cicloAnterior || pedido.cicloAnterior === pedido.ciclo);
}

// ---------------------------------------------------------------- troca agendada

export async function agendarTroca(clinicaId: string, planoId: string, ciclo: CicloCobranca) {
  await prisma.clinica.update({
    where: { id: clinicaId },
    data: { planoAgendadoId: planoId, cicloAgendado: ciclo },
  });
}

export async function cancelarTrocaAgendada(clinicaId: string) {
  const atualizado = await prisma.clinica.updateMany({
    where: { id: clinicaId, planoAgendadoId: { not: null } },
    data: { planoAgendadoId: null, cicloAgendado: null },
  });
  return atualizado.count === 1;
}
