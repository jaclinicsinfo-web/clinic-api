import { prisma } from '../config/database';
import { dataCivil, dataDeIso, dinheiro, horaCivil, horaParaMinutos, hojeCivil, minutosIntervalo } from '../lib/datas';
import {
  adicionarDiasIso,
  adicionarMesesIso,
  arredondarDinheiro,
  competenciaAtual,
  competenciaDeIso,
  inicioFimCompetencia,
  statusCobrancaEfetivo,
  statusDespesaEfetivo,
  valorAbertoCobranca,
  variacaoPercentual,
} from '../lib/financeiro';
import { coletarAlertas, AlertaOperacional } from './notificacao.model';
import { movimentosRecebidos } from './cobranca.model';

const STATUS_OCUPAM = new Set(['agendado', 'confirmado', 'check_in', 'em_atendimento', 'atendido', 'faltou']);
const STATUS_ATIVOS_DIA = new Set(['agendado', 'confirmado', 'check_in', 'em_atendimento']);

export interface SerieValor {
  periodo: string;
  valor: number;
}

export interface AtendimentoPorProfissional {
  profissional: string;
  atendimentos: number;
  faturamento: number;
}

export interface ProximoAtendimentoPainel {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  profissionalNome: string;
  procedimentoNome: string;
  horaInicio: string;
  sala: string | null;
  particular: boolean;
  valor: number;
  status: string;
}

export interface AniversariantePainel {
  id: string;
  nome: string;
  dataNascimento: string;
  idade: number;
}

export interface ResumoReceberPainel {
  vencendo7Dias: number;
  quantidadeVencendo7Dias: number;
  totalAtrasado: number;
}

export interface ResumoPagarPainel {
  vencendo7Dias: number;
  quantidadeVencendo7Dias: number;
  totalVencido: number;
}

