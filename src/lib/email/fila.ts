import { cifrarSegredo, decifrarSegredo } from '../segredo';
import { comoSistema } from '../tenant';
import { registrarEvento, mensagemDeErro } from '../eventos-pagamento';
import {
  cancelarEmail,
  inserirEmail,
  marcarEnviado,
  marcarFalha,
  reservarEmail,
  reservarLote,
  type EmailSaida,
} from '../../models/email-saida.model';
import { marcarAcessoEnviado } from '../../models/pedido-assinatura.model';
import { enviarEmail } from './index';

export type TipoEmailSaida = 'acesso' | 'acesso_teste' | 'recibo' | 'lembrete_cobranca';

/** Espera depois de cada falha: 1 min, 5 min, 15 min, 1 h, 6 h, 24 h. Depois disso, desiste. */
const ESPERAS_MIN = [1, 5, 15, 60, 360, 1440];
export const MAX_TENTATIVAS = ESPERAS_MIN.length + 1;

export function proximaTentativa(tentativasFeitas: number, agora = new Date()): Date | null {
  if (tentativasFeitas >= MAX_TENTATIVAS) return null;
  const espera = ESPERAS_MIN[Math.min(tentativasFeitas - 1, ESPERAS_MIN.length - 1)] ?? ESPERAS_MIN[0];
  return new Date(agora.getTime() + espera * 60_000);
}

interface ConteudoEmail {
  texto: string;
  html: string;
  remetenteNome?: string;
}

/** Antes de enviar um lembrete: devolve o motivo para cancelar, ou null para seguir. */
export type ConferenciaAntesDeEnviar = (email: EmailSaida) => Promise<string | null>;
let conferirLembrete: ConferenciaAntesDeEnviar | null = null;

export function definirConferenciaDeLembrete(fn: ConferenciaAntesDeEnviar) {
  conferirLembrete = fn;
}

export interface NovoEmail {
  tipo: TipoEmailSaida;
  chave: string;
  para: string;
  assunto: string;
  texto: string;
  html: string;
  remetenteNome?: string;
  clinicaId?: string | null;
  pedidoId?: string | null;
  referencia?: Date | null;
  /** Tenta mandar na hora (e-mail de acesso). Sem isso, sai no próximo ciclo da fila (até 1 min). */
  enviarAgora?: boolean;
}

/**
 * Coloca o e-mail na fila. A mesma chave nunca gera dois envios.
 * `enviado` só é true quando o e-mail saiu nesta chamada (ou já tinha saído antes).
 */
export async function enfileirarEmail(novo: NovoEmail): Promise<{ id: string; novo: boolean; enviado: boolean }> {
  const conteudo: ConteudoEmail = { texto: novo.texto, html: novo.html, remetenteNome: novo.remetenteNome };
  const { email, novo: criado } = await comoSistema(() =>
    inserirEmail({
      tipo: novo.tipo,
      chave: novo.chave,
      para: novo.para,
      assunto: novo.assunto,
      conteudo: cifrarSegredo(JSON.stringify(conteudo)),
      clinicaId: novo.clinicaId ?? null,
      pedidoId: novo.pedidoId ?? null,
      referencia: novo.referencia ?? null,
    }),
  );

  if (!criado) return { id: email.id, novo: false, enviado: email.status === 'enviado' };
  if (!novo.enviarAgora) return { id: email.id, novo: true, enviado: false };

  const reservado = await comoSistema(() => reservarEmail(email.id));
  if (!reservado) return { id: email.id, novo: true, enviado: false };
  const enviado = await tentarEnviar({ ...email, status: 'enviando' });
  return { id: email.id, novo: true, enviado };
}

/** Envia um e-mail já reservado (status "enviando"). Nunca lança. */
async function tentarEnviar(email: EmailSaida): Promise<boolean> {
  try {
    if (email.tipo === 'lembrete_cobranca' && conferirLembrete) {
      const motivo = await conferirLembrete(email);
      if (motivo) {
        await comoSistema(() => cancelarEmail(email.id, motivo));
        return false;
      }
    }

    const bruto = decifrarSegredo(email.conteudo);
    if (!bruto) {
      await comoSistema(() => marcarFalha(email.id, { tentativas: email.tentativas + 1, proxima: null, erro: 'Conteúdo ilegível.' }));
      return false;
    }
    const conteudo = JSON.parse(bruto) as ConteudoEmail;

    await enviarEmail({
      para: email.para,
      assunto: email.assunto,
      texto: conteudo.texto,
      html: conteudo.html,
      remetenteNome: conteudo.remetenteNome,
      categoria: email.tipo,
    });

    await comoSistema(async () => {
      await marcarEnviado(email.id);
      if (email.tipo === 'acesso' && email.pedidoId) await marcarAcessoEnviado(email.pedidoId);
    });
    await registrarEvento({
      tipo: 'email_enviado',
      nivel: 'info',
      pedidoId: email.pedidoId,
      clinicaId: email.clinicaId,
      mensagem: `E-mail "${email.assunto}" enviado para ${email.para}${email.tentativas > 0 ? ` (tentativa ${email.tentativas + 1})` : ''}.`,
      detalhes: { tipo: email.tipo, chave: email.chave },
    });
    return true;
  } catch (err) {
    const tentativas = email.tentativas + 1;
    const proxima = proximaTentativa(tentativas);
    const erro = mensagemDeErro(err);
    await comoSistema(() => marcarFalha(email.id, { tentativas, proxima, erro })).catch((falha) =>
      console.error('[email] não consegui registrar a falha do envio', mensagemDeErro(falha)),
    );
    await registrarEvento({
      tipo: proxima ? 'email_tentativa_falhou' : 'email_desistiu',
      nivel: proxima ? 'aviso' : 'erro',
      pedidoId: email.pedidoId,
      clinicaId: email.clinicaId,
      mensagem: proxima
        ? `E-mail para ${email.para} não saiu (tentativa ${tentativas}): ${erro}. Nova tentativa em ${proxima.toISOString()}.`
        : `Desisti do e-mail para ${email.para} depois de ${tentativas} tentativas: ${erro}.${email.tipo === 'acesso' ? ' Use Reenviar acesso no painel.' : ''}`,
      detalhes: { tipo: email.tipo, chave: email.chave },
    });
    return false;
  }
}

let ocupado = false;

/** Ciclo da fila: manda o que está vencido. Seguro para rodar em paralelo com outra instância. */
export async function processarFilaEmails(limite = 20): Promise<number> {
  if (ocupado) return 0;
  ocupado = true;
  let enviados = 0;
  try {
    const lote = await comoSistema(() => reservarLote(limite));
    for (const email of lote) {
      if (await tentarEnviar(email)) enviados += 1;
    }
  } catch (err) {
    console.error('[email] falha no ciclo da fila', mensagemDeErro(err));
  } finally {
    ocupado = false;
  }
  return enviados;
}
