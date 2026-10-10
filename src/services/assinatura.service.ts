import { Prisma } from '@prisma/client';

import { env, isDev } from '../config/env';
import { AppError } from '../lib/erros';
import {
  type CicloCobranca,
  fimDoAcessoGratuito,
  formatarDataAcesso,
  gerarSenhaInicial,
  inicioDoNovoPeriodo,
  resumoAssinatura,
  somarCiclo,
} from '../lib/assinatura';
import { emailHabilitado, enviarEmail } from '../lib/email';
import { meioDoPagamento, mensagemDeErro, registrarEvento } from '../lib/eventos-pagamento';
import { montarEmailAcesso } from '../lib/email/templates/acesso';
import {
  buscarPagamento,
  buscarPagamentosDoPedido,
  criarPreferencia,
  pagador,
  valorConfere,
} from '../lib/mercadopago';
import { NOME_PERFIL_ADMINISTRADOR } from '../lib/perfis-padrao';
import { buscarPorCnpj, buscarPorId as buscarClinica, criarCadastroPosCompra } from '../models/clinica.model';
import { assertClinicaCabeNoPlano, buscarPorCodigo } from '../models/plano.model';
import {
  buscarPedido,
  concluirPedido,
  criarPedido,
  criarPedidoClinica,
  type DadosPedidoClinica,
  estornarPedido,
  gravarPreferencia,
  liberarPedido,
  marcarAcessoEnviado,
  marcarRevisao,
  registrarPagamentoClinica,
  reservarPedido,
} from '../models/pedido-assinatura.model';
import {
  buscarAdministradorInicial,
  buscarPorEmail,
  buscarPorId as buscarUsuario,
  definirSenha,
} from '../models/usuario.model';
import type { InscricaoInput, PagamentoClinicaInput } from '../validators/assinatura.validator';

type Pedido = NonNullable<Awaited<ReturnType<typeof buscarPedido>>>;

interface ResultadoAcesso {
  mensagem: string;
  email: string;
  senhaTemporaria?: string;
}

export interface ResultadoPedido {
  status: 'pago' | 'pendente' | 'revisao' | 'estornado';
  tipo: 'nova_clinica' | 'clinica_existente';
  mensagem: string;
  email: string;
  /** Até quando a clínica ficou paga (só pagamento de clínica existente). */
  pagoAte?: string | null;
  /** Clínica nova: o e-mail com a senha saiu? */
  acessoEnviado?: boolean;
  senhaTemporaria?: string;
}

const MENSAGEM_REVISAO =
  'Recebemos o pagamento, mas já existe uma clínica com este CNPJ ou e-mail. Nossa equipe vai revisar e falar com você.';

function exigirEmailConfigurado() {
  if (!emailHabilitado() && !isDev) {
    throw new AppError(503, 'O envio de e-mail não está configurado.');
  }
}

function cicloDe(valor: unknown): CicloCobranca {
  return valor === 'anual' ? 'anual' : 'mensal';
}

function tipoDe(pedido: Pedido): ResultadoPedido['tipo'] {
  return pedido.tipo === 'clinica_existente' ? 'clinica_existente' : 'nova_clinica';
}

function emailDoPedido(pedido: Pedido): string {
  if (pedido.tipo === 'clinica_existente') return '';
  return (pedido.dados as InscricaoInput | null)?.usuario?.email ?? '';
}

async function planoComPreco(codigo: string, ciclo: CicloCobranca = 'mensal') {
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
    throw new AppError(
      409,
      'Esta clínica já tem cadastro. Entre no sistema e pague em Configurações › Assinatura.',
    );
  }
  if (await buscarPorEmail(dados.usuario.email)) {
    throw new AppError(
      409,
      'Já existe uma conta com este e-mail. Se a clínica já usa o sistema, entre e pague em Configurações › Assinatura.',
    );
  }
}

function exigirMercadoPago() {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new AppError(503, 'O pagamento ainda não está configurado.');
  }
}

function tituloDoPlano(nome: string, ciclo: CicloCobranca) {
  return `J.A. Clinics — Plano ${nome} (${ciclo === 'anual' ? 'anual' : 'mensal'})`;
}

