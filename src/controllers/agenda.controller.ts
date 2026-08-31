import { Request, Response, NextFunction } from 'express';
import {
  agendamentoBodySchema,
  agendamentoStatusSchema,
  agendaQuerySchema,
  bloqueioBodySchema,
  esperaBodySchema,
  FLUXO_STATUS,
  idParamSchema,
  reagendarSchema,
  STATUS_AGENDAMENTO,
} from '../validators/agenda.validator';
import {
  alterarStatus,
  atualizar,
  buscarBloqueio,
  buscarEspera,
  buscarPorIdEClinica,
  criar,
  criarBloqueio,
  criarEspera,
  horarioOcupado,
  listar,
  listarBloqueios,
  listarEspera,
  marcarEsperaEncaixada,
  marcarLembrete,
  reagendar,
  removerBloqueio,
  removerEspera,
} from '../models/agendamento.model';
import { buscarPorIdEClinica as buscarPaciente, listarResumoAgenda } from '../models/paciente.model';
import {
  buscarPorIdEClinica as buscarProfissional,
  ehProfissionalAtivoDaClinica,
  listarAtivosPorClinica as listarProfissionaisAtivos,
} from '../models/profissional.model';
import { buscarPorIdEClinica as buscarProcedimento, listarAtivosPorClinica as listarProcedimentosAtivos } from '../models/procedimento.model';
import { buscarPorIdEClinica as buscarConvenio, listarAtivosPorClinica as listarConveniosAtivos } from '../models/convenio.model';
import { possuiAcessoUnidade } from '../models/usuario.model';
import { carregarContextoClinico, exigirProfissionalVinculado, exigirUnidade } from '../lib/escopo';
import { AppError } from '../lib/erros';
import { dataCivil, dataDeIso, dinheiro, hojeCivil } from '../lib/datas';
import { profissionalCompleto } from '../views/profissionais.view';
import { procedimentoResumo } from '../views/procedimentos.view';
import {
  montarAgenda,
  montarAgendamento,
  montarBloqueio,
  montarEspera,
} from '../views/agenda.view';

function periodoPadrao(de?: string, ate?: string) {
  const hoje = hojeCivil();
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const inicioMesAnterior = dataDeIso(
    `${mes === 1 ? ano - 1 : ano}-${String(mes === 1 ? 12 : mes - 1).padStart(2, '0')}-01`,
  ) as Date;
  const ultimoDiaMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const fimMes = dataDeIso(`${hoje.slice(0, 7)}-${String(ultimoDiaMes).padStart(2, '0')}`) as Date;
  return {
    de: dataDeIso(de) ?? inicioMesAnterior,
    ate: dataDeIso(ate) ?? fimMes,
  };
}

async function carregarAgendamento(req: Request, profissionalIdEscopo: string | null) {
  const { id } = idParamSchema.parse(req.params);
  const agendamento = await buscarPorIdEClinica(id, req.auth!.clinicaId);
  if (!agendamento) {
    throw new AppError(404, 'Agendamento não encontrado.');
  }
  if (profissionalIdEscopo && agendamento.profissionalId !== profissionalIdEscopo) {
    throw new AppError(404, 'Agendamento não encontrado.');
  }
  return agendamento;
}

async function calcularValor(params: {
  clinicaId: string;
  procedimentoId: string;
  convenioId: string | null;
  particular: boolean;
}) {
  const procedimento = await buscarProcedimento(params.procedimentoId, params.clinicaId);
  if (!procedimento || procedimento.status !== 'ativo') {
    throw new AppError(400, 'Procedimento inválido para esta clínica.');
  }
  if (params.particular || !params.convenioId) {
    return { procedimento, valor: dinheiro(procedimento.valorParticular) };
  }
  const daTabela = procedimento.valoresConvenio.find((item) => item.convenioId === params.convenioId);
  return { procedimento, valor: daTabela ? dinheiro(daTabela.valor) : dinheiro(procedimento.valorParticular) };
}

