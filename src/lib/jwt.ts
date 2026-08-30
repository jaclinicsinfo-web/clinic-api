import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface PayloadToken {
  sub: string;
  email: string;
  perfilId: string;
  clinicaId: string;
  unidadeAtualId: string | null;
}

export function assinarToken(payload: PayloadToken, lembrar = false): string {
  const expiresIn = lembrar ? env.JWT_EXPIRES_IN_LEMBRAR : env.JWT_EXPIRES_IN;
  const options: SignOptions = { expiresIn: expiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verificarToken(token: string): PayloadToken {
  return jwt.verify(token, env.JWT_SECRET) as PayloadToken;
}
