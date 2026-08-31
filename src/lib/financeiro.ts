import { dataCivil, dataDeIso, hojeCivil } from './datas';

export const CATEGORIAS_DESPESA = [
  'Aluguel',
  'Folha de pagamento',
  'Comissões',
  'Insumos e materiais',
  'Energia elétrica',
  'Água',
  'Internet e telefonia',
  'Software e sistemas',
  'Marketing',
  'Manutenção',
  'Impostos',
  'Limpeza',
  'Outros',
] as const;

export const FORMAS_PAGAMENTO_CODIGOS = [
  'dinheiro',
  'pix',
  'cartao_debito',
  'cartao_credito',
  'boleto',
  'convenio',
] as const;

export const FORMAS_PADRAO = [
  { codigo: 'dinheiro', nome: 'Dinheiro', taxa: 0, ordem: 1 },
  { codigo: 'pix', nome: 'PIX', taxa: 0, ordem: 2 },
  { codigo: 'cartao_debito', nome: 'Cartão de débito', taxa: 1.49, ordem: 3 },
  { codigo: 'cartao_credito', nome: 'Cartão de crédito', taxa: 3.29, ordem: 4 },
  { codigo: 'boleto', nome: 'Boleto bancário', taxa: 2.5, ordem: 5 },
  { codigo: 'convenio', nome: 'Faturamento por convênio', taxa: 0, ordem: 6 },
] as const;

export type CodigoFormaPagamento = (typeof FORMAS_PAGAMENTO_CODIGOS)[number];

export function arredondarDinheiro(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function competenciaDeIso(iso: string): string {
  return iso.slice(0, 7);
}

export function competenciaAtual(): string {
  return competenciaDeIso(hojeCivil());
}

export function inicioFimCompetencia(competencia: string): { inicio: Date; fim: Date } {
  const [ano, mes] = competencia.split('-').map(Number);
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1)),
    fim: new Date(Date.UTC(ano, mes, 0)),
  };
}

export function adicionarMesesIso(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1 + meses, dia));
  return data.toISOString().slice(0, 10);
}

export function adicionarDiasIso(iso: string, dias: number): string {
  const base = dataDeIso(iso);
  if (!base) return iso;
  const data = new Date(base.getTime() + dias * 86_400_000);
  return data.toISOString().slice(0, 10);
}

export function variacaoPercentual(atual: number, anterior: number): number {
  if (anterior === 0) return atual === 0 ? 0 : 100;
  return ((atual - anterior) / anterior) * 100;
}

export function statusCobrancaEfetivo(status: string, vencimento: Date, hoje = hojeCivil()): string {
  if (status === 'pendente' && (dataCivil(vencimento) ?? '') < hoje) return 'atrasado';
  return status;
}

export function statusParcelaEfetivo(status: string, vencimento: Date, hoje = hojeCivil()): string {
  if (status === 'pendente' && (dataCivil(vencimento) ?? '') < hoje) return 'atrasado';
  return status;
}

export function statusDespesaEfetivo(status: string, vencimento: Date, hoje = hojeCivil()): string {
  if (status === 'a_pagar' && (dataCivil(vencimento) ?? '') < hoje) return 'vencido';
  return status;
}

export function valorAbertoCobranca(params: {
  status: string;
  valor: number;
  parcelas: { status: string; valor: number }[];
}): number {
  if (params.status === 'pago' || params.status === 'cancelado') return 0;
  if (params.parcelas.length > 0) {
    return arredondarDinheiro(
      params.parcelas
        .filter((parcela) => parcela.status !== 'pago')
        .reduce((total, parcela) => total + parcela.valor, 0),
    );
  }
  return params.valor;
}
