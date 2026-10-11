import { Prisma } from '@prisma/client';

import { env, isDev } from '../config/env';
import { AppError } from '../lib/erros';
import { comoSistema } from '../lib/tenant';
import {
  type CicloCobranca,
  fimDoAcessoGratuito,
  formatarDataAcesso,
  gerarSenhaInicial,
  inicioDoNovoPeriodo,
  resumoAssinatura,
  somarCiclo,
  valorMensalDe,
} from '../lib/assinatura';
import { sincronizarAutomatica } from '../lib/cobranca/automatica';
import { emailHabilitado } from '../lib/email';
import { enfileirarEmail } from '../lib/email/fila';
import { montarEmailRecibo } from '../lib/email/templates/cobranca';
import { meioDoPagamento, mensagemDeErro, registrarEvento } from '../lib/eventos-pagamento';
import { montarEmailAcesso } from '../lib/email/templates/acesso';
import {
  assinaturaDoPagamento,
  buscarPagamento,
  buscarPagamentosDoPedido,
  criarPreferencia,
  pagador,
  valorConfere,
  type PagamentoMercadoPago,
} from '../lib/mercadopago';
import { NOME_PERFIL_ADMINISTRADOR } from '../lib/perfis-padrao';
import { buscarPorCnpj, buscarPorId as buscarClinica, criarCadastroPosCompra } from '../models/clinica.model';
import { assertClinicaCabeNoPlano, buscarPorCodigo, buscarPorId as buscarPlanoPorId } from '../models/plano.model';
import {
  buscarPedido,
  buscarPedidoPorPagamento,
  concluirPedido,
  criarPedido,
  criarPedidoClinica,
  type DadosPedidoClinica,
  ehUpgrade,
  estornarPedido,
  gravarPreferencia,
  type InfoPagamento,
  liberarPedido,
  marcarRevisao,
  registrarPagamentoClinica,
  registrarTrocaPlano,
  reservarPedido,
} from '../models/pedido-assinatura.model';
import { listarAdministradoresAtivos } from '../models/cobranca-assinatura.model';
import {
  atualizarAutomatica,
  buscarAutomatica,
  buscarAutomaticaDaClinica,
  buscarAutomaticaPorPreapproval,
} from '../models/assinatura-recorrente.model';
import { cancelarAcessosPendentes } from '../models/email-saida.model';
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
  /** false: a clínica abriu, mas o e-mail com a senha não saiu. */
  acessoEnviado?: boolean;
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
const MENSAGEM_REVISAO_TROCA =
  'Recebemos o pagamento, mas a assinatura mudou antes da confirmação (outro pagamento ou outra troca). Nossa equipe vai revisar e falar com você.';

function exigirEmailConfigurado() {
  if (!emailHabilitado() && !isDev) {
    throw new AppError(503, 'O envio de e-mail não está configurado.');
  }
}

export function cicloDe(valor: unknown): CicloCobranca {
  return valor === 'anual' ? 'anual' : 'mensal';
}

/** Só a landing abre clínica nova; troca de plano e cobrança automática são de clínica existente. */
function tipoDe(pedido: Pedido): ResultadoPedido['tipo'] {
  return pedido.tipo === 'nova_clinica' ? 'nova_clinica' : 'clinica_existente';
}

function emailDoPedido(pedido: Pedido): string {
  if (pedido.tipo !== 'nova_clinica') return '';
  return (pedido.dados as InscricaoInput | null)?.usuario?.email ?? '';
}

export async function planoComPreco(codigo: string, ciclo: CicloCobranca = 'mensal') {
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

export function exigirMercadoPago() {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new AppError(503, 'O pagamento ainda não está configurado.');
  }
}

export function tituloDoPlano(nome: string, ciclo: CicloCobranca) {
  return `J.A. Clinics — Plano ${nome} (${ciclo === 'anual' ? 'anual' : 'mensal'})`;
}

function descricaoDoPlano(nome: string, ciclo: CicloCobranca) {
  return ciclo === 'anual'
    ? `Assinatura anual do plano ${nome}: Pix à vista ou cartão parcelado`
    : `Mensalidade do plano ${nome}`;
}

