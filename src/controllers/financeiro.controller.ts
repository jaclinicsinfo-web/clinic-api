import { Request, Response, NextFunction } from 'express';
import {
  cobrancaBodySchema,
  cobrancaQuerySchema,
  comissaoCalcularSchema,
  comissaoFecharSchema,
  comissaoQuerySchema,
  despesaBodySchema,
  formasPagamentoBodySchema,
  idParamSchema,
  loteBodySchema,
  loteReconciliarSchema,
  pagamentoBodySchema,
  parcelaParamSchema,
  parcelarBodySchema,
} from '../validators/financeiro.validator';
import * as cobrancaModel from '../models/cobranca.model';
import * as despesaModel from '../models/despesa.model';
import * as loteModel from '../models/lote-convenio.model';
import * as comissaoModel from '../models/comissao.model';
import * as formaModel from '../models/forma-pagamento.model';
import { buscarPorIdEClinica as buscarPaciente, listarResumoAgenda } from '../models/paciente.model';
import { buscarPorIdEClinica as buscarAgendamento } from '../models/agendamento.model';
import { buscarPorIdEClinica as buscarConvenio, listarAtivosPorClinica as listarConveniosAtivos } from '../models/convenio.model';
import { exigirUnidade } from '../lib/escopo';
import { AppError } from '../lib/erros';
import { dataCivil, dataDeIso, dinheiro, hojeCivil } from '../lib/datas';
import {
  adicionarDiasIso,
  arredondarDinheiro,
  CATEGORIAS_DESPESA,
  competenciaAtual,
  competenciaDeIso,
  inicioFimCompetencia,
  statusCobrancaEfetivo,
  statusDespesaEfetivo,
  valorAbertoCobranca,
  variacaoPercentual,
} from '../lib/financeiro';
import {
  cobrancaResumo,
  comissaoResumo,
  despesaResumo,
  formaPagamentoResumo,
  loteResumo,
  montarCobranca,
  montarComissao,
  montarDespesa,
  montarFormasPagamento,
  montarLote,
} from '../views/financeiro.view';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

async function carregarCobranca(req: Request) {
  const { id } = idParamSchema.parse(req.params);
  const cobranca = await cobrancaModel.buscarPorIdEClinica(id, req.auth!.clinicaId);
  if (!cobranca) throw new AppError(404, 'Cobrança não encontrada.');
  return cobranca;
}

async function carregarDespesa(req: Request) {
  const { id } = idParamSchema.parse(req.params);
  const despesa = await despesaModel.buscarPorIdEClinica(id, req.auth!.clinicaId);
  if (!despesa) throw new AppError(404, 'Despesa não encontrada.');
  return despesa;
}

async function carregarLote(req: Request) {
  const { id } = idParamSchema.parse(req.params);
  const lote = await loteModel.buscarPorIdEClinica(id, req.auth!.clinicaId);
  if (!lote) throw new AppError(404, 'Lote não encontrado.');
  return lote;
}

async function carregarComissao(req: Request) {
  const { id } = idParamSchema.parse(req.params);
  const comissao = await comissaoModel.buscarPorIdEClinica(id, req.auth!.clinicaId);
  if (!comissao) throw new AppError(404, 'Comissão não encontrada.');
  return comissao;
}

function resumoReceber(cobrancas: ReturnType<typeof cobrancaResumo>[], hoje: string) {
  const mesAtual = hoje.slice(0, 7);
  const limite7 = adicionarDiasIso(hoje, 7);
  const emAberto = cobrancas.filter((item) => item.status === 'pendente' || item.status === 'parcelado');
  const atrasadas = cobrancas.filter((item) => item.status === 'atrasado');
  const recebidoMes = cobrancas.filter((item) => item.status === 'pago' && (item.pagoEm ?? '').startsWith(mesAtual));
  const vencendo7 = cobrancas.filter(
    (item) => item.status === 'pendente' && item.vencimento >= hoje && item.vencimento <= limite7,
  );
  const somarAberto = (lista: typeof cobrancas) =>
    lista.reduce((total, item) => total + (item.valorAberto ?? item.valor), 0);
  const somar = (lista: typeof cobrancas) => lista.reduce((total, item) => total + item.valor, 0);

  return {
    totalEmAberto: arredondarDinheiro(somarAberto(emAberto) + somarAberto(atrasadas)),
    totalAtrasado: arredondarDinheiro(somarAberto(atrasadas)),
    recebidoNoMes: arredondarDinheiro(somar(recebidoMes)),
    vencendo7Dias: arredondarDinheiro(somarAberto(vencendo7)),
    quantidadeAtrasada: atrasadas.length,
    quantidadeEmAberto: emAberto.length + atrasadas.length,
    quantidadeVencendo7Dias: vencendo7.length,
  };
}

