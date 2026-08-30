import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export async function gerarHash(senha: string): Promise<string> {
  return bcrypt.hash(senha, ROUNDS);
}

export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}
