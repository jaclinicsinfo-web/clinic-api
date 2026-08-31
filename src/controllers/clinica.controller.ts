import { Request, Response, NextFunction } from 'express';
import { clinicaBodySchema, unidadeBodySchema, unidadeIdParamSchema } from '../validators/clinica.validator';
import {
  atualizarCadastro,
  buscarCadastro,
  buscarLogo,
  cnpjEmUso,
  removerLogo,
  salvarLogo,
} from '../models/clinica.model';
import {
  alterarAtivo,
  atualizarUnidade,
  buscarPorId as buscarUnidadePorId,
  concederAcesso,
  contarAtivas,
  criarUnidade,
  listarPorUsuario,
  nomeJaExiste,
} from '../models/unidade.model';
import { listarIdsAdministradoresAtivos } from '../models/usuario.model';
import { AppError } from '../lib/erros';
import { montarClinica, montarUnidadeMutacao } from '../views/clinica.view';

async function carregarClinica(req: Request) {
  const clinica = await buscarCadastro(req.auth!.clinicaId);
  if (!clinica) {
    throw new AppError(404, 'Clínica não encontrada.');
  }
  return clinica;
}

async function carregarUnidade(req: Request) {
  const { id } = unidadeIdParamSchema.parse(req.params);
  const unidade = await buscarUnidadePorId(id);
  if (!unidade || unidade.clinicaId !== req.auth!.clinicaId) {
    throw new AppError(404, 'Unidade não encontrada.');
  }
  return unidade;
}

async function responderUnidade(req: Request, res: Response, unidade: Awaited<ReturnType<typeof criarUnidade>>) {
  const unidadesSessao = await listarPorUsuario(req.auth!.sub);
  res.json(montarUnidadeMutacao({ unidade, unidadesSessao }));
}

export async function obterClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinica = await carregarClinica(req);
    res.json(montarClinica(clinica));
  } catch (err) {
    next(err);
  }
}

export async function atualizarClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const dados = clinicaBodySchema.parse(req.body);

    if (await cnpjEmUso(dados.cnpj, clinicaId)) {
      throw new AppError(409, 'Já existe uma clínica com este CNPJ.');
    }

    const atualizada = await atualizarCadastro(clinicaId, {
      nomeFantasia: dados.nomeFantasia,
      razaoSocial: dados.razaoSocial,
      cnpj: dados.cnpj,
      telefone: dados.telefone,
      email: dados.email,
      cep: dados.endereco.cep,
      rua: dados.endereco.rua,
      numero: dados.endereco.numero,
      complemento: dados.endereco.complemento,
      bairro: dados.endereco.bairro,
      cidade: dados.endereco.cidade,
      uf: dados.endereco.uf,
    });

    res.json(montarClinica(atualizada));
  } catch (err) {
    next(err);
  }
}

export async function obterLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const logo = await buscarLogo(req.auth!.clinicaId);
    if (!logo) {
      throw new AppError(404, 'A clínica ainda não tem logo.');
    }
    res.setHeader('Content-Type', logo.logoMime);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(logo.logoBytes);
  } catch (err) {
    next(err);
  }
}

export async function enviarLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const arquivo = req.file;
    if (!arquivo) {
      throw new AppError(400, 'Envie um arquivo JPG, PNG ou WebP.');
    }

    const atualizada = await salvarLogo(
      req.auth!.clinicaId,
      arquivo.mimetype,
      new Uint8Array(arquivo.buffer),
    );
    res.json(montarClinica(atualizada));
  } catch (err) {
    next(err);
  }
}

export async function excluirLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const atualizada = await removerLogo(req.auth!.clinicaId);
    res.json(montarClinica(atualizada));
  } catch (err) {
    next(err);
  }
}

export async function criarUnidadeClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const dados = unidadeBodySchema.parse(req.body);

    if (await nomeJaExiste(clinicaId, dados.nome)) {
      throw new AppError(409, 'Já existe uma unidade com este nome.');
    }

    const unidade = await criarUnidade({
      clinicaId,
      nome: dados.nome,
      cidade: dados.cidade,
    });

    const admins = await listarIdsAdministradoresAtivos(clinicaId);
    await concederAcesso(unidade.id, [...new Set([req.auth!.sub, ...admins])]);

    res.status(201);
    await responderUnidade(req, res, unidade);
  } catch (err) {
    next(err);
  }
}

export async function atualizarUnidadeClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const unidade = await carregarUnidade(req);
    const dados = unidadeBodySchema.parse(req.body);

    if (await nomeJaExiste(unidade.clinicaId, dados.nome, unidade.id)) {
      throw new AppError(409, 'Já existe uma unidade com este nome.');
    }

    const atualizada = await atualizarUnidade(unidade.id, {
      nome: dados.nome,
      cidade: dados.cidade,
    });
    await responderUnidade(req, res, atualizada);
  } catch (err) {
    next(err);
  }
}

export async function inativarUnidadeClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const unidade = await carregarUnidade(req);
    if (!unidade.ativo) {
      await responderUnidade(req, res, unidade);
      return;
    }

    const ativas = await contarAtivas(unidade.clinicaId);
    if (ativas <= 1) {
      throw new AppError(400, 'A clínica precisa ter ao menos uma unidade ativa.');
    }

    const atualizada = await alterarAtivo(unidade.id, false);
    await responderUnidade(req, res, atualizada);
  } catch (err) {
    next(err);
  }
}

export async function ativarUnidadeClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const unidade = await carregarUnidade(req);
    const atualizada = unidade.ativo ? unidade : await alterarAtivo(unidade.id, true);
    await responderUnidade(req, res, atualizada);
  } catch (err) {
    next(err);
  }
}
