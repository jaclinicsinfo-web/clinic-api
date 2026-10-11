import { createHmac, timingSafeEqual } from 'crypto';

import { env } from '../config/env';
import { AppError } from './erros';
import { registrarEvento } from './eventos-pagamento';
import type { CicloCobranca } from './assinatura';

const API = 'https://api.mercadopago.com';
/** Link de pagamento velho não deve ser pago semanas depois. Pix já gerado segue o prazo próprio. */
const VALIDADE_PREFERENCIA_MS = 48 * 60 * 60 * 1000;
/** Teto de parcelas do anual no cartão. O Mercado Pago mostra as opções de 1x até aqui. */
export const PARCELAS_ANUAL = 12;

export interface PagamentoMercadoPago {
  id?: number | string;
  status?: string;
  status_detail?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  installments?: number;
  date_approved?: string;
  transaction_details?: { total_paid_amount?: number };
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  card?: { last_four_digits?: string };
  /** Pagamento gerado por uma assinatura (preapproval): o Mercado Pago informa o id dela aqui. */
  metadata?: { preapproval_id?: string } & Record<string, unknown>;
  point_of_interaction?: { transaction_data?: { subscription_id?: string } };
}

/** Assinatura sem plano associado ("preapproval"): o Mercado Pago cobra o cartão sozinho. */
export interface AssinaturaMercadoPago {
  id?: string;
  status?: 'pending' | 'authorized' | 'paused' | 'cancelled' | string;
  init_point?: string;
  sandbox_init_point?: string;
  external_reference?: string;
  payer_email?: string;
  next_payment_date?: string;
  payment_method_id?: string;
  card_id?: string | number;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
    currency_id?: string;
    start_date?: string;
  };
  summarized?: { last_charged_date?: string; last_charged_amount?: number };
}

/** Cada cobrança de uma assinatura (tópico subscription_authorized_payment). */
export interface CobrancaAutorizadaMercadoPago {
  id?: number | string;
  preapproval_id?: string;
  status?: 'scheduled' | 'processed' | 'recycling' | 'cancelled' | string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string;
  date_created?: string;
  debit_date?: string;
  next_retry_date?: string;
  retry_attempt?: number;
  rejection_code?: string;
  payment?: { id?: number | string; status?: string; status_detail?: string };
}

