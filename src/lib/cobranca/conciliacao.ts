import { env } from '../../config/env';
import { AppError } from '../erros';
import { mensagemDeErro, registrarEvento } from '../eventos-pagamento';
import { comoSistema } from '../tenant';
import {
  expirarPendentesAntigos,
  houveEventoRecente,
  listarEmRevisao,
  listarPagosParaConferir,
  listarPendentesParaConferir,
  marcarConferido,
} from '../../models/cobranca-assinatura.model';
import { buscarPedido } from '../../models/pedido-assinatura.model';
import { conferirPedidoPago, conferirPedidoPendente } from '../../services/assinatura.service';

/** Pausa entre chamadas para não estourar o limite do Mercado Pago. */
const PAUSA_MS = 200;
const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

export interface ResumoConciliacao {
  pendentesConferidos: number;
  pagosPelaConferencia: number;
  pagosConferidos: number;
  estornadosPelaConferencia: number;
  expirados: number;
}

function limiteDoMercadoPago(err: unknown) {
  return err instanceof AppError && err.status === 502 && /429|limite/i.test(err.message);
}

let ocupado = false;

/**
 * Confere com o Mercado Pago o que o aviso (webhook) pode ter perdido:
 * pagamentos aprovados de pedidos pendentes e estornos/chargebacks de pedidos pagos.
 * Idempotente: confirmar e estornar já são atômicos, então rodar duas vezes não faz efeito em dobro.
 */
export async function conciliarPagamentos(): Promise<ResumoConciliacao> {
  const resumo: ResumoConciliacao = {
    pendentesConferidos: 0,
    pagosPelaConferencia: 0,
    pagosConferidos: 0,
    estornadosPelaConferencia: 0,
    expirados: 0,
  };
  if (ocupado || !env.MERCADOPAGO_ACCESS_TOKEN) return resumo;
  ocupado = true;

  try {
    await comoSistema(async () => {
      for (const pedido of await listarPendentesParaConferir(50)) {
        try {
          if (await conferirPedidoPendente(pedido.id)) resumo.pagosPelaConferencia += 1;
          await marcarConferido(pedido.id);
          resumo.pendentesConferidos += 1;
        } catch (err) {
          console.error('[conciliacao] pedido pendente não conferido', pedido.id, mensagemDeErro(err));
          if (limiteDoMercadoPago(err)) return;
        }
        await esperar(PAUSA_MS);
      }

      for (const pedido of await listarPagosParaConferir(100)) {
        try {
          if (await conferirPedidoPago(pedido.id)) resumo.estornadosPelaConferencia += 1;
          await marcarConferido(pedido.id);
          resumo.pagosConferidos += 1;
        } catch (err) {
          console.error('[conciliacao] pedido pago não conferido', pedido.id, mensagemDeErro(err));
          if (limiteDoMercadoPago(err)) return;
        }
        await esperar(PAUSA_MS);
      }

      for (const pedido of await expirarPendentesAntigos()) {
        const atual = await buscarPedido(pedido.id);
        if (atual?.status !== 'expirado') continue;
        resumo.expirados += 1;
        await registrarEvento({
          tipo: 'pedido_expirado',
          nivel: 'info',
          pedidoId: pedido.id,
          clinicaId: pedido.clinicaId,
          valor: Number(pedido.valor),
          status: 'expirado',
          mensagem: 'Checkout abandonado há mais de 72 h. Se um Pix gerado antes for pago, o aviso ainda confirma.',
        });
      }

      for (const pedido of await listarEmRevisao()) {
        if (await houveEventoRecente('pedido_revisao_pendente', pedido.id, 24)) continue;
        await registrarEvento({
          tipo: 'pedido_revisao_pendente',
          nivel: 'erro',
          pedidoId: pedido.id,
          clinicaId: pedido.clinicaId,
          pagamentoId: pedido.pagamentoId,
          valor: Number(pedido.valor),
          status: 'revisao',
          mensagem: 'Pedido pago continua em revisão (CNPJ ou e-mail já existia). Resolva com o cliente ou devolva o pagamento.',
        });
      }
    });
  } catch (err) {
    console.error('[conciliacao] falha no ciclo', mensagemDeErro(err));
  } finally {
    ocupado = false;
  }

  if (resumo.pagosPelaConferencia || resumo.estornadosPelaConferencia || resumo.expirados) {
    console.info(
      `[conciliacao] ${resumo.pagosPelaConferencia} pago(s) e ${resumo.estornadosPelaConferencia} estorno(s) aplicados; ${resumo.expirados} checkout(s) expirado(s).`,
    );
  }
  return resumo;
}
