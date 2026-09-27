import { env, isDev } from '../../config/env';
import { AppError } from '../erros';
import { criarTransportSmtp, despacharEmail, mensagemFalhaSmtp, parsearRemetente } from './transporte';

export { montarEmailRedefinirSenha } from './templates/redefinir-senha';

export interface MensagemEmail {
  para: string;
  assunto: string;
  texto: string;
  html: string;
  categoria?: string;
  remetenteNome?: string;
}

function credenciaisDoServidor() {
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    usuario: env.SMTP_USER,
    senha: env.SMTP_PASS,
    seguro: env.SMTP_PORT === 465 ? 'ssl' : 'tls',
  };
}

function smtpConfigurado() {
  const credenciais = credenciaisDoServidor();
  return Boolean(credenciais.host && env.SMTP_FROM && credenciais.usuario && credenciais.senha);
}

export function emailHabilitado() {
  return smtpConfigurado();
}

export async function verificarSmtp(): Promise<void> {
  if (!smtpConfigurado()) {
    console.warn('[email] SMTP incompleto. Defina SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM.');
    return;
  }

  try {
    await criarTransportSmtp(credenciaisDoServidor()).verify();
    console.info(`[email] SMTP autenticado (${env.SMTP_USER}).`);
  } catch (err) {
    console.error('[email]', mensagemFalhaSmtp(err));
  }
}

export async function enviarEmail(mensagem: MensagemEmail): Promise<void> {
  if (!smtpConfigurado()) {
    if (isDev) {
      console.info(`[email] SMTP não configurado. Para: ${mensagem.para}. Assunto: ${mensagem.assunto}`);
      console.info(mensagem.texto);
    }
    throw new AppError(503, 'O envio de e-mail não está configurado.');
  }

  try {
    const credenciais = credenciaisDoServidor();
    const remetente = parsearRemetente(env.SMTP_FROM, 'J.A. Clinics', credenciais.usuario);
    const nomeEmpresa = mensagem.remetenteNome?.trim();
    if (nomeEmpresa) remetente.name = nomeEmpresa;
    await despacharEmail({
      credenciais,
      from: remetente,
      para: mensagem.para,
      assunto: mensagem.assunto,
      texto: mensagem.texto,
      html: mensagem.html,
      categoria: mensagem.categoria,
    });
  } catch (err) {
    console.error('[email] falha no envio', err instanceof Error ? err.message : 'erro');
    throw new AppError(503, mensagemFalhaSmtp(err));
  }
}
