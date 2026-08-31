import { prisma } from '../config/database';
import { dataCivil, dataDeIso, dinheiro, hojeCivil } from '../lib/datas';
import {
  adicionarDiasIso,
  adicionarMesesIso,
  arredondarDinheiro,
  competenciaDeIso,
  inicioFimCompetencia,
  valorAbertoCobranca,
} from '../lib/financeiro';
import { PERIODOS_RELATORIO } from '../validators/relatorios.validator';
import { listarPorClinica as listarComissoes } from './comissao.model';

export type PeriodoRelatorio = (typeof PERIODOS_RELATORIO)[number];

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

interface PontoTempo {
  chave: string;
  label: string;
  testa: (iso: string) => boolean;
}

export interface RelatoriosPainel {
  intervalo: { inicio: string; fim: string; label: string };
  faturamento: {
    total: number;
    quantidade: number;
    ticketMedio: number;
    evolucao: { periodo: string; valor: number }[];
    porProfissional: { id: string; nome: string; atendimentos: number; valor: number }[];
    porConvenio: { id: string; nome: string; atendimentos: number; valor: number }[];
    porProcedimento: { id: string; nome: string; quantidade: number; valor: number }[];
  };
  atendimentos: {
    realizados: number;
    cancelados: number;
    faltas: number;
    total: number;
    porStatus: { nome: string; valor: number }[];
    evolucao: { periodo: string; realizados: number; cancelados: number; faltas: number }[];
  };
  inadimplencia: {
    total: number;
    quantidade: number;
    pacientes: { id: string; nome: string; valor: number; cobrancas: number }[];
  };
  pacientes: {
    novos: number;
    recorrentes: number;
    evolucao: { periodo: string; novos: number; recorrentes: number }[];
  };
  produtividade: {
    id: string;
    nome: string;
    especialidade: string;
    agendamentos: number;
    realizados: number;
    faltas: number;
    faturamento: number;
    ocupacao: number;
  }[];
  comissoes: {
    total: number;
    lista: {
      id: string;
      profissionalId: string;
      profissionalNome: string;
      competencia: string;
      atendimentos: number;
      faturamentoGerado: number;
      percentual: number;
      valorComissao: number;
      status: string;
      pagoEm?: string;
    }[];
  };
  conveniosAtivos: number;
}

function filtroPacienteDoProfissional(profissionalId?: string) {
  if (!profissionalId) return {};
  return {
    OR: [
      { profissionalPreferidoId: profissionalId },
      { agendamentos: { some: { profissionalId } } },
    ],
  };
}

function resolverPeriodo(periodo: PeriodoRelatorio, hoje: string) {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));

  if (periodo === 'anterior') {
    const competencia = competenciaDeIso(adicionarMesesIso(`${hoje.slice(0, 7)}-01`, -1));
    const { inicio, fim } = inicioFimCompetencia(competencia);
    const mesRef = Number(competencia.slice(5, 7));
    return {
      inicio: dataCivil(inicio) as string,
      fim: dataCivil(fim) as string,
      label: `${MESES[mesRef - 1]} ${competencia.slice(0, 4)}`,
    };
  }

  if (periodo === '30d') {
    return { inicio: adicionarDiasIso(hoje, -29), fim: hoje, label: 'Últimos 30 dias' };
  }

  if (periodo === '12m') {
    return {
      inicio: adicionarMesesIso(`${hoje.slice(0, 7)}-01`, -11),
      fim: hoje,
      label: 'Últimos 12 meses',
    };
  }

  if (periodo === 'ano') {
    return { inicio: `${ano}-01-01`, fim: hoje, label: String(ano) };
  }

  const { inicio, fim } = inicioFimCompetencia(hoje.slice(0, 7));
  return {
    inicio: dataCivil(inicio) as string,
    fim: dataCivil(fim) as string,
    label: `${MESES[mes - 1]} ${ano}`,
  };
}