function descricaoDoPlano(nome: string, ciclo: CicloCobranca) {
  return ciclo === 'anual'
    ? `Assinatura anual do plano ${nome}: Pix à vista ou cartão parcelado`
    : `Mensalidade do plano ${nome}`;
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
    manual: params.gratuitoAte ? env.MANUAL_URL : null,
  });

  if (!emailHabilitado()) {
    if (!isDev) throw new AppError(503, 'O envio de e-mail não está configurado.');
    console.info(`[email] Acesso de ${params.email}. Senha temporária: ${params.senha}`);
    return {
      mensagem: 'A clínica foi aberta. O e-mail não está configurado neste ambiente, então a senha temporária aparece só aqui.',
      email: params.email,
      senhaTemporaria: params.senha,
    };
  }

  await enviarEmail({
    para: params.email,
    assunto: mensagemEmail.assunto,
    texto: mensagemEmail.texto,
    html: mensagemEmail.html,
    remetenteNome: mensagemEmail.remetenteNome,
    categoria: 'acesso',
  });

  return {
    mensagem: 'Enviamos o acesso para o e-mail do administrador.',
    email: params.email,
  };
}

// ---------------------------------------------------------------- teste grátis

export async function iniciarAcessoGratuito(dados: InscricaoInput): Promise<ResultadoAcesso> {
  exigirEmailConfigurado();
  const { plano } = await planoComPreco(dados.plano);
  await garantirVaga(dados);

  const senha = gerarSenhaInicial();
  const trialExpiraEm = fimDoAcessoGratuito();
  await criarCadastroPosCompra({
    planoId: plano.id,
    clinica: dados.clinica,
    unidade: dados.unidade,
    usuario: { ...dados.usuario, senha },
    acesso: {
      tipoAcesso: 'gratuito',
      trialExpiraEm,
      valorMensal: 0,
      situacaoCobranca: 'em_dia',
    },
  });

  try {
    return await entregarAcesso({
      clinicaNome: dados.clinica.nomeFantasia,
      usuarioNome: dados.usuario.nome,
      email: dados.usuario.email,
      senha,
      planoNome: plano.nome,
      gratuitoAte: trialExpiraEm,
    });
  } catch (err) {
    if (!isDev) throw err;
    console.info(`[email] Falha no envio para ${dados.usuario.email}. Senha temporária: ${senha}`);
    return {
      mensagem: 'A clínica foi aberta, mas o e-mail não saiu. Use a senha temporária abaixo.',
      email: dados.usuario.email,
      senhaTemporaria: senha,
    };
  }
}

// ---------------------------------------------------------------- checkout de clínica nova (landing)

export async function iniciarCheckout(dados: InscricaoInput) {
  exigirEmailConfigurado();
  if (!env.MERCADOPAGO_ACCESS_TOKEN && !isDev) {
    throw new AppError(503, 'O pagamento ainda não está configurado.');
  }
  if (env.MERCADOPAGO_ACCESS_TOKEN && !env.LANDING_URL) {
    throw new AppError(503, 'A página de retorno do pagamento não está configurada.');
  }
  const ciclo = cicloDe(dados.ciclo);
  const { plano, preco } = await planoComPreco(dados.plano, ciclo);
  await garantirVaga(dados);

  const pedido = await criarPedido({ ...dados, ciclo }, preco);
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    return {
      pedidoId: pedido.id,
      checkoutUrl: `/assinatura/confirmar?pedido=${pedido.id}`,
    };
  }

  const { preferenciaId, checkoutUrl } = await criarPreferencia({
    pedidoId: pedido.id,
    itemId: `${plano.codigo}-${ciclo}`,
    titulo: tituloDoPlano(plano.nome, ciclo),
    descricao: descricaoDoPlano(plano.nome, ciclo),
    valor: preco,
    ciclo,
    pagador: pagador(dados.usuario.nome, dados.usuario.email),
    retorno: `${env.LANDING_URL}/assinatura/retorno`,
  });
  await gravarPreferencia(pedido.id, preferenciaId);
  await registrarEvento({
    tipo: 'checkout_criado',
    nivel: 'info',
    pedidoId: pedido.id,
    valor: preco,
    status: 'pendente',
    mensagem: `Clínica nova "${dados.clinica.nomeFantasia}" abriu o pagamento do plano ${plano.nome} (${ciclo}).`,
    detalhes: { preferenciaId, tipo: 'nova_clinica', plano: plano.codigo, ciclo, email: dados.usuario.email },
  });

  return { pedidoId: pedido.id, checkoutUrl };
}

