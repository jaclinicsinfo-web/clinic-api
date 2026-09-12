export const MODULOS_NUCLEO = [
  'dashboard',
  'pacientes',
  'agenda',
  'profissionais',
  'convenios',
  'rh',
  'configuracoes',
] as const;

export const MODULOS_GESTAO = ['financeiro', 'estoque', 'relatorios'] as const;

export const MODULOS_RESERVADOS = ['integracoes', 'powerbi', 'agenteia'] as const;

export type CodigoPlano = 'essencial' | 'profissional' | 'ilimitado';

export function ehCodigoPlano(valor: string): valor is CodigoPlano {
  return valor === 'essencial' || valor === 'profissional' || valor === 'ilimitado';
}

export function modulosDoPlano(codigo: string): readonly string[] {
  if (codigo === 'ilimitado') {
    return [...MODULOS_NUCLEO, ...MODULOS_GESTAO, ...MODULOS_RESERVADOS];
  }
  if (codigo === 'profissional') {
    return [...MODULOS_NUCLEO, ...MODULOS_GESTAO];
  }
  return [...MODULOS_NUCLEO];
}

export function planoIncluiModulo(codigo: string, modulo: string): boolean {
  return modulosDoPlano(codigo).includes(modulo);
}

/** Essencial: 1 unidade. Os demais planos não têm teto. */
export function limiteUnidadesDoPlano(codigo: string): number | null {
  return codigo === 'essencial' ? 1 : null;
}

export function planoMinimoDoModulo(modulo: string): CodigoPlano {
  if ((MODULOS_RESERVADOS as readonly string[]).includes(modulo)) return 'ilimitado';
  if ((MODULOS_GESTAO as readonly string[]).includes(modulo)) return 'profissional';
  return 'essencial';
}

export function nomeDoPlanoMinimo(modulo: string): string {
  const minimo = planoMinimoDoModulo(modulo);
  if (minimo === 'essencial') return 'Essencial';
  if (minimo === 'profissional') return 'Profissional';
  return 'Ilimitado';
}

export function mensagemModuloForaDoPlano(modulo: string): string {
  return `O módulo não está incluído no plano da clínica. Disponível a partir do plano ${nomeDoPlanoMinimo(modulo)}.`;
}

export function mensagemLimiteUnidades(codigo: string): string {
  const limite = limiteUnidadesDoPlano(codigo);
  if (limite == null) return 'Limite de unidades do plano atingido. Faça upgrade para adicionar filiais.';
  return `O plano Essencial inclui ${limite} unidade. Faça upgrade para cadastrar filiais.`;
}
