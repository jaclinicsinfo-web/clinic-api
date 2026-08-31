import { CobrancaCompleta } from '../models/cobranca.model';
import { ComissaoCompleta } from '../models/comissao.model';
import { LoteCompleto } from '../models/lote-convenio.model';
import { dataCivil, dinheiro } from '../lib/datas';
import {
  statusCobrancaEfetivo,
  statusDespesaEfetivo,
  statusParcelaEfetivo,
  valorAbertoCobranca,
} from '../lib/financeiro';
import { Despesa, FormaPagamento } from '@prisma/client';

export function formaPagamentoResumo(forma: FormaPagamento) {
  return {
    id: forma.id,
    codigo: forma.codigo,
    nome: forma.nome,
    taxa: dinheiro(forma.taxa),
    ativo: forma.ativo,
  };
}

export function cobrancaResumo(cobranca: CobrancaCompleta) {
  const parcelas = cobranca.parcelas.map((parcela) => ({
    numero: parcela.numero,
    valor: dinheiro(parcela.valor),
    vencimento: dataCivil(parcela.vencimento) ?? '',
    status: statusParcelaEfetivo(parcela.status, parcela.vencimento) as 'pendente' | 'pago' | 'atrasado',
    pagoEm: dataCivil(parcela.pagoEm) ?? undefined,
  }));

  return {
    id: cobranca.id,
    pacienteId: cobranca.pacienteId,
    pacienteNome: cobranca.paciente.nome,
    agendamentoId: cobranca.agendamentoId ?? undefined,
    descricao: cobranca.descricao,
    valor: dinheiro(cobranca.valor),
    formaPagamento: cobranca.formaPagamento,
    convenioId: cobranca.convenioId,
    convenioNome: cobranca.convenio?.nome ?? null,
    status: statusCobrancaEfetivo(cobranca.status, cobranca.vencimento),
    vencimento: dataCivil(cobranca.vencimento) ?? '',
    parcelas,
    pagoEm: dataCivil(cobranca.pagoEm) ?? undefined,
    criadoEm: cobranca.criadoEm.toISOString(),
    valorAberto: valorAbertoCobranca({
      status: cobranca.status,
      valor: dinheiro(cobranca.valor),
      parcelas: cobranca.parcelas.map((parcela) => ({ status: parcela.status, valor: dinheiro(parcela.valor) })),
    }),
  };
}

export function despesaResumo(despesa: Despesa) {
  return {
    id: despesa.id,
    descricao: despesa.descricao,
    categoria: despesa.categoria,
    fornecedor: despesa.fornecedor,
    valor: dinheiro(despesa.valor),
    vencimento: dataCivil(despesa.vencimento) ?? '',
    status: statusDespesaEfetivo(despesa.status, despesa.vencimento),
    recorrente: despesa.recorrente,
    formaPagamento: despesa.formaPagamento ?? undefined,
    pagoEm: dataCivil(despesa.pagoEm) ?? undefined,
  };
}

export function loteResumo(lote: LoteCompleto) {
  return {
    id: lote.id,
    convenioId: lote.convenioId,
    convenioNome: lote.convenio.nome,
    competencia: lote.competencia,
    quantidadeGuias: lote.guias.length,
    valorApresentado: dinheiro(lote.valorApresentado),
    valorGlosado: dinheiro(lote.valorGlosado),
    valorRecebido: dinheiro(lote.valorRecebido),
    status: lote.status,
    enviadoEm: dataCivil(lote.enviadoEm) ?? undefined,
    previsaoPagamento: dataCivil(lote.previsaoPagamento) ?? undefined,
  };
}

export function comissaoResumo(comissao: ComissaoCompleta) {
  return {
    id: comissao.id,
    profissionalId: comissao.profissionalId,
    profissionalNome: comissao.profissional.nome,
    competencia: comissao.competencia,
    atendimentos: comissao.atendimentos,
    faturamentoGerado: dinheiro(comissao.faturamentoGerado),
    percentual: dinheiro(comissao.percentual),
    valorComissao: dinheiro(comissao.valorComissao),
    status: comissao.status,
    pagoEm: dataCivil(comissao.pagoEm) ?? undefined,
  };
}

export function montarCobranca(cobranca: CobrancaCompleta) {
  return { cobranca: cobrancaResumo(cobranca) };
}

export function montarDespesa(despesa: Despesa) {
  return { despesa: despesaResumo(despesa) };
}

export function montarLote(lote: LoteCompleto) {
  return { lote: loteResumo(lote) };
}

export function montarComissao(comissao: ComissaoCompleta) {
  return { comissao: comissaoResumo(comissao) };
}

export function montarFormasPagamento(formas: FormaPagamento[]) {
  return { formas: formas.map(formaPagamentoResumo) };
}
