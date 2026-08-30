import { Request, Response, NextFunction } from 'express';
import { cadastroSchema } from '../validators/cadastro.validator';
import { buscarPorCodigo, usoDaClinica } from '../models/plano.model';
import {
  buscarPorCnpj,
  criarSetupInicial,
  sistemaPrecisaSetup,
} from '../models/clinica.model';
import { buscarPorEmail } from '../models/usuario.model';
import { assinarToken } from '../lib/jwt';
import { AppError } from '../lib/erros';
import { montarSetup, montarStatusSetup } from '../views/setup.view';

export async function status(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const precisaSetup = await sistemaPrecisaSetup();
    res.json(montarStatusSetup(precisaSetup));
  } catch (err) {
    next(err);
  }
}

export async function concluir(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const livre = await sistemaPrecisaSetup();
    if (!livre) {
      throw new AppError(409, 'O sistema já foi configurado. Entre com sua conta.');
    }

    const dados = cadastroSchema.parse(req.body);

    const plano = await buscarPorCodigo(dados.plano);
    if (!plano || !plano.ativo) {
      throw new AppError(400, 'Plano inválido.');
    }

    const cnpjExistente = await buscarPorCnpj(dados.clinica.cnpj);
    if (cnpjExistente) {
      throw new AppError(409, 'Já existe uma clínica com este CNPJ.');
    }

    const emailExistente = await buscarPorEmail(dados.usuario.email);
    if (emailExistente) {
      throw new AppError(409, 'Já existe uma conta com este e-mail.');
    }

    const { clinica, usuario } = await criarSetupInicial({
      planoId: plano.id,
      clinica: dados.clinica,
      unidade: dados.unidade,
      usuario: dados.usuario,
    });

    const unidadeAtualId = usuario.usuarioUnidades[0]?.unidadeId ?? null;

    const token = assinarToken(
      {
        sub: usuario.id,
        email: usuario.email,
        perfilId: usuario.perfilId,
        clinicaId: usuario.clinicaId,
        unidadeAtualId,
      },
      true,
    );

    const uso = await usoDaClinica(clinica.id);

    res.status(201).json(montarSetup({ token, usuario, unidadeAtualId, uso }));
  } catch (err) {
    next(err);
  }
}
