import dotenv from 'dotenv';

dotenv.config();

function requerido(nome: string, valor: string | undefined): string {
  if (!valor || valor.trim() === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  }
  return valor;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3001),
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  DATABASE_URL: requerido('DATABASE_URL', process.env.DATABASE_URL),

  JWT_SECRET: requerido('JWT_SECRET', process.env.JWT_SECRET),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '12h',
  JWT_EXPIRES_IN_LEMBRAR: process.env.JWT_EXPIRES_IN_LEMBRAR ?? '7d',

  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  CORS_ORIGIN: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean),

  LANDING_API_KEY: requerido('LANDING_API_KEY', process.env.LANDING_API_KEY),
} as const;

export const isDev = env.NODE_ENV === 'development';