function resumoPagar(despesas: ReturnType<typeof despesaResumo>[], hoje: string) {
  const mesAtual = hoje.slice(0, 7);
  const limite7 = adicionarDiasIso(hoje, 7);
  const aPagar = despesas.filter((item) => item.status === 'a_pagar');
  const vencidas = despesas.filter((item) => item.status === 'vencido');
  const pagasMes = despesas.filter((item) => item.status === 'pago' && (item.pagoEm ?? '').startsWith(mesAtual));
  const vencendo7 = aPagar.filter((item) => item.vencimento >= hoje && item.vencimento <= limite7);
  const somar = (lista: typeof despesas) => lista.reduce((total, item) => total + item.valor, 0);

  return {
    totalAPagar: arredondarDinheiro(somar(aPagar)),
    totalVencido: arredondarDinheiro(somar(vencidas)),
    pagoNoMes: arredondarDinheiro(somar(pagasMes)),
    vencendo7Dias: arredondarDinheiro(somar(vencendo7)),
    quantidadeVencida: vencidas.length,
    quantidadeAPagar: aPagar.length,
    quantidadeVencendo7Dias: vencendo7.length,
  };
}

function resumoLotes(lotes: ReturnType<typeof loteResumo>[]) {
  const apresentado = lotes.reduce((total, lote) => total + lote.valorApresentado, 0);
  const glosado = lotes.reduce((total, lote) => total + lote.valorGlosado, 0);
  return {
    valorApresentado: arredondarDinheiro(apresentado),
    valorGlosado: arredondarDinheiro(glosado),
    valorRecebido: arredondarDinheiro(lotes.reduce((total, lote) => total + lote.valorRecebido, 0)),
    taxaGlosa: apresentado > 0 ? (glosado / apresentado) * 100 : 0,
    lotesAbertos: lotes.filter((lote) => lote.status === 'aberto').length,
    lotesAguardando: lotes.filter((lote) => lote.status === 'enviado').length,
  };
}

function resumoComissoes(comissoes: ReturnType<typeof comissaoResumo>[]) {
  const competencia =
    comissoes.reduce((maior, item) => (item.competencia > maior ? item.competencia : maior), '') || competenciaAtual();
  const doMes = comissoes.filter((item) => item.competencia === competencia);
  return {
    competencia,
    totalPrevisto: arredondarDinheiro(doMes.reduce((total, item) => total + item.valorComissao, 0)),
    aprovadas: arredondarDinheiro(
      comissoes.filter((item) => item.status === 'aprovada').reduce((total, item) => total + item.valorComissao, 0),
    ),
    pagas: arredondarDinheiro(
      comissoes.filter((item) => item.status === 'paga').reduce((total, item) => total + item.valorComissao, 0),
    ),
    profissionaisComissionados: doMes.length,
  };
}

function rotuloMensal(competencia: string) {
  const [, mes] = competencia.split('-').map(Number);
  const ano = competencia.slice(2, 4);
  return `${MESES_CURTOS[(mes ?? 1) - 1]}/${ano}`;
}

