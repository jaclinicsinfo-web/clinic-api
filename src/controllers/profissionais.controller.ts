import { Request, Response, NextFunction } from 'express';
import { profissionalBodySchema, profissionalIdParamSchema } from '../validators/profissionais.validator';
import {
  alterarStatus,
  atualizar,
  buscarPorIdEClinica,
  cpfJaExiste,
  criar,
  indicadores,
  listarPorClinica,
  pacientesAtendidos,
  usuarioJaVinculado,
} from '../models/profissional.model';
import { idsPertencemAClinica, listarAtivosPorClinica } from '../models/procedimento.model';
import { buscarUsuarioDaClinica, listarUsuariosSaude } from '../models/usuario.model';
import { listarDoProfissional } from '../models/agendamento.model';
import { listarPorProfissional as listarComissoes } from '../models/comissao.model';
import { comissaoResumo } from '../views/financeiro.view';
import { NOME_PERFIL_PROFISSIONAL_SAUDE } from '../lib/perfis-padrao';
import { AppError } from '../lib/erros';
import { temAcessoAoModulo } from '../lib/permissoes';
import { carregarUsuario } from '../lib/escopo';
import { dataDeIso, dinheiro } from '../lib/datas';
import { agendamentoResumo } from '../views/agenda.view';
import {
  montarDetalheProfissional,
  montarListaProfissionais,
  montarOpcoesProfissionais,
  montarProfissional,
} from '../views/profissionais.view';
import { ProfissionalBodyInput } from '../validators/profissionais.validator';
import { DadosProfissional } from '../models/profissional.model';

function inicioFimMesAtual() {
  const agora = new Date();
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0));
  return { inicio, fim };
}

function horasSemanais(grade: { horaInicio: string; horaFim: string }[]) {
  return grade.reduce((total, item) => {
    const [hi, mi] = item.horaInicio.split(':').map(Number);
    const [hf, mf] = item.horaFim.split(':').map(Number);
    return total + (hf * 60 + mf - (hi * 60 + mi)) / 60;
  }, 0);
}

async function carregar(req: Request) {
  const { id } = profissionalIdParamSchema.parse(req.params);
  const profissional = await buscarPorIdEClinica(id, req.auth!.clinicaId);
  if (!profissional) {
    throw new AppError(404, 'Profissional não encontrado.');
  }
  return profissional;
}

async function paraDados(
  clinicaId: string,
  dados: ProfissionalBodyInput,
): Promise<DadosProfissional> {
  if (!(await idsPertencemAClinica(dados.procedimentosHabilitados, clinicaId))) {
    throw new AppError(400, 'Um ou mais procedimentos não pertencem a esta clínica.');
  }

  if (dados.usuarioId) {
    const usuario = await buscarUsuarioDaClinica(dados.usuarioId, clinicaId);
    if (!usuario || usuario.perfil.nome !== NOME_PERFIL_PROFISSIONAL_SAUDE) {
      throw new AppError(400, 'A conta vinculada precisa ser um profissional de saúde ativo desta clínica.');
    }
  }

  return {
    clinicaId,
    usuarioId: dados.usuarioId,
    nome: dados.nome,
    cpf: dados.cpf,
    rg: dados.rg,
    email: dados.email,
    telefone: dados.telefone,
    fotoUrl: dados.fotoUrl,
    especialidades: dados.especialidades,
    conselho: dados.conselho,
    registroConselho: dados.registroConselho,
    tipoVinculo: dados.tipoVinculo,
    formaRemuneracao: dados.formaRemuneracao,
    dataAdmissao: dataDeIso(dados.dataAdmissao) as Date,
    percentualComissao: dados.formaRemuneracao === 'fixo' ? 0 : dados.percentualComissao,
    comissaoPorProcedimento: dados.comissaoPorProcedimento,
    procedimentoIds: dados.procedimentosHabilitados,
    gradeHorarios: dados.gradeHorarios,
    status: dados.status,
  };
}

export async function listarProfissionais(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const usuario = await carregarUsuario(req);
    const profissionais = await listarPorClinica(req.auth!.clinicaId);
    res.json(montarListaProfissionais(profissionais, temAcessoAoModulo(usuario, 'financeiro', 'visualizar')));
  } catch (err) {
    next(err);
  }
}

