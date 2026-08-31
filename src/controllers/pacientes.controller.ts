import { Request, Response, NextFunction } from 'express';
import { pacienteBodySchema, pacienteIdParamSchema, PacienteBodyInput } from '../validators/pacientes.validator';
import {
  alterarStatus,
  atualizar,
  buscarPorIdEClinica,
  cpfJaExiste,
  criar,
  listar,
  DadosPaciente,
} from '../models/paciente.model';
import { listarAtivosPorClinica, buscarPorIdEClinica as buscarConvenio } from '../models/convenio.model';
import {
  buscarPorId,
  ehProfissionalSaudeDaClinica,
  listarProfissionaisSaude,
  possuiAcessoUnidade,
} from '../models/usuario.model';
import { NOME_PERFIL_PROFISSIONAL_SAUDE } from '../lib/perfis-padrao';
import { AppError } from '../lib/erros';
import {
  montarDetalhePaciente,
  montarListaPacientes,
  montarOpcoesPacientes,
  montarPaciente,
} from '../views/pacientes.view';

function dataDeIso(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  return new Date(`${valor}T00:00:00.000Z`);
}

async function carregarUsuario(req: Request) {
  const usuario = await buscarPorId(req.auth!.sub);
  if (!usuario || usuario.status !== 'ativo') {
    throw new AppError(401, 'Sessão expirada. Entre novamente.');
  }
  return usuario;
}

function somenteProprios(perfilNome: string) {
  return perfilNome === NOME_PERFIL_PROFISSIONAL_SAUDE;
}

async function carregarNoEscopo(req: Request) {
  const { id } = pacienteIdParamSchema.parse(req.params);
  const clinicaId = req.auth!.clinicaId;
  const usuario = await carregarUsuario(req);
  const paciente = await buscarPorIdEClinica(id, clinicaId);

  if (!paciente) {
    throw new AppError(404, 'Paciente não encontrado.');
  }

  if (somenteProprios(usuario.perfil.nome) && paciente.profissionalPreferidoId !== usuario.id) {
    throw new AppError(404, 'Paciente não encontrado.');
  }

  return { usuario, paciente };
}

async function validarVinculos(
  clinicaId: string,
  convenioId: string | null,
  profissionalPreferidoId: string | null,
) {
  if (convenioId) {
    const convenio = await buscarConvenio(convenioId, clinicaId);
    if (!convenio || convenio.status !== 'ativo') {
      throw new AppError(400, 'Convênio inválido para esta clínica.');
    }
  }

  if (profissionalPreferidoId) {
    const valido = await ehProfissionalSaudeDaClinica(profissionalPreferidoId, clinicaId);
    if (!valido) {
      throw new AppError(400, 'Profissional preferido inválido para esta clínica.');
    }
  }
}

function paraDados(
  clinicaId: string,
  unidadeId: string,
  dados: PacienteBodyInput,
  profissionalPreferidoId: string | null,
): DadosPaciente {
  return {
    clinicaId,
    unidadeId,
    nome: dados.nome,
    cpf: dados.cpf,
    rg: dados.rg,
    dataNascimento: dataDeIso(dados.dataNascimento) as Date,
    sexo: dados.sexo,
    estadoCivil: dados.estadoCivil,
    profissao: dados.profissao,
    telefone: dados.telefone,
    whatsapp: dados.whatsapp,
    email: dados.email,
    cep: dados.endereco.cep,
    rua: dados.endereco.rua,
    numero: dados.endereco.numero,
    complemento: dados.endereco.complemento,
    bairro: dados.endereco.bairro,
    cidade: dados.endereco.cidade,
    uf: dados.endereco.uf,
    convenioId: dados.convenioId,
    numeroCarteirinha: dados.convenioId ? dados.numeroCarteirinha : null,
    validadeCarteirinha: dados.convenioId ? dataDeIso(dados.validadeCarteirinha) : null,
    responsavelNome: dados.responsavel?.nome ?? null,
    responsavelCpf: dados.responsavel?.cpf ?? null,
    responsavelParentesco: dados.responsavel?.parentesco ?? null,
    responsavelTelefone: dados.responsavel?.telefone ?? null,
    alergias: dados.alergias,
    condicoesPreexistentes: dados.condicoesPreexistentes,
    medicacoesEmUso: dados.medicacoesEmUso,
    profissionalPreferidoId,
    formaContatoPreferida: dados.formaContatoPreferida,
    observacoes: dados.observacoes,
    consentimentoLgpd: dados.consentimentoLgpd,
    autorizacaoImagem: dados.autorizacaoImagem,
  };
}