function rotuloDiario(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function agruparPorDia(
  movimentos: { valor: number; pagoEm: Date | null }[],
  chave: 'entradas' | 'saidas',
  dias: number,
) {
  const hoje = hojeCivil();
  const mapa = new Map<string, number>();
  for (const item of movimentos) {
    const dia = dataCivil(item.pagoEm);
    if (!dia) continue;
    mapa.set(dia, arredondarDinheiro((mapa.get(dia) ?? 0) + item.valor));
  }

  return Array.from({ length: dias }, (_, index) => {
    const iso = adicionarDiasIso(hoje, -(dias - 1 - index));
    const valor = mapa.get(iso) ?? 0;
    return { periodo: rotuloDiario(iso), iso, [chave]: valor };
  });
}

async function montarFluxo(clinicaId: string) {
  const hoje = hojeCivil();
  const inicioDiario = dataDeIso(adicionarDiasIso(hoje, -29)) as Date;
  const fim = dataDeIso(hoje) as Date;
  const inicioAnual = dataDeIso(`${Number(hoje.slice(0, 4)) - 1}-${hoje.slice(5, 7)}-01`) as Date;

  const [entradas, saidas] = await Promise.all([
    cobrancaModel.movimentosRecebidos(clinicaId, inicioAnual, fim),
    despesaModel.listarPagasEntre(clinicaId, inicioAnual, fim),
  ]);

  const saidasNum = saidas.map((item) => ({ valor: Number(item.valor), pagoEm: item.pagoEm, categoria: item.categoria }));

  const diarioMapa = new Map<string, { entradas: number; saidas: number }>();
  for (let i = 29; i >= 0; i -= 1) {
    diarioMapa.set(adicionarDiasIso(hoje, -i), { entradas: 0, saidas: 0 });
  }
  for (const item of entradas) {
    const dia = dataCivil(item.pagoEm);
    if (dia && diarioMapa.has(dia)) {
      const ponto = diarioMapa.get(dia)!;
      ponto.entradas = arredondarDinheiro(ponto.entradas + item.valor);
    }
  }
  for (const item of saidasNum) {
    const dia = dataCivil(item.pagoEm);
    if (dia && diarioMapa.has(dia)) {
      const ponto = diarioMapa.get(dia)!;
      ponto.saidas = arredondarDinheiro(ponto.saidas + item.valor);
    }
  }

  const diario = [...diarioMapa.entries()].map(([iso, valores]) => ({
    periodo: rotuloDiario(iso),
    entradas: valores.entradas,
    saidas: valores.saidas,
    saldo: arredondarDinheiro(valores.entradas - valores.saidas),
  }));

  const mensalMapa = new Map<string, { entradas: number; saidas: number }>();
  for (let i = 11; i >= 0; i -= 1) {
    const [ano, mes] = hoje.slice(0, 7).split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1 - i, 1));
    const competencia = data.toISOString().slice(0, 7);
    mensalMapa.set(competencia, { entradas: 0, saidas: 0 });
  }
  for (const item of entradas) {
    const competencia = item.pagoEm ? competenciaDeIso(dataCivil(item.pagoEm) ?? '') : '';
    if (mensalMapa.has(competencia)) {
      const ponto = mensalMapa.get(competencia)!;
      ponto.entradas = arredondarDinheiro(ponto.entradas + item.valor);
    }
  }
  for (const item of saidasNum) {
    const competencia = item.pagoEm ? competenciaDeIso(dataCivil(item.pagoEm) ?? '') : '';
    if (mensalMapa.has(competencia)) {
      const ponto = mensalMapa.get(competencia)!;
      ponto.saidas = arredondarDinheiro(ponto.saidas + item.valor);
    }
  }

  const mensal = [...mensalMapa.entries()].map(([competencia, valores]) => ({
    periodo: rotuloMensal(competencia),
    competencia,
    entradas: valores.entradas,
    saidas: valores.saidas,
    saldo: arredondarDinheiro(valores.entradas - valores.saidas),
  }));

  const mesAtual = mensal[mensal.length - 1] ?? { entradas: 0, saidas: 0, saldo: 0 };
  const mesAnterior = mensal[mensal.length - 2] ?? { entradas: 0, saidas: 0, saldo: 0 };

  const dreReceitas = new Map<string, number>();
  for (const item of entradas) {
    if (!item.pagoEm || competenciaDeIso(dataCivil(item.pagoEm) ?? '') !== hoje.slice(0, 7)) continue;
    const chave = item.convenioId ? 'Convênio' : 'Particular';
    dreReceitas.set(chave, arredondarDinheiro((dreReceitas.get(chave) ?? 0) + item.valor));
  }
  const dreDespesas = new Map<string, number>();
  for (const item of saidasNum) {
    if (!item.pagoEm || competenciaDeIso(dataCivil(item.pagoEm) ?? '') !== hoje.slice(0, 7)) continue;
    dreDespesas.set(item.categoria, arredondarDinheiro((dreDespesas.get(item.categoria) ?? 0) + item.valor));
  }

  void inicioDiario;

  return {
    resumo: {
      entradasMes: mesAtual.entradas,
      saidasMes: mesAtual.saidas,
      saldoMes: mesAtual.saldo,
      variacaoEntradas: variacaoPercentual(mesAtual.entradas, mesAnterior.entradas),
      variacaoSaidas: variacaoPercentual(mesAtual.saidas, mesAnterior.saidas),
      variacaoSaldo: variacaoPercentual(mesAtual.saldo, mesAnterior.saldo),
    },
    diario,
    mensal,
    dre: {
      receitas: [...dreReceitas.entries()]
        .map(([categoria, valor]) => ({ categoria, valor }))
        .sort((a, b) => b.valor - a.valor),
      despesas: [...dreDespesas.entries()]
        .map(([categoria, valor]) => ({ categoria, valor }))
        .sort((a, b) => b.valor - a.valor),
    },
  };
}