// ---------------------------------------------------------------- clínica que já existe (teste → pago, renovação)

export interface AcessoPagamento {
  usuarioId: string;
  clinicaId: string;
}

async function administradorDaClinica(acesso: AcessoPagamento) {
  const usuario = await buscarUsuario(acesso.usuarioId);
  if (!usuario || usuario.clinicaId !== acesso.clinicaId || usuario.status !== 'ativo') {
    throw new AppError(401, 'Sessão expirada. Entre novamente.');
  }
  if (usuario.perfil.nome !== NOME_PERFIL_ADMINISTRADOR) {
    throw new AppError(403, 'Só o administrador da clínica pode pagar a assinatura.');
  }
  return usuario;
}

export async function obterAssinaturaClinica(acesso: AcessoPagamento) {
  const usuario = await buscarUsuario(acesso.usuarioId);
  const clinica = await buscarClinica(acesso.clinicaId);
  if (!usuario || !clinica || usuario.clinicaId !== clinica.id) {
    throw new AppError(404, 'Clínica não encontrada.');
  }
  const plano = usuario.clinica.plano;

  return {
    tipoAcesso: clinica.tipoAcesso,
    ciclo: cicloDe(clinica.cicloCobranca),
    plano: { codigo: plano.codigo, nome: plano.nome },
    ...resumoAssinatura(clinica),
    podePagar: usuario.perfil.nome === NOME_PERFIL_ADMINISTRADOR,
    pagamentoDisponivel: Boolean(env.MERCADOPAGO_ACCESS_TOKEN),
  };
}

export async function iniciarCheckoutClinica(acesso: AcessoPagamento, escolha: PagamentoClinicaInput) {
  exigirMercadoPago();
  const usuario = await administradorDaClinica(acesso);
  if (usuario.clinica.status !== 'ativa') {
    throw new AppError(403, 'Esta clínica está desativada. Fale com o suporte.');
  }

  const ciclo = cicloDe(escolha.ciclo);
  const { plano, preco } = await planoComPreco(escolha.plano, ciclo);
  await assertClinicaCabeNoPlano(acesso.clinicaId, plano);

  const dados: DadosPedidoClinica = { plano: plano.codigo, ciclo, usuarioId: usuario.id };
  const pedido = await criarPedidoClinica(acesso.clinicaId, dados, preco);
  const { preferenciaId, checkoutUrl } = await criarPreferencia({
    pedidoId: pedido.id,
    itemId: `${plano.codigo}-${ciclo}`,
    titulo: tituloDoPlano(plano.nome, ciclo),
    descricao: descricaoDoPlano(plano.nome, ciclo),
    valor: preco,
    ciclo,
    pagador: pagador(usuario.nome, usuario.email),
    retorno: `${env.FRONTEND_URL.replace(/\/+$/, '')}/assinatura/retorno`,
  });
  await gravarPreferencia(pedido.id, preferenciaId);
  await registrarEvento({
    tipo: 'checkout_criado',
    nivel: 'info',
    pedidoId: pedido.id,
    clinicaId: acesso.clinicaId,
    valor: preco,
    status: 'pendente',
    mensagem: `"${usuario.clinica.nomeFantasia}" (${usuario.clinica.tipoAcesso === 'gratuito' ? 'em teste' : 'renovação'}) abriu o pagamento do plano ${plano.nome} (${ciclo}).`,
    detalhes: { preferenciaId, tipo: 'clinica_existente', plano: plano.codigo, ciclo, usuarioId: usuario.id },
  });

  return { pedidoId: pedido.id, checkoutUrl };
}

// ---------------------------------------------------------------- confirmação do pagamento

