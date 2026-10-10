import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { AppError } from '../lib/erros';
import { montarErro } from '../views/error.view';
import { isDev } from '../config/env';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json(montarErro('Recurso não encontrado.'));
}

export function tratarErros(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const mensagem = err.issues[0]?.message ?? 'Dados inválidos.';
    res.status(400).json(montarErro(mensagem));
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ ...err.extras, ...montarErro(err.message) });
    return;
  }

  if (
    err instanceof jwt.JsonWebTokenError ||
    err instanceof jwt.TokenExpiredError
  ) {
    res.status(401).json(montarErro('Sessão expirada. Entre novamente.'));
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P1001') {
      res.status(503).json(montarErro('Banco de dados indisponível.'));
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json(montarErro('Registro relacionado inválido.'));
      return;
    }
    if (err.code === 'P2002') {
      const alvo = (err.meta?.target as string[] | undefined)?.join(',') ?? '';
      if (alvo.includes('cnpj')) {
        res.status(409).json(montarErro('Já existe uma clínica com este CNPJ.'));
        return;
      }
      if (alvo.includes('email')) {
        res.status(409).json(montarErro('Já existe uma conta com este e-mail.'));
        return;
      }
      if (alvo.includes('cpf')) {
        res.status(409).json(montarErro('Já existe um cadastro com este CPF nesta clínica.'));
        return;
      }
      if (alvo.includes('nome')) {
        res.status(409).json(montarErro('Já existe um registro com este nome nesta clínica.'));
        return;
      }
      if (alvo.includes('usuarioId')) {
        res.status(409).json(montarErro('Esta conta de login já está vinculada a outro profissional.'));
        return;
      }
      res.status(409).json(montarErro('Registro já existente.'));
      return;
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    res.status(503).json(montarErro('Banco de dados indisponível.'));
    return;
  }

  // Nunca logar senha, token, LANDING_API_KEY nem DATABASE_URL.
  if (isDev) {
    console.error('[erro-nao-tratado]', err);
  } else {
    console.error('[erro-nao-tratado]', err instanceof Error ? err.message : 'erro');
  }

  res.status(500).json(montarErro('Erro interno do servidor.'));
}