export async function visaoGeral(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const hoje = hojeCivil();
    const [cobrancas, despesas, lotes, comissoes, inadimplentes, fluxo] = await Promise.all([
      cobrancaModel.listarPorClinica(clinicaId),
      despesaModel.listarPorClinica(clinicaId),
      loteModel.listarPorClinica(clinicaId),
      comissaoModel.listarPorClinica(clinicaId),
      cobrancaModel.listarInadimplentes(clinicaId),
      montarFluxo(clinicaId),
    ]);

    const cobrancasResumo = cobrancas.map(cobrancaResumo);
    const despesasResumo = despesas.map(despesaResumo);

    res.json({
      receber: resumoReceber(cobrancasResumo, hoje),
      pagar: resumoPagar(despesasResumo, hoje),
      fluxo: fluxo.resumo,
      convenios: resumoLotes(lotes.map(loteResumo)),
      comissoes: resumoComissoes(comissoes.map(comissaoResumo)),
      dre: fluxo.dre,
      fluxoDiario: fluxo.diario,
      fluxoMensal: fluxo.mensal,
      inadimplentes: inadimplentes.map((item) => ({
        paciente: { id: item.id, nome: item.nome, telefone: item.telefone },
        valorEmAberto: item.valorEmAberto,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function listarCobrancas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const query = cobrancaQuerySchema.parse(req.query);
    const [cobrancas, convenios, pacientes, formas] = await Promise.all([
      cobrancaModel.listarPorClinica(clinicaId, query.pacienteId),
      listarConveniosAtivos(clinicaId),
      listarResumoAgenda(clinicaId),
      formaModel.listarPorClinica(clinicaId),
    ]);
    const lista = cobrancas.map(cobrancaResumo);
    res.json({
      cobrancas: lista,
      resumo: resumoReceber(lista, hojeCivil()),
      convenios,
      pacientes: pacientes.map((item) => ({ id: item.id, nome: item.nome })),
      formasPagamento: formas.filter((item) => item.ativo).map(formaPagamentoResumo),
    });
  } catch (err) {
    next(err);
  }
}

export async function criarCobranca(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const unidadeId = exigirUnidade(req);
    const dados = cobrancaBodySchema.parse(req.body);

    const paciente = await buscarPaciente(dados.pacienteId, clinicaId);
    if (!paciente || paciente.status === 'arquivado') {
      throw new AppError(400, 'Paciente inválido para esta clínica.');
    }

    let descricao = dados.descricao;
    let valor = dados.valor;
    let convenioId = dados.convenioId;
    let agendamentoId = dados.agendamentoId;

    if (agendamentoId) {
      const agendamento = await buscarAgendamento(agendamentoId, clinicaId);
      if (!agendamento || agendamento.pacienteId !== dados.pacienteId) {
        throw new AppError(400, 'Agendamento inválido para este paciente.');
      }
      const existente = await cobrancaModel.buscarPorAgendamento(agendamentoId, clinicaId);
      if (existente) {
        throw new AppError(409, 'Este atendimento já possui cobrança.');
      }
      descricao = agendamento.procedimento.nome;
      valor = dinheiro(agendamento.valor);
      convenioId = agendamento.convenioId;
    }

    if (convenioId) {
      const convenio = await buscarConvenio(convenioId, clinicaId);
      if (!convenio) throw new AppError(400, 'Convênio inválido para esta clínica.');
    }

    let cobranca = await cobrancaModel.criar({
      clinicaId,
      unidadeId,
      pacienteId: dados.pacienteId,
      agendamentoId,
      descricao,
      valor,
      vencimento: dataDeIso(dados.vencimento) as Date,
      convenioId,
      formaPagamento: convenioId && !agendamentoId ? dados.formaPagamento ?? 'convenio' : dados.formaPagamento ?? null,
      observacoes: dados.observacoes,
    });

    if (dados.parcelas && dados.parcelas >= 2) {
      cobranca = await cobrancaModel.parcelar({
        id: cobranca.id,
        quantidade: dados.parcelas,
        vencimentoBase: dados.vencimento,
        valorTotal: valor,
        formaPagamento: dados.formaPagamento,
      });
    }

    res.status(201).json(montarCobranca(cobranca));
  } catch (err) {
    next(err);
  }
}

export async function pagarCobranca(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cobranca = await carregarCobranca(req);
    const dados = pagamentoBodySchema.parse(req.body);
    const status = statusCobrancaEfetivo(cobranca.status, cobranca.vencimento);

    if (cobranca.status === 'pago' || cobranca.status === 'cancelado') {
      throw new AppError(400, 'Esta cobrança não pode receber pagamento.');
    }

    const pagoEm = dataDeIso(dados.data) as Date;

    if (cobranca.status === 'parcelado' || cobranca.parcelas.length > 0) {
      const proxima = cobranca.parcelas.find((parcela) => parcela.status !== 'pago');
      if (!proxima) throw new AppError(400, 'Todas as parcelas já foram pagas.');
      const atualizada = await cobrancaModel.pagarParcela({
        cobrancaId: cobranca.id,
        numero: proxima.numero,
        formaPagamento: dados.formaPagamento,
        pagoEm,
      });
      res.json(montarCobranca(atualizada));
      return;
    }

    void status;
    const atualizada = await cobrancaModel.registrarPagamento({
      id: cobranca.id,
      formaPagamento: dados.formaPagamento,
      pagoEm,
      observacoes: dados.observacoes ?? cobranca.observacoes,
    });
    res.json(montarCobranca(atualizada));
  } catch (err) {
    next(err);
  }
}

export async function pagarParcelaCobranca(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { numero } = parcelaParamSchema.parse(req.params);
    const cobranca = await carregarCobranca(req);
    const dados = pagamentoBodySchema.parse(req.body);
    const parcela = cobranca.parcelas.find((item) => item.numero === numero);
    if (!parcela) throw new AppError(404, 'Parcela não encontrada.');
    if (parcela.status === 'pago') throw new AppError(400, 'Esta parcela já foi paga.');

    const atualizada = await cobrancaModel.pagarParcela({
      cobrancaId: cobranca.id,
      numero,
      formaPagamento: dados.formaPagamento,
      pagoEm: dataDeIso(dados.data) as Date,
    });
    res.json(montarCobranca(atualizada));
  } catch (err) {
    next(err);
  }
}

export async function parcelarCobranca(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cobranca = await carregarCobranca(req);
    const dados = parcelarBodySchema.parse(req.body);
    if (cobranca.status === 'pago' || cobranca.status === 'cancelado' || cobranca.parcelas.length > 0) {
      throw new AppError(400, 'Esta cobrança não pode ser parcelada.');
    }
    const atualizada = await cobrancaModel.parcelar({
      id: cobranca.id,
      quantidade: dados.quantidade,
      vencimentoBase: dataCivil(cobranca.vencimento) ?? hojeCivil(),
      valorTotal: dinheiro(cobranca.valor),
      formaPagamento: dados.formaPagamento,
    });
    res.json(montarCobranca(atualizada));
  } catch (err) {
    next(err);
  }
}