function resultadoDoPedido(pedido: Pedido): ResultadoPedido {
  const tipo = tipoDe(pedido);
  const email = emailDoPedido(pedido);
  if (pedido.status === 'pago') {
    if (tipo === 'clinica_existente') {
      return {
        status: 'pago',
        tipo,
        email,
        pagoAte: pedido.periodoFim?.toISOString() ?? null,
        mensagem: pedido.periodoFim
          ? `Pagamento confirmado. A assinatura vale até ${formatarDataAcesso(pedido.periodoFim)}.`
          : 'Pagamento confirmado.',
      };
    }
    return {
      status: 'pago',
      tipo,
      email,
      acessoEnviado: Boolean(pedido.acessoEnviadoEm),
      mensagem: pedido.acessoEnviadoEm
        ? 'O acesso desta clínica já foi enviado.'
        : 'A clínica foi aberta. Se o e-mail não chegar, use Esqueci minha senha com o mesmo e-mail.',
    };
  }
  if (pedido.status === 'revisao') return { status: 'revisao', tipo, email, mensagem: MENSAGEM_REVISAO };
  if (pedido.status === 'estornado') {
    return { status: 'estornado', tipo, email, mensagem: 'Este pagamento foi estornado.' };
  }
  return {
    status: 'pendente',
    tipo,
    email,
    mensagem: 'O pagamento está sendo confirmado. Atualize a página em instantes.',
  };
}