function cabecalhos() {
  return {
    Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export function pagador(nome: string, email: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const name = partes[0] || 'Clinica';
  const surname = partes.slice(1).join(' ') || name;
  return { name, surname, email };
}

/**
 * Mensal: Pix ou cartão à vista, todo mês.
 * Anual: Pix à vista, ou cartão parcelado em até 12x pelo Mercado Pago.
 */
export function meiosDePagamento(ciclo: CicloCobranca) {
  return {
    excluded_payment_types: [
      { id: 'ticket' },
      { id: 'debit_card' },
      { id: 'prepaid_card' },
      { id: 'atm' },
      { id: 'digital_currency' },
      { id: 'digital_wallet' },
      { id: 'voucher_card' },
    ],
    ...(ciclo === 'anual'
      ? { installments: PARCELAS_ANUAL }
      : { installments: 1, default_installments: 1 }),
  };
}

export function urlDeAviso(): string | undefined {
  if (!env.API_PUBLIC_URL) return undefined;
  try {
    const url = new URL(env.API_PUBLIC_URL);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' || local) return undefined;
    // source_news=webhooks: só o formato Webhook (com x-signature), sem o IPN antigo em dobro.
    return `${env.API_PUBLIC_URL}/api/assinatura/mercadopago?source_news=webhooks`;
  } catch {
    return undefined;
  }
}

let vendedorDeTeste: Promise<boolean> | null = null;

/**
 * Credencial de conta vendedora de teste: o Mercado Pago recusa o pagamento quando o e-mail do
 * pagador é de uma conta real ("uma das partes é de teste"). Consultado uma vez por processo.
 */
function credencialDeTeste(): Promise<boolean> {
  if (env.MERCADOPAGO_ACCESS_TOKEN.startsWith('TEST-')) return Promise.resolve(true);
  vendedorDeTeste ??= fetch(`${API}/users/me`, { headers: cabecalhos() })
    .then(async (resposta) => {
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as { tags?: string[] };
      return Boolean(corpo.tags?.includes('test_user'));
    })
    .catch(() => {
      vendedorDeTeste = null;
      return false;
    });
  return vendedorDeTeste;
}

export async function criarPreferencia(params: {
  pedidoId: string;
  itemId: string;
  titulo: string;
  descricao: string;
  valor: number;
  ciclo: CicloCobranca;
  pagador: ReturnType<typeof pagador>;
  /** Página que recebe a volta do Mercado Pago, sem query. */
  retorno: string;
}): Promise<{ preferenciaId: string; checkoutUrl: string }> {
  const agora = Date.now();
  // Em teste, o pagador é a conta compradora de teste logada no checkout, não o e-mail do formulário.
  const payer = (await credencialDeTeste())
    ? { name: params.pagador.name, surname: params.pagador.surname }
    : params.pagador;
  const voltar = (resultado: string) => `${params.retorno}?resultado=${resultado}&pedido=${params.pedidoId}`;

  const resposta = await fetch(`${API}/checkout/preferences`, {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify({
      items: [
        {
          id: params.itemId,
          title: params.titulo,
          description: params.descricao,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Math.round(params.valor * 100) / 100,
        },
      ],
      payer,
      external_reference: params.pedidoId,
      metadata: { pedido_id: params.pedidoId },
      statement_descriptor: 'JA CLINICS',
      payment_methods: meiosDePagamento(params.ciclo),
      back_urls: {
        success: voltar('aprovado'),
        failure: voltar('recusado'),
        pending: voltar('pendente'),
      },
      auto_return: 'approved',
      notification_url: urlDeAviso(),
      expires: true,
      expiration_date_from: new Date(agora - 60_000).toISOString(),
      expiration_date_to: new Date(agora + VALIDADE_PREFERENCIA_MS).toISOString(),
    }),
  });

  const corpo = (await resposta.json().catch(() => null)) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
    message?: string;
  } | null;

  if (!resposta.ok || !corpo?.id) {
    await registrarEvento({
      tipo: 'checkout_recusado',
      nivel: 'erro',
      pedidoId: params.pedidoId,
      valor: params.valor,
      mensagem: `Mercado Pago recusou a preferência (HTTP ${resposta.status}): ${corpo?.message ?? 'sem detalhe'}.`,
    });
    throw new AppError(502, 'Não foi possível abrir o pagamento.');
  }

  // Credencial antiga de teste (TEST-) usa o sandbox. A atual (APP_USR- de usuário de teste) usa o init_point.
  const checkoutUrl = env.MERCADOPAGO_ACCESS_TOKEN.startsWith('TEST-')
    ? corpo.sandbox_init_point
    : corpo.init_point;
  if (!checkoutUrl) throw new AppError(502, 'Não foi possível abrir o pagamento.');

  if (!urlDeAviso()) {
    console.warn('[pagamento] API_PUBLIC_URL sem https: o Mercado Pago não vai avisar este pagamento, só a página de retorno confirma.');
  }
  return { preferenciaId: corpo.id, checkoutUrl };
}

/** `null` quando o pagamento não existe. Falha de rede ou do Mercado Pago lança, para o aviso ser reenviado. */
export async function buscarPagamento(id: string): Promise<PagamentoMercadoPago | null> {
  const resposta = await fetch(`${API}/v1/payments/${encodeURIComponent(id)}`, { headers: cabecalhos() });
  if (resposta.status === 404) return null;
  if (resposta.status === 429) throw new AppError(502, 'Limite de consultas do Mercado Pago (429).');
  if (!resposta.ok) throw new AppError(502, 'Não foi possível consultar o pagamento.');
  return (await resposta.json()) as PagamentoMercadoPago;
}

export async function buscarPagamentosDoPedido(pedidoId: string): Promise<PagamentoMercadoPago[]> {
  const url = new URL(`${API}/v1/payments/search`);
  url.searchParams.set('external_reference', pedidoId);
  url.searchParams.set('sort', 'date_created');
  url.searchParams.set('criteria', 'desc');
  const resposta = await fetch(url, { headers: cabecalhos() });
  if (resposta.status === 429) throw new AppError(502, 'Limite de consultas do Mercado Pago (429).');
  if (!resposta.ok) throw new AppError(502, 'Não foi possível consultar o pagamento.');
  const corpo = (await resposta.json()) as { results?: PagamentoMercadoPago[] };
  return corpo.results ?? [];
}

export function valorConfere(valorPedido: number, valorPago: number) {
  return Math.abs(valorPedido - valorPago) < 0.02;
}

/**
 * Confere o cabeçalho `x-signature` do webhook (HMAC-SHA256 com a assinatura secreta da aplicação).
 * Manifesto: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` — partes ausentes saem do texto.
 */
export function assinaturaWebhookValida(params: {
  assinatura: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  segredo: string;
}): boolean {
  if (!params.assinatura || !params.segredo) return false;

  let ts = '';
  let v1 = '';
  for (const parte of params.assinatura.split(',')) {
    const [chave, ...resto] = parte.split('=');
    const valor = resto.join('=').trim();
    if (chave?.trim() === 'ts') ts = valor;
    if (chave?.trim() === 'v1') v1 = valor;
  }
  if (!ts || !v1) return false;

  const dataId = params.dataId?.trim();
  const id = dataId && /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifesto = '';
  if (id) manifesto += `id:${id};`;
  if (params.requestId?.trim()) manifesto += `request-id:${params.requestId.trim()};`;
  manifesto += `ts:${ts};`;

  const esperado = createHmac('sha256', params.segredo).update(manifesto).digest('hex');
  const recebido = Buffer.from(v1, 'utf8');
  const calculado = Buffer.from(esperado, 'utf8');
  return recebido.length === calculado.length && timingSafeEqual(recebido, calculado);
}

// ---------------------------------------------------------------- cobrança automática (preapproval)

function erroDaApi(resposta: Response, acao: string): AppError {
  if (resposta.status === 429) return new AppError(502, 'Limite de consultas do Mercado Pago (429).');
  return new AppError(502, `Não foi possível ${acao} no Mercado Pago.`);
}

/**
 * Pagador da assinatura. Com credencial de vendedor de teste, o Mercado Pago só aceita o e-mail
 * da compradora de teste (MERCADOPAGO_PAGADOR_TESTE).
 */
async function emailDoAssinante(email: string): Promise<string> {
  if (env.MERCADOPAGO_PAGADOR_TESTE && (await credencialDeTeste())) return env.MERCADOPAGO_PAGADOR_TESTE;
  return email;
}

export async function criarAssinaturaRecorrente(params: {
  /** Nosso id (assinaturas_recorrentes.id): volta como external_reference. */
  referencia: string;
  titulo: string;
  email: string;
  ciclo: CicloCobranca;
  valor: number;
  /** Primeira cobrança: o vencimento atual da clínica. */
  inicio: Date;
  retorno: string;
}): Promise<{ preapprovalId: string; linkAutorizacao: string; status: string }> {
  const resposta = await fetch(`${API}/preapproval`, {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify({
      reason: params.titulo,
      external_reference: params.referencia,
      payer_email: await emailDoAssinante(params.email),
      auto_recurring: {
        frequency: params.ciclo === 'anual' ? 12 : 1,
        frequency_type: 'months',
        start_date: params.inicio.toISOString(),
        transaction_amount: Math.round(params.valor * 100) / 100,
        currency_id: 'BRL',
      },
      back_url: params.retorno,
      status: 'pending',
    }),
  });
  const corpo = (await resposta.json().catch(() => null)) as (AssinaturaMercadoPago & { message?: string }) | null;
  if (!resposta.ok || !corpo?.id) {
    await registrarEvento({
      tipo: 'checkout_recusado',
      nivel: 'erro',
      valor: params.valor,
      mensagem: `Mercado Pago recusou a assinatura automática (HTTP ${resposta.status}): ${corpo?.message ?? 'sem detalhe'}.`,
      detalhes: { referencia: params.referencia },
    });
    throw new AppError(502, 'Não foi possível ativar a cobrança automática agora.');
  }
  const link = env.MERCADOPAGO_ACCESS_TOKEN.startsWith('TEST-')
    ? corpo.sandbox_init_point ?? corpo.init_point
    : corpo.init_point;
  if (!link) throw new AppError(502, 'Não foi possível ativar a cobrança automática agora.');
  return { preapprovalId: corpo.id, linkAutorizacao: link, status: corpo.status ?? 'pending' };
}

/** `null` quando a assinatura não existe. */
export async function buscarAssinaturaRecorrente(id: string): Promise<AssinaturaMercadoPago | null> {
  const resposta = await fetch(`${API}/preapproval/${encodeURIComponent(id)}`, { headers: cabecalhos() });
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw erroDaApi(resposta, 'consultar a assinatura');
  return (await resposta.json()) as AssinaturaMercadoPago;
}

/** Cancela, pausa ou reativa, e/ou muda o valor das próximas cobranças. */
export async function atualizarAssinaturaRecorrente(
  id: string,
  mudanca: { status?: 'cancelled' | 'paused' | 'authorized'; valor?: number },
): Promise<AssinaturaMercadoPago> {
  const corpo: Record<string, unknown> = {};
  if (mudanca.status) corpo.status = mudanca.status;
  if (mudanca.valor !== undefined) {
    corpo.auto_recurring = { transaction_amount: Math.round(mudanca.valor * 100) / 100, currency_id: 'BRL' };
  }
  const resposta = await fetch(`${API}/preapproval/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: cabecalhos(),
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) throw erroDaApi(resposta, 'atualizar a assinatura');
  return (await resposta.json()) as AssinaturaMercadoPago;
}

/** `null` quando a cobrança não existe. */
export async function buscarCobrancaAutorizada(id: string): Promise<CobrancaAutorizadaMercadoPago | null> {
  const resposta = await fetch(`${API}/authorized_payments/${encodeURIComponent(id)}`, { headers: cabecalhos() });
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw erroDaApi(resposta, 'consultar a cobrança automática');
  return (await resposta.json()) as CobrancaAutorizadaMercadoPago;
}

/** Cobranças de uma assinatura (conferência diária: aviso perdido). */
export async function buscarCobrancasDaAssinatura(preapprovalId: string): Promise<CobrancaAutorizadaMercadoPago[]> {
  const url = new URL(`${API}/authorized_payments/search`);
  url.searchParams.set('preapproval_id', preapprovalId);
  const resposta = await fetch(url, { headers: cabecalhos() });
  if (!resposta.ok) throw erroDaApi(resposta, 'consultar as cobranças automáticas');
  const corpo = (await resposta.json()) as { results?: CobrancaAutorizadaMercadoPago[] };
  return corpo.results ?? [];
}

/** Id da assinatura que gerou o pagamento, ou a referência que mandamos nela. */
export function assinaturaDoPagamento(pagamento: PagamentoMercadoPago): { preapprovalId: string | null; referencia: string | null } {
  const preapprovalId =
    (typeof pagamento.metadata?.preapproval_id === 'string' && pagamento.metadata.preapproval_id) ||
    pagamento.point_of_interaction?.transaction_data?.subscription_id ||
    null;
  return { preapprovalId, referencia: pagamento.external_reference ?? null };
}