export async function cancelarCobranca(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cobranca = await carregarCobranca(req);
    if (cobranca.status === 'pago') {
      throw new AppError(400, 'Não é possível cancelar uma cobrança já paga.');
    }
    const atualizada = await cobrancaModel.cancelar(cobranca.id);
    res.json(montarCobranca(atualizada));
  } catch (err) {
    next(err);
  }
}

export async function listarDespesas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const [despesas, formas] = await Promise.all([
      despesaModel.listarPorClinica(clinicaId),
      formaModel.listarPorClinica(clinicaId),
    ]);
    const lista = despesas.map(despesaResumo);
    res.json({
      despesas: lista,
      resumo: resumoPagar(lista, hojeCivil()),
      categorias: [...CATEGORIAS_DESPESA],
      formasPagamento: formas.filter((item) => item.ativo).map(formaPagamentoResumo),
    });
  } catch (err) {
    next(err);
  }
}

export async function criarDespesa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dados = despesaBodySchema.parse(req.body);
    const despesa = await despesaModel.criar({
      clinicaId: req.auth!.clinicaId,
      unidadeId: exigirUnidade(req),
      descricao: dados.descricao,
      categoria: dados.categoria,
      fornecedor: dados.fornecedor,
      valor: dados.valor,
      vencimento: dataDeIso(dados.vencimento) as Date,
      recorrente: dados.recorrente,
      formaPagamento: dados.formaPagamento,
      observacoes: dados.observacoes,
    });
    res.status(201).json(montarDespesa(despesa));
  } catch (err) {
    next(err);
  }
}

