/**
 * Uso único depois da migração 20261012090000_cobranca_fase2: completa meio, parcelas e total pago
 * dos pedidos pagos (ou estornados) antes da fase 2, buscando cada pagamento no Mercado Pago.
 * Idempotente: só mexe em pedido com `meio` vazio.
 *
 *   npm run build && npm run pagamentos:preencher
 */
import { env } from '../config/env';
import { conectarBanco, desconectarBanco, prisma } from '../config/database';
import { mensagemDeErro } from '../lib/eventos-pagamento';
import { buscarPagamento } from '../lib/mercadopago';
import { comoSistema } from '../lib/tenant';
import { infoDoPagamento } from '../services/assinatura.service';

const PAUSA_MS = 300;
const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

async function preencher() {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) throw new Error('MERCADOPAGO_ACCESS_TOKEN vazio: nada a consultar.');
  const pedidos = await comoSistema(() =>
    prisma.pedidoAssinatura.findMany({
      where: { status: { in: ['pago', 'estornado'] }, pagamentoId: { not: null }, meio: null },
      select: { id: true, pagamentoId: true },
      orderBy: { pagoEm: 'asc' },
    }),
  );
  console.info(`[preencher] ${pedidos.length} pedido(s) sem meio de pagamento.`);

  let preenchidos = 0;
  for (const pedido of pedidos) {
    try {
      const pagamento = await buscarPagamento(pedido.pagamentoId!);
      if (!pagamento) {
        console.warn(`[preencher] ${pedido.id}: pagamento ${pedido.pagamentoId} não existe neste Mercado Pago.`);
        continue;
      }
      const info = infoDoPagamento(pagamento);
      await comoSistema(() =>
        prisma.pedidoAssinatura.update({
          where: { id: pedido.id },
          data: { meio: info.meio, parcelas: info.parcelas, totalPago: info.totalPago },
        }),
      );
      preenchidos += 1;
    } catch (err) {
      console.error(`[preencher] ${pedido.id}: ${mensagemDeErro(err)}`);
    }
    await esperar(PAUSA_MS);
  }
  console.info(`[preencher] ${preenchidos} de ${pedidos.length} preenchido(s).`);
}

conectarBanco()
  .then(preencher)
  .catch((err) => {
    console.error('[preencher] falhou', mensagemDeErro(err));
    process.exitCode = 1;
  })
  .finally(() => desconectarBanco());
