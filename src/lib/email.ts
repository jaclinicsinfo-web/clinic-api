import nodemailer from 'nodemailer';
import { env, isDev } from '../config/env';

export interface MensagemEmail {
  para: string;
  assunto: string;
  texto: string;
  html: string;
}

function smtpConfigurado() {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

export function emailHabilitado() {
  return smtpConfigurado();
}

export async function enviarEmail(mensagem: MensagemEmail): Promise<void> {
  if (!smtpConfigurado()) {
    if (isDev) {
      console.info(`[email] SMTP não configurado. Para: ${mensagem.para}. Assunto: ${mensagem.assunto}`);
      console.info(mensagem.texto);
    }
    return;
  }

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: mensagem.para,
    subject: mensagem.assunto,
    text: mensagem.texto,
    html: mensagem.html,
  });
}