function pontosDoIntervalo(inicioIso: string, fimIso: string): PontoTempo[] {
  const inicio = dataDeIso(inicioIso) as Date;
  const fim = dataDeIso(fimIso) as Date;
  const dias = Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);

  if (dias > 45) {
    const pontos: PontoTempo[] = [];
    let [ano, mes] = inicioIso.slice(0, 7).split('-').map(Number);
    const [anoFim, mesFim] = fimIso.slice(0, 7).split('-').map(Number);
    while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
      const chave = `${ano}-${String(mes).padStart(2, '0')}`;
      pontos.push({
        chave,
        label: MESES_CURTOS[mes - 1] ?? chave,
        testa: (iso) => iso.startsWith(chave),
      });
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }
    return pontos;
  }

  const pontos: PontoTempo[] = [];
  for (let iso = inicioIso; iso <= fimIso; iso = adicionarDiasIso(iso, 1)) {
    pontos.push({
      chave: iso,
      label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
      testa: (valor) => valor === iso,
    });
  }
  return pontos;
}

export function relatoriosVazio(periodo: PeriodoRelatorio): RelatoriosPainel {
  const intervalo = resolverPeriodo(periodo, hojeCivil());
  return {
    intervalo,
    faturamento: {
      total: 0,
      quantidade: 0,
      ticketMedio: 0,
      evolucao: [],
      porProfissional: [],
      porConvenio: [],
      porProcedimento: [],
    },
    atendimentos: {
      realizados: 0,
      cancelados: 0,
      faltas: 0,
      total: 0,
      porStatus: [
        { nome: 'Atendido', valor: 0 },
        { nome: 'Cancelado', valor: 0 },
        { nome: 'Faltou', valor: 0 },
        { nome: 'Demais', valor: 0 },
      ],
      evolucao: [],
    },
    inadimplencia: { total: 0, quantidade: 0, pacientes: [] },
    pacientes: { novos: 0, recorrentes: 0, evolucao: [] },
    produtividade: [],
    comissoes: { total: 0, lista: [] },
    conveniosAtivos: 0,
  };
}