export async function opcoesProfissionais(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const [procedimentos, usuarios] = await Promise.all([
      listarAtivosPorClinica(clinicaId),
      listarUsuariosSaude(clinicaId),
    ]);

    res.json(
      montarOpcoesProfissionais({
        procedimentos: procedimentos.map((item) => ({
          id: item.id,
          nome: item.nome,
          categoria: item.categoria,
          duracaoPadraoMin: item.duracaoPadraoMin,
          valorParticular: dinheiro(item.valorParticular),
        })),
        usuarios: usuarios.map((item) => ({
          id: item.id,
          nome: item.nome,
          email: item.email,
          ocupado: Boolean(item.profissional),
        })),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function obterProfissional(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profissional = await carregar(req);
    const usuario = await carregarUsuario(req);
    const clinicaId = req.auth!.clinicaId;
    const verFinanceiro = temAcessoAoModulo(usuario, 'financeiro', 'visualizar');
    const { inicio, fim } = inicioFimMesAtual();
    const [indicadoresMes, pacientes, agenda, procedimentos, comissoes] = await Promise.all([
      indicadores(profissional.id, clinicaId, inicio, fim),
      pacientesAtendidos(profissional.id, clinicaId),
      listarDoProfissional(profissional.id, clinicaId),
      listarAtivosPorClinica(clinicaId),
      verFinanceiro ? listarComissoes(profissional.id, clinicaId) : Promise.resolve([]),
    ]);

    const horas = horasSemanais(profissional.gradeHorarios);
    const capacidadeMensalMin = horas * 60 * 4.3;
    const taxaOcupacao =
      capacidadeMensalMin > 0 ? Math.min((indicadoresMes.minutosAgendados / capacidadeMensalMin) * 100, 100) : 0;

    const habilitados = new Set(profissional.procedimentos.map((item) => item.procedimentoId));

    res.json(
      montarDetalheProfissional({
        profissional,
        indicadores: {
          atendimentosMes: indicadoresMes.atendimentosMes,
          agendamentosMes: indicadoresMes.agendamentosMes,
          faturamentoGerado: verFinanceiro ? indicadoresMes.faturamentoGerado : 0,
          taxaOcupacao,
          taxaFaltas: indicadoresMes.taxaFaltas,
          pacientesAtendidos: indicadoresMes.pacientesAtendidos,
          horasSemanais: horas,
        },
        pacientesAtendidos: pacientes,
        agenda: agenda.map(agendamentoResumo),
        procedimentosHabilitados: procedimentos
          .filter((item) => habilitados.has(item.id))
          .map((item) => ({ id: item.id, nome: item.nome })),
        comissoes: comissoes.map(comissaoResumo),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function criarProfissional(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const dados = profissionalBodySchema.parse(req.body);

    if (await cpfJaExiste(clinicaId, dados.cpf)) {
      throw new AppError(409, 'Já existe um profissional com este CPF nesta clínica.');
    }
    if (dados.usuarioId && (await usuarioJaVinculado(dados.usuarioId))) {
      throw new AppError(409, 'Esta conta de login já está vinculada a outro profissional.');
    }

    const criado = await criar(await paraDados(clinicaId, dados));
    res.status(201).json(montarProfissional(criado));
  } catch (err) {
    next(err);
  }
}

export async function atualizarProfissional(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profissional = await carregar(req);
    const dados = profissionalBodySchema.parse(req.body);

    if (await cpfJaExiste(profissional.clinicaId, dados.cpf, profissional.id)) {
      throw new AppError(409, 'Já existe um profissional com este CPF nesta clínica.');
    }
    if (dados.usuarioId && (await usuarioJaVinculado(dados.usuarioId, profissional.id))) {
      throw new AppError(409, 'Esta conta de login já está vinculada a outro profissional.');
    }

    const atualizado = await atualizar(profissional.id, await paraDados(profissional.clinicaId, dados));
    res.json(montarProfissional(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function inativarProfissional(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profissional = await carregar(req);
    if (profissional.status === 'inativo') {
      res.json(montarProfissional(profissional));
      return;
    }
    const atualizado = await alterarStatus(profissional.id, 'inativo');
    res.json(montarProfissional(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function ativarProfissional(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profissional = await carregar(req);
    if (profissional.status === 'ativo') {
      res.json(montarProfissional(profissional));
      return;
    }
    const atualizado = await alterarStatus(profissional.id, 'ativo');
    res.json(montarProfissional(atualizado));
  } catch (err) {
    next(err);
  }
}
