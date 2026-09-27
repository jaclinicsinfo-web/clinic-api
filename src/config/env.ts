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

function dinheiroDaEnv(nome: string, padrao = 0): number {
  const bruto = process.env[nome]?.trim();
  if (!bruto) return padrao;
  const valor = Number(bruto.replace(',', '.'));
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error(`Variável de ambiente ${nome} inválida: "${bruto}". Use um valor >= 0.`);
  }
  return Math.round(valor * 10000) / 10000;
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
  SMTP_PASS: (process.env.SMTP_PASS ?? '').replace(/\s+/g, ''),
  SMTP_FROM: process.env.SMTP_FROM?.trim() || '',

  API_PUBLIC_URL: process.env.API_PUBLIC_URL?.trim().replace(/\/+$/, '') || '',
  CREDENTIALS_KEY: process.env.CREDENTIALS_KEY?.trim() || '',
  META_GRAPH_VERSION: process.env.META_GRAPH_VERSION?.trim() || 'v21.0',
  INTEGRACOES_INTERVALO_MS: Number(process.env.INTEGRACOES_INTERVALO_MS ?? 60_000),

  /** Tabela de repasse. Definida no deploy — a clínica não edita. */
  CUSTO_WHATSAPP_UTILITY: dinheiroDaEnv('CUSTO_WHATSAPP_UTILITY'),
  CUSTO_WHATSAPP_MARKETING: dinheiroDaEnv('CUSTO_WHATSAPP_MARKETING'),
  CUSTO_WHATSAPP_AUTHENTICATION: dinheiroDaEnv('CUSTO_WHATSAPP_AUTHENTICATION'),
  CUSTO_WHATSAPP_SERVICE: dinheiroDaEnv('CUSTO_WHATSAPP_SERVICE'),
  CUSTO_EMAIL: dinheiroDaEnv('CUSTO_EMAIL'),
} as const;

export const isDev = env.NODE_ENV === 'development';