export async function atualizarDespesa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const despesa = await carregarDespesa(req);
    if (despesa.status === 'pago') {
      throw new AppError(400, 'Não é possível editar uma despesa já paga.');
    }
    const dados = despesaBodySchema.parse(req.body);
    const atualizada = await despesaModel.atualizar(despesa.id, {
      descricao: dados.descricao,
      categoria: dados.categoria,
      fornecedor: dados.fornecedor,
      valor: dados.valor,
      vencimento: dataDeIso(dados.vencimento) as Date,
      recorrente: dados.recorrente,
      formaPagamento: dados.formaPagamento,
      observacoes: dados.observacoes,
    });
    res.json(montarDespesa(atualizada));
  } catch (err) {
    next(err);
  }
}

export async function pagarDespesa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const despesa = await carregarDespesa(req);
    if (despesa.status === 'pago') {
      throw new AppError(400, 'Esta despesa já foi paga.');
    }
    const dados = pagamentoBodySchema.parse(req.body);
    const atualizada = await despesaModel.registrarPagamento({
      id: despesa.id,
      formaPagamento: dados.formaPagamento,
      pagoEm: dataDeIso(dados.data) as Date,
      observacoes: dados.observacoes ?? despesa.observacoes,
    });
    res.json(montarDespesa(atualizada));
  } catch (err) {
    next(err);
  }
}

export async function removerDespesa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const despesa = await carregarDespesa(req);
    if (despesa.status === 'pago') {
      throw new AppError(400, 'Não é possível excluir uma despesa já paga.');
    }
    await despesaModel.remover(despesa.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function obterFluxoCaixa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const fluxo = await montarFluxo(req.auth!.clinicaId);
    res.json(fluxo);
  } catch (err) {
    next(err);
  }
}

