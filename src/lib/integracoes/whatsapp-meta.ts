import crypto from 'crypto';
import { env } from '../../config/env';

export interface CredenciaisWhatsapp {
  accessToken: string;
  phoneNumberId: string;
  appSecret?: string | null;
}

export interface MensagemTemplateWhatsapp {
  para: string;
  nomeTemplate: string;
  idioma: string;
  parametros: string[];
}

export interface ResultadoCanal {
  ok: boolean;
  provedorMessageId?: string;
  erro?: string;
}

function urlGraph(recurso: string): string {
  return `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${recurso}`;
}

async function chamarGraph<T>(
  credenciais: CredenciaisWhatsapp,
  recurso: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; corpo: T | null; erro?: string }> {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), 15000);
  try {
    const resposta = await fetch(urlGraph(recurso), {
      ...init,
      signal: controlador.signal,
      headers: {
        Authorization: `Bearer ${credenciais.accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const texto = await resposta.text();
    let json: T | null = null;
    try {
      json = texto ? (JSON.parse(texto) as T) : null;
    } catch {
      json = null;
    }
    if (!resposta.ok) {
      const mensagem =
        json && typeof json === 'object' && 'error' in (json as object)
          ? String((json as { error?: { message?: string } }).error?.message ?? 'Falha na API da Meta.')
          : `Falha na API da Meta (HTTP ${resposta.status}).`;
      return { ok: false, status: resposta.status, corpo: json, erro: mensagem };
    }
    return { ok: true, status: resposta.status, corpo: json };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, status: 0, corpo: null, erro: 'Timeout ao contatar a API da Meta.' };
    }
    return { ok: false, status: 0, corpo: null, erro: 'Não foi possível contatar a API da Meta.' };
  } finally {
    clearTimeout(timer);
  }
}

export async function testarConexaoWhatsapp(credenciais: CredenciaisWhatsapp): Promise<ResultadoCanal> {
  const resultado = await chamarGraph<{ id?: string; verified_name?: string }>(
    credenciais,
    `${credenciais.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
  );
  if (!resultado.ok) {
    console.error('[integracoes] falha de autenticação com Meta', resultado.erro);
    return { ok: false, erro: resultado.erro ?? 'Falha ao validar o número do WhatsApp.' };
  }
  return { ok: true, provedorMessageId: resultado.corpo?.id };
}

export async function enviarTemplateWhatsapp(
  credenciais: CredenciaisWhatsapp,
  mensagem: MensagemTemplateWhatsapp,
): Promise<ResultadoCanal> {
  const componentes =
    mensagem.parametros.length > 0
      ? [
          {
            type: 'body',
            parameters: mensagem.parametros.map((texto) => ({ type: 'text', text: texto.slice(0, 1024) || ' ' })),
          },
        ]
      : undefined;

  const resultado = await chamarGraph<{ messages?: { id?: string }[] }>(
    credenciais,
    `${credenciais.phoneNumberId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: mensagem.para,
        type: 'template',
        template: {
          name: mensagem.nomeTemplate,
          language: { code: mensagem.idioma || 'pt_BR' },
          ...(componentes ? { components: componentes } : {}),
        },
      }),
    },
  );

  if (!resultado.ok) {
    console.error('[integracoes] falha de envio WhatsApp', resultado.erro);
    return { ok: false, erro: resultado.erro };
  }

  const id = resultado.corpo?.messages?.[0]?.id;
  return { ok: true, provedorMessageId: id };
}

export function validarAssinaturaWebhook(params: {
  appSecret: string;
  assinatura: string | undefined;
  corpoBruto: Buffer | string;
}): boolean {
  if (!params.assinatura || !params.assinatura.startsWith('sha256=')) return false;
  const esperado = crypto
    .createHmac('sha256', params.appSecret)
    .update(params.corpoBruto)
    .digest('hex');
  const recebido = params.assinatura.slice('sha256='.length);
  try {
    const a = Buffer.from(esperado, 'utf8');
    const b = Buffer.from(recebido, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