async function validarAgendamento(params: {
  clinicaId: string;
  pacienteId: string;
  profissionalId: string;
  procedimentoId: string;
  convenioId: string | null;
  particular: boolean;
  data: Date;
  horaInicio: string;
  horaFim: string;
  excetoId?: string;
  profissionalIdEscopo: string | null;
}) {
  if (params.profissionalIdEscopo && params.profissionalId !== params.profissionalIdEscopo) {
    throw new AppError(403, 'Você só pode operar a própria agenda.');
  }

  const paciente = await buscarPaciente(params.pacienteId, params.clinicaId);
  if (!paciente || paciente.status === 'arquivado') {
    throw new AppError(400, 'Paciente inválido para esta clínica.');
  }

  const profissional = await buscarProfissional(params.profissionalId, params.clinicaId);
  if (!profissional || profissional.status !== 'ativo') {
    throw new AppError(400, 'Profissional inválido para esta clínica.');
  }

  const habilitados = profissional.procedimentos.map((item) => item.procedimentoId);
  if (habilitados.length > 0 && !habilitados.includes(params.procedimentoId)) {
    throw new AppError(400, 'Este profissional não realiza o procedimento selecionado.');
  }

  if (!params.particular && params.convenioId) {
    const convenio = await buscarConvenio(params.convenioId, params.clinicaId);
    if (!convenio || convenio.status !== 'ativo') {
      throw new AppError(400, 'Convênio inválido para esta clínica.');
    }
  }

  const ocupado = await horarioOcupado({
    clinicaId: params.clinicaId,
    profissionalId: params.profissionalId,
    data: params.data,
    horaInicio: params.horaInicio,
    horaFim: params.horaFim,
    excetoId: params.excetoId,
  });
  if (ocupado) {
    throw new AppError(409, 'Já existe um agendamento ou bloqueio neste horário.');
  }

  return calcularValor({
    clinicaId: params.clinicaId,
    procedimentoId: params.procedimentoId,
    convenioId: params.particular ? null : params.convenioId,
    particular: params.particular,
  });
}

