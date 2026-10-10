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

/**
 * Token curto que só abre o pagamento da clínica bloqueada (teste encerrado ou assinatura vencida).
 * Usa outra chave para nunca valer como sessão.
 */
export interface PayloadPagamento {
  sub: string;
  clinicaId: string;
  finalidade: 'pagamento';
}

const SEGREDO_PAGAMENTO = () => `${env.JWT_SECRET}:pagamento`;

export function assinarTokenPagamento(usuarioId: string, clinicaId: string): string {
  const payload: PayloadPagamento = { sub: usuarioId, clinicaId, finalidade: 'pagamento' };
  return jwt.sign(payload, SEGREDO_PAGAMENTO(), { expiresIn: '30m' });
}

export function verificarTokenPagamento(token: string): PayloadPagamento | null {
  try {
    const payload = jwt.verify(token, SEGREDO_PAGAMENTO()) as Partial<PayloadPagamento>;
    if (payload.finalidade !== 'pagamento' || !payload.sub || !payload.clinicaId) return null;
    return { sub: payload.sub, clinicaId: payload.clinicaId, finalidade: 'pagamento' };
  } catch {
    return null;
  }
}