export async function listarLotes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const [lotes, convenios] = await Promise.all([
      loteModel.listarPorClinica(clinicaId),
      listarConveniosAtivos(clinicaId),
    ]);
    const lista = lotes.map(loteResumo);
    res.json({
      lotes: lista,
      resumo: resumoLotes(lista),
      convenios,
    });
  } catch (err) {
    next(err);
  }
}

export async function criarLote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const dados = loteBodySchema.parse(req.body);
    const convenio = await buscarConvenio(dados.convenioId, clinicaId);
    if (!convenio) throw new AppError(400, 'Convênio inválido para esta clínica.');
    if (await loteModel.jaExiste(clinicaId, dados.convenioId, dados.competencia)) {
      throw new AppError(409, 'Já existe um lote para este convênio nesta competência.');
    }

    const { inicio, fim } = inicioFimCompetencia(dados.competencia);
    const cobrancas = await loteModel.cobrancasElegiveis(clinicaId, dados.convenioId, inicio, fim);
    if (cobrancas.length === 0) {
      throw new AppError(400, 'Não há cobranças de convênio elegíveis nesta competência.');
    }

    const lote = await loteModel.criar({
      clinicaId,
      convenioId: dados.convenioId,
      competencia: dados.competencia,
      cobrancaIds: cobrancas.map((item) => item.id),
      valorApresentado: arredondarDinheiro(cobrancas.reduce((total, item) => total + Number(item.valor), 0)),
    });
    res.status(201).json(montarLote(lote));
  } catch (err) {
    next(err);
  }
}

export async function enviarLote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const lote = await carregarLote(req);
    if (lote.status !== 'aberto') {
      throw new AppError(400, 'Só é possível enviar um lote em aberto.');
    }
    const enviadoEm = hojeCivil();
    const previsao = adicionarDiasIso(enviadoEm, lote.convenio.prazoPagamentoDias);
    const atualizado = await loteModel.enviar(lote.id, dataDeIso(enviadoEm) as Date, dataDeIso(previsao) as Date);
    res.json(montarLote(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function reconciliarLote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const lote = await carregarLote(req);
    if (lote.status === 'aberto') {
      throw new AppError(400, 'Envie o lote antes de reconciliar o recebimento.');
    }
    if (lote.status === 'pago' || lote.status === 'glosado') {
      throw new AppError(400, 'Este lote já foi encerrado.');
    }
    const dados = loteReconciliarSchema.parse(req.body);
    const apresentado = dinheiro(lote.valorApresentado);
    if (dados.valorGlosado + dados.valorRecebido > apresentado + 0.009) {
      throw new AppError(400, 'A soma de glosa e recebido não pode superar o valor apresentado.');
    }

    const liquido = arredondarDinheiro(apresentado - dados.valorGlosado);
    let status = 'parcial';
    if (dados.valorRecebido >= liquido - 0.009) {
      status = dados.valorGlosado > 0 ? 'glosado' : 'pago';
    } else if (dados.valorRecebido === 0 && dados.valorGlosado > 0) {
      status = 'glosado';
    }

    const atualizado = await loteModel.reconciliar({
      id: lote.id,
      valorGlosado: dados.valorGlosado,
      valorRecebido: dados.valorRecebido,
      status,
    });

    if (status === 'pago' || status === 'glosado') {
      await cobrancaModel.marcarPagas(
        lote.guias.map((guia) => guia.cobrancaId),
        'convenio',
        dataDeIso(hojeCivil()) as Date,
      );
    }

    res.json(montarLote(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function listarComissoes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = comissaoQuerySchema.parse(req.query);
    const comissoes = await comissaoModel.listarPorClinica(req.auth!.clinicaId, query.profissionalId);
    const filtradas = query.competencia
      ? comissoes.filter((item) => item.competencia === query.competencia)
      : comissoes;
    const lista = filtradas.map(comissaoResumo);
    res.json({
      comissoes: lista,
      resumo: resumoComissoes(lista.length ? lista : comissoes.map(comissaoResumo)),
      competencias: [...new Set(comissoes.map((item) => item.competencia))].sort().reverse(),
    });
  } catch (err) {
    next(err);
  }
}

async function calcularCompetencia(clinicaId: string, competencia: string) {
  const { inicio, fim } = inicioFimCompetencia(competencia);
  const profissionais = await comissaoModel.profissionaisComissionaveis(clinicaId);
  const geradas = [];

  for (const profissional of profissionais) {
    const percentual = dinheiro(profissional.percentualComissao);
    if (percentual <= 0) continue;
    const periodo = await comissaoModel.faturamentoDoPeriodo({
      clinicaId,
      profissionalId: profissional.id,
      inicio,
      fim,
    });
    geradas.push(
      await comissaoModel.upsertPrevista({
        clinicaId,
        profissionalId: profissional.id,
        competencia,
        atendimentos: periodo.atendimentos,
        faturamentoGerado: arredondarDinheiro(periodo.faturamentoGerado),
        percentual,
        valorComissao: arredondarDinheiro((periodo.faturamentoGerado * percentual) / 100),
      }),
    );
  }

  return geradas;
}

export async function calcularComissoes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dados = comissaoCalcularSchema.parse(req.body ?? {});
    const competencia = dados.competencia ?? competenciaAtual();
    await calcularCompetencia(req.auth!.clinicaId, competencia);
    const comissoes = await comissaoModel.listarPorClinica(req.auth!.clinicaId);
    const lista = comissoes.map(comissaoResumo);
    res.json({
      comissoes: lista,
      resumo: resumoComissoes(lista),
      competencias: [...new Set(lista.map((item) => item.competencia))].sort().reverse(),
    });
  } catch (err) {
    next(err);
  }
}

