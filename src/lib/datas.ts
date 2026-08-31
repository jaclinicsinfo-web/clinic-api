export function dataDeIso(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  return new Date(`${valor}T00:00:00.000Z`);
}

export function dataCivil(valor: Date | null | undefined): string | null {
  if (!valor) return null;
  return valor.toISOString().slice(0, 10);
}

const FUSO_CLINICA = 'America/Sao_Paulo';

/** Dia civil no fuso da clínica — não usar UTC, senão depois das 21h no Brasil vira o dia seguinte. */
export function hojeCivil(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_CLINICA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Relógio civil no fuso da clínica (HH:mm, 24h). */
export function horaCivil(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO_CLINICA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(agora);
  const hora = partes.find((parte) => parte.type === 'hour')?.value ?? '00';
  const minuto = partes.find((parte) => parte.type === 'minute')?.value ?? '00';
  return `${hora.padStart(2, '0')}:${minuto.padStart(2, '0')}`;
}

export function dinheiro(valor: { toString(): string } | number | string): number {
  return Number(valor);
}

export function horaParaMinutos(hora: string): number {
  const [horaNum, minutoNum] = hora.split(':').map(Number);
  return (horaNum || 0) * 60 + (minutoNum || 0);
}

export function minutosIntervalo(inicio: string, fim: string): number {
  return Math.max(horaParaMinutos(fim) - horaParaMinutos(inicio), 0);
}

export function horariosSobrepoem(inicioA: string, fimA: string, inicioB: string, fimB: string): boolean {
  return inicioA < fimB && inicioB < fimA;
}
