import { Request, Response, NextFunction } from 'express';
import { decifrarSegredo } from '../lib/segredo';
import { obterConfiguracao } from '../models/integracao.model';
import { atualizarPorProvedor } from '../models/envio-lembrete.model';
import { validarAssinaturaWebhook } from '../lib/integracoes/whatsapp-meta';
import { statusWhatsappParaEnvio } from '../lib/integracoes/regras';
import { comTenant } from '../lib/tenant';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clinicaIdDoWebhook(req: Request): string | null {
  const clinicaId = String(req.params.clinicaId ?? '');
  return UUID.test(clinicaId) ? clinicaId : null;
}

export async function verificarWebhookWhatsapp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = clinicaIdDoWebhook(req);
    if (!clinicaId) {
      res.status(403).send('Forbidden');
      return;
    }
    const mode = String(req.query['hub.mode'] ?? '');
    const token = String(req.query['hub.verify_token'] ?? '');
    const challenge = String(req.query['hub.challenge'] ?? '');
    const config = await comTenant(clinicaId, () => obterConfiguracao(clinicaId));
    const esperado = decifrarSegredo(config?.whatsappVerifyTokenCifrado);

    if (mode === 'subscribe' && esperado && token && token === esperado) {
      res.status(200).send(challenge);
      return;
    }

    console.error('[integracoes] webhook WhatsApp com verify token inválido');
    res.status(403).send('Forbidden');
  } catch (err) {
    next(err);
  }
}

export async function receberWebhookWhatsapp(req: Request, res: Response): Promise<void> {
  const clinicaId = clinicaIdDoWebhook(req);
  if (!clinicaId) {
    res.status(403).json({ message: 'Assinatura do webhook inválida.' });
    return;
  }

  await comTenant(clinicaId, async () => {
    const config = await obterConfiguracao(clinicaId);
    const appSecret = decifrarSegredo(config?.whatsappAppSecretCifrado);
    const assinatura = req.header('x-hub-signature-256') ?? undefined;
    const corpoBruto = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

    if (!appSecret || !validarAssinaturaWebhook({ appSecret, assinatura, corpoBruto })) {
      console.error('[integracoes] erro de webhook: assinatura inválida');
      res.status(403).json({ message: 'Assinatura do webhook inválida.' });
      return;
    }

    res.status(200).json({ ok: true });

    try {
      const corpo = req.body as {
        entry?: {
          changes?: {
            value?: {
              statuses?: { id?: string; status?: string; errors?: { title?: string; message?: string }[] }[];
            };
          }[];
        }[];
      };

      const statuses =
        corpo.entry?.flatMap((entry) => entry.changes ?? []).flatMap((change) => change.value?.statuses ?? []) ?? [];

      for (const item of statuses) {
        if (!item.id || !item.status) continue;
        const status = statusWhatsappParaEnvio(item.status);
        if (!status) continue;
        await atualizarPorProvedor({
          clinicaId,
          provedorMessageId: item.id,
          status,
          erro:
            item.status === 'failed'
              ? item.errors?.[0]?.title || item.errors?.[0]?.message || 'Falha reportada pela Meta.'
              : null,
        });
      }
    } catch (err) {
      console.error('[integracoes] erro de webhook ao atualizar status', err instanceof Error ? err.message : 'erro');
    }
  });
}
