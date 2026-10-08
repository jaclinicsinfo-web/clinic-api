import { env, isDev } from '../config/env';
import { AppError } from '../lib/erros';
import {
  fimDoAcessoGratuito,
  formatarDataAcesso,
  gerarSenhaInicial,
} from '../lib/assinatura';
import { emailHabilitado, enviarEmail } from '../lib/email';
import { montarEmailAcesso } from '../lib/email/templates/acesso';
import { buscarPorCnpj, criarCadastroPosCompra } from '../models/clinica.model';
import { buscarPorCodigo } from '../models/plano.model';
import {
  buscarPedido,
  concluirPedido,
  criarPedido,
  gravarPreferencia,
  liberarPedido,
  marcarRevisao,
  reservarPedido,
} from '../models/pedido-assinatura.model';
import { buscarPorEmail } from '../models/usuario.model';
import type { InscricaoInput } from '../validators/assinatura.validator';

interface ResultadoAcesso {
  mensagem: string;
  email: string;
  senhaTemporaria?: string;
}

function exigirEmailConfigurado() {
  if (!emailHabilitado() && !isDev) {
    throw new AppError(503, 'O envio de e-mail não está configurado.');
  }
}

function cicloDe(dados: InscricaoInput): 'mensal' | 'anual' {
  return dados.ciclo === 'anual' ? 'anual' : 'mensal';
}

async function planoComPreco(codigo: string, ciclo: 'mensal' | 'anual' = 'mensal') {
  const plano = await buscarPorCodigo(codigo);
  if (!plano || !plano.ativo) throw new AppError(400, 'Plano inválido.');
  const mensal = Number(plano.precoMensal);
  const anual = Number(plano.precoAnual);
  if (!Number.isFinite(mensal) || mensal <= 0) {
    throw new AppError(400, 'Este plano ainda não tem preço de assinatura.');
  }
  if (ciclo === 'anual' && (!Number.isFinite(anual) || anual <= 0)) {
    throw new AppError(400, 'Este plano ainda não tem preço anual.');
  }
  return { plano, preco: ciclo === 'anual' ? anual : mensal, ciclo };
}

async function garantirVaga(dados: InscricaoInput) {
  if (await buscarPorCnpj(dados.clinica.cnpj)) {
    throw new AppError(409, 'Já existe uma clínica com este CNPJ.');
  }
  if (await buscarPorEmail(dados.usuario.email)) {
    throw new AppError(409, 'Já existe uma conta com este e-mail.');
  }
}

async function entregarAcesso(params: {
  clinicaNome: string;
  usuarioNome: string;
  email: string;
  senha: string;
  planoNome: string;
  gratuitoAte: Date | null;
}): Promise<ResultadoAcesso> {
  const link = `${env.FRONTEND_URL.replace(/\/+$/, '')}/login`;
  const mensagemEmail = montarEmailAcesso({
    nome: params.usuarioNome,
    empresa: params.clinicaNome,
    email: params.email,
    senha: params.senha,
    link,
    plano: params.planoNome,
    gratuitoAte: params.gratuitoAte ? formatarDataAcesso(params.gratuitoAte) : null,
  });

  if (!emailHabilitado()) {
    console.info(`[email] Acesso de ${params.email}. Senha temporária: ${params.senha}`);
    return {
      mensagem: 'A clínica foi aberta. O e-mail não está configurado neste ambiente, então a senha temporária aparece só aqui.',
      email: params.email,
      senhaTemporaria: params.senha,
    };
  }

  try {
    await enviarEmail({
      para: params.email,
      assunto: mensagemEmail.assunto,
      texto: mensagemEmail.texto,
      html: mensagemEmail.html,
      remetenteNome: mensagemEmail.remetenteNome,
      categoria: 'acesso',
    });
  } catch (err) {
    if (!isDev) throw err;
    console.info(`[email] Falha no envio para ${params.email}. Senha temporária: ${params.senha}`);
    return {
      mensagem: 'A clínica foi aberta, mas o e-mail não saiu. Use a senha temporária abaixo.',
      email: params.email,
      senhaTemporaria: params.senha,
    };
  }

  return {
    mensagem: 'Enviamos o acesso para o e-mail do administrador.',
    email: params.email,
  };
}