export interface PainelDashboard {
  atendimentosHoje: {
    total: number;
    confirmados: number;
    agendados: number;
    cancelados: number;
  };
  taxaOcupacao: number;
  taxaFaltas: number;
  novosPacientes: number;
  variacaoNovosPacientes: number;
  faturamentoMes: number;
  variacaoFaturamento: number;
  faturamentoDia: number;
  contasAReceber: ResumoReceberPainel;
  contasAPagar: ResumoPagarPainel;
  faturamentoDiario: SerieValor[];
  faturamentoMensal: SerieValor[];
  origemAtendimento: { nome: string; valor: number }[];
  atendimentosPorProfissional: AtendimentoPorProfissional[];
  funil: { etapa: string; quantidade: number }[];
  proximos: ProximoAtendimentoPainel[];
  alertas: AlertaOperacional[];
  aniversariantes: AniversariantePainel[];
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloDiario(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function rotuloMensal(competencia: string) {
  const mes = Number(competencia.slice(5, 7));
  return `${MESES_CURTOS[(mes || 1) - 1]}/${competencia.slice(2, 4)}`;
}

function nomeCurto(nome: string) {
  return nome.replace(/^(Dra?\.)\s+/i, '');
}

function filtroProfissionalPaciente(profissionalId?: string) {
  if (!profissionalId) return {};
  return {
    OR: [
      { profissionalPreferidoId: profissionalId },
      { agendamentos: { some: { profissionalId } } },
    ],
  };
}

function contarStatus(lista: { status: string }[], status: string) {
  return lista.filter((item) => item.status === status).length;
}

function minutosSobrepostos(inicioA: string, fimA: string, inicioB: string, fimB: string) {
  const inicio = Math.max(horaParaMinutos(inicioA), horaParaMinutos(inicioB));
  const fim = Math.min(horaParaMinutos(fimA), horaParaMinutos(fimB));
  return Math.max(fim - inicio, 0);
}

function taxaOcupacaoDoMes(params: {
  competencia: string;
  profissionais: { id: string; gradeHorarios: { diaSemana: number; horaInicio: string; horaFim: string }[] }[];
  bloqueios: { profissionalId: string; data: Date; horaInicio: string; horaFim: string }[];
  agendamentos: { profissionalId: string; data: Date; horaInicio: string; horaFim: string; status: string }[];
}) {
  const { inicio, fim } = inicioFimCompetencia(params.competencia);
  const gradePorProfissional = new Map(params.profissionais.map((item) => [item.id, item.gradeHorarios]));
  const bloqueiosPorChave = new Map<string, { horaInicio: string; horaFim: string }[]>();
  for (const bloqueio of params.bloqueios) {
    const chave = `${bloqueio.profissionalId}:${dataCivil(bloqueio.data)}`;
    const lista = bloqueiosPorChave.get(chave) ?? [];
    lista.push({ horaInicio: bloqueio.horaInicio, horaFim: bloqueio.horaFim });
    bloqueiosPorChave.set(chave, lista);
  }

  let capacidade = 0;
  for (let ts = inicio.getTime(); ts <= fim.getTime(); ts += 86_400_000) {
    const dia = new Date(ts);
    const iso = dataCivil(dia);
    const diaSemana = dia.getUTCDay();
    for (const profissional of params.profissionais) {
      const grades = gradePorProfissional.get(profissional.id) ?? [];
      const doDia = grades.filter((grade) => grade.diaSemana === diaSemana);
      if (doDia.length === 0) continue;
      const bloqueios = bloqueiosPorChave.get(`${profissional.id}:${iso}`) ?? [];
      for (const grade of doDia) {
        let minutos = minutosIntervalo(grade.horaInicio, grade.horaFim);
        for (const bloqueio of bloqueios) {
          minutos -= minutosSobrepostos(grade.horaInicio, grade.horaFim, bloqueio.horaInicio, bloqueio.horaFim);
        }
        capacidade += Math.max(minutos, 0);
      }
    }
  }

  const ocupados = params.agendamentos
    .filter((item) => STATUS_OCUPAM.has(item.status))
    .reduce((total, item) => total + minutosIntervalo(item.horaInicio, item.horaFim), 0);

  if (capacidade <= 0) return ocupados > 0 ? 100 : 0;
  return Math.min((ocupados / capacidade) * 100, 100);
}

export function painelVazio(): PainelDashboard {
  const vazioFinanceiro = { vencendo7Dias: 0, quantidadeVencendo7Dias: 0, totalAtrasado: 0 };
  return {
    atendimentosHoje: { total: 0, confirmados: 0, agendados: 0, cancelados: 0 },
    taxaOcupacao: 0,
    taxaFaltas: 0,
    novosPacientes: 0,
    variacaoNovosPacientes: 0,
    faturamentoMes: 0,
    variacaoFaturamento: 0,
    faturamentoDia: 0,
    contasAReceber: vazioFinanceiro,
    contasAPagar: { vencendo7Dias: 0, quantidadeVencendo7Dias: 0, totalVencido: 0 },
    faturamentoDiario: [],
    faturamentoMensal: [],
    origemAtendimento: [
      { nome: 'Particular', valor: 0 },
      { nome: 'Convênio', valor: 0 },
    ],
    atendimentosPorProfissional: [],
    funil: [
      { etapa: 'Agendado', quantidade: 0 },
      { etapa: 'Confirmado', quantidade: 0 },
      { etapa: 'Atendido', quantidade: 0 },
      { etapa: 'Faltou/Cancelado', quantidade: 0 },
    ],
    proximos: [],
    alertas: [],
    aniversariantes: [],
  };
}

export async function carregarPainel(params: {
  clinicaId: string;
  profissionalId?: string | null;
  incluirFinanceiro: boolean;
  permissoes: unknown;
}): Promise<PainelDashboard> {
  const hoje = hojeCivil();
  const agora = horaCivil();
  const competencia = competenciaAtual();
  const { inicio, fim } = inicioFimCompetencia(competencia);
  const competenciaAnterior = competenciaDeIso(adicionarMesesIso(`${competencia}-01`, -1));
  const inicioMesAnterior = inicioFimCompetencia(competenciaAnterior).inicio;
  const profissionalId = params.profissionalId ?? undefined;
  const filtroAgenda = profissionalId ? { profissionalId } : {};
  const anoAtual = Number(hoje.slice(0, 4));
  const mesAtual = Number(hoje.slice(5, 7));

  const [agendamentos, profissionais, bloqueios, novosMes, novosMesAnterior, aniversariantesBrutos] = await Promise.all([
    prisma.agendamento.findMany({
      where: { clinicaId: params.clinicaId, data: { gte: inicio, lte: fim }, ...filtroAgenda },
      select: {
        id: true,
        pacienteId: true,
        profissionalId: true,
        data: true,
        horaInicio: true,
        horaFim: true,
        sala: true,
        particular: true,
        valor: true,
        status: true,
        paciente: { select: { nome: true } },
        profissional: { select: { nome: true } },
        procedimento: { select: { nome: true } },
      },
      orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
    }),
    prisma.profissional.findMany({
      where: { clinicaId: params.clinicaId, status: 'ativo', ...(profissionalId ? { id: profissionalId } : {}) },
      select: {
        id: true,
        nome: true,
        gradeHorarios: { select: { diaSemana: true, horaInicio: true, horaFim: true } },
      },
      orderBy: { nome: 'asc' },
    }),
    prisma.bloqueioAgenda.findMany({
      where: { clinicaId: params.clinicaId, data: { gte: inicio, lte: fim }, ...filtroAgenda },
      select: { profissionalId: true, data: true, horaInicio: true, horaFim: true },
    }),
    prisma.paciente.count({
      where: {
        clinicaId: params.clinicaId,
        criadoEm: { gte: inicio, lt: dataDeIso(adicionarMesesIso(`${competencia}-01`, 1)) ?? fim },
        ...filtroProfissionalPaciente(profissionalId),
      },
    }),
    prisma.paciente.count({
      where: {
        clinicaId: params.clinicaId,
        criadoEm: { gte: inicioMesAnterior, lt: inicio },
        ...filtroProfissionalPaciente(profissionalId),
      },
    }),
    prisma.paciente.findMany({
      where: {
        clinicaId: params.clinicaId,
        status: 'ativo',
        ...filtroProfissionalPaciente(profissionalId),
      },
      select: { id: true, nome: true, dataNascimento: true },
    }),
  ]);

  const doDia = agendamentos.filter((item) => dataCivil(item.data) === hoje);
  const atendimentosHoje = {
    total: doDia.length,
    confirmados: contarStatus(doDia, 'confirmado'),
    agendados: contarStatus(doDia, 'agendado'),
    cancelados: contarStatus(doDia, 'cancelado'),
  };

  const faturamentoDia = arredondarDinheiro(
    doDia
      .filter((item) => item.status !== 'cancelado' && item.status !== 'faltou')
      .reduce((total, item) => total + dinheiro(item.valor), 0),
  );

  const faltas = contarStatus(agendamentos, 'faltou');
  const taxaFaltas = agendamentos.length === 0 ? 0 : (faltas / agendamentos.length) * 100;
  const taxaOcupacao = taxaOcupacaoDoMes({ competencia, profissionais, bloqueios, agendamentos });

  const atendidosMes = agendamentos.filter((item) => item.status === 'atendido');
  const particular = atendidosMes.filter((item) => item.particular).length;

  const porProfissional = new Map<string, AtendimentoPorProfissional>();
  for (const profissional of profissionais) {
    porProfissional.set(profissional.id, {
      profissional: nomeCurto(profissional.nome),
      atendimentos: 0,
      faturamento: 0,
    });
  }
  for (const item of atendidosMes) {
    const atual = porProfissional.get(item.profissionalId) ?? {
      profissional: nomeCurto(item.profissional.nome),
      atendimentos: 0,
      faturamento: 0,
    };
    atual.atendimentos += 1;
    atual.faturamento = arredondarDinheiro(atual.faturamento + dinheiro(item.valor));
    porProfissional.set(item.profissionalId, atual);
  }

  const confirmadosFunil = agendamentos.filter((item) =>
    ['confirmado', 'check_in', 'em_atendimento', 'atendido'].includes(item.status),
  ).length;

  const proximos = doDia
    .filter((item) => item.horaInicio >= agora && STATUS_ATIVOS_DIA.has(item.status))
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      pacienteId: item.pacienteId,
      pacienteNome: item.paciente.nome,
      profissionalNome: item.profissional.nome,
      procedimentoNome: item.procedimento.nome,
      horaInicio: item.horaInicio,
      sala: item.sala,
      particular: item.particular,
      valor: dinheiro(item.valor),
      status: item.status,
    }));

  const aniversariantes = aniversariantesBrutos
    .filter((item) => item.dataNascimento.getUTCMonth() + 1 === mesAtual)
    .sort((a, b) => {
      const dia = a.dataNascimento.getUTCDate() - b.dataNascimento.getUTCDate();
      return dia !== 0 ? dia : a.nome.localeCompare(b.nome, 'pt-BR');
    })
    .map((item) => ({
      id: item.id,
      nome: item.nome,
      dataNascimento: dataCivil(item.dataNascimento) ?? '',
      idade: anoAtual - item.dataNascimento.getUTCFullYear(),
    }));

  const painel: PainelDashboard = {
    ...painelVazio(),
    atendimentosHoje,
    taxaOcupacao,
    taxaFaltas,
    novosPacientes: novosMes,
    variacaoNovosPacientes: variacaoPercentual(novosMes, novosMesAnterior),
    faturamentoDia,
    origemAtendimento: [
      { nome: 'Particular', valor: particular },
      { nome: 'Convênio', valor: atendidosMes.length - particular },
    ],
    atendimentosPorProfissional: [...porProfissional.values()].sort((a, b) => b.atendimentos - a.atendimentos),
    funil: [
      { etapa: 'Agendado', quantidade: agendamentos.length },
      { etapa: 'Confirmado', quantidade: confirmadosFunil },
      { etapa: 'Atendido', quantidade: atendidosMes.length },
      { etapa: 'Faltou/Cancelado', quantidade: faltas + contarStatus(agendamentos, 'cancelado') },
    ],
    proximos,
    aniversariantes,
  };

  if (!params.incluirFinanceiro) {
    return painel;
  }

  const inicioAnual = dataDeIso(`${anoAtual - 1}-${hoje.slice(5, 7)}-01`) as Date;
  const fimHoje = dataDeIso(hoje) as Date;
  const limite7 = adicionarDiasIso(hoje, 7);

  const [movimentos, cobrancas, despesas, alertas] = await Promise.all([
    movimentosRecebidos(params.clinicaId, inicioAnual, fimHoje),
    prisma.cobranca.findMany({
      where: { clinicaId: params.clinicaId, status: { not: 'cancelado' } },
      select: {
        status: true,
        valor: true,
        vencimento: true,
        parcelas: { select: { status: true, valor: true } },
      },
    }),
    prisma.despesa.findMany({
      where: { clinicaId: params.clinicaId, status: { not: 'pago' } },
      select: { status: true, valor: true, vencimento: true },
    }),
    coletarAlertas({ clinicaId: params.clinicaId, permissoes: params.permissoes }),
  ]);

  const diarioMapa = new Map<string, number>();
  for (let i = 29; i >= 0; i -= 1) {
    diarioMapa.set(adicionarDiasIso(hoje, -i), 0);
  }
  const mensalMapa = new Map<string, number>();
  for (let i = 11; i >= 0; i -= 1) {
    const [ano, mes] = competencia.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1 - i, 1));
    mensalMapa.set(data.toISOString().slice(0, 7), 0);
  }

  for (const item of movimentos) {
    const dia = dataCivil(item.pagoEm);
    if (dia && diarioMapa.has(dia)) {
      diarioMapa.set(dia, arredondarDinheiro((diarioMapa.get(dia) ?? 0) + item.valor));
    }
    const competenciaItem = item.pagoEm ? competenciaDeIso(dataCivil(item.pagoEm) ?? '') : '';
    if (mensalMapa.has(competenciaItem)) {
      mensalMapa.set(competenciaItem, arredondarDinheiro((mensalMapa.get(competenciaItem) ?? 0) + item.valor));
    }
  }

  const faturamentoMensal = [...mensalMapa.entries()].map(([chave, valor]) => ({
    periodo: rotuloMensal(chave),
    valor,
  }));
  const faturamentoMes = faturamentoMensal[faturamentoMensal.length - 1]?.valor ?? 0;
  const faturamentoMesAnterior = faturamentoMensal[faturamentoMensal.length - 2]?.valor ?? 0;

  const receberEfetivo = cobrancas.map((item) => ({
    status: statusCobrancaEfetivo(item.status, item.vencimento, hoje),
    vencimento: dataCivil(item.vencimento) ?? '',
    valorAberto: valorAbertoCobranca({
      status: item.status,
      valor: dinheiro(item.valor),
      parcelas: item.parcelas.map((parcela) => ({ status: parcela.status, valor: dinheiro(parcela.valor) })),
    }),
  }));
  const atrasadas = receberEfetivo.filter((item) => item.status === 'atrasado');
  const vencendo7 = receberEfetivo.filter(
    (item) => item.status === 'pendente' && item.vencimento >= hoje && item.vencimento <= limite7,
  );

  const pagarEfetivo = despesas.map((item) => ({
    status: statusDespesaEfetivo(item.status, item.vencimento, hoje),
    vencimento: dataCivil(item.vencimento) ?? '',
    valor: dinheiro(item.valor),
  }));
  const vencidas = pagarEfetivo.filter((item) => item.status === 'vencido');
  const pagarVencendo7 = pagarEfetivo.filter(
    (item) => item.status === 'a_pagar' && item.vencimento >= hoje && item.vencimento <= limite7,
  );

  painel.faturamentoMes = faturamentoMes;
  painel.variacaoFaturamento = variacaoPercentual(faturamentoMes, faturamentoMesAnterior);
  painel.contasAReceber = {
    vencendo7Dias: arredondarDinheiro(vencendo7.reduce((total, item) => total + item.valorAberto, 0)),
    quantidadeVencendo7Dias: vencendo7.length,
    totalAtrasado: arredondarDinheiro(atrasadas.reduce((total, item) => total + item.valorAberto, 0)),
  };
  painel.contasAPagar = {
    vencendo7Dias: arredondarDinheiro(pagarVencendo7.reduce((total, item) => total + item.valor, 0)),
    quantidadeVencendo7Dias: pagarVencendo7.length,
    totalVencido: arredondarDinheiro(vencidas.reduce((total, item) => total + item.valor, 0)),
  };
  painel.faturamentoDiario = [...diarioMapa.entries()].map(([iso, valor]) => ({
    periodo: rotuloDiario(iso),
    valor,
  }));
  painel.faturamentoMensal = faturamentoMensal;
  painel.alertas = alertas;

  return painel;
}
