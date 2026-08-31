import { AcoesModulo, MODULOS, Permissoes } from './perfis-padrao';

export type AcaoPermissao = keyof AcoesModulo;

export interface PermissaoItem extends AcoesModulo {
  modulo: string;
}

function acoesVazias(): AcoesModulo {
  return { visualizar: false, criar: false, editar: false, excluir: false };
}

function lerAcoes(valor: unknown): AcoesModulo {
  if (!valor || typeof valor !== 'object') return acoesVazias();
  const bruto = valor as Record<string, unknown>;
  return {
    visualizar: Boolean(bruto.visualizar),
    criar: Boolean(bruto.criar),
    editar: Boolean(bruto.editar),
    excluir: Boolean(bruto.excluir),
  };
}

export function permissoesComoMapa(raw: unknown): Permissoes {
  const mapa: Permissoes = {};
  for (const modulo of MODULOS) {
    mapa[modulo] = acoesVazias();
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const bruto = item as PermissaoItem;
      if (typeof bruto.modulo !== 'string' || !(bruto.modulo in mapa)) continue;
      mapa[bruto.modulo] = lerAcoes(bruto);
    }
    return mapa;
  }

  if (raw && typeof raw === 'object') {
    for (const [modulo, acoes] of Object.entries(raw as Record<string, unknown>)) {
      if (modulo in mapa) {
        mapa[modulo] = lerAcoes(acoes);
      }
    }
  }

  return mapa;
}

export function montarPermissoes(raw: unknown): PermissaoItem[] {
  const mapa = permissoesComoMapa(raw);
  return MODULOS.map((modulo) => ({ modulo, ...mapa[modulo] }));
}

export function temPermissao(raw: unknown, modulo: string, acao: AcaoPermissao): boolean {
  return Boolean(permissoesComoMapa(raw)[modulo]?.[acao]);
}
