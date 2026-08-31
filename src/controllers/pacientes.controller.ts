import { Request, Response, NextFunction } from 'express';
import { pacienteBodySchema, pacienteIdParamSchema, PacienteBodyInput } from '../validators/pacientes.validator';
import { atendimentoBodySchema, documentoOrigemSchema } from '../validators/prontuario.validator';
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
  ehProfissionalAtivoDaClinica,
  listarAtivosPorClinica as listarProfissionaisAtivos,
} from '../models/profissional.model';
import { datasPorPacientes, listarDoPaciente } from '../models/agendamento.model';
import {
  buscarAcompanhamento,
  criarAcompanhamento,
  criarAtendimento,
  encerrarAcompanhamento,
  listarAcompanhamentos,
  listarAtendimentos,
  registrarAcessoProntuario,
} from '../models/prontuario.model';
import {
  buscarPorId as buscarDocumento,
  criar as criarDocumento,
  listarPorPaciente as listarDocumentos,
  remover as removerDocumento,
} from '../models/documento-paciente.model';
import { listarAtivosPorClinica as listarProcedimentosAtivos } from '../models/procedimento.model';
import { possuiAcessoUnidade } from '../models/usuario.model';
import {
  carregarContextoClinico,
  carregarUsuario,
  podeRegistrarProntuario,
  podeVerProntuario,
} from '../lib/escopo';
import { AppError } from '../lib/erros';
import { dataCivil, dataDeIso, hojeCivil } from '../lib/datas';
import { agendamentoResumo } from '../views/agenda.view';
import { acompanhamentoResumo, atendimentoResumo, documentoResumo } from '../views/prontuario.view';
import {
  montarDetalhePaciente,
  montarListaPacientes,
  montarOpcoesPacientes,
  montarPaciente,
} from '../views/pacientes.view';

async function carregarNoEscopo(req: Request) {
  const { id } = pacienteIdParamSchema.parse(req.params);
  const clinicaId = req.auth!.clinicaId;
  const { usuario, profissional, somenteProprios, profissionalIdEscopo } = await carregarContextoClinico(req);
  const paciente = await buscarPorIdEClinica(id, clinicaId);

  if (!paciente) {
    throw new AppError(404, 'Paciente não encontrado.');
  }

  if (somenteProprios) {
    if (!profissionalIdEscopo) {
      throw new AppError(404, 'Paciente não encontrado.');
    }
    const naAgenda = (await listarDoPaciente(paciente.id, clinicaId)).some(
      (item) => item.profissionalId === profissionalIdEscopo,
    );
    if (paciente.profissionalPreferidoId !== profissionalIdEscopo && !naAgenda) {
      throw new AppError(404, 'Paciente não encontrado.');
    }
  }

  return { usuario, profissional, paciente, somenteProprios, profissionalIdEscopo };
}

