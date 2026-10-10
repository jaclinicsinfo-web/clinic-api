import { env } from '../config/env';
import { conciliarPagamentos } from './cobranca/conciliacao';
import { processarLembretesCobranca } from './cobranca/lembretes';
import { processarFilaEmails } from './email/fila';

const MINUTO = 60_000;

/**
 * Tarefas periódicas da cobrança: fila de e-mails (1 min), lembretes (10 min) e conferência
 * com o Mercado Pago (15 min). Ligadas por padrão só em produção (TAREFAS_COBRANCA).
 * Cada tarefa tem trava própria e é idempotente; uma falha nunca derruba a API.
 */
export function iniciarTarefasCobranca(): NodeJS.Timeout[] {
  if (!env.TAREFAS_COBRANCA) {
    console.info('[tarefas] cobrança desligada (TAREFAS_COBRANCA=off).');
    return [];
  }

  const seguro = (nome: string, tarefa: () => Promise<unknown>) => () => {
    tarefa().catch((err) => console.error(`[tarefas] ${nome} falhou`, err instanceof Error ? err.message : err));
  };

  const timers = [
    setInterval(seguro('fila de e-mails', () => processarFilaEmails()), MINUTO),
    setInterval(seguro('lembretes', () => processarLembretesCobranca()), 10 * MINUTO),
    setInterval(seguro('conferência', () => conciliarPagamentos()), 15 * MINUTO),
  ];
  // Primeira rodada logo depois de subir, sem disputar com a inicialização.
  timers.push(
    setTimeout(() => {
      seguro('fila de e-mails', () => processarFilaEmails())();
      seguro('lembretes', () => processarLembretesCobranca())();
      seguro('conferência', () => conciliarPagamentos())();
    }, MINUTO),
  );
  console.info('[tarefas] cobrança ligada: fila de e-mails 1 min, lembretes 10 min, conferência 15 min.');
  return timers;
}

export function pararTarefasCobranca(timers: NodeJS.Timeout[]) {
  for (const timer of timers) clearInterval(timer);
}
