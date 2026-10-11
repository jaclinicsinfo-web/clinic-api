import { env } from '../../config/env';
import { marcoDeCobranca, type MarcoCobranca } from '../assinatura';
import { definirConferenciaDeLembrete, enfileirarEmail } from '../email/fila';
import { montarEmailAvisoAutomatica, montarEmailLembrete } from '../email/templates/cobranca';
import { mensagemDeErro, registrarEvento } from '../eventos-pagamento';
import { comoSistema } from '../tenant';
import {
  buscarSituacaoClinica,
  listarAdministradoresAtivos,
  listarClinicasParaLembrete,
  notificarAdministrador,
  type ClinicaParaLembrete,
} from '../../models/cobranca-assinatura.model';

/** Atraso: a partir do D+1 o e-mail da clínica também recebe (EMAIL_COPIA_CLINICA). */
const MARCOS_COM_COPIA: MarcoCobranca[] = ['D+1', 'D+3', 'D+5'];

const TITULO_SINO: Record<MarcoCobranca, string> = {
  'D-30': 'A anuidade vence em 30 dias',
  'D-5': 'A assinatura vence em breve',
  'D-1': 'A assinatura vence amanhã',
  D0: 'A assinatura vence hoje',
  'D+1': 'Pagamento pendente',
  'D+3': 'Último aviso antes do bloqueio',
  'D+5': 'Acesso bloqueado',
  'teste-2': 'O teste grátis está terminando',
  'teste-fim': 'O teste grátis terminou',
  'auto-3': 'Cobrança automática em breve',
};

export function dentroDaJanela(agora = new Date(), janela = env.LEMBRETES_JANELA): boolean {
  const hora = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(agora));
  return hora >= janela.inicio && hora < janela.fim;
}

/**
 * Antes de mandar um lembrete que estava na fila: se a clínica pagou (o vencimento mudou)
 * ou saiu do teste, o aviso perdeu o sentido e é cancelado.
 */
definirConferenciaDeLembrete(async (email) => {
  if (!email.clinicaId || !email.referencia) return null;
  const clinica = await comoSistema(() => buscarSituacaoClinica(email.clinicaId!));
  if (!clinica || clinica.status !== 'ativa') return 'Clínica desativada ou removida.';
  const marco = marcoDeCobranca(clinica);
  if (!marco || marco.referencia.getTime() !== email.referencia.getTime()) {
    return 'A situação mudou (pagamento ou fim do teste) antes do envio.';
  }
  if (email.chave.includes(':auto-3:') && !clinica.automatica) {
    return 'A cobrança automática foi desligada antes do envio.';
  }
  return null;
});

