import { inserirEvento, type DadosEventoPagamento } from '../models/evento-pagamento.model';
import { comoSistema } from './tenant';

export type TipoEventoPagamento =
  | 'checkout_criado'
  | 'checkout_recusado'
  | 'aviso_recebido'
  | 'aviso_recusado'
  | 'aviso_falhou'
  | 'pagamento_consultado'
  | 'pagamento_ignorado'
  | 'pedido_pago'
  | 'pedido_revisao'
  | 'pedido_estornado'
  | 'acesso_enviado'
  | 'acesso_falhou'
  | 'acesso_reenviado';

export interface EventoPagamento extends Omit<DadosEventoPagamento, 'tipo'> {
  tipo: TipoEventoPagamento;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function linha(evento: EventoPagamento): string {
  const campos = [
    evento.pedidoId && `pedido=${evento.pedidoId}`,
    evento.pagamentoId && `pagamento=${evento.pagamentoId}`,
    evento.clinicaId && `clinica=${evento.clinicaId}`,
    evento.meio && `meio=${evento.meio}`,
    evento.status && `status=${evento.status}`,
    evento.valor != null && `valor=${evento.valor.toFixed(2)}`,
  ].filter(Boolean);
  return `[pagamento] ${evento.tipo} ${campos.join(' ')} — ${evento.mensagem}`;
}

/**
 * Registra o evento no console (logs do Dokploy) e na tabela eventos_pagamento (painel › Logs).
 * Nunca lança: falha ao gravar o log não pode derrubar um pagamento.
 */
export async function registrarEvento(evento: EventoPagamento): Promise<void> {
  const texto = linha(evento);
  if (evento.nivel === 'erro') console.error(texto);
  else if (evento.nivel === 'aviso') console.warn(texto);
  else console.info(texto);

  try {
    await comoSistema(() =>
      inserirEvento({
        ...evento,
        pedidoId: evento.pedidoId && UUID.test(evento.pedidoId) ? evento.pedidoId : null,
        clinicaId: evento.clinicaId && UUID.test(evento.clinicaId) ? evento.clinicaId : null,
        mensagem: evento.mensagem.slice(0, 1000),
      }),
    );
  } catch (err) {
    console.error('[pagamento] evento não gravado', err instanceof Error ? err.message : err);
  }
}

/** pix | cartao_credito | outro, a partir do pagamento do Mercado Pago. */
export function meioDoPagamento(pagamento: { payment_method_id?: string; payment_type_id?: string }): string | null {
  if (pagamento.payment_method_id === 'pix' || pagamento.payment_type_id === 'bank_transfer') return 'pix';
  if (pagamento.payment_type_id === 'credit_card') return 'cartao_credito';
  return pagamento.payment_type_id ?? null;
}

export function mensagemDeErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
