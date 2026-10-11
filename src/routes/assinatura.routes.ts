import { Router } from 'express';

import {
  acessoGratuito,
  assinaturaDaClinica,
  ativarCobrancaAutomatica,
  cancelarAutomaticaPainel,
  cancelarTrocaAgendada,
  checkout,
  checkoutClinica,
  confirmarLocal,
  desativarCobrancaAutomatica,
  pagamentosDaClinica,
  reciboDoPagamento,
  reenviarAcessoPedido,
  simularTrocaClinica,
  sincronizar,
  sincronizarClinica,
  trocarPlanoClinica,
  webhookMercadoPago,
} from '../controllers/assinatura.controller';
import { autenticar } from '../middlewares/auth.middleware';
import { validarChaveLanding } from '../middlewares/landing.middleware';
import { exigirOrigemLanding } from '../middlewares/origem-landing.middleware';
import {
  limiteAssinatura,
  limiteSincronizacao,
  limiteWebhookMercadoPago,
} from '../middlewares/rate-limit.middleware';

const router = Router();

// Clínica nova: começa no site público.
router.post('/gratuito', limiteAssinatura, exigirOrigemLanding, acessoGratuito);
router.post('/checkout', limiteAssinatura, exigirOrigemLanding, checkout);
router.post('/sincronizar', limiteSincronizacao, exigirOrigemLanding, sincronizar);
router.post('/confirmar', limiteAssinatura, exigirOrigemLanding, confirmarLocal);

// Clínica que já existe: teste → pago e renovação, de dentro do sistema.
router.get('/clinica', autenticar, assinaturaDaClinica);
router.post('/clinica/checkout', limiteAssinatura, checkoutClinica);
router.post('/clinica/sincronizar', limiteSincronizacao, sincronizarClinica);

// Histórico de pagamentos e recibo (administrador).
router.get('/clinica/pagamentos', autenticar, pagamentosDaClinica);
router.get('/clinica/pagamentos/:id/recibo', autenticar, reciboDoPagamento);

// Troca de plano no meio do período.
router.get('/clinica/simular-troca', autenticar, simularTrocaClinica);
router.post('/clinica/trocar-plano', limiteAssinatura, autenticar, trocarPlanoClinica);
router.delete('/clinica/troca-agendada', autenticar, cancelarTrocaAgendada);

// Cobrança automática no cartão.
router.post('/clinica/automatica', limiteAssinatura, autenticar, ativarCobrancaAutomatica);
router.delete('/clinica/automatica', autenticar, desativarCobrancaAutomatica);

// Painel interno.
router.post('/pedidos/:id/reenviar-acesso', validarChaveLanding, reenviarAcessoPedido);
router.post('/clinicas/:clinicaId/automatica/cancelar', validarChaveLanding, cancelarAutomaticaPainel);

router.post('/mercadopago', limiteWebhookMercadoPago, webhookMercadoPago);

export default router;
