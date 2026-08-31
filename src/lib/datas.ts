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

export function dinheiro(valor: { toString(): string } | number | string): number {
  return Number(valor);
}

export function horariosSobrepoem(inicioA: string, fimA: string, inicioB: string, fimB: string): boolean {
  return inicioA < fimB && inicioB < fimA;
}
