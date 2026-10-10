import { prisma } from '../config/database';
import { NOME_PERFIL_ADMINISTRADOR } from '../lib/perfis-padrao';

const DIA_MS = 24 * 60 * 60 * 1000;

export interface ClinicaParaLembrete {
  id: string;
  nomeFantasia: string;
  email: string;
  status: string;
  tipoAcesso: string;
  cicloCobranca: string;
  trialExpiraEm: Date | null;
  pagoAte: Date | null;
  planoNome: string;
  precoMensal: number;
  precoAnual: number;
}

/**
 * Clínicas que podem estar num marco de lembrete: pagas pelo Mercado Pago perto do vencimento
 * ou em teste perto do fim. trialExpiraEm guarda o relógio de São Paulo sem fuso.
 */
export async function listarClinicasParaLembrete(): Promise<ClinicaParaLembrete[]> {
  const linhas = await prisma.$queryRaw<(ClinicaParaLembrete & { precoMensal: unknown; precoAnual: unknown })[]>`
    SELECT c.id, c."nomeFantasia", c.email, c.status, c."tipoAcesso", c."cicloCobranca",
           c."trialExpiraEm", c."pagoAte", p.nome AS "planoNome",
           p."precoMensal" AS "precoMensal", p."precoAnual" AS "precoAnual"
    FROM clinicas c
    JOIN planos p ON p.id = c."planoId"
    WHERE c.status = 'ativa'
      AND (
        (c."tipoAcesso" = 'pago' AND c."pagoAte" BETWEEN now() - interval '8 days' AND now() + interval '31 days')
        OR (
          c."tipoAcesso" = 'gratuito'
          AND c."trialExpiraEm" BETWEEN (now() AT TIME ZONE 'America/Sao_Paulo') - interval '3 days'
                                    AND (now() AT TIME ZONE 'America/Sao_Paulo') + interval '3 days'
        )
      )
  `;
  return linhas.map((linha) => ({
    ...linha,
    precoMensal: Number(linha.precoMensal),
    precoAnual: Number(linha.precoAnual),
  }));
}

export async function listarAdministradoresAtivos(clinicaId: string) {
  return prisma.usuario.findMany({
    where: { clinicaId, status: 'ativo', perfil: { nome: NOME_PERFIL_ADMINISTRADOR } },
    select: { id: true, nome: true, email: true },
    orderBy: { criadoEm: 'asc' },
  });
}

export async function buscarSituacaoClinica(clinicaId: string) {
  return prisma.clinica.findUnique({
    where: { id: clinicaId },
    select: { status: true, tipoAcesso: true, trialExpiraEm: true, pagoAte: true },
  });
}

/** Notificação no sino para o administrador. A chave evita repetir o mesmo aviso. */
export async function notificarAdministrador(dados: {
  clinicaId: string;
  usuarioId: string;
  chave: string;
  titulo: string;
  descricao: string;
  href: string;
  severidade: 'baixa' | 'media' | 'alta';
}) {
  await prisma.notificacao.upsert({
    where: { usuarioId_chave: { usuarioId: dados.usuarioId, chave: dados.chave } },
    create: { ...dados, tipo: 'assinatura' },
    update: {},
  });
}

// ---------------------------------------------------------------- conferência com o Mercado Pago

/** Pendentes recentes com checkout aberto, ainda não conferidos nos últimos 10 min. */
export async function listarPendentesParaConferir(limite: number) {
  const agora = Date.now();
  return prisma.pedidoAssinatura.findMany({
    where: {
      status: { in: ['pendente', 'processando'] },
      preferenciaId: { not: null },
      criadoEm: { gt: new Date(agora - 72 * 60 * 60 * 1000) },
      OR: [{ conferidoEm: null }, { conferidoEm: { lt: new Date(agora - 10 * 60 * 1000) } }],
    },
    orderBy: { criadoEm: 'desc' },
    take: limite,
  });
}

/**
 * Pagos com pagamento do Mercado Pago para conferir estorno/chargeback:
 * dos últimos 2 dias a cada ciclo; até 180 dias, uma vez por dia.
 */
export async function listarPagosParaConferir(limite: number) {
  const agora = Date.now();
  return prisma.pedidoAssinatura.findMany({
    where: {
      status: 'pago',
      pagamentoId: { not: null },
      pagoEm: { gt: new Date(agora - 180 * DIA_MS) },
      OR: [
        { pagoEm: { gt: new Date(agora - 2 * DIA_MS) }, OR: [{ conferidoEm: null }, { conferidoEm: { lt: new Date(agora - 10 * 60 * 1000) } }] },
        { conferidoEm: null },
        { conferidoEm: { lt: new Date(agora - DIA_MS) } },
      ],
    },
    orderBy: [{ conferidoEm: { sort: 'asc', nulls: 'first' } }, { pagoEm: 'desc' }],
    take: limite,
  });
}

export async function marcarConferido(id: string) {
  await prisma.pedidoAssinatura.update({ where: { id }, data: { conferidoEm: new Date() } });
}

/** Checkout abandonado: a preferência vence em 48 h. Ainda pode ser pago por Pix gerado antes (o aviso confirma). */
export async function expirarPendentesAntigos() {
  const limite = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const antigos = await prisma.pedidoAssinatura.findMany({
    where: { status: 'pendente', criadoEm: { lt: limite } },
    select: { id: true, clinicaId: true, valor: true },
    take: 200,
  });
  if (antigos.length === 0) return [];
  // Só os que continuam pendentes: um aviso pode ter pago o pedido entre a busca e a atualização.
  await prisma.pedidoAssinatura.updateMany({
    where: { id: { in: antigos.map((item) => item.id) }, status: 'pendente' },
    data: { status: 'expirado' },
  });
  return antigos;
}

export async function listarEmRevisao() {
  return prisma.pedidoAssinatura.findMany({
    where: { status: 'revisao' },
    select: { id: true, clinicaId: true, valor: true, pagamentoId: true, atualizadoEm: true },
  });
}

export async function houveEventoRecente(tipo: string, pedidoId: string, horas: number) {
  const evento = await prisma.eventoPagamento.findFirst({
    where: { tipo, pedidoId, criadoEm: { gt: new Date(Date.now() - horas * 60 * 60 * 1000) } },
    select: { id: true },
  });
  return Boolean(evento);
}