async function validarVinculos(
  clinicaId: string,
  convenioId: string | null,
  profissionalPreferidoId: string | null,
  atuais?: { convenioId: string | null; profissionalPreferidoId: string | null },
) {
  if (convenioId && convenioId !== atuais?.convenioId) {
    const convenio = await buscarConvenio(convenioId, clinicaId);
    if (!convenio || convenio.status !== 'ativo') {
      throw new AppError(400, 'Convênio inválido para esta clínica.');
    }
  }

  if (profissionalPreferidoId && profissionalPreferidoId !== atuais?.profissionalPreferidoId) {
    const valido = await ehProfissionalAtivoDaClinica(profissionalPreferidoId, clinicaId);
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
    const { somenteProprios, profissionalIdEscopo } = await carregarContextoClinico(req);

    if (somenteProprios && !profissionalIdEscopo) {
      res.json(
        montarListaPacientes({
          pacientes: [],
          convenios: [],
          profissionais: [],
          somenteProprios: true,
        }),
      );
      return;
    }

    const [pacientes, convenios, profissionais] = await Promise.all([
      listar({
        clinicaId,
        profissionalId: profissionalIdEscopo ?? undefined,
      }),
      listarAtivosPorClinica(clinicaId),
      listarProfissionaisAtivos(clinicaId),
    ]);

    const agendaPorPaciente = await datasPorPacientes(
      clinicaId,
      pacientes.map((item) => item.id),
    );

    res.json(
      montarListaPacientes({
        pacientes,
        convenios,
        profissionais,
        somenteProprios,
        agendaPorPaciente,
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
      listarProfissionaisAtivos(clinicaId),
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
    const { usuario, paciente } = await carregarNoEscopo(req);
    const clinicaId = paciente.clinicaId;
    const verProntuario = podeVerProntuario(usuario.perfil.nome);
    const registrar = podeRegistrarProntuario(usuario.perfil.nome);

    const [agendamentos, acompanhamentos, atendimentos, documentos, agendaMap] = await Promise.all([
      listarDoPaciente(paciente.id, clinicaId),
      verProntuario ? listarAcompanhamentos(paciente.id, clinicaId) : Promise.resolve([]),
      verProntuario ? listarAtendimentos(paciente.id, clinicaId) : Promise.resolve([]),
      verProntuario ? listarDocumentos(paciente.id, clinicaId) : Promise.resolve([]),
      datasPorPacientes(clinicaId, [paciente.id]),
    ]);

    if (verProntuario) {
      await registrarAcessoProntuario({
        clinicaId,
        pacienteId: paciente.id,
        usuarioId: usuario.id,
        acao: 'visualizar',
      });
    }

    const hoje = hojeCivil();
    const futuros = new Set(['agendado', 'confirmado', 'check_in', 'em_atendimento']);
    const proximos = agendamentos
      .filter((item) => futuros.has(item.status) && (dataCivil(item.data) ?? '') >= hoje)
      .sort((a, b) => `${dataCivil(a.data)}${a.horaInicio}`.localeCompare(`${dataCivil(b.data)}${b.horaInicio}`));

    res.json(
      montarDetalhePaciente({
        paciente,
        agenda: agendaMap.get(paciente.id),
        proximosAgendamentos: proximos.map(agendamentoResumo),
        atendimentos: atendimentos.map((item) => atendimentoResumo(item, paciente.id)),
        acompanhamentos: acompanhamentos.map(acompanhamentoResumo),
        agendamentos: agendamentos.map(agendamentoResumo),
        documentos: documentos.map((item) => documentoResumo(item, paciente.id)),
        podeVerProntuario: verProntuario,
        podeRegistrarProntuario: registrar,
      }),
    );
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
    const { somenteProprios, paciente } = await carregarNoEscopo(req);
    const dados = pacienteBodySchema.parse(req.body);

    if (await cpfJaExiste(paciente.clinicaId, dados.cpf, paciente.id)) {
      throw new AppError(409, 'Já existe um paciente com este CPF nesta clínica.');
    }

    const profissionalPreferidoId = somenteProprios
      ? paciente.profissionalPreferidoId
      : dados.profissionalPreferidoId;

    await validarVinculos(paciente.clinicaId, dados.convenioId, profissionalPreferidoId, {
      convenioId: paciente.convenioId,
      profissionalPreferidoId: paciente.profissionalPreferidoId,
    });

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

export async function registrarEvolucao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { usuario, paciente, profissionalIdEscopo, somenteProprios } = await carregarNoEscopo(req);
    if (!podeRegistrarProntuario(usuario.perfil.nome)) {
      throw new AppError(403, 'Você não tem permissão para registrar no prontuário.');
    }

    const dados = atendimentoBodySchema.parse(req.body);
    const profissionalId = somenteProprios && profissionalIdEscopo ? profissionalIdEscopo : dados.profissionalId;

    if (!(await ehProfissionalAtivoDaClinica(profissionalId, paciente.clinicaId))) {
      throw new AppError(400, 'Profissional inválido para esta clínica.');
    }

    let acompanhamentoId = dados.acompanhamentoId;
    if (acompanhamentoId) {
      const acompanhamento = await buscarAcompanhamento(acompanhamentoId, paciente.clinicaId);
      if (!acompanhamento || acompanhamento.pacienteId !== paciente.id) {
        throw new AppError(400, 'Acompanhamento inválido para este paciente.');
      }
      if (acompanhamento.status === 'alta') {
        throw new AppError(400, 'Este acompanhamento já foi encerrado.');
      }
    } else if (dados.tipoRegistro === 'avaliacao_inicial') {
      const criadoAcomp = await criarAcompanhamento({
        clinicaId: paciente.clinicaId,
        pacienteId: paciente.id,
        profissionalId,
        especialidade: dados.especialidade ?? 'Clínica Geral',
        titulo: dados.titulo ?? dados.procedimentoRealizado,
        queixaInicial: dados.queixaPrincipal ?? dados.evolucao.slice(0, 180),
        quadroInicial: dados.quadroClinico,
        objetivo: dados.objetivo,
        inicioEm: dataDeIso(hojeCivil()) as Date,
      });
      acompanhamentoId = criadoAcomp.id;
    }

    const atendimento = await criarAtendimento({
      clinicaId: paciente.clinicaId,
      agendamentoId: dados.agendamentoId,
      acompanhamentoId,
      pacienteId: paciente.id,
      profissionalId,
      data: dataDeIso(hojeCivil()) as Date,
      procedimentoRealizado: dados.procedimentoRealizado,
      tipoRegistro: dados.tipoRegistro,
      queixaPrincipal: dados.queixaPrincipal,
      quadroClinico: dados.quadroClinico,
      evolucao: dados.evolucao,
      conduta: dados.conduta,
      respostaAoTratamento:
        dados.tipoRegistro === 'alta' ? 'resolvido' : (dados.respostaAoTratamento ?? null),
      escalaDor: dados.escalaDor,
      proximoRetornoSugerido: dataDeIso(dados.proximoRetornoSugerido),
      criadoPorId: usuario.id,
    });

    if (dados.tipoRegistro === 'alta' && acompanhamentoId) {
      await encerrarAcompanhamento(acompanhamentoId, {
        altaEm: dataDeIso(hojeCivil()) as Date,
        resumoAlta: dados.quadroClinico,
      });
    }

    await registrarAcessoProntuario({
      clinicaId: paciente.clinicaId,
      pacienteId: paciente.id,
      usuarioId: usuario.id,
      acao: 'registrar',
    });

    const [acompanhamentos, atendimentos] = await Promise.all([
      listarAcompanhamentos(paciente.id, paciente.clinicaId),
      listarAtendimentos(paciente.id, paciente.clinicaId),
    ]);

    res.status(201).json({
      atendimento: atendimentoResumo(atendimento, paciente.id),
      acompanhamentos: acompanhamentos.map(acompanhamentoResumo),
      atendimentos: atendimentos.map((item) => atendimentoResumo(item, paciente.id)),
    });
  } catch (err) {
    next(err);
  }
}

export async function enviarDocumento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { usuario, paciente } = await carregarNoEscopo(req);
    if (!podeRegistrarProntuario(usuario.perfil.nome)) {
      throw new AppError(403, 'Você não tem permissão para anexar documentos clínicos.');
    }

    const arquivo = req.file;
    if (!arquivo) {
      throw new AppError(400, 'Envie um arquivo PDF, JPG ou PNG.');
    }

    const { origem } = documentoOrigemSchema.parse(req.body);
    const documento = await criarDocumento({
      clinicaId: paciente.clinicaId,
      pacienteId: paciente.id,
      nome: arquivo.originalname,
      tipo: arquivo.mimetype,
      origem,
      mimeType: arquivo.mimetype,
      tamanhoKb: Math.max(1, Math.round(arquivo.size / 1024)),
      conteudo: new Uint8Array(arquivo.buffer),
      criadoPorId: usuario.id,
    });

    await registrarAcessoProntuario({
      clinicaId: paciente.clinicaId,
      pacienteId: paciente.id,
      usuarioId: usuario.id,
      acao: 'anexo',
    });

    res.status(201).json({ documento: documentoResumo(documento, paciente.id) });
  } catch (err) {
    next(err);
  }
}

export async function baixarDocumento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { usuario, paciente } = await carregarNoEscopo(req);
    if (!podeVerProntuario(usuario.perfil.nome)) {
      throw new AppError(403, 'Você não tem permissão para acessar documentos clínicos.');
    }

    const { docId } = req.params as { docId: string };
    const documento = await buscarDocumento(docId, paciente.id, paciente.clinicaId);
    if (!documento) {
      throw new AppError(404, 'Documento não encontrado.');
    }

    res.setHeader('Content-Type', documento.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(documento.nome)}"`,
    );
    res.send(Buffer.from(documento.conteudo));
  } catch (err) {
    next(err);
  }
}

export async function excluirDocumento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { usuario, paciente } = await carregarNoEscopo(req);
    if (!podeRegistrarProntuario(usuario.perfil.nome)) {
      throw new AppError(403, 'Você não tem permissão para excluir documentos clínicos.');
    }

    const { docId } = req.params as { docId: string };
    const documento = await buscarDocumento(docId, paciente.id, paciente.clinicaId);
    if (!documento) {
      throw new AppError(404, 'Documento não encontrado.');
    }
    await removerDocumento(documento.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function opcoesClinicasPaciente(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { paciente } = await carregarNoEscopo(req);
    const [profissionais, procedimentos] = await Promise.all([
      listarProfissionaisAtivos(paciente.clinicaId),
      listarProcedimentosAtivos(paciente.clinicaId),
    ]);
    res.json({
      profissionais: profissionais.map((item) => ({ id: item.id, nome: item.nome })),
      procedimentos: procedimentos.map((item) => ({ id: item.id, nome: item.nome })),
    });
  } catch (err) {
    next(err);
  }
}