export async function carregarRelatorios(params: {
  clinicaId: string;
  periodo: PeriodoRelatorio;
  profissionalId?: string | null;
}): Promise<RelatoriosPainel> {
  const hoje = hojeCivil();
  const intervalo = resolverPeriodo(params.periodo, hoje);
  const inicio = dataDeIso(intervalo.inicio) as Date;
  const fim = dataDeIso(intervalo.fim) as Date;
  const proximoDia = dataDeIso(adicionarDiasIso(intervalo.fim, 1)) as Date;
  const profissionalId = params.profissionalId ?? undefined;
  const filtroAgenda = profissionalId ? { profissionalId } : {};
  const pontos = pontosDoIntervalo(intervalo.inicio, intervalo.fim);

  const [agendamentos, profissionais, novosPacientes, cobrancas, comissoes, conveniosAtivos] = await Promise.all([
    prisma.agendamento.findMany({
      where: {
        clinicaId: params.clinicaId,
        data: { gte: inicio, lte: fim },
        ...filtroAgenda,
      },
      select: {
        id: true,
        data: true,
        status: true,
        valor: true,
        particular: true,
        convenioId: true,
        profissionalId: true,
        procedimentoId: true,
        pacienteId: true,
        profissional: { select: { nome: true } },
        procedimento: { select: { nome: true } },
        convenio: { select: { nome: true } },
      },
    }),
    prisma.profissional.findMany({
      where: {
        clinicaId: params.clinicaId,
        status: 'ativo',
        ...(profissionalId ? { id: profissionalId } : {}),
      },
      select: { id: true, nome: true, especialidades: true },
      orderBy: { nome: 'asc' },
    }),
    prisma.paciente.findMany({
      where: {
        clinicaId: params.clinicaId,
        criadoEm: { gte: inicio, lt: proximoDia },
        ...filtroPacienteDoProfissional(profissionalId),
      },
      select: { id: true, criadoEm: true },
    }),
    prisma.cobranca.findMany({
      where: {
        clinicaId: params.clinicaId,
        status: { in: ['pendente', 'parcelado'] },
        ...(profissionalId
          ? {
              paciente: {
                OR: [
                  { profissionalPreferidoId: profissionalId },
                  { agendamentos: { some: { profissionalId } } },
                ],
              },
            }
          : {}),
      },
      select: {
        status: true,
        valor: true,
        vencimento: true,
        pacienteId: true,
        paciente: { select: { id: true, nome: true } },
        parcelas: { select: { status: true, valor: true, vencimento: true } },
      },
    }),
    listarComissoes(params.clinicaId, profissionalId),
    prisma.convenio.count({ where: { clinicaId: params.clinicaId, status: 'ativo' } }),
  ]);

  const comIso = agendamentos.map((item) => ({
    ...item,
    iso: dataCivil(item.data) ?? '',
    valor: dinheiro(item.valor),
  }));

  const atendidos = comIso.filter((item) => item.status === 'atendido');
  const cancelados = comIso.filter((item) => item.status === 'cancelado');
  const faltas = comIso.filter((item) => item.status === 'faltou');
  const totalFaturamento = arredondarDinheiro(atendidos.reduce((soma, item) => soma + item.valor, 0));

  const porProfissionalMap = new Map<string, { id: string; nome: string; atendimentos: number; valor: number }>();
  for (const item of atendidos) {
    const atual = porProfissionalMap.get(item.profissionalId) ?? {
      id: item.profissionalId,
      nome: item.profissional.nome,
      atendimentos: 0,
      valor: 0,
    };
    atual.atendimentos += 1;
    atual.valor = arredondarDinheiro(atual.valor + item.valor);
    porProfissionalMap.set(item.profissionalId, atual);
  }

  const porConvenioMap = new Map<string, { id: string; nome: string; atendimentos: number; valor: number }>();
  for (const item of atendidos) {
    const chave = item.particular || !item.convenioId ? 'particular' : item.convenioId;
    const atual = porConvenioMap.get(chave) ?? {
      id: chave,
      nome: item.particular || !item.convenio?.nome ? 'Particular' : item.convenio.nome,
      atendimentos: 0,
      valor: 0,
    };
    atual.atendimentos += 1;
    atual.valor = arredondarDinheiro(atual.valor + item.valor);
    porConvenioMap.set(chave, atual);
  }

  const porProcedimentoMap = new Map<string, { id: string; nome: string; quantidade: number; valor: number }>();
  for (const item of atendidos) {
    const atual = porProcedimentoMap.get(item.procedimentoId) ?? {
      id: item.procedimentoId,
      nome: item.procedimento.nome,
      quantidade: 0,
      valor: 0,
    };
    atual.quantidade += 1;
    atual.valor = arredondarDinheiro(atual.valor + item.valor);
    porProcedimentoMap.set(item.procedimentoId, atual);
  }

  const inadimplentesMap = new Map<string, { id: string; nome: string; valor: number; cobrancas: number }>();
  let quantidadeAtrasadas = 0;
  for (const cobranca of cobrancas) {
    const atrasada =
      cobranca.status === 'pendente'
        ? (dataCivil(cobranca.vencimento) ?? '') < hoje
        : cobranca.parcelas.some(
            (parcela) => parcela.status !== 'pago' && (dataCivil(parcela.vencimento) ?? '') < hoje,
          );
    if (!atrasada) continue;
    quantidadeAtrasadas += 1;
    const aberto = valorAbertoCobranca({
      status: cobranca.status,
      valor: dinheiro(cobranca.valor),
      parcelas: cobranca.parcelas.map((parcela) => ({ status: parcela.status, valor: dinheiro(parcela.valor) })),
    });
    const atual = inadimplentesMap.get(cobranca.pacienteId) ?? {
      id: cobranca.paciente.id,
      nome: cobranca.paciente.nome,
      valor: 0,
      cobrancas: 0,
    };
    atual.valor = arredondarDinheiro(atual.valor + aberto);
    atual.cobrancas += 1;
    inadimplentesMap.set(cobranca.pacienteId, atual);
  }

  const novos = novosPacientes.map((item) => ({
    id: item.id,
    iso: dataCivil(item.criadoEm) ?? item.criadoEm.toISOString().slice(0, 10),
  }));
  const idsNovos = new Set(novos.map((item) => item.id));
  const idsAtendidos = new Set(atendidos.map((item) => item.pacienteId));
  const recorrentes = [...idsAtendidos].filter((id) => !idsNovos.has(id)).length;

  const comissoesPeriodo = comissoes.filter((item) => {
    const dia = `${item.competencia}-15`;
    return dia >= intervalo.inicio && dia <= intervalo.fim;
  });

  return {
    intervalo,
    faturamento: {
      total: totalFaturamento,
      quantidade: atendidos.length,
      ticketMedio: atendidos.length === 0 ? 0 : arredondarDinheiro(totalFaturamento / atendidos.length),
      evolucao: pontos.map((ponto) => ({
        periodo: ponto.label,
        valor: arredondarDinheiro(
          atendidos.filter((item) => ponto.testa(item.iso)).reduce((soma, item) => soma + item.valor, 0),
        ),
      })),
      porProfissional: [...porProfissionalMap.values()].sort((a, b) => b.valor - a.valor),
      porConvenio: [...porConvenioMap.values()].sort((a, b) => b.valor - a.valor),
      porProcedimento: [...porProcedimentoMap.values()].sort((a, b) => b.valor - a.valor),
    },
    atendimentos: {
      realizados: atendidos.length,
      cancelados: cancelados.length,
      faltas: faltas.length,
      total: comIso.length,
      porStatus: [
        { nome: 'Atendido', valor: atendidos.length },
        { nome: 'Cancelado', valor: cancelados.length },
        { nome: 'Faltou', valor: faltas.length },
        {
          nome: 'Demais',
          valor: comIso.length - atendidos.length - cancelados.length - faltas.length,
        },
      ],
      evolucao: pontos.map((ponto) => ({
        periodo: ponto.label,
        realizados: atendidos.filter((item) => ponto.testa(item.iso)).length,
        cancelados: cancelados.filter((item) => ponto.testa(item.iso)).length,
        faltas: faltas.filter((item) => ponto.testa(item.iso)).length,
      })),
    },
    inadimplencia: {
      total: arredondarDinheiro([...inadimplentesMap.values()].reduce((soma, item) => soma + item.valor, 0)),
      quantidade: quantidadeAtrasadas,
      pacientes: [...inadimplentesMap.values()].sort((a, b) => b.valor - a.valor),
    },
    pacientes: {
      novos: novos.length,
      recorrentes,
      evolucao: pontos.map((ponto) => ({
        periodo: ponto.label,
        novos: novos.filter((item) => ponto.testa(item.iso)).length,
        recorrentes: atendidos.filter((item) => ponto.testa(item.iso) && !idsNovos.has(item.pacienteId)).length,
      })),
    },
    produtividade: profissionais
      .map((profissional) => {
        const lista = comIso.filter((item) => item.profissionalId === profissional.id);
        const realizados = lista.filter((item) => item.status === 'atendido');
        const faltou = lista.filter((item) => item.status === 'faltou');
        return {
          id: profissional.id,
          nome: profissional.nome,
          especialidade: profissional.especialidades[0] ?? '—',
          agendamentos: lista.length,
          realizados: realizados.length,
          faltas: faltou.length,
          faturamento: arredondarDinheiro(realizados.reduce((soma, item) => soma + item.valor, 0)),
          ocupacao: lista.length === 0 ? 0 : (realizados.length / lista.length) * 100,
        };
      })
      .sort((a, b) => b.realizados - a.realizados),
    comissoes: {
      total: arredondarDinheiro(comissoesPeriodo.reduce((soma, item) => soma + dinheiro(item.valorComissao), 0)),
      lista: comissoesPeriodo.map((item) => ({
        id: item.id,
        profissionalId: item.profissionalId,
        profissionalNome: item.profissional.nome,
        competencia: item.competencia,
        atendimentos: item.atendimentos,
        faturamentoGerado: dinheiro(item.faturamentoGerado),
        percentual: dinheiro(item.percentual),
        valorComissao: dinheiro(item.valorComissao),
        status: item.status,
        pagoEm: dataCivil(item.pagoEm) ?? undefined,
      })),
    },
    conveniosAtivos,
  };
}