export async function aprovarComissao(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const comissao = await carregarComissao(req);
    if (comissao.status !== 'prevista') {
      throw new AppError(400, 'Só é possível aprovar comissões previstas.');
    }
    const atualizada = await comissaoModel.aprovar(comissao.id);
    res.json(montarComissao(atualizada));
  } catch (err) {
    next(err);
  }
}

export async function pagarComissao(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const comissao = await carregarComissao(req);
    if (comissao.status !== 'aprovada') {
      throw new AppError(400, 'Aprove a comissão antes de registrar o pagamento.');
    }
    const dados = pagamentoBodySchema.parse(req.body);
    const pagoEm = dataDeIso(dados.data) as Date;
    const atualizada = await comissaoModel.pagar(comissao.id, pagoEm);
    await despesaModel.criar({
      clinicaId: req.auth!.clinicaId,
      unidadeId: exigirUnidade(req),
      descricao: `Comissão ${comissao.profissional.nome} — ${comissao.competencia}`,
      categoria: 'Comissões',
      fornecedor: comissao.profissional.nome,
      valor: dinheiro(comissao.valorComissao),
      vencimento: pagoEm,
      recorrente: false,
      formaPagamento: dados.formaPagamento,
      status: 'pago',
      pagoEm,
    });
    res.json(montarComissao(atualizada));
  } catch (err) {
    next(err);
  }
}

export async function fecharFolha(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dados = comissaoFecharSchema.parse(req.body);
    await calcularCompetencia(req.auth!.clinicaId, dados.competencia);
    const comissoes = await comissaoModel.aprovarPrevistas(req.auth!.clinicaId, dados.competencia);
    const lista = comissoes.map(comissaoResumo);
    res.json({
      comissoes: lista,
      resumo: resumoComissoes(lista),
      competencias: [...new Set(lista.map((item) => item.competencia))].sort().reverse(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listarFormasPagamento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const formas = await formaModel.listarPorClinica(req.auth!.clinicaId);
    res.json(montarFormasPagamento(formas));
  } catch (err) {
    next(err);
  }
}

export async function salvarFormasPagamento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dados = formasPagamentoBodySchema.parse(req.body);
    const formas = await formaModel.substituir(
      req.auth!.clinicaId,
      dados.formas.map((item, index) => ({ ...item, ordem: index + 1 })),
    );
    res.json(montarFormasPagamento(formas));
  } catch (err) {
    next(err);
  }
}
