import nodemailer from 'nodemailer';
import { env, isDev } from '../../config/env';
import { ResultadoCanal } from './whatsapp-meta';

export interface ConfiguracaoSmtpClinica {
  host?: string | null;
  port?: number | null;
  usuario?: string | null;
  senha?: string | null;
  remetente?: string | null;
  remetenteNome?: string | null;
  seguro?: string | null;
}

function smtpEfetivo(config: ConfiguracaoSmtpClinica) {
  const host = config.host?.trim() || env.SMTP_HOST;
  const port = config.port || env.SMTP_PORT;
  const usuario = config.usuario?.trim() || env.SMTP_USER;
  const senha = config.senha ?? env.SMTP_PASS;
  const remetente = config.remetente?.trim() || env.SMTP_FROM;
  const remetenteNome = config.remetenteNome?.trim() || '';
  const seguro = config.seguro || (port === 465 ? 'ssl' : 'tls');
  return { host, port, usuario, senha, remetente, remetenteNome, seguro };
}

export function smtpPronto(config: ConfiguracaoSmtpClinica): boolean {
  const efetivo = smtpEfetivo(config);
  return Boolean(efetivo.host && efetivo.remetente);
}

function montarFrom(config: ReturnType<typeof smtpEfetivo>): string {
  if (config.remetenteNome && !config.remetente.includes('<')) {
    return `${config.remetenteNome} <${config.remetente}>`;
  }
  return config.remetente;
}

function criarTransport(config: ReturnType<typeof smtpEfetivo>) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.seguro === 'ssl' || config.port === 465,
    requireTLS: config.seguro === 'tls',
    auth: config.usuario ? { user: config.usuario, pass: config.senha } : undefined,
  });
}

export async function testarSmtp(config: ConfiguracaoSmtpClinica): Promise<ResultadoCanal> {
  const efetivo = smtpEfetivo(config);
  if (!efetivo.host || !efetivo.remetente) {
    return { ok: false, erro: 'SMTP não configurado.' };
  }
  try {
    await criarTransport(efetivo).verify();
    return { ok: true };
  } catch (err) {
    console.error('[integracoes] falha de SMTP', err instanceof Error ? err.message : 'erro');
    return { ok: false, erro: 'Não foi possível autenticar no servidor de e-mail.' };
  }
}

export async function enviarEmailCanal(
  config: ConfiguracaoSmtpClinica,
  mensagem: { para: string; assunto: string; texto: string; html?: string },
): Promise<ResultadoCanal> {
  const efetivo = smtpEfetivo(config);
  if (!efetivo.host || !efetivo.remetente) {
    if (isDev) {
      console.info(`[integracoes] SMTP não configurado. Para: ${mensagem.para}. Assunto: ${mensagem.assunto}`);
    }
    return { ok: false, erro: 'SMTP não configurado.' };
  }

  try {
    const info = await criarTransport(efetivo).sendMail({
      from: montarFrom(efetivo),
      to: mensagem.para,
      subject: mensagem.assunto,
      text: mensagem.texto,
      html: mensagem.html ?? `<p>${mensagem.texto.replace(/\n/g, '<br/>')}</p>`,
    });
    return { ok: true, provedorMessageId: typeof info.messageId === 'string' ? info.messageId : undefined };
  } catch (err) {
    console.error('[integracoes] falha de envio de e-mail', err instanceof Error ? err.message : 'erro');
    return { ok: false, erro: 'Falha ao enviar e-mail.' };
  }
}
