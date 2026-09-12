import { Request, Response, NextFunction } from 'express';
import {
  baterPontoBodySchema,
  holeriteIdParamSchema,
  holeriteQuerySchema,
  holeriteUploadSchema,
  pontoAtualizacaoSchema,
  pontoBodySchema,
  pontoIdParamSchema,
  pontoQuerySchema,
} from '../validators/rh.validator';
import {
  atualizarRegistroPonto,
  buscarHoleriteArquivo,
  buscarHoleritePorCompetencia,
  buscarPontoDoDia,
  buscarRegistroPonto,
  criarHolerite,
  criarRegistroPonto,
  listarCompetenciasHolerite,
  listarHolerites,
  listarRegistrosPonto,
  listarUsuariosRh,
  removerHolerite,
  removerRegistroPonto,
  usuarioPertenceAClinica,
} from '../models/rh.model';
import { AppError } from '../lib/erros';
import { carregarUsuario, ehAdminOuGestor } from '../lib/escopo';
import { dataCivil, dataDeIso, hojeCivil, horaCivil } from '../lib/datas';
import {
  campoDaBatida,
  competenciaDeData,
  HorariosPonto,
  inicioFimDaCompetencia,
  proximoTipoBatida,
  TipoBatida,
  validarHorariosPonto,
} from '../lib/rh';
import {
  montarHolerite,
  montarListaHolerites,
  montarListaPonto,
  montarRegistroPonto,
  montarVisaoRh,
} from '../views/rh.view';

function exigirData(valor: string, rotulo: string): Date {
  const data = dataDeIso(valor);
  if (!data) {
    throw new AppError(400, `${rotulo} inválida.`);
  }
  return data;
}

function horariosDe(dados: {
  entrada?: string | null;
  saidaIntervalo?: string | null;
  retornoIntervalo?: string | null;
  saida?: string | null;
}): HorariosPonto {
  return {
    entrada: dados.entrada ?? null,
    saidaIntervalo: dados.saidaIntervalo ?? null,
    retornoIntervalo: dados.retornoIntervalo ?? null,
    saida: dados.saida ?? null,
  };
}

function garantirHorarios(horarios: HorariosPonto) {
  const erro = validarHorariosPonto(horarios);
  if (erro) {
    throw new AppError(400, erro);
  }
}

async function garantirUsuarioDaClinica(usuarioId: string, clinicaId: string) {
  const usuario = await usuarioPertenceAClinica(usuarioId, clinicaId);
  if (!usuario) {
    throw new AppError(404, 'Usuário não encontrado.');
  }
  return usuario;
}

async function contextoRh(req: Request) {
  const usuario = await carregarUsuario(req);
  const gestaoCompleta = ehAdminOuGestor(usuario.perfil.nome);
  return {
    usuario,
    gestaoCompleta,
    somenteProprios: !gestaoCompleta,
    usuarioEscopoId: gestaoCompleta ? undefined : usuario.id,
  };
}

function exigirGestaoRh(gestaoCompleta: boolean) {
  if (!gestaoCompleta) {
    throw new AppError(403, 'Apenas administradores e gestores podem gerenciar o ponto e os holerites da clínica.');
  }
}

async function carregarRegistro(req: Request) {
  const { id } = pontoIdParamSchema.parse(req.params);
  const registro = await buscarRegistroPonto(id, req.auth!.clinicaId);
  if (!registro) {
    throw new AppError(404, 'Registro de ponto não encontrado.');
  }
  return registro;
}

function periodoPonto(query: { inicio?: string; fim?: string }) {
  const hoje = hojeCivil();
  const competencia = competenciaDeData(hoje);
  const padrao = inicioFimDaCompetencia(competencia);
  const inicio = query.inicio ?? dataCivil(padrao.inicio) ?? hoje;
  const fim = query.fim ?? dataCivil(padrao.fim) ?? hoje;
  if (inicio > fim) {
    throw new AppError(400, 'A data inicial não pode ser posterior à final.');
  }
  return { inicio, fim, hoje };
}