export async function listarPacientes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const usuario = await carregarUsuario(req);
    const escopoProprio = somenteProprios(usuario.perfil.nome);

    const [pacientes, convenios, profissionais] = await Promise.all([
      listar({
        clinicaId,
        profissionalPreferidoId: escopoProprio ? usuario.id : undefined,
      }),
      listarAtivosPorClinica(clinicaId),
      listarProfissionaisSaude(clinicaId),
    ]);

    res.json(
      montarListaPacientes({
        pacientes,
        convenios,
        profissionais,
        somenteProprios: escopoProprio,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function opcoesPacientes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const [convenios, profissionais] = await Promise.all([
      listarAtivosPorClinica(clinicaId),
      listarProfissionaisSaude(clinicaId),
    ]);
    res.json(montarOpcoesPacientes({ convenios, profissionais }));
  } catch (err) {
    next(err);
  }
}

export async function obterPaciente(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { paciente } = await carregarNoEscopo(req);
    res.json(montarDetalhePaciente(paciente));
  } catch (err) {
    next(err);
  }
}

export async function criarPaciente(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const unidadeId = req.auth!.unidadeAtualId;
    if (!unidadeId) {
      throw new AppError(400, 'Selecione uma unidade para continuar.');
    }

    const temAcesso = await possuiAcessoUnidade(req.auth!.sub, unidadeId);
    if (!temAcesso) {
      throw new AppError(403, 'Você não tem acesso a esta unidade.');
    }

    const dados = pacienteBodySchema.parse(req.body);

    if (await cpfJaExiste(clinicaId, dados.cpf)) {
      throw new AppError(409, 'Já existe um paciente com este CPF nesta clínica.');
    }

    await validarVinculos(clinicaId, dados.convenioId, dados.profissionalPreferidoId);

    const criado = await criar(paraDados(clinicaId, unidadeId, dados, dados.profissionalPreferidoId));
    res.status(201).json(montarPaciente(criado));
  } catch (err) {
    next(err);
  }
}

export async function atualizarPaciente(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { usuario, paciente } = await carregarNoEscopo(req);
    const dados = pacienteBodySchema.parse(req.body);

    if (await cpfJaExiste(paciente.clinicaId, dados.cpf, paciente.id)) {
      throw new AppError(409, 'Já existe um paciente com este CPF nesta clínica.');
    }

    const profissionalPreferidoId = somenteProprios(usuario.perfil.nome)
      ? paciente.profissionalPreferidoId
      : dados.profissionalPreferidoId;

    await validarVinculos(paciente.clinicaId, dados.convenioId, profissionalPreferidoId);

    const atualizado = await atualizar(
      paciente.id,
      paraDados(paciente.clinicaId, paciente.unidadeId, dados, profissionalPreferidoId),
    );
    res.json(montarPaciente(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function arquivarPaciente(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { paciente } = await carregarNoEscopo(req);
    if (paciente.status === 'arquivado') {
      res.json(montarPaciente(paciente));
      return;
    }
    const atualizado = await alterarStatus(paciente.id, 'arquivado');
    res.json(montarPaciente(atualizado));
  } catch (err) {
    next(err);
  }
}