async function abrirClinica(dados: InscricaoInput, senha: string, acesso: {
  tipoAcesso: 'gratuito' | 'pago';
  trialExpiraEm: Date | null;
  valorMensal: number;
  situacaoCobranca: string;
  cicloCobranca?: 'mensal' | 'anual';
}) {
  const plano = await buscarPorCodigo(dados.plano);
  if (!plano || !plano.ativo) throw new AppError(400, 'Plano inválido.');

  const { clinica } = await criarCadastroPosCompra({
    planoId: plano.id,
    clinica: dados.clinica,
    unidade: dados.unidade,
    usuario: { ...dados.usuario, senha },
    acesso,
  });

  return { clinica, plano };
}

export async function iniciarAcessoGratuito(dados: InscricaoInput): Promise<ResultadoAcesso> {
  exigirEmailConfigurado();
  const { plano } = await planoComPreco(dados.plano);
  await garantirVaga(dados);

  const senha = gerarSenhaInicial();
  const trialExpiraEm = fimDoAcessoGratuito();
  await abrirClinica(dados, senha, {
    tipoAcesso: 'gratuito',
    trialExpiraEm,
    valorMensal: 0,
    situacaoCobranca: 'em_dia',
  });

  return entregarAcesso({
    clinicaNome: dados.clinica.nomeFantasia,
    usuarioNome: dados.usuario.nome,
    email: dados.usuario.email,
    senha,
    planoNome: plano.nome,
    gratuitoAte: trialExpiraEm,
  });
}