function conflitoDeCadastro(err: unknown) {
  if (err instanceof AppError) return err.status === 409;
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

type OrigemConfirmacao = 'aviso' | 'retorno' | 'local';

async function cumprirNovaClinica(
  pedido: Pedido,
  pagamentoId: string | null,
  origem: OrigemConfirmacao,
): Promise<ResultadoPedido> {
  const dados = pedido.dados as InscricaoInput;
  const ciclo = cicloDe(pedido.ciclo);
  const senha = gerarSenhaInicial();
  const inicio = new Date();
  const fim = somarCiclo(inicio, ciclo);

  let planoNome: string;
  let clinicaId: string | null = null;
  try {
    await garantirVaga(dados);
    const plano = await buscarPorCodigo(dados.plano);
    if (!plano) throw new AppError(400, 'Plano inválido.');
    planoNome = plano.nome;
    // Clínica, administrador e pedido pago nascem juntos: ou tudo grava, ou nada.
    await criarCadastroPosCompra(
      {
        planoId: plano.id,
        clinica: dados.clinica,
        unidade: dados.unidade,
        usuario: { ...dados.usuario, senha },
        acesso: {
          tipoAcesso: 'pago',
          trialExpiraEm: null,
          valorMensal: ciclo === 'anual' ? Number(plano.precoMensal) : Number(pedido.valor),
          situacaoCobranca: 'em_dia',
          cicloCobranca: ciclo,
          pagoAte: fim,
        },
      },
      {
        aoCriar: (tx, idClinica) => {
          clinicaId = idClinica;
          return concluirPedido(
            pedido.id,
            { clinicaId: idClinica, pagamentoId, periodoInicio: inicio, periodoFim: fim },
            tx,
          );
        },
      },
    );
  } catch (err) {
    if (conflitoDeCadastro(err)) {
      await marcarRevisao(pedido.id);
      await registrarEvento({
        tipo: 'pedido_revisao',
        nivel: 'erro',
        pedidoId: pedido.id,
        pagamentoId,
        valor: Number(pedido.valor),
        status: 'revisao',
        mensagem: `Pagamento recebido, mas a clínica não abriu: ${mensagemDeErro(err)}`,
        detalhes: { cnpj: dados.clinica.cnpj, email: dados.usuario.email, origem },
      });
      return { status: 'revisao', tipo: 'nova_clinica', email: dados.usuario.email, mensagem: MENSAGEM_REVISAO };
    }
    await liberarPedido(pedido.id);
    throw err;
  }

  await registrarEvento({
    tipo: 'pedido_pago',
    nivel: 'info',
    pedidoId: pedido.id,
    clinicaId,
    pagamentoId,
    valor: Number(pedido.valor),
    status: 'pago',
    mensagem: `Clínica "${dados.clinica.nomeFantasia}" aberta como paga até ${formatarDataAcesso(fim)} (confirmado pelo ${origem}).`,
    detalhes: { origem, ciclo, periodoInicio: inicio.toISOString(), periodoFim: fim.toISOString() },
  });

  try {
    const entrega = await entregarAcesso({
      clinicaNome: dados.clinica.nomeFantasia,
      usuarioNome: dados.usuario.nome,
      email: dados.usuario.email,
      senha,
      planoNome: ciclo === 'anual' ? `${planoNome} anual` : planoNome,
      gratuitoAte: null,
    });
    if (!entrega.senhaTemporaria) await marcarAcessoEnviado(pedido.id);
    await registrarEvento({
      tipo: 'acesso_enviado',
      nivel: entrega.senhaTemporaria ? 'aviso' : 'info',
      pedidoId: pedido.id,
      clinicaId,
      mensagem: entrega.senhaTemporaria
        ? `SMTP desligado neste ambiente: senha temporária só no log (${dados.usuario.email}).`
        : `Login e senha temporária enviados para ${dados.usuario.email}.`,
    });
    return { status: 'pago', tipo: 'nova_clinica', acessoEnviado: !entrega.senhaTemporaria, ...entrega };
  } catch (err) {
    // A clínica já está paga e aberta. O painel mostra o pedido para reenviar o acesso.
    await registrarEvento({
      tipo: 'acesso_falhou',
      nivel: 'erro',
      pedidoId: pedido.id,
      clinicaId,
      mensagem: `E-mail de acesso para ${dados.usuario.email} não saiu: ${mensagemDeErro(err)}. Use Reenviar acesso no painel.`,
    });
    return {
      status: 'pago',
      tipo: 'nova_clinica',
      email: dados.usuario.email,
      acessoEnviado: false,
      mensagem: 'A clínica foi aberta, mas o e-mail com o acesso não saiu. Use Esqueci minha senha com o mesmo e-mail.',
    };
  }
}

async function cumprirClinicaExistente(
  pedido: Pedido,
  pagamentoId: string | null,
  origem: OrigemConfirmacao,
): Promise<ResultadoPedido> {
  if (!pedido.clinicaId) {
    await marcarRevisao(pedido.id);
    await registrarEvento({
      tipo: 'pedido_revisao',
      nivel: 'erro',
      pedidoId: pedido.id,
      pagamentoId,
      mensagem: 'Pedido de clínica existente sem clínica vinculada.',
    });
    return { status: 'revisao', tipo: 'clinica_existente', email: '', mensagem: MENSAGEM_REVISAO };
  }
  const ciclo = cicloDe(pedido.ciclo);
  try {
    const { inicio, fim } = await registrarPagamentoClinica({
      pedidoId: pedido.id,
      clinicaId: pedido.clinicaId,
      planoCodigo: pedido.planoCodigo,
      ciclo,
      valorPedido: Number(pedido.valor),
      pagamentoId,
      calcularPeriodo: (clinica) => {
        const inicio = inicioDoNovoPeriodo(clinica);
        return { inicio, fim: somarCiclo(inicio, ciclo) };
      },
    });
    await registrarEvento({
      tipo: 'pedido_pago',
      nivel: 'info',
      pedidoId: pedido.id,
      clinicaId: pedido.clinicaId,
      pagamentoId,
      valor: Number(pedido.valor),
      status: 'pago',
      mensagem: `Clínica paga até ${formatarDataAcesso(fim)}: plano ${pedido.planoCodigo} (${ciclo}), confirmado pelo ${origem}.`,
      detalhes: { origem, ciclo, periodoInicio: inicio.toISOString(), periodoFim: fim.toISOString() },
    });
    return {
      status: 'pago',
      tipo: 'clinica_existente',
      email: '',
      pagoAte: fim.toISOString(),
      mensagem: `Pagamento confirmado. A assinatura vale até ${formatarDataAcesso(fim)}.`,
    };
  } catch (err) {
    await liberarPedido(pedido.id);
    throw err;
  }
}

async function cumprir(
  pedidoId: string,
  pagamentoId: string | null,
  origem: OrigemConfirmacao,
): Promise<ResultadoPedido> {
  const pedido = await buscarPedido(pedidoId);
  if (!pedido) throw new AppError(404, 'Pedido não encontrado.');
  if (pedido.status === 'pago' || pedido.status === 'estornado') return resultadoDoPedido(pedido);

  if (!(await reservarPedido(pedidoId))) {
    const atual = await buscarPedido(pedidoId);
    if (atual && atual.status !== 'processando') return resultadoDoPedido(atual);
    throw new AppError(409, 'Este pagamento já está sendo confirmado.');
  }

  return pedido.tipo === 'clinica_existente'
    ? cumprirClinicaExistente(pedido, pagamentoId, origem)
    : cumprirNovaClinica(pedido, pagamentoId, origem);
}

/** Página de retorno: confere no Mercado Pago se o pedido já tem pagamento aprovado. */
export async function sincronizarPedido(pedidoId: string): Promise<ResultadoPedido> {
  const pedido = await buscarPedido(pedidoId);
  if (!pedido) throw new AppError(404, 'Pedido não encontrado.');
  if (pedido.status !== 'pendente' && pedido.status !== 'processando') return resultadoDoPedido(pedido);

  const pendente: ResultadoPedido = {
    status: 'pendente',
    tipo: tipoDe(pedido),
    email: '',
    mensagem: 'Ainda não identificamos o pagamento deste pedido.',
  };
  if (!env.MERCADOPAGO_ACCESS_TOKEN) return pendente;

  const pagamento = (await buscarPagamentosDoPedido(pedido.id)).find(
    (item) =>
      item.status === 'approved' &&
      item.currency_id === 'BRL' &&
      valorConfere(Number(pedido.valor), Number(item.transaction_amount)),
  );
  if (!pagamento) return pendente;
  await registrarEvento({
    tipo: 'pagamento_consultado',
    nivel: 'info',
    pedidoId: pedido.id,
    clinicaId: pedido.clinicaId,
    pagamentoId: String(pagamento.id ?? ''),
    meio: meioDoPagamento(pagamento),
    status: pagamento.status ?? null,
    valor: Number(pagamento.transaction_amount),
    mensagem: 'Página de retorno encontrou o pagamento aprovado no Mercado Pago.',
    detalhes: { origem: 'retorno', parcelas: pagamento.installments, status_detail: pagamento.status_detail },
  });

  try {
    return await cumprir(pedido.id, String(pagamento.id ?? ''), 'retorno');
  } catch (err) {
    if (!(err instanceof AppError) || err.status !== 409) throw err;
    const atual = await buscarPedido(pedido.id);
    return resultadoDoPedido(atual ?? pedido);
  }
}

export async function confirmarPagamentoLocal(pedidoId: string) {
  if (!isDev || env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new AppError(404, 'Recurso não encontrado.');
  }
  return cumprir(pedidoId, null, 'local');
}

// ---------------------------------------------------------------- webhook

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Aviso do Mercado Pago. Os dados vêm sempre da API do Mercado Pago com o nosso token,
 * nunca do corpo do aviso. Lança só em falha passageira, para o aviso voltar a ser enviado.
 */
export async function processarAvisoMercadoPago(pagamentoId: string): Promise<void> {
  if (!env.MERCADOPAGO_ACCESS_TOKEN || !pagamentoId) return;
  const pagamento = await buscarPagamento(pagamentoId);
  if (!pagamento) {
    await registrarEvento({
      tipo: 'pagamento_ignorado',
      nivel: 'aviso',
      pagamentoId,
      mensagem: 'O Mercado Pago não encontrou este pagamento (404).',
    });
    return;
  }

  const pedidoId = pagamento.external_reference ?? '';
  const idPagamento = String(pagamento.id ?? pagamentoId);
  const pedido = UUID.test(pedidoId) ? await buscarPedido(pedidoId) : null;
  const base = {
    pedidoId: pedido?.id ?? null,
    clinicaId: pedido?.clinicaId ?? null,
    pagamentoId: idPagamento,
    meio: meioDoPagamento(pagamento),
    status: pagamento.status ?? null,
    valor: Number(pagamento.transaction_amount),
  };
  await registrarEvento({
    ...base,
    tipo: 'pagamento_consultado',
    nivel: 'info',
    mensagem: `Mercado Pago: ${descreverPagamento(pagamento)}.`,
    detalhes: {
      origem: 'aviso',
      external_reference: pedidoId || null,
      status_detail: pagamento.status_detail,
      metodo: pagamento.payment_method_id,
      parcelas: pagamento.installments,
      total_pago: pagamento.transaction_details?.total_paid_amount,
      aprovado_em: pagamento.date_approved,
    },
  });

  const ignorar = (mensagem: string, nivel: 'info' | 'aviso' = 'aviso') =>
    registrarEvento({ ...base, tipo: 'pagamento_ignorado', nivel, mensagem });

  if (!pedido) {
    await ignorar(pedidoId ? `Referência ${pedidoId} não é um pedido deste ambiente.` : 'Pagamento sem referência de pedido.');
    return;
  }

  if (pagamento.status === 'refunded' || pagamento.status === 'charged_back') {
    if (await estornarPedido(pedido.id, idPagamento)) {
      await registrarEvento({
        ...base,
        tipo: 'pedido_estornado',
        nivel: 'aviso',
        mensagem: `${pagamento.status === 'charged_back' ? 'Chargeback' : 'Estorno'}: o vencimento da clínica recuou o período deste pagamento.`,
      });
    }
    return;
  }

  if (pagamento.status !== 'approved') {
    if (pagamento.status === 'pending' || pagamento.status === 'in_process') {
      await ignorar(base.meio === 'pix' ? 'Pix gerado, aguardando o pagamento.' : 'Pagamento em análise no Mercado Pago.', 'info');
    } else {
      await ignorar(`Pagamento ${pagamento.status}${pagamento.status_detail ? ` (${pagamento.status_detail})` : ''}: nada a fazer.`, 'info');
    }
    return;
  }
  if (pagamento.currency_id !== 'BRL') {
    await ignorar(`Moeda ${pagamento.currency_id} não aceita.`);
    return;
  }
  if (!valorConfere(Number(pedido.valor), Number(pagamento.transaction_amount))) {
    await ignorar(`Valor pago (${pagamento.transaction_amount}) não confere com o pedido (${Number(pedido.valor)}).`);
    return;
  }
  if (pedido.status === 'pago' && pedido.pagamentoId && pedido.pagamentoId !== idPagamento) {
    await ignorar(`Pedido já pago pelo pagamento ${pedido.pagamentoId}. Este é repetido: avaliar devolução.`);
    return;
  }

  try {
    await cumprir(pedido.id, idPagamento, 'aviso');
  } catch (err) {
    const atual = await buscarPedido(pedido.id);
    if (atual && (atual.status === 'pago' || atual.status === 'revisao' || atual.status === 'estornado')) return;
    throw err;
  }
}

function descreverPagamento(pagamento: {
  status?: string;
  status_detail?: string;
  payment_method_id?: string;
  installments?: number;
}) {
  const meio = pagamento.payment_method_id === 'pix' ? 'Pix' : pagamento.payment_method_id ?? 'meio desconhecido';
  const parcelas = pagamento.installments && pagamento.installments > 1 ? ` em ${pagamento.installments}x` : '';
  return `${pagamento.status ?? 'sem status'}${pagamento.status_detail ? ` (${pagamento.status_detail})` : ''}, ${meio}${parcelas}`;
}

// ---------------------------------------------------------------- painel interno

/** Gera outra senha temporária e reenvia o acesso de um pedido pago cujo e-mail não saiu. */
export async function reenviarAcesso(pedidoId: string): Promise<{ mensagem: string; email: string }> {
  const pedido = await buscarPedido(pedidoId);
  if (!pedido || pedido.tipo !== 'nova_clinica' || pedido.status !== 'pago' || !pedido.clinicaId) {
    throw new AppError(404, 'Pedido pago não encontrado.');
  }
  const admin = await buscarAdministradorInicial(pedido.clinicaId);
  if (!admin) throw new AppError(404, 'Esta clínica não tem administrador.');
  if (admin.ultimoAcesso) {
    throw new AppError(409, 'O administrador já entrou no sistema. Ele pode usar Esqueci minha senha.');
  }
  if (!emailHabilitado()) throw new AppError(503, 'O envio de e-mail não está configurado.');

  const dados = pedido.dados as InscricaoInput;
  const plano = await buscarPorCodigo(pedido.planoCodigo);
  const senha = gerarSenhaInicial();
  await definirSenha(admin.id, pedido.clinicaId, senha);
  await entregarAcesso({
    clinicaNome: dados.clinica.nomeFantasia,
    usuarioNome: admin.nome,
    email: admin.email,
    senha,
    planoNome: `${plano?.nome ?? pedido.planoCodigo}${pedido.ciclo === 'anual' ? ' anual' : ''}`,
    gratuitoAte: null,
  });
  await marcarAcessoEnviado(pedido.id);
  await registrarEvento({
    tipo: 'acesso_reenviado',
    nivel: 'info',
    pedidoId: pedido.id,
    clinicaId: pedido.clinicaId,
    mensagem: `Painel reenviou o acesso para ${admin.email} com outra senha temporária.`,
  });
  return { mensagem: `Acesso reenviado para ${admin.email}.`, email: admin.email };
}
