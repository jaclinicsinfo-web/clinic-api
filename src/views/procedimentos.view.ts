import { ProcedimentoCompleto } from '../models/procedimento.model';
import { dinheiro } from '../lib/datas';
import { CATEGORIAS_PROCEDIMENTO } from '../validators/procedimentos.validator';

export function procedimentoResumo(procedimento: ProcedimentoCompleto) {
  return {
    id: procedimento.id,
    nome: procedimento.nome,
    categoria: procedimento.categoria,
    duracaoPadraoMin: procedimento.duracaoPadraoMin,
    valorParticular: dinheiro(procedimento.valorParticular),
    valoresPorConvenio: procedimento.valoresConvenio.map((item) => ({
      convenioId: item.convenioId,
      valor: dinheiro(item.valor),
    })),
    status: procedimento.status,
  };
}

export function montarListaProcedimentos(procedimentos: ProcedimentoCompleto[]) {
  const extras = procedimentos
    .map((item) => item.categoria)
    .filter((categoria) => !(CATEGORIAS_PROCEDIMENTO as readonly string[]).includes(categoria));
  const categorias = [...CATEGORIAS_PROCEDIMENTO, ...new Set(extras)];
  return {
    procedimentos: procedimentos.map(procedimentoResumo),
    categorias,
  };
}

export function montarProcedimento(procedimento: ProcedimentoCompleto) {
  return { procedimento: procedimentoResumo(procedimento) };
}