export async function iniciarCheckout(dados: InscricaoInput) {
  exigirEmailConfigurado();
  if (!env.MERCADOPAGO_ACCESS_TOKEN && !isDev) {
    throw new AppError(503, 'O pagamento ainda não está configurado.');
  }
  if (env.MERCADOPAGO_ACCESS_TOKEN && !env.LANDING_URL) {
    throw new AppError(503, 'A página de retorno do pagamento não está configurada.');
  }
  const ciclo = cicloDe(dados);
  const { plano, preco } = await planoComPreco(dados.plano, ciclo);
  await garantirVaga(dados);

  const pedido = await criarPedido({ ...dados, ciclo }, preco);
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    if (!isDev) {
      throw new AppError(503, 'O pagamento ainda não está configurado.');
    }
    return {
      pedidoId: pedido.id,
      checkoutUrl: `/assinatura/confirmar?pedido=${pedido.id}`,
    };
  }

  const landing = env.LANDING_URL;
  const resposta = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [
        {
          id: `${plano.codigo}-${ciclo}`,
          title: `J.A. Clinics — Plano ${plano.nome} (${ciclo === 'anual' ? 'anual' : 'mensal'})`,
          description:
            ciclo === 'anual'
              ? `Assinatura anual do plano ${plano.nome}, cobrada à vista`
              : `Assinatura mensal do plano ${plano.nome}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Math.round(preco * 100) / 100,
        },
      ],
      payer: pagador(dados.usuario.nome, dados.usuario.email),
      external_reference: pedido.id,
      metadata: { pedido_id: pedido.id },
      statement_descriptor: 'JA CLINICS',
      payment_methods: {
        excluded_payment_types: [
          { id: 'ticket' },
          { id: 'debit_card' },
          { id: 'prepaid_card' },
          { id: 'atm' },
          { id: 'digital_currency' },
          { id: 'digital_wallet' },
          { id: 'voucher_card' },
        ],
        installments: 1,
        default_installments: 1,
      },
      back_urls: {
        success: `${landing}/assinatura/retorno?resultado=aprovado&pedido=${pedido.id}`,
        failure: `${landing}/assinatura/retorno?resultado=recusado&pedido=${pedido.id}`,
        pending: `${landing}/assinatura/retorno?resultado=pendente&pedido=${pedido.id}`,
      },
      auto_return: 'approved',
      notification_url: urlDeAvisoMercadoPago(),
    }),
  });

  const corpo = (await resposta.json().catch(() => null)) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
    message?: string;
  } | null;

  if (!resposta.ok || !corpo?.id) {
    throw new AppError(502, 'Não foi possível abrir o pagamento.');
  }

  await gravarPreferencia(pedido.id, corpo.id);
  const checkoutUrl = env.MERCADOPAGO_ACCESS_TOKEN.startsWith('TEST-')
    ? corpo.sandbox_init_point
    : corpo.init_point;
  if (!checkoutUrl) throw new AppError(502, 'Não foi possível abrir o pagamento.');

  return { pedidoId: pedido.id, checkoutUrl };
}

function pagador(nome: string, email: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const name = partes[0] || 'Clinica';
  const surname = partes.slice(1).join(' ') || name;
  return { name, surname, email };
}

function valorConfere(valorPedido: number, valorPago: number) {
  return Math.abs(valorPedido - valorPago) < 0.02;
}

async function cumprir(pedidoId: string, pagamentoId: string | null): Promise<ResultadoAcesso & { status: 'pago' }> {
  const pedido = await buscarPedido(pedidoId);
  if (!pedido) throw new AppError(404, 'Pedido não encontrado.');
  if (pedido.status === 'pago') {
    const dados = pedido.dados as InscricaoInput;
    return {
      status: 'pago',
      mensagem: 'O acesso desta clínica já foi enviado.',
      email: dados.usuario.email,
    };
  }

  const reservou = await reservarPedido(pedidoId);
  if (!reservou) {
    const atual = await buscarPedido(pedidoId);
    if (atual?.status === 'pago') {
      const dados = atual.dados as InscricaoInput;
      return {
        status: 'pago',
        mensagem: 'O acesso desta clínica já foi enviado.',
        email: dados.usuario.email,
      };
    }
    throw new AppError(409, 'Este pagamento já está sendo confirmado.');
  }

  const dados = pedido.dados as InscricaoInput;
  let clinicaId: string | null = null;
  try {
    await garantirVaga(dados);
    const senha = gerarSenhaInicial();
    const ciclo = dados.ciclo === 'anual' ? 'anual' : 'mensal';
    const planoCobrado = await buscarPorCodigo(dados.plano);
    const aberto = await abrirClinica(dados, senha, {
      tipoAcesso: 'pago',
      trialExpiraEm: null,
      valorMensal: ciclo === 'anual' ? Number(planoCobrado?.precoMensal ?? 0) : Number(pedido.valor),
      situacaoCobranca: 'em_dia',
      cicloCobranca: ciclo,
    });
    clinicaId = aberto.clinica.id;
    await concluirPedido(pedido.id, aberto.clinica.id, pagamentoId);
    const entrega = await entregarAcesso({
      clinicaNome: dados.clinica.nomeFantasia,
      usuarioNome: dados.usuario.nome,
      email: dados.usuario.email,
      senha,
      planoNome: ciclo === 'anual' ? `${aberto.plano.nome} anual` : aberto.plano.nome,
      gratuitoAte: null,
    });
    return { status: 'pago' as const, ...entrega };
  } catch (err) {
    if (clinicaId) {
      await concluirPedido(pedido.id, clinicaId, pagamentoId).catch(() => undefined);
      return {
        status: 'pago' as const,
        mensagem: 'A clínica foi aberta. Se o e-mail não chegou, use Esqueci minha senha com o mesmo e-mail.',
        email: dados.usuario.email,
      };
    }
    if (err instanceof AppError && err.status === 409) {
      await marcarRevisao(pedidoId);
    } else {
      await liberarPedido(pedidoId);
    }
    throw err;
  }
}

function urlDeAvisoMercadoPago(): string | undefined {
  if (!env.API_PUBLIC_URL) return undefined;
  try {
    const url = new URL(env.API_PUBLIC_URL);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' || local) return undefined;
    return `${env.API_PUBLIC_URL}/api/assinatura/mercadopago`;
  } catch {
    return undefined;
  }
}

interface PagamentoMercadoPago {
  id?: number | string;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
}

async function buscarPagamento(id: string): Promise<PagamentoMercadoPago | null> {
  const resposta = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}` },
  });
  if (!resposta.ok) return null;
  return (await resposta.json()) as PagamentoMercadoPago;
}

