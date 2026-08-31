import dotenv from 'dotenv';

dotenv.config();

function requerido(nome: string, valor: string | undefined): string {
  if (!valor || valor.trim() === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  }
  return valor;
}

function normalizarOrigem(origem: string): string {
  return origem.trim().replace(/\/+$/, '');
}

const PLANOS = ['essencial', 'profissional', 'ilimitado'] as const;
export type CodigoPlano = (typeof PLANOS)[number];

function planoDaClinica(): CodigoPlano {
  const bruto = (process.env.PLANO ?? 'essencial').trim().toLowerCase();
  if (!PLANOS.includes(bruto as CodigoPlano)) {
    throw new Error(
      `Variável de ambiente PLANO inválida: "${bruto}". Use essencial, profissional ou ilimitado.`,
    );
  }
  return bruto as CodigoPlano;
}

function origensCors(): string[] {
  const daEnv = (process.env.CORS_ORIGIN ?? 'http://localhost:3000,http://localhost:3002')
    .split(',')
    .map(normalizarOrigem)
    .filter(Boolean);

  const extras = [
    process.env.FRONTEND_URL,
    'https://clinic-web-app-q4mc.onrender.com',
  ]
    .filter((origem): origem is string => Boolean(origem && origem.trim()))
    .map(normalizarOrigem);

  return [...new Set([...daEnv, ...extras])];
}

export const env = {
  PORT: Number(process.env.PORT ?? 3001),
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  DATABASE_URL: requerido('DATABASE_URL', process.env.DATABASE_URL),

  JWT_SECRET: requerido('JWT_SECRET', process.env.JWT_SECRET),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '12h',
  JWT_EXPIRES_IN_LEMBRAR: process.env.JWT_EXPIRES_IN_LEMBRAR ?? '7d',

  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  CORS_ORIGIN: origensCors(),

  PLANO: planoDaClinica(),

  LANDING_API_KEY: requerido('LANDING_API_KEY', process.env.LANDING_API_KEY),

  SMTP_HOST: process.env.SMTP_HOST?.trim() || '',
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_USER: process.env.SMTP_USER?.trim() || '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  SMTP_FROM: process.env.SMTP_FROM?.trim() || '',
} as const;

export const isDev = env.NODE_ENV === 'development';
