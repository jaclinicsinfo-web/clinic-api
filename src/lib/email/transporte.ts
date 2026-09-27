import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export interface CredenciaisSmtp {
  host: string;
  port: number;
  usuario: string;
  senha: string;
  seguro?: string;
}

export function mensagemFalhaSmtp(err: unknown): string {
  const codigo = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
  if (codigo === 'EAUTH') {
    return 'O servidor recusou as credenciais SMTP. No Gmail, use uma senha de app, não a senha da conta.';
  }
  return 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.';
}

export function parsearRemetente(
  bruto: string,
  fallbackNome = 'J.A. Clinics',
  fallbackEndereco = '',
): { name: string; address: string } {
  const match = bruto.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim() || fallbackNome, address: match[2].trim() };
  }
  return { name: fallbackNome, address: (bruto || fallbackEndereco).trim() };
}

function ehGmail(credenciais: CredenciaisSmtp): boolean {
  return credenciais.host.includes('gmail.com') || credenciais.usuario.endsWith('@gmail.com');
}

export function criarTransportSmtp(credenciais: CredenciaisSmtp) {
  const opcoes: SMTPTransport.Options = ehGmail(credenciais)
    ? {
        service: 'gmail',
        auth: { user: credenciais.usuario, pass: credenciais.senha },
      }
    : {
        host: credenciais.host,
        port: credenciais.port,
        secure: credenciais.seguro === 'ssl' || credenciais.port === 465,
        requireTLS: credenciais.seguro === 'tls' || (credenciais.seguro !== 'ssl' && credenciais.seguro !== 'none' && credenciais.port === 587),
        auth: credenciais.usuario ? { user: credenciais.usuario, pass: credenciais.senha } : undefined,
      };

  return nodemailer.createTransport(opcoes);
}

export async function despacharEmail(params: {
  credenciais: CredenciaisSmtp;
  from: { name: string; address: string };
  para: string;
  assunto: string;
  texto: string;
  html: string;
  categoria?: string;
}): Promise<string | undefined> {
  const dominio = params.from.address.split('@')[1] || 'gmail.com';
  const categoria = params.categoria ?? 'transacional';
  const id = `${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;

  const info = await criarTransportSmtp(params.credenciais).sendMail({
    from: params.from,
    to: params.para,
    replyTo: params.from.address,
    subject: params.assunto,
    text: params.texto,
    html: params.html,
    date: new Date(),
    messageId: `<${categoria}.${id}@${dominio}>`,
    headers: {
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
      'X-Entity-Ref-ID': id,
    },
  });

  return typeof info.messageId === 'string' ? info.messageId : undefined;
}