export async function obterAgenda(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const { profissional, somenteProprios, profissionalIdEscopo } = await carregarContextoClinico(req);
    const query = agendaQuerySchema.parse(req.query);
    const periodo = periodoPadrao(query.de, query.ate);

    if (somenteProprios && !profissionalIdEscopo) {
      res.json(
        montarAgenda({
          agendamentos: [],
          bloqueios: [],
          listaEspera: [],
          profissionais: [],
          procedimentos: [],
          convenios: [],
          pacientes: [],
          somenteProprios: true,
          meuProfissionalId: null,
        }),
      );
      return;
    }

    const filtro = {
      clinicaId,
      de: periodo.de,
      ate: periodo.ate,
      profissionalId: profissionalIdEscopo ?? undefined,
    };

    const [agendamentos, bloqueios, listaEspera, profissionais, procedimentos, convenios, pacientes] =
      await Promise.all([
        listar(filtro),
        listarBloqueios(filtro),
        listarEspera(clinicaId, profissionalIdEscopo ?? undefined),
        profissionalIdEscopo && profissional ? [profissional] : listarProfissionaisAtivos(clinicaId),
        listarProcedimentosAtivos(clinicaId),
        listarConveniosAtivos(clinicaId),
        listarResumoAgenda(clinicaId, profissionalIdEscopo ?? undefined),
      ]);

    res.json(
      montarAgenda({
        agendamentos,
        bloqueios,
        listaEspera,
        profissionais: (Array.isArray(profissionais) ? profissionais : [profissionais]).map(profissionalCompleto),
        procedimentos: procedimentos.map(procedimentoResumo),
        convenios,
        pacientes: pacientes.map((item) => ({
          ...item,
          dataNascimento: dataCivil(item.dataNascimento),
        })),
        somenteProprios,
        meuProfissionalId: profissionalIdEscopo,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function criarAgendamento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const unidadeId = exigirUnidade(req);
    const { profissionalIdEscopo, somenteProprios } = await carregarContextoClinico(req);
    exigirProfissionalVinculado(somenteProprios, profissionalIdEscopo);

    if (!(await possuiAcessoUnidade(req.auth!.sub, unidadeId))) {
      throw new AppError(403, 'Você não tem acesso a esta unidade.');
    }

    const dados = agendamentoBodySchema.parse(req.body);
    const data = dataDeIso(dados.data) as Date;
    const { valor } = await validarAgendamento({
      clinicaId,
      pacienteId: dados.pacienteId,
      profissionalId: dados.profissionalId,
      procedimentoId: dados.procedimentoId,
      convenioId: dados.convenioId,
      particular: dados.particular,
      data,
      horaInicio: dados.horaInicio,
      horaFim: dados.horaFim,
      profissionalIdEscopo,
    });

    const criado = await criar({
      clinicaId,
      unidadeId,
      pacienteId: dados.pacienteId,
      profissionalId: dados.profissionalId,
      procedimentoId: dados.procedimentoId,
      data,
      horaInicio: dados.horaInicio,
      horaFim: dados.horaFim,
      sala: dados.sala,
      convenioId: dados.particular ? null : dados.convenioId,
      particular: dados.particular,
      valor,
      status: dados.status,
      observacoes: dados.observacoes,
      criadoPorId: req.auth!.sub,
    });
    res.status(201).json(montarAgendamento(criado));
  } catch (err) {
    next(err);
  }
}

export async function atualizarAgendamento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { profissionalIdEscopo, somenteProprios } = await carregarContextoClinico(req);
    exigirProfissionalVinculado(somenteProprios, profissionalIdEscopo);
    const agendamento = await carregarAgendamento(req, profissionalIdEscopo);
    const dados = agendamentoBodySchema.parse(req.body);
    const data = dataDeIso(dados.data) as Date;

    const { valor } = await validarAgendamento({
      clinicaId: agendamento.clinicaId,
      pacienteId: dados.pacienteId,
      profissionalId: dados.profissionalId,
      procedimentoId: dados.procedimentoId,
      convenioId: dados.convenioId,
      particular: dados.particular,
      data,
      horaInicio: dados.horaInicio,
      horaFim: dados.horaFim,
      excetoId: agendamento.id,
      profissionalIdEscopo,
    });

    const atualizado = await atualizar(agendamento.id, {
      pacienteId: dados.pacienteId,
      profissionalId: dados.profissionalId,
      procedimentoId: dados.procedimentoId,
      data,
      horaInicio: dados.horaInicio,
      horaFim: dados.horaFim,
      sala: dados.sala,
      convenioId: dados.particular ? null : dados.convenioId,
      particular: dados.particular,
      valor,
      status: dados.status,
      observacoes: dados.observacoes,
    });
    res.json(montarAgendamento(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function alterarStatusAgendamento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { profissionalIdEscopo, somenteProprios } = await carregarContextoClinico(req);
    exigirProfissionalVinculado(somenteProprios, profissionalIdEscopo);
    const agendamento = await carregarAgendamento(req, profissionalIdEscopo);
    const { status } = agendamentoStatusSchema.parse(req.body);
    const atuais = agendamento.status as (typeof STATUS_AGENDAMENTO)[number];
    const permitidos = FLUXO_STATUS[atuais] ?? [];

    if (!permitidos.includes(status)) {
      throw new AppError(400, 'Essa transição de status não é permitida.');
    }

    const atualizado = await alterarStatus(agendamento.id, status);
    res.json(montarAgendamento(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function reagendarAgendamento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { profissionalIdEscopo, somenteProprios } = await carregarContextoClinico(req);
    exigirProfissionalVinculado(somenteProprios, profissionalIdEscopo);
    const agendamento = await carregarAgendamento(req, profissionalIdEscopo);
    const dados = reagendarSchema.parse(req.body);
    const profissionalId = dados.profissionalId ?? agendamento.profissionalId;
    const data = dataDeIso(dados.data) as Date;

    if (profissionalIdEscopo && profissionalId !== profissionalIdEscopo) {
      throw new AppError(403, 'Você só pode operar a própria agenda.');
    }
    if (!(await ehProfissionalAtivoDaClinica(profissionalId, agendamento.clinicaId))) {
      throw new AppError(400, 'Profissional inválido para esta clínica.');
    }

    const ocupado = await horarioOcupado({
      clinicaId: agendamento.clinicaId,
      profissionalId,
      data,
      horaInicio: dados.horaInicio,
      horaFim: dados.horaFim,
      excetoId: agendamento.id,
    });
    if (ocupado) {
      throw new AppError(409, 'Já existe um agendamento ou bloqueio neste horário.');
    }

    const atualizado = await reagendar(agendamento.id, {
      data,
      horaInicio: dados.horaInicio,
      horaFim: dados.horaFim,
      profissionalId,
    });
    res.json(montarAgendamento(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function marcarLembreteAgendamento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { profissionalIdEscopo, somenteProprios } = await carregarContextoClinico(req);
    exigirProfissionalVinculado(somenteProprios, profissionalIdEscopo);
    const agendamento = await carregarAgendamento(req, profissionalIdEscopo);
    const atualizado = await marcarLembrete(agendamento.id, true);
    res.json(montarAgendamento(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function criarBloqueioAgenda(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const { profissionalIdEscopo, somenteProprios } = await carregarContextoClinico(req);
    exigirProfissionalVinculado(somenteProprios, profissionalIdEscopo);
    const dados = bloqueioBodySchema.parse(req.body);

    if (profissionalIdEscopo && dados.profissionalId !== profissionalIdEscopo) {
      throw new AppError(403, 'Você só pode bloquear a própria agenda.');
    }
    if (!(await ehProfissionalAtivoDaClinica(dados.profissionalId, clinicaId))) {
      throw new AppError(400, 'Profissional inválido para esta clínica.');
    }

    const data = dataDeIso(dados.data) as Date;
    const ocupado = await horarioOcupado({
      clinicaId,
      profissionalId: dados.profissionalId,
      data,
      horaInicio: dados.horaInicio,
      horaFim: dados.horaFim,
    });
    if (ocupado) {
      throw new AppError(409, 'Já existe um agendamento ou bloqueio neste horário.');
    }

    const bloqueio = await criarBloqueio({
      clinicaId,
      profissionalId: dados.profissionalId,
      data,
      horaInicio: dados.horaInicio,
      horaFim: dados.horaFim,
      motivo: dados.motivo,
    });
    res.status(201).json(montarBloqueio(bloqueio));
  } catch (err) {
    next(err);
  }
}

export async function removerBloqueioAgenda(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { profissionalIdEscopo, somenteProprios } = await carregarContextoClinico(req);
    exigirProfissionalVinculado(somenteProprios, profissionalIdEscopo);
    const { id } = idParamSchema.parse(req.params);
    const bloqueio = await buscarBloqueio(id, req.auth!.clinicaId);
    if (!bloqueio) {
      throw new AppError(404, 'Bloqueio não encontrado.');
    }
    if (profissionalIdEscopo && bloqueio.profissionalId !== profissionalIdEscopo) {
      throw new AppError(404, 'Bloqueio não encontrado.');
    }
    await removerBloqueio(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function criarItemEspera(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const unidadeId = exigirUnidade(req);
    const { profissionalIdEscopo, somenteProprios } = await carregarContextoClinico(req);
    exigirProfissionalVinculado(somenteProprios, profissionalIdEscopo);
    const dados = esperaBodySchema.parse(req.body);

    const paciente = await buscarPaciente(dados.pacienteId, clinicaId);
    if (!paciente) {
      throw new AppError(400, 'Paciente inválido para esta clínica.');
    }
    if (profissionalIdEscopo) {
      dados.profissionalId = profissionalIdEscopo;
    }

    if (dados.profissionalId) {
      const profissionalOk = await ehProfissionalAtivoDaClinica(dados.profissionalId, clinicaId);
      if (!profissionalOk) {
        throw new AppError(400, 'Profissional inválido para esta clínica.');
      }
    }

    if (dados.procedimentoId) {
      const procedimento = await buscarProcedimento(dados.procedimentoId, clinicaId);
      if (!procedimento || procedimento.status !== 'ativo') {
        throw new AppError(400, 'Procedimento inválido para esta clínica.');
      }
    }

    const item = await criarEspera({
      clinicaId,
      unidadeId,
      pacienteId: dados.pacienteId,
      profissionalId: dados.profissionalId,
      procedimentoId: dados.procedimentoId,
      preferenciaPeriodo: dados.preferenciaPeriodo,
    });
    res.status(201).json(montarEspera(item));
  } catch (err) {
    next(err);
  }
}

export async function encaixarEspera(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { profissionalIdEscopo, somenteProprios } = await carregarContextoClinico(req);
    exigirProfissionalVinculado(somenteProprios, profissionalIdEscopo);
    const item = await buscarEspera(id, req.auth!.clinicaId);
    if (!item || item.status !== 'aguardando') {
      throw new AppError(404, 'Item da lista de espera não encontrado.');
    }
    if (profissionalIdEscopo && item.profissionalId && item.profissionalId !== profissionalIdEscopo) {
      throw new AppError(404, 'Item da lista de espera não encontrado.');
    }
    const atualizado = await marcarEsperaEncaixada(id);
    res.json(montarEspera(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function removerItemEspera(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { profissionalIdEscopo, somenteProprios } = await carregarContextoClinico(req);
    exigirProfissionalVinculado(somenteProprios, profissionalIdEscopo);
    const item = await buscarEspera(id, req.auth!.clinicaId);
    if (!item) {
      throw new AppError(404, 'Item da lista de espera não encontrado.');
    }
    if (profissionalIdEscopo && item.profissionalId && item.profissionalId !== profissionalIdEscopo) {
      throw new AppError(404, 'Item da lista de espera não encontrado.');
    }
    await removerEspera(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
