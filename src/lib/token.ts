import { createHash, randomBytes } from 'crypto';

export function gerarTokenOpaco() {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
