import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { precoDoCiclo, type CicloCobranca } from '../assinatura';
import { mensagemDeErro, registrarEvento } from '../eventos-pagamento';
import { atualizarAssinaturaRecorrente } from '../mercadopago';
import { atualizarAutomatica, buscarAutomaticaDaClinica } from '../../models/assinatura-recorrente.model';

function cicloDe(valor: unknown): CicloCobranca {
  return valor === 'anual' ? 'anual' : 'mensal';
}

/**
 * Plano e ciclo da próxima cobrança automática: a troca agendada (que vale no vencimento) ou o plano atual.
 */
export async function planoDaProximaCobranca(clinicaId: string) {
  const clinica = await prisma.clinica.findUnique({
    where: { id: clinicaId },
    select: { cicloCobranca: true, cicloAgendado: true, plano: true, planoAgendado: true },
  });
  if (!clinica) return null;
  const plano = clinica.planoAgendado ?? clinica.plano;
  const ciclo = cicloDe(clinica.planoAgendado ? clinica.cicloAgendado ?? clinica.cicloCobranca : clinica.cicloCobranca);
  const valor = precoDoCiclo(
    { codigo: plano.codigo, precoMensal: Number(plano.precoMensal), precoAnual: Number(plano.precoAnual) },
    ciclo,
  );
  return { plano, ciclo, valor };
}

/**
 * Deixa a cobrança automática (no Mercado Pago e aqui) com o valor do plano da próxima cobrança.
 * Chamada sempre que o plano ou a troca agendada mudam: upgrade, troca sem custo, agendar ou cancelar
 * troca, pagamento à mão, estorno de troca. Nunca lança: a falha fica em Logs para a equipe.
 */
export async function sincronizarAutomatica(clinicaId: string, motivo: string): Promise<boolean> {
  try {
    const automatica = await buscarAutomaticaDaClinica(clinicaId);
    if (!automatica) return false;
    const alvo = await planoDaProximaCobranca(clinicaId);
    if (!alvo || !(alvo.valor > 0)) return false;
    const valorAtual = Number(automatica.valor);
    // Mesmo plano: nada a fazer. Mudança de preço do plano segue o reajuste com aviso (aplicarReajustes).
    if (automatica.planoCodigo === alvo.plano.codigo && automatica.ciclo === alvo.ciclo) return true;
    if (alvo.ciclo !== automatica.ciclo) {
      // A frequência da assinatura não muda: a troca de ciclo é bloqueada com a automática ligada.
      await registrarEvento({
        tipo: 'automatica_atualizada',
        nivel: 'erro',
        clinicaId,
        mensagem: `A próxima cobrança é ${alvo.ciclo}, mas a cobrança automática é ${automatica.ciclo}. Cancele a automática e peça para ativar de novo.`,
        detalhes: { preapprovalId: automatica.preapprovalId, motivo },
      });
      return false;
    }

    if (automatica.preapprovalId && env.MERCADOPAGO_ACCESS_TOKEN) {
      await atualizarAssinaturaRecorrente(automatica.preapprovalId, { valor: alvo.valor });
    }
    await atualizarAutomatica(automatica.id, {
      valor: alvo.valor,
      planoCodigo: alvo.plano.codigo,
      ciclo: alvo.ciclo,
      valorNovo: null,
      valorNovoEm: null,
    });
    await registrarEvento({
      tipo: 'automatica_atualizada',
      nivel: 'info',
      clinicaId,
      valor: alvo.valor,
      mensagem: `Cobrança automática passou de ${valorAtual.toFixed(2)} para ${alvo.valor.toFixed(2)} (plano ${alvo.plano.nome}, ${alvo.ciclo}): ${motivo}.`,
      detalhes: { preapprovalId: automatica.preapprovalId },
    });
    return true;
  } catch (err) {
    await registrarEvento({
      tipo: 'automatica_atualizada',
      nivel: 'erro',
      clinicaId,
      mensagem: `Não foi possível ajustar o valor da cobrança automática (${motivo}): ${mensagemDeErro(err)}. Ajuste no Mercado Pago.`,
    });
    return false;
  }
}
