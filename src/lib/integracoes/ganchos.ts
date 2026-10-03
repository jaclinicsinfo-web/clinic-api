import { dispararEventoAgenda } from './motor';
import { processarFilaEnvios } from './processador';

export function notificarEventoAgenda(params: {
  agendamentoId: string;
  clinicaId: string;
  evento: 'criado' | 'confirmado' | 'reagendado' | 'cancelado';
}): void {
  void dispararEventoAgenda(params)
    .then(async () => {
      if (params.evento !== 'criado') {
        await processarFilaEnvios(params.clinicaId);
      }
    })
    .catch((err) => {
      console.error('[integracoes] falha ao gerar lembrete da agenda', err instanceof Error ? err.message : 'erro');
    });
}