async function entregarAcesso(params: {
  tipo: 'acesso' | 'acesso_teste';
  /** Idempotência na fila: a mesma chave nunca manda duas vezes. */
  chave: string;
  pedidoId?: string | null;
  clinicaId?: string | null;
  clinicaNome: string;
  usuarioNome: string;
  email: string;
  senha: string;
  planoNome: string;
  gratuitoAte: Date | null;
}): Promise<ResultadoAcesso & { acessoEnviado: boolean }> {
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

  // Desenvolvimento local sem SMTP: a senha aparece só no log e na tela, como antes.
  if (!emailHabilitado() && isDev) {
    console.info(`[email] Acesso de ${params.email}. Senha temporária: ${params.senha}`);
    return {
      mensagem: 'A clínica foi aberta. O e-mail não está configurado neste ambiente, então a senha temporária aparece só aqui.',
      email: params.email,
      senhaTemporaria: params.senha,
      acessoEnviado: false,
    };
  }

  // Na fila: tenta na hora e, se falhar, a fila insiste sozinha (1 min, 5 min, 15 min, 1 h, 6 h, 24 h).
  const { enviado } = await enfileirarEmail({
    tipo: params.tipo,
    chave: params.chave,
    para: params.email,
    assunto: mensagemEmail.assunto,
    texto: mensagemEmail.texto,
    html: mensagemEmail.html,
    remetenteNome: mensagemEmail.remetenteNome,
    pedidoId: params.pedidoId ?? null,
    clinicaId: params.clinicaId ?? null,
    enviarAgora: true,
  });

  return enviado
    ? { mensagem: 'Enviamos o acesso para o e-mail do administrador.', email: params.email, acessoEnviado: true }
    : {
        mensagem:
          'A clínica foi aberta. O e-mail com a senha está a caminho: se não chegar em alguns minutos, confira o spam ou fale com a gente.',
        email: params.email,
        acessoEnviado: false,
      };
}

/** Recibo para os administradores. Nunca lança: o pagamento já está confirmado. */
export async function enviarRecibo(params: {
  pedidoId: string;
  clinicaId: string;
  clinicaNome: string;
  planoNome: string;
  ciclo: CicloCobranca;
  valor: number;
  periodoInicio: Date;
  periodoFim: Date;
  pagamentoId: string | null;
  infoPagamento?: InfoPagamento;
  /** Clínica nova: o administrador ainda não tem sessão; o recibo vai para o e-mail do cadastro. */
  destinatarios?: { email: string; nome: string }[];
}) {
  try {
    const destinatarios = params.destinatarios ?? (await listarAdministradoresAtivos(params.clinicaId));
    for (const admin of destinatarios) {
      const recibo = montarEmailRecibo({
        clinica: params.clinicaNome,
        nomeAdmin: admin.nome,
        plano: params.planoNome,
        ciclo: params.ciclo,
        valor: params.valor,
        meio: params.infoPagamento?.meio ?? null,
        parcelas: params.infoPagamento?.parcelas ?? null,
        periodoInicio: params.periodoInicio,
        periodoFim: params.periodoFim,
        pagamentoId: params.pagamentoId,
        link: `${env.FRONTEND_URL.replace(/\/+$/, '')}/login`,
      });
      await enfileirarEmail({
        tipo: 'recibo',
        chave: `recibo:${params.pedidoId}:${admin.email}`,
        para: admin.email,
        assunto: recibo.assunto,
        texto: recibo.texto,
        html: recibo.html,
        remetenteNome: recibo.remetenteNome,
        pedidoId: params.pedidoId,
        clinicaId: params.clinicaId,
      });
    }
  } catch (err) {
    console.error('[email] recibo não enfileirado', params.pedidoId, mensagemDeErro(err));
  }
}

// ---------------------------------------------------------------- teste grátis

