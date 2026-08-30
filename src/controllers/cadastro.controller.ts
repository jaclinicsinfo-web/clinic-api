import { Request, Response, NextFunction } from 'express';
import { cadastroSchema } from '../validators/cadastro.validator';
import { buscarPorCodigo, usoDaClinica } from '../models/plano.model';
import { buscarPorCnpj, criarCadastroPosCompra } from '../models/clinica.model';
import { buscarPorEmail } from '../models/usuario.model';
import { assinarToken } from '../lib/jwt';
import { AppError } from '../lib/erros';
import { montarCadastro } from '../views/cadastro.view';

export async function cadastrar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
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

    const { clinica, usuario } = await criarCadastroPosCompra({
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

    res.status(200).json(montarCadastro({ token, usuario, unidadeAtualId, uso }));
  } catch (err) {
    next(err);
  }
}