async function pagamentoAprovadoDoPedido(pedidoId: string, valor: number) {
  const url = new URL('https://api.mercadopago.com/v1/payments/search');
  url.searchParams.set('external_reference', pedidoId);
  url.searchParams.set('sort', 'date_created');
  url.searchParams.set('criteria', 'desc');
  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}` },
  });
  if (!resposta.ok) throw new AppError(502, 'Não foi possível consultar o pagamento.');
  const corpo = (await resposta.json()) as { results?: PagamentoMercadoPago[] };
  return (
    corpo.results?.find(
      (pagamento) =>
        pagamento.status === 'approved' &&
        pagamento.currency_id === 'BRL' &&
        valorConfere(valor, Number(pagamento.transaction_amount)),
    ) ?? null
  );
}

export async function sincronizarPedido(pedidoId: string) {
  const pedido = await buscarPedido(pedidoId);
  if (!pedido) throw new AppError(404, 'Pedido não encontrado.');
  if (pedido.status === 'pago') {
    const dados = pedido.dados as InscricaoInput;
    return {
      status: 'pago' as const,
      mensagem: 'O acesso desta clínica já foi enviado.',
      email: dados.usuario.email,
    };
  }
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    return { status: 'pendente' as const, mensagem: 'O pagamento ainda não foi confirmado.', email: '' };
  }

  const pagamento = await pagamentoAprovadoDoPedido(pedido.id, Number(pedido.valor));
  if (!pagamento) {
    return { status: 'pendente' as const, mensagem: 'Ainda não identificamos o pagamento deste pedido.', email: '' };
  }
  try {
    return await cumprir(pedido.id, String(pagamento.id ?? ''));
  } catch (err) {
    if (!(err instanceof AppError) || err.status !== 409) throw err;
    const atual = await buscarPedido(pedido.id);
    const dados = (atual?.dados ?? pedido.dados) as InscricaoInput;
    if (atual?.status === 'pago') {
      return {
        status: 'pago' as const,
        mensagem: 'O acesso desta clínica já foi enviado.',
        email: dados.usuario.email,
      };
    }
    if (atual?.status === 'revisao') {
      return {
        status: 'revisao' as const,
        mensagem: err.message,
        email: dados.usuario.email,
      };
    }
    return {
      status: 'pendente' as const,
      mensagem: 'O pagamento está sendo confirmado. Atualize a página em instantes.',
      email: dados.usuario.email,
    };
  }
}

export async function confirmarPagamentoLocal(pedidoId: string) {
  if (!isDev || env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new AppError(404, 'Recurso não encontrado.');
  }
  return cumprir(pedidoId, null);
}

export async function processarAvisoMercadoPago(pagamentoId: string) {
  if (!env.MERCADOPAGO_ACCESS_TOKEN || !pagamentoId) return;
  const pagamento = await buscarPagamento(pagamentoId);
  if (!pagamento || pagamento.status !== 'approved' || pagamento.currency_id !== 'BRL') return;
  const pedidoId = pagamento.external_reference;
  if (!pedidoId) return;
  const pedido = await buscarPedido(pedidoId);
  if (!pedido || !valorConfere(Number(pedido.valor), Number(pagamento.transaction_amount))) return;
  await cumprir(pedido.id, String(pagamento.id ?? pagamentoId));
}