export async function iniciarAcessoGratuito(dados: InscricaoInput): Promise<ResultadoAcesso> {
  exigirEmailConfigurado();
  const { plano } = await planoComPreco(dados.plano);
  await garantirVaga(dados);

  const senha = gerarSenhaInicial();
  const trialExpiraEm = fimDoAcessoGratuito();
  const { clinica } = await criarCadastroPosCompra({
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

  // A clínica já existe: nunca responder erro aqui, senão a pessoa tenta de novo e bate em "CNPJ já cadastrado".
  try {
    return await entregarAcesso({
      tipo: 'acesso_teste',
      chave: `acesso-teste:${clinica.id}`,
      clinicaId: clinica.id,
      clinicaNome: dados.clinica.nomeFantasia,
      usuarioNome: dados.usuario.nome,
      email: dados.usuario.email,
      senha,
      planoNome: plano.nome,
      gratuitoAte: trialExpiraEm,
    });
  } catch (err) {
    console.error(`[email] teste grátis aberto sem e-mail para ${dados.usuario.email}: ${mensagemDeErro(err)}`);
    return {
      mensagem: 'A clínica foi aberta, mas o e-mail com a senha não saiu. Fale com a gente no WhatsApp para receber o acesso.',
      email: dados.usuario.email,
      acessoEnviado: false,
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

export async function administradorDaClinica(acesso: AcessoPagamento) {
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
  const administrador = usuario.perfil.nome === NOME_PERFIL_ADMINISTRADOR;
  const agendado = clinica.planoAgendadoId ? await buscarPlanoPorId(clinica.planoAgendadoId) : null;
  const automatica = await buscarAutomaticaDaClinica(clinica.id);
  const planoAutomatica = automatica
    ? automatica.planoCodigo === plano.codigo
      ? plano
      : await buscarPorCodigo(automatica.planoCodigo)
    : null;

  return {
    tipoAcesso: clinica.tipoAcesso,
    ciclo: cicloDe(clinica.cicloCobranca),
    plano: { codigo: plano.codigo, nome: plano.nome },
    ...resumoAssinatura(clinica),
    podePagar: administrador,
    pagamentoDisponivel: Boolean(env.MERCADOPAGO_ACCESS_TOKEN),
    trocaAgendada:
      agendado && clinica.pagoAte
        ? {
            plano: { codigo: agendado.codigo, nome: agendado.nome },
            ciclo: cicloDe(clinica.cicloAgendado ?? clinica.cicloCobranca),
            aPartirDe: clinica.pagoAte.toISOString(),
          }
        : null,
    automatica: automatica
      ? {
          status: automatica.status as 'pendente' | 'ativa' | 'pausada',
          plano: { codigo: automatica.planoCodigo, nome: planoAutomatica?.nome ?? automatica.planoCodigo },
          ciclo: cicloDe(automatica.ciclo),
          valor: Number(automatica.valor),
          cartaoFinal: automatica.cartaoFinal,
          proximaCobrancaEm: (automatica.proximaCobrancaEm ?? clinica.pagoAte)?.toISOString() ?? null,
          // O link de autorização só serve para o administrador.
          linkAutorizacao: administrador ? automatica.linkAutorizacao : null,
          falhou: automatica.ultimaFalhaEm
            ? { em: automatica.ultimaFalhaEm.toISOString(), motivo: automatica.ultimaFalhaMotivo }
            : null,
        }
      : null,
    automaticaDisponivel: administrador && Boolean(env.MERCADOPAGO_ACCESS_TOKEN),
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
  const automatica = await buscarAutomaticaDaClinica(acesso.clinicaId);
  if (automatica && automatica.ciclo !== ciclo) {
    throw new AppError(
      409,
      `A cobrança automática desta clínica é ${automatica.ciclo}. Para pagar o ${ciclo}, desative a cobrança automática antes.`,
    );
  }

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
    if (pedido.tipo === 'troca_plano') {
      return {
        status: 'pago',
        tipo,
        email,
        pagoAte: pedido.periodoFim?.toISOString() ?? null,
        mensagem: pedido.periodoFim
          ? `Pagamento confirmado. O novo plano já está valendo e a assinatura vence em ${formatarDataAcesso(pedido.periodoFim)}.`
          : 'Pagamento confirmado. O novo plano já está valendo.',
      };
    }
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
  if (pedido.status === 'revisao') {
    return {
      status: 'revisao',
      tipo,
      email,
      mensagem: pedido.tipo === 'troca_plano' ? MENSAGEM_REVISAO_TROCA : MENSAGEM_REVISAO,
    };
  }
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

export type OrigemConfirmacao = 'aviso' | 'retorno' | 'local' | 'conciliacao';

export type { InfoPagamento };

export function infoDoPagamento(pagamento: PagamentoMercadoPago): InfoPagamento {
  const total = Number(pagamento.transaction_details?.total_paid_amount);
  return {
    meio: meioDoPagamento(pagamento),
    parcelas: pagamento.installments ?? null,
    totalPago: Number.isFinite(total) && total > 0 ? total : null,
  };
}

async function cumprirNovaClinica(
  pedido: Pedido,
  pagamentoId: string | null,
  origem: OrigemConfirmacao,
  info?: InfoPagamento,
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
          valorMensal:
            ciclo === 'anual'
              ? valorMensalDe(
                  { codigo: plano.codigo, precoMensal: Number(plano.precoMensal), precoAnual: Number(plano.precoAnual) },
                  'anual',
                )
              : Number(pedido.valor),
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
            { clinicaId: idClinica, pagamentoId, periodoInicio: inicio, periodoFim: fim, info },
            tx,
          );
        },
      },
    );
  } catch (err) {
    if (conflitoDeCadastro(err)) {
      await marcarRevisao(pedido.id, pagamentoId, info);
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

  if (clinicaId) {
    await enviarRecibo({
      pedidoId: pedido.id,
      clinicaId,
      clinicaNome: dados.clinica.nomeFantasia,
      planoNome,
      ciclo,
      valor: Number(pedido.valor),
      periodoInicio: inicio,
      periodoFim: fim,
      pagamentoId,
      infoPagamento: info,
      destinatarios: [{ email: dados.usuario.email, nome: dados.usuario.nome }],
    });
  }

  try {
    const entrega = await entregarAcesso({
      tipo: 'acesso',
      chave: `acesso:${pedido.id}`,
      pedidoId: pedido.id,
      clinicaId,
      clinicaNome: dados.clinica.nomeFantasia,
      usuarioNome: dados.usuario.nome,
      email: dados.usuario.email,
      senha,
      planoNome: ciclo === 'anual' ? `${planoNome} anual` : planoNome,
      gratuitoAte: null,
    });
    if (entrega.senhaTemporaria) {
      await registrarEvento({
        tipo: 'acesso_enviado',
        nivel: 'aviso',
        pedidoId: pedido.id,
        clinicaId,
        mensagem: `SMTP desligado neste ambiente: senha temporária só no log (${dados.usuario.email}).`,
      });
    }
    return { status: 'pago', tipo: 'nova_clinica', ...entrega };
  } catch (err) {
    // A clínica já está paga e aberta. O painel mostra o pedido para reenviar o acesso.
    await registrarEvento({
      tipo: 'acesso_falhou',
      nivel: 'erro',
      pedidoId: pedido.id,
      clinicaId,
      mensagem: `E-mail de acesso para ${dados.usuario.email} não entrou na fila: ${mensagemDeErro(err)}. Use Reenviar acesso no painel.`,
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
  info?: InfoPagamento,
): Promise<ResultadoPedido> {
  if (!pedido.clinicaId) {
    await marcarRevisao(pedido.id, pagamentoId, info);
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
      pagamentoId,
      info,
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
      mensagem: `Clínica paga até ${formatarDataAcesso(fim)}: plano ${pedido.planoCodigo} (${ciclo})${pedido.tipo === 'recorrente' ? ' pela cobrança automática' : ''}, confirmado pelo ${origem}.`,
      detalhes: { origem, ciclo, periodoInicio: inicio.toISOString(), periodoFim: fim.toISOString() },
    });
    if (pedido.tipo !== 'recorrente') {
      await depoisDePagamentoManual(pedido.clinicaId).catch((err) =>
        registrarEvento({
          tipo: 'automatica_atualizada',
          nivel: 'erro',
          clinicaId: pedido.clinicaId,
          mensagem: `Pagamento confirmado, mas a cobrança automática não foi conferida: ${mensagemDeErro(err)}.`,
        }),
      );
    }
    const clinica = await buscarClinica(pedido.clinicaId);
    const plano = await buscarPorCodigo(pedido.planoCodigo);
    await enviarRecibo({
      pedidoId: pedido.id,
      clinicaId: pedido.clinicaId,
      clinicaNome: clinica?.nomeFantasia ?? 'Clínica',
      planoNome: plano?.nome ?? pedido.planoCodigo,
      ciclo,
      valor: Number(pedido.valor),
      periodoInicio: inicio,
      periodoFim: fim,
      pagamentoId,
      infoPagamento: info,
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

/**
 * Pagamento à mão com a cobrança automática ligada: o aviso de cobrança recusada perde o sentido e o
 * valor da automática acompanha o plano que acabou de ser pago (a troca agendada foi descartada).
 */
async function depoisDePagamentoManual(clinicaId: string) {
  const automatica = await buscarAutomaticaDaClinica(clinicaId);
  if (!automatica) return;
  if (automatica.ultimaFalhaEm) {
    await atualizarAutomatica(automatica.id, { ultimaFalhaEm: null, ultimaFalhaMotivo: null });
  }
  await sincronizarAutomatica(clinicaId, 'pagamento feito à mão');
}

/**
 * Upgrade ou troca de ciclo paga. Confere de novo se a clínica está como na simulação; se o plano
 * ou o vencimento mudaram no meio-tempo, o pedido vai para revisão em vez de aplicar a troca errada.
 */
async function cumprirTrocaPlano(
  pedido: Pedido,
  pagamentoId: string | null,
  origem: OrigemConfirmacao,
  info?: InfoPagamento,
): Promise<ResultadoPedido> {
  const clinicaId = pedido.clinicaId;
  const ciclo = cicloDe(pedido.ciclo);
  const upgrade = ehUpgrade(pedido);
  const revisao = async (motivo: string): Promise<ResultadoPedido> => {
    await marcarRevisao(pedido.id, pagamentoId, info);
    await registrarEvento({
      tipo: 'pedido_revisao',
      nivel: 'erro',
      pedidoId: pedido.id,
      clinicaId,
      pagamentoId,
      valor: Number(pedido.valor),
      status: 'revisao',
      mensagem: `Troca de plano paga, mas não aplicada: ${motivo}. Aplique à mão ou devolva o pagamento.`,
      detalhes: { origem, plano: pedido.planoCodigo, ciclo, planoAnterior: pedido.planoAnteriorCodigo, cicloAnterior: pedido.cicloAnterior },
    });
    return { status: 'revisao', tipo: 'clinica_existente', email: '', mensagem: MENSAGEM_REVISAO_TROCA };
  };
  if (!clinicaId || !pedido.planoAnteriorCodigo) return revisao('pedido sem a situação anterior');

  try {
    const resultado = await registrarTrocaPlano({
      pedidoId: pedido.id,
      clinicaId,
      planoCodigo: pedido.planoCodigo,
      ciclo,
      esperado: {
        planoCodigo: pedido.planoAnteriorCodigo,
        ciclo: cicloDe(pedido.cicloAnterior),
        pagoAte: pedido.pagoAteAnterior,
      },
      // O crédito foi calculado quando o pedido abriu: o ciclo novo conta dali (Pix pago dias depois não ganha dias).
      novoPeriodo: upgrade ? null : { inicio: pedido.criadoEm, fim: somarCiclo(pedido.criadoEm, ciclo) },
      pagamentoId,
      info,
    });
    if (!resultado.aplicada) return revisao(resultado.motivo);

    const plano = await buscarPorCodigo(pedido.planoCodigo);
    await registrarEvento({
      tipo: 'pedido_pago',
      nivel: 'info',
      pedidoId: pedido.id,
      clinicaId,
      pagamentoId,
      valor: Number(pedido.valor),
      status: 'pago',
      mensagem: upgrade
        ? `Upgrade de ${pedido.planoAnteriorCodigo} para ${pedido.planoCodigo} pago (proporcional); o vencimento continua em ${formatarDataAcesso(resultado.fim)}. Confirmado pelo ${origem}.`
        : `Troca para ${pedido.planoCodigo} ${ciclo} paga com crédito de ${Number(pedido.credito ?? 0).toFixed(2)}; vale até ${formatarDataAcesso(resultado.fim)}. Confirmado pelo ${origem}.`,
      detalhes: {
        origem,
        troca: upgrade ? 'upgrade' : 'troca_ciclo',
        periodoInicio: resultado.inicio.toISOString(),
        periodoFim: resultado.fim.toISOString(),
      },
    });
    await sincronizarAutomatica(clinicaId, 'troca de plano paga');
    const clinica = await buscarClinica(clinicaId);
    await enviarRecibo({
      pedidoId: pedido.id,
      clinicaId,
      clinicaNome: clinica?.nomeFantasia ?? 'Clínica',
      planoNome: plano?.nome ?? pedido.planoCodigo,
      ciclo,
      valor: Number(pedido.valor),
      periodoInicio: resultado.inicio,
      periodoFim: resultado.fim,
      pagamentoId,
      infoPagamento: info,
    });
    return resultadoDoPedido((await buscarPedido(pedido.id)) ?? pedido);
  } catch (err) {
    await liberarPedido(pedido.id);
    throw err;
  }
}

/** Confirma um pedido pago (aviso, retorno, conferência ou cobrança automática). Idempotente. */
export async function confirmarPedido(
  pedidoId: string,
  pagamentoId: string | null,
  origem: OrigemConfirmacao,
  info?: InfoPagamento,
): Promise<ResultadoPedido> {
  return cumprir(pedidoId, pagamentoId, origem, info);
}

async function cumprir(
  pedidoId: string,
  pagamentoId: string | null,
  origem: OrigemConfirmacao,
  info?: InfoPagamento,
): Promise<ResultadoPedido> {
  const pedido = await buscarPedido(pedidoId);
  if (!pedido) throw new AppError(404, 'Pedido não encontrado.');
  if (pedido.status === 'pago' || pedido.status === 'estornado') return resultadoDoPedido(pedido);

  if (!(await reservarPedido(pedidoId))) {
    const atual = await buscarPedido(pedidoId);
    if (atual && atual.status !== 'processando') return resultadoDoPedido(atual);
    throw new AppError(409, 'Este pagamento já está sendo confirmado.');
  }

  if (pedido.tipo === 'nova_clinica') return cumprirNovaClinica(pedido, pagamentoId, origem, info);
  if (pedido.tipo === 'troca_plano') return cumprirTrocaPlano(pedido, pagamentoId, origem, info);
  // clinica_existente e recorrente: período cheio.
  return cumprirClinicaExistente(pedido, pagamentoId, origem, info);
}

/** Página de retorno: confere no Mercado Pago se o pedido já tem pagamento aprovado. */
export async function sincronizarPedido(pedidoId: string): Promise<ResultadoPedido> {
  const pedido = await buscarPedido(pedidoId);
  if (!pedido) throw new AppError(404, 'Pedido não encontrado.');
  if (pedido.status !== 'pendente' && pedido.status !== 'processando' && pedido.status !== 'expirado') {
    return resultadoDoPedido(pedido);
  }

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
    return await cumprir(pedido.id, String(pagamento.id ?? ''), 'retorno', infoDoPagamento(pagamento));
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

/** Pagamento sem pedido que pertence a uma cobrança automática: o chamador aplica pela assinatura. */
export interface PagamentoDeAutomatica {
  pagamento: PagamentoMercadoPago;
  assinaturaRecorrenteId: string;
}

async function automaticaDoPagamento(pagamento: PagamentoMercadoPago) {
  const { preapprovalId, referencia } = assinaturaDoPagamento(pagamento);
  if (preapprovalId) {
    const porId = await buscarAutomaticaPorPreapproval(preapprovalId);
    if (porId) return porId;
  }
  return referencia && UUID.test(referencia) ? buscarAutomatica(referencia) : null;
}

const ROTULO_ESTORNO: Record<string, string> = {
  troca_plano: 'o plano voltou ao anterior',
};

/**
 * Aviso do Mercado Pago. Os dados vêm sempre da API do Mercado Pago com o nosso token,
 * nunca do corpo do aviso. Lança só em falha passageira, para o aviso voltar a ser enviado.
 * Pagamento de cobrança automática ainda sem pedido é devolvido para o serviço da automática.
 */
export async function processarAvisoMercadoPago(pagamentoId: string): Promise<PagamentoDeAutomatica | null> {
  if (!env.MERCADOPAGO_ACCESS_TOKEN || !pagamentoId) return null;
  const pagamento = await buscarPagamento(pagamentoId);
  if (!pagamento) {
    await registrarEvento({
      tipo: 'pagamento_ignorado',
      nivel: 'aviso',
      pagamentoId,
      mensagem: 'O Mercado Pago não encontrou este pagamento (404).',
    });
    return null;
  }

  const pedidoId = pagamento.external_reference ?? '';
  const idPagamento = String(pagamento.id ?? pagamentoId);
  // Cobrança automática: o pedido nasce com o id do pagamento; a referência é a da assinatura.
  const pedido =
    (UUID.test(pedidoId) ? await buscarPedido(pedidoId) : null) ?? (await buscarPedidoPorPagamento(idPagamento));
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
    const automatica = await automaticaDoPagamento(pagamento);
    if (automatica) return { pagamento, assinaturaRecorrenteId: automatica.id };
    await ignorar(pedidoId ? `Referência ${pedidoId} não é um pedido deste ambiente.` : 'Pagamento sem referência de pedido.');
    return null;
  }

  if (pagamento.status === 'refunded' || pagamento.status === 'charged_back') {
    if (await estornarPedido(pedido.id, idPagamento)) {
      await registrarEvento({
        ...base,
        tipo: 'pedido_estornado',
        nivel: 'aviso',
        mensagem: `${pagamento.status === 'charged_back' ? 'Chargeback' : 'Estorno'}: ${descreverEstorno(pedido)}.`,
      });
      if (pedido.tipo === 'troca_plano' && pedido.clinicaId) await sincronizarAutomatica(pedido.clinicaId, 'estorno da troca de plano');
    }
    return null;
  }

  if (pagamento.status !== 'approved') {
    if (pagamento.status === 'pending' || pagamento.status === 'in_process') {
      await ignorar(base.meio === 'pix' ? 'Pix gerado, aguardando o pagamento.' : 'Pagamento em análise no Mercado Pago.', 'info');
    } else {
      await ignorar(`Pagamento ${pagamento.status}${pagamento.status_detail ? ` (${pagamento.status_detail})` : ''}: nada a fazer.`, 'info');
    }
    return null;
  }
  if (pagamento.currency_id !== 'BRL') {
    await ignorar(`Moeda ${pagamento.currency_id} não aceita.`);
    return null;
  }
  if (!valorConfere(Number(pedido.valor), Number(pagamento.transaction_amount))) {
    await ignorar(`Valor pago (${pagamento.transaction_amount}) não confere com o pedido (${Number(pedido.valor)}).`);
    return null;
  }
  if (pedido.status === 'pago' && pedido.pagamentoId && pedido.pagamentoId !== idPagamento) {
    await ignorar(`Pedido já pago pelo pagamento ${pedido.pagamentoId}. Este é repetido: avaliar devolução.`);
    return null;
  }

  try {
    await cumprir(pedido.id, idPagamento, 'aviso', infoDoPagamento(pagamento));
  } catch (err) {
    const atual = await buscarPedido(pedido.id);
    if (atual && (atual.status === 'pago' || atual.status === 'revisao' || atual.status === 'estornado')) return null;
    throw err;
  }
  return null;
}

function descreverEstorno(pedido: Pedido): string {
  if (pedido.tipo !== 'troca_plano') return 'o vencimento da clínica recuou o período deste pagamento';
  return ehUpgrade(pedido)
    ? `${ROTULO_ESTORNO.troca_plano} (${pedido.planoAnteriorCodigo}) e o vencimento não mudou`
    : `${ROTULO_ESTORNO.troca_plano} (${pedido.planoAnteriorCodigo}, ${pedido.cicloAnterior}) e o vencimento voltou ao de antes da troca`;
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

// ---------------------------------------------------------------- conferência periódica com o Mercado Pago

/**
 * Pedido pendente: procura pagamento aprovado no Mercado Pago (aviso perdido ou recusado).
 * Devolve true quando a conferência pagou o pedido.
 */
export async function conferirPedidoPendente(pedidoId: string): Promise<boolean> {
  const pedido = await buscarPedido(pedidoId);
  if (!pedido || !['pendente', 'processando', 'expirado'].includes(pedido.status)) return false;
  const pagamento = (await buscarPagamentosDoPedido(pedido.id)).find(
    (item) =>
      item.status === 'approved' &&
      item.currency_id === 'BRL' &&
      valorConfere(Number(pedido.valor), Number(item.transaction_amount)),
  );
  if (!pagamento) return false;

  try {
    const resultado = await cumprir(pedido.id, String(pagamento.id ?? ''), 'conciliacao', infoDoPagamento(pagamento));
    if (resultado.status !== 'pago') return false;
  } catch (err) {
    if (err instanceof AppError && err.status === 409) return false;
    throw err;
  }
  await registrarEvento({
    tipo: 'conciliacao_aplicou',
    nivel: 'aviso',
    pedidoId: pedido.id,
    clinicaId: pedido.clinicaId,
    pagamentoId: String(pagamento.id ?? ''),
    meio: meioDoPagamento(pagamento),
    status: pagamento.status ?? null,
    valor: Number(pagamento.transaction_amount),
    mensagem: 'A conferência periódica encontrou o pagamento aprovado que o aviso do Mercado Pago não aplicou. Confira o webhook.',
  });
  return true;
}

/** Pedido pago: confere se o pagamento foi devolvido ou contestado. Devolve true quando estornou. */
export async function conferirPedidoPago(pedidoId: string): Promise<boolean> {
  const pedido = await buscarPedido(pedidoId);
  if (!pedido || pedido.status !== 'pago' || !pedido.pagamentoId) return false;
  const pagamento = await buscarPagamento(pedido.pagamentoId);
  if (!pagamento || (pagamento.status !== 'refunded' && pagamento.status !== 'charged_back')) return false;
  if (!(await estornarPedido(pedido.id, pedido.pagamentoId))) return false;
  if (pedido.tipo === 'troca_plano' && pedido.clinicaId) await sincronizarAutomatica(pedido.clinicaId, 'estorno da troca de plano');
  await registrarEvento({
    tipo: 'conciliacao_aplicou',
    nivel: 'aviso',
    pedidoId: pedido.id,
    clinicaId: pedido.clinicaId,
    pagamentoId: pedido.pagamentoId,
    meio: meioDoPagamento(pagamento),
    status: pagamento.status ?? null,
    valor: Number(pagamento.transaction_amount),
    mensagem: `A conferência periódica aplicou ${pagamento.status === 'charged_back' ? 'um chargeback' : 'um estorno'} que o aviso não aplicou: ${descreverEstorno(pedido)}. Confira o webhook.`,
  });
  return true;
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
  // O e-mail que ainda está na fila leva a senha antiga: não pode sair depois deste.
  await comoSistema(() => cancelarAcessosPendentes(pedido.id, 'Reenviado com outra senha pelo painel.'));
  await definirSenha(admin.id, pedido.clinicaId, senha);
  const entrega = await entregarAcesso({
    tipo: 'acesso',
    chave: `acesso:${pedido.id}:reenvio:${Date.now()}`,
    pedidoId: pedido.id,
    clinicaId: pedido.clinicaId,
    clinicaNome: dados.clinica.nomeFantasia,
    usuarioNome: admin.nome,
    email: admin.email,
    senha,
    planoNome: `${plano?.nome ?? pedido.planoCodigo}${pedido.ciclo === 'anual' ? ' anual' : ''}`,
    gratuitoAte: null,
  });
  if (!entrega.acessoEnviado) {
    throw new AppError(
      503,
      'O e-mail não saiu agora. Ele ficou na fila com a senha nova e será reenviado sozinho; confira em Logs.',
    );
  }
  await registrarEvento({
    tipo: 'acesso_reenviado',
    nivel: 'info',
    pedidoId: pedido.id,
    clinicaId: pedido.clinicaId,
    mensagem: `Painel reenviou o acesso para ${admin.email} com outra senha temporária.`,
  });
  return { mensagem: `Acesso reenviado para ${admin.email}.`, email: admin.email };
}
