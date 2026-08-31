import { ProfissionalCompleto } from '../models/profissional.model';
import { dataCivil, dinheiro } from '../lib/datas';
import { ESPECIALIDADES } from '../validators/profissionais.validator';

export function profissionalResumo(profissional: { id: string; nome: string }) {
  return { id: profissional.id, nome: profissional.nome };
}

export function profissionalCompleto(profissional: ProfissionalCompleto) {
  return {
    id: profissional.id,
    usuarioId: profissional.usuarioId,
    usuarioNome: profissional.usuario?.nome ?? null,
    nome: profissional.nome,
    cpf: profissional.cpf,
    rg: profissional.rg,
    fotoUrl: profissional.fotoUrl,
    email: profissional.email,
    telefone: profissional.telefone,
    especialidades: profissional.especialidades,
    conselho: profissional.conselho,
    registroConselho: profissional.registroConselho,
    tipoVinculo: profissional.tipoVinculo,
    formaRemuneracao: profissional.formaRemuneracao,
    dataAdmissao: dataCivil(profissional.dataAdmissao) ?? '',
    percentualComissao: dinheiro(profissional.percentualComissao),
    comissaoPorProcedimento: profissional.comissaoPorProcedimento,
    procedimentosHabilitados: profissional.procedimentos.map((item) => item.procedimentoId),
    gradeHorarios: profissional.gradeHorarios.map((item) => ({
      diaSemana: item.diaSemana as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      horaInicio: item.horaInicio,
      horaFim: item.horaFim,
    })),
    status: profissional.status,
    criadoEm: profissional.criadoEm.toISOString(),
  };
}

export function montarListaProfissionais(profissionais: ProfissionalCompleto[]) {
  const comissionados = profissionais.filter((item) => Number(item.percentualComissao) > 0);
  return {
    profissionais: profissionais.map(profissionalCompleto),
    especialidades: [...ESPECIALIDADES],
    resumo: {
      total: profissionais.length,
      ativos: profissionais.filter((item) => item.status === 'ativo').length,
      especialidades: new Set(profissionais.flatMap((item) => item.especialidades)).size,
      comissaoMedia:
        comissionados.length === 0
          ? 0
          : comissionados.reduce((total, item) => total + Number(item.percentualComissao), 0) /
            comissionados.length,
    },
  };
}

export function montarProfissional(profissional: ProfissionalCompleto) {
  return { profissional: profissionalCompleto(profissional) };
}

export function montarOpcoesProfissionais(params: {
  procedimentos: {
    id: string;
    nome: string;
    categoria: string;
    duracaoPadraoMin: number;
    valorParticular: number;
  }[];
  usuarios: { id: string; nome: string; email: string; ocupado: boolean }[];
}) {
  return {
    procedimentos: params.procedimentos,
    usuarios: params.usuarios,
    especialidades: [...ESPECIALIDADES],
  };
}

export function montarDetalheProfissional(params: {
  profissional: ProfissionalCompleto;
  indicadores: {
    atendimentosMes: number;
    agendamentosMes: number;
    faturamentoGerado: number;
    taxaOcupacao: number;
    taxaFaltas: number;
    pacientesAtendidos: number;
    horasSemanais: number;
  };
  pacientesAtendidos: {
    id: string;
    nome: string;
    telefone: string;
    convenio: string;
    status: string;
    atendimentos: number;
    ultimaVisita: string | null;
  }[];
  agenda: unknown[];
  procedimentosHabilitados: { id: string; nome: string }[];
  comissoes?: unknown[];
}) {
  return {
    profissional: profissionalCompleto(params.profissional),
    indicadores: params.indicadores,
    pacientesAtendidos: params.pacientesAtendidos,
    agenda: params.agenda,
    procedimentosHabilitados: params.procedimentosHabilitados,
    comissoes: params.comissoes ?? [],
  };
}