async function avisarClinica(clinica: ClinicaParaLembrete, agora: Date): Promise<number> {
  const marco = marcoDeCobranca(clinica, agora);
  if (!marco) return 0;

  const admins = await comoSistema(() => listarAdministradoresAtivos(clinica.id));
  if (admins.length === 0) return 0;

  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  const bloqueada = marco.marco === 'D+5' || marco.marco === 'teste-fim';
  const link = bloqueada ? `${base}/login` : `${base}/configuracoes/assinatura`;
  const ciclo = clinica.cicloRenovacao === 'anual' ? 'anual' : 'mensal';
  const valor =
    marco.marco === 'auto-3' && clinica.automaticaValor !== null
      ? clinica.automaticaValor
      : ciclo === 'anual'
        ? clinica.precoAnual
        : clinica.precoMensal;
  const referencia = marco.referencia.toISOString();

  const destinatarios = admins.map((admin) => ({ email: admin.email, nome: admin.nome as string | null }));
  if (env.EMAIL_COPIA_CLINICA && MARCOS_COM_COPIA.includes(marco.marco) && clinica.email) {
    const jaIncluso = destinatarios.some((item) => item.email.toLowerCase() === clinica.email.toLowerCase());
    if (!jaIncluso) destinatarios.push({ email: clinica.email, nome: null });
  }

  let novos = 0;
  for (const destino of destinatarios) {
    const mensagem =
      marco.marco === 'auto-3'
        ? montarEmailAvisoAutomatica({
            clinica: clinica.nomeFantasia,
            nomeAdmin: destino.nome,
            plano: clinica.planoNome,
            ciclo,
            valor,
            cartaoFinal: clinica.cartaoFinal,
            cobraEm: marco.vence,
            link,
            agora,
          })
        : montarEmailLembrete({
            marco: marco.marco,
            clinica: clinica.nomeFantasia,
            nomeAdmin: destino.nome,
            plano: clinica.planoNome,
            ciclo,
            valor,
            vence: marco.vence,
            bloqueia: marco.bloqueia,
            link,
            agora,
          });
    const { novo } = await enfileirarEmail({
      tipo: 'lembrete_cobranca',
      chave: `cobranca:${clinica.id}:${referencia}:${marco.marco}:${destino.email.toLowerCase()}`,
      para: destino.email,
      assunto: mensagem.assunto,
      texto: mensagem.texto,
      html: mensagem.html,
      remetenteNome: mensagem.remetenteNome,
      clinicaId: clinica.id,
      referencia: marco.referencia,
    });
    if (novo) novos += 1;
  }

  for (const admin of admins) {
    await comoSistema(() =>
      notificarAdministrador({
        clinicaId: clinica.id,
        usuarioId: admin.id,
        chave: `cobranca:${referencia}:${marco.marco}`,
        titulo: TITULO_SINO[marco.marco],
        descricao: mensagemCurta(marco.marco, marco.vence, marco.bloqueia, valor),
        href: '/configuracoes/assinatura',
        severidade: marco.marco.startsWith('D+') || marco.marco === 'teste-fim' ? 'alta' : 'media',
      }),
    );
  }

  if (novos > 0) {
    await registrarEvento({
      tipo: 'lembrete_enfileirado',
      nivel: 'info',
      clinicaId: clinica.id,
      mensagem: `Lembrete ${marco.marco} para ${novos} destinatário(s): ${TITULO_SINO[marco.marco].toLowerCase()}.`,
      detalhes: { marco: marco.marco, referencia, destinatarios: destinatarios.map((item) => item.email) },
    });
  }
  return novos;
}

function mensagemCurta(marco: MarcoCobranca, vence: Date, bloqueia: Date, valor: number): string {
  const data = (d: Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d);
  if (marco === 'auto-3') {
    const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
    return `Vamos cobrar ${reais} no cartão em ${data(vence)}.`;
  }
  if (marco === 'teste-2') return `O teste vale até ${data(vence)}. Assine para não interromper o uso.`;
  if (marco === 'teste-fim') return 'Escolha um plano para continuar usando o sistema.';
  if (marco === 'D+5') return 'O prazo de pagamento terminou. Pague para voltar a usar.';
  if (marco.startsWith('D+')) return `Venceu em ${data(vence)}. O acesso é bloqueado em ${data(bloqueia)}.`;
  return `Vence em ${data(vence)}. Pague em Configurações › Assinatura.`;
}

let ocupado = false;

/** Ciclo dos lembretes. Idempotente: a chave da fila impede e-mail repetido. */
export async function processarLembretesCobranca(agora = new Date()): Promise<number> {
  if (ocupado || !dentroDaJanela(agora)) return 0;
  ocupado = true;
  let total = 0;
  try {
    const clinicas = await comoSistema(() => listarClinicasParaLembrete());
    for (const clinica of clinicas) {
      try {
        total += await avisarClinica(clinica, agora);
      } catch (err) {
        console.error('[cobranca] lembrete não enfileirado', clinica.id, mensagemDeErro(err));
      }
    }
  } catch (err) {
    console.error('[cobranca] falha no ciclo de lembretes', mensagemDeErro(err));
  } finally {
    ocupado = false;
  }
  return total;
}
