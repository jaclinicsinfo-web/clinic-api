import { env } from '../../config/env';
import { arredondarDinheiro } from '../financeiro';
import { CanalLembrete, CUSTOS_PADRAO } from './constantes';

export interface CustoPlataforma {
  canal: CanalLembrete;
  categoria: string;
  valor: number;
}

export function custosDaPlataforma(): CustoPlataforma[] {
  const valores: Record<string, number> = {
    'whatsapp:utility': env.CUSTO_WHATSAPP_UTILITY,
    'whatsapp:marketing': env.CUSTO_WHATSAPP_MARKETING,
    'whatsapp:authentication': env.CUSTO_WHATSAPP_AUTHENTICATION,
    'whatsapp:service': env.CUSTO_WHATSAPP_SERVICE,
    'email:padrao': env.CUSTO_EMAIL,
  };

  return CUSTOS_PADRAO.map((item) => ({
    canal: item.canal,
    categoria: item.categoria,
    valor: arredondarDinheiro(valores[`${item.canal}:${item.categoria}`] ?? 0),
  }));
}

export function custoDaPlataforma(canal: string, categoria?: string | null): number {
  const categoriaEfetiva = categoria || (canal === 'email' ? 'padrao' : 'utility');
  const lista = custosDaPlataforma();
  const especifico = lista.find((item) => item.canal === canal && item.categoria === categoriaEfetiva);
  if (especifico) return especifico.valor;
  const fallback = lista.find((item) => item.canal === canal);
  return fallback?.valor ?? 0;
}
