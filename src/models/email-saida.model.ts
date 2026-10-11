import { Prisma } from '@prisma/client';

import { prisma } from '../config/database';

export type EmailSaida = Prisma.EmailSaidaGetPayload<Record<string, never>>;

/** Envio que ficou em "enviando" mais que isso foi interrompido (processo caiu) e volta para a fila. */
const ENVIANDO_EXPIRA_MS = 10 * 60 * 1000;

export async function inserirEmail(dados: {
  tipo: string;
  chave: string;
  para: string;
  assunto: string;
  conteudo: string;
  clinicaId?: string | null;
  pedidoId?: string | null;
  referencia?: Date | null;
}): Promise<{ email: EmailSaida; novo: boolean }> {
  try {
    const email = await prisma.emailSaida.create({ data: dados });
    return { email, novo: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existente = await prisma.emailSaida.findUnique({ where: { chave: dados.chave } });
      if (existente) return { email: existente, novo: false };
    }
    throw err;
  }
}

/** Reserva um e-mail específico para envio imediato. Falso se outro processo já pegou. */
export async function reservarEmail(id: string): Promise<boolean> {
  const reservado = await prisma.emailSaida.updateMany({
    where: { id, status: 'pendente' },
    data: { status: 'enviando' },
  });
  return reservado.count === 1;
}

/** Pega um lote vencido da fila sem disputar com outra instância (SKIP LOCKED). */
export async function reservarLote(limite: number): Promise<EmailSaida[]> {
  const abandonado = new Date(Date.now() - ENVIANDO_EXPIRA_MS);
  await prisma.emailSaida.updateMany({
    where: { status: 'enviando', atualizadoEm: { lt: abandonado } },
    data: { status: 'pendente' },
  });

  return prisma.$queryRaw<EmailSaida[]>`
    UPDATE "emails_saida"
    SET "status" = 'enviando', "atualizadoEm" = now()
    WHERE "id" IN (
      SELECT "id" FROM "emails_saida"
      WHERE "status" = 'pendente' AND "proximaTentativaEm" <= now()
      ORDER BY "proximaTentativaEm"
      LIMIT ${limite}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
}

export async function marcarEnviado(id: string) {
  await prisma.emailSaida.update({
    where: { id },
    data: { status: 'enviado', enviadoEm: new Date(), conteudo: null, ultimoErro: null },
  });
}

export async function marcarFalha(id: string, dados: { tentativas: number; proxima: Date | null; erro: string }) {
  // Cancelado durante o envio (ex.: acesso reenviado com outra senha) não volta para a fila.
  await prisma.emailSaida.updateMany({
    where: { id, status: { not: 'cancelado' } },
    data: {
      tentativas: dados.tentativas,
      ultimoErro: dados.erro.slice(0, 500),
      ...(dados.proxima
        ? { status: 'pendente', proximaTentativaEm: dados.proxima }
        : { status: 'falhou', conteudo: null }),
    },
  });
}

export async function cancelarEmail(id: string, motivo: string) {
  await prisma.emailSaida.update({
    where: { id },
    data: { status: 'cancelado', conteudo: null, ultimoErro: motivo.slice(0, 500) },
  });
}

/** Cancela os e-mails de acesso ainda na fila de um pedido (só os que não estão saindo agora). */
export async function cancelarAcessosPendentes(pedidoId: string, motivo: string) {
  const cancelados = await prisma.emailSaida.updateMany({
    where: { pedidoId, tipo: 'acesso', status: { in: ['pendente', 'enviando', 'falhou'] } },
    data: { status: 'cancelado', conteudo: null, ultimoErro: motivo.slice(0, 500) },
  });
  return cancelados.count;
}
