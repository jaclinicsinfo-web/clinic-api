import { arredondarDinheiro } from '../lib/financeiro';
import { PainelDashboard } from '../models/dashboard.model';

export function montarDashboard(painel: PainelDashboard, incluirFinanceiro: boolean) {
  return {
    atendimentosHoje: painel.atendimentosHoje,
    taxaOcupacao: painel.taxaOcupacao,
    taxaFaltas: painel.taxaFaltas,
    novosPacientes: painel.novosPacientes,
    variacaoNovosPacientes: painel.variacaoNovosPacientes,
    atendimentosPorProfissional: painel.atendimentosPorProfissional.map((item) => ({
      profissional: item.profissional,
      atendimentos: item.atendimentos,
      faturamento: incluirFinanceiro ? arredondarDinheiro(item.faturamento) : 0,
    })),
    funil: painel.funil,
    proximos: painel.proximos.map((item) => ({
      ...item,
      valor: incluirFinanceiro ? item.valor : 0,
    })),
    aniversariantes: painel.aniversariantes,
    financeiro: incluirFinanceiro
      ? {
          faturamentoMes: painel.faturamentoMes,
          variacaoFaturamento: painel.variacaoFaturamento,
          faturamentoDia: painel.faturamentoDia,
          contasAReceber: painel.contasAReceber,
          contasAPagar: painel.contasAPagar,
          faturamentoDiario: painel.faturamentoDiario,
          faturamentoMensal: painel.faturamentoMensal,
          origemAtendimento: painel.origemAtendimento,
          alertas: painel.alertas.map((alerta) => ({
            id: alerta.chave,
            titulo: alerta.titulo,
            descricao: alerta.descricao,
            severidade: alerta.severidade,
            href: alerta.href,
          })),
        }
      : null,
  };
}