export async function visaoRh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { usuarioEscopoId, somenteProprios } = await contextoRh(req);
    const clinicaId = req.auth!.clinicaId;
    const hoje = hojeCivil();
    const competencia = competenciaDeData(hoje);
    const dataHoje = exigirData(hoje, 'Data');

    const [usuarios, registrosHoje, holerites] = await Promise.all([
      listarUsuariosRh(clinicaId),
      listarRegistrosPonto({ clinicaId, inicio: dataHoje, fim: dataHoje, usuarioId: usuarioEscopoId }),
      listarHolerites({ clinicaId, usuarioId: usuarioEscopoId }),
    ]);

    const usuariosVisiveis = usuarioEscopoId
      ? usuarios.filter((item) => item.id === usuarioEscopoId)
      : usuarios;

    res.json(
      montarVisaoRh({
        usuarios: usuariosVisiveis,
        registrosHoje,
        holerites,
        competencia,
        hoje,
        somenteProprios,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function listarPonto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { usuarioEscopoId, somenteProprios } = await contextoRh(req);
    const clinicaId = req.auth!.clinicaId;
    const query = pontoQuerySchema.parse(req.query);
    const { inicio, fim, hoje } = periodoPonto(query);

    if (query.usuarioId && usuarioEscopoId && query.usuarioId !== usuarioEscopoId) {
      throw new AppError(403, 'Você só pode consultar o próprio ponto.');
    }

    const [registros, usuarios] = await Promise.all([
      listarRegistrosPonto({
        clinicaId,
        inicio: exigirData(inicio, 'Data inicial'),
        fim: exigirData(fim, 'Data final'),
        usuarioId: usuarioEscopoId ?? query.usuarioId,
      }),
      listarUsuariosRh(clinicaId),
    ]);

    const usuariosVisiveis = usuarioEscopoId
      ? usuarios.filter((item) => item.id === usuarioEscopoId)
      : usuarios;

    res.json(
      montarListaPonto({
        registros,
        usuarios: usuariosVisiveis,
        inicio,
        fim,
        hoje,
        somenteProprios,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function criarPonto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { gestaoCompleta } = await contextoRh(req);
    exigirGestaoRh(gestaoCompleta);
    const auth = req.auth!;
    const dados = pontoBodySchema.parse(req.body);
    await garantirUsuarioDaClinica(dados.usuarioId, auth.clinicaId);

    const horarios = horariosDe(dados);
    garantirHorarios(horarios);

    const data = exigirData(dados.data, 'Data');
    const existente = await buscarPontoDoDia(auth.clinicaId, dados.usuarioId, data);
    if (existente) {
      throw new AppError(409, 'Já existe um registro de ponto para este usuário nesta data.');
    }

    const criado = await criarRegistroPonto({
      clinicaId: auth.clinicaId,
      usuarioId: dados.usuarioId,
      data,
      ...horarios,
      observacao: dados.observacao ?? null,
      origem: dados.usuarioId === auth.sub ? 'proprio' : 'manual',
      registradoPorId: auth.sub,
    });

    res.status(201).json(montarRegistroPonto(criado));
  } catch (err) {
    next(err);
  }
}

export async function baterPonto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = req.auth!;
    const dados = baterPontoBodySchema.parse(req.body);
    const hoje = hojeCivil();
    const data = exigirData(hoje, 'Data');
    const atual = await buscarPontoDoDia(auth.clinicaId, auth.sub, data);
    const horariosAtuais: HorariosPonto = atual
      ? horariosDe(atual)
      : { entrada: null, saidaIntervalo: null, retornoIntervalo: null, saida: null };

    const tipo = (dados.tipo ?? proximoTipoBatida(horariosAtuais)) as TipoBatida | null;
    if (!tipo) {
      throw new AppError(400, 'O ponto de hoje já está completo.');
    }

    const campo = campoDaBatida(tipo);
    if (horariosAtuais[campo]) {
      throw new AppError(409, 'Este horário já foi registrado hoje.');
    }

    const hora = horaCivil();
    const horarios = { ...horariosAtuais, [campo]: hora };
    garantirHorarios(horarios);

    const salvo = atual
      ? await atualizarRegistroPonto(atual.id, {
          ...horarios,
          observacao: atual.observacao,
          origem: 'proprio',
          registradoPorId: auth.sub,
        })
      : await criarRegistroPonto({
          clinicaId: auth.clinicaId,
          usuarioId: auth.sub,
          data,
          ...horarios,
          observacao: null,
          origem: 'proprio',
          registradoPorId: auth.sub,
        });

    res.status(atual ? 200 : 201).json(montarRegistroPonto(salvo));
  } catch (err) {
    next(err);
  }
}

export async function atualizarPonto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { gestaoCompleta } = await contextoRh(req);
    exigirGestaoRh(gestaoCompleta);
    const registro = await carregarRegistro(req);
    const dados = pontoAtualizacaoSchema.parse(req.body);
    const horarios = horariosDe(dados);
    garantirHorarios(horarios);

    const atualizado = await atualizarRegistroPonto(registro.id, {
      ...horarios,
      observacao: dados.observacao ?? null,
      registradoPorId: req.auth!.sub,
    });

    res.json(montarRegistroPonto(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function excluirPonto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { gestaoCompleta } = await contextoRh(req);
    exigirGestaoRh(gestaoCompleta);
    const registro = await carregarRegistro(req);
    await removerRegistroPonto(registro.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listarHoleritesRh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { usuarioEscopoId, somenteProprios } = await contextoRh(req);
    const clinicaId = req.auth!.clinicaId;
    const query = holeriteQuerySchema.parse(req.query);
    const competencia = query.competencia ?? competenciaDeData(hojeCivil());

    if (query.usuarioId && usuarioEscopoId && query.usuarioId !== usuarioEscopoId) {
      throw new AppError(403, 'Você só pode consultar os próprios holerites.');
    }

    const usuarioId = usuarioEscopoId ?? query.usuarioId;

    const [holerites, usuarios, competencias] = await Promise.all([
      listarHolerites({ clinicaId, competencia, usuarioId }),
      listarUsuariosRh(clinicaId),
      listarCompetenciasHolerite(clinicaId, usuarioId),
    ]);

    const competenciasLista = competencias.includes(competencia) ? competencias : [competencia, ...competencias];
    const usuariosVisiveis = usuarioEscopoId
      ? usuarios.filter((item) => item.id === usuarioEscopoId)
      : usuarios;

    res.json(
      montarListaHolerites({
        holerites,
        usuarios: usuariosVisiveis,
        competencias: competenciasLista,
        competencia,
        somenteProprios,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function enviarHolerite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { gestaoCompleta } = await contextoRh(req);
    exigirGestaoRh(gestaoCompleta);
    const auth = req.auth!;
    const dados = holeriteUploadSchema.parse(req.body);
    await garantirUsuarioDaClinica(dados.usuarioId, auth.clinicaId);

    const arquivo = req.file;
    if (!arquivo) {
      throw new AppError(400, 'Envie um arquivo PDF, JPG ou PNG.');
    }

    if (await buscarHoleritePorCompetencia(auth.clinicaId, dados.usuarioId, dados.competencia)) {
      throw new AppError(409, 'Já existe um holerite para este usuário nesta competência.');
    }

    const criado = await criarHolerite({
      clinicaId: auth.clinicaId,
      usuarioId: dados.usuarioId,
      competencia: dados.competencia,
      nomeArquivo: arquivo.originalname,
      mimeType: arquivo.mimetype,
      tamanhoKb: Math.max(1, Math.round(arquivo.size / 1024)),
      conteudo: new Uint8Array(arquivo.buffer),
      criadoPorId: auth.sub,
    });

    res.status(201).json(montarHolerite(criado));
  } catch (err) {
    next(err);
  }
}

export async function baixarHolerite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { usuarioEscopoId } = await contextoRh(req);
    const { id } = holeriteIdParamSchema.parse(req.params);
    const holerite = await buscarHoleriteArquivo(id, req.auth!.clinicaId);
    if (!holerite || (usuarioEscopoId && holerite.usuarioId !== usuarioEscopoId)) {
      throw new AppError(404, 'Holerite não encontrado.');
    }

    res.setHeader('Content-Type', holerite.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(holerite.nomeArquivo)}"`);
    res.send(Buffer.from(holerite.conteudo));
  } catch (err) {
    next(err);
  }
}

export async function excluirHoleriteRh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { gestaoCompleta } = await contextoRh(req);
    exigirGestaoRh(gestaoCompleta);
    const { id } = holeriteIdParamSchema.parse(req.params);
    const holerite = await buscarHoleriteArquivo(id, req.auth!.clinicaId);
    if (!holerite) {
      throw new AppError(404, 'Holerite não encontrado.');
    }
    await removerHolerite(holerite.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
