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

function dinheiroDaEnv(nome: string, padrao = 0): number {
  const bruto = process.env[nome]?.trim();
  if (!bruto) return padrao;
  const valor = Number(bruto.replace(',', '.'));
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error(`Variável de ambiente ${nome} inválida: "${bruto}". Use um valor >= 0.`);
  }
  return Math.round(valor * 10000) / 10000;
}

function ligado(nome: string, padrao: boolean): boolean {
  const bruto = process.env[nome]?.trim().toLowerCase();
  if (!bruto) return padrao;
  return !['off', 'false', '0', 'nao', 'não'].includes(bruto);
}

/** "08-20" → envia das 8h às 20h (horário de São Paulo). */
function janelaDaEnv(nome: string, padrao: { inicio: number; fim: number }) {
  const bruto = process.env[nome]?.trim();
  const partes = bruto?.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!partes) return padrao;
  const inicio = Number(partes[1]);
  const fim = Number(partes[2]);
  if (inicio < 0 || fim > 24 || inicio >= fim) return padrao;
  return { inicio, fim };
}

function origensCors(): string[] {
  const daEnv = (process.env.CORS_ORIGIN ?? 'http://localhost:3000,http://localhost:3002')
    .split(',')
    .map(normalizarOrigem)
    .filter(Boolean);

  const extras = [process.env.FRONTEND_URL, process.env.LANDING_URL]
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
  /** Site público onde a clínica testa ou paga. O sistema interno continua em FRONTEND_URL. */
  LANDING_URL: process.env.LANDING_URL?.trim().replace(/\/+$/, '') || '',
  /** Manual do usuário. Entra no e-mail do teste grátis. */
  MANUAL_URL: process.env.MANUAL_URL?.trim().replace(/\/+$/, '')
    || 'https://clinicapp-manual-tre6pq-8e2016-179-236-238-195.sslip.io',
  CORS_ORIGIN: origensCors(),

  LANDING_API_KEY: requerido('LANDING_API_KEY', process.env.LANDING_API_KEY),

  /** Access token do Mercado Pago. Vazio: o pagamento real fica desligado. */
  MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || '',
  /** Assinatura secreta do webhook (Suas integrações › Webhooks). Preenchida: aviso sem x-signature válido é recusado. */
  MERCADOPAGO_WEBHOOK_SECRET: process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || '',
  /** Só com credencial de vendedor de teste: e-mail da compradora de teste, exigido na cobrança automática. */
  MERCADOPAGO_PAGADOR_TESTE: process.env.MERCADOPAGO_PAGADOR_TESTE?.trim() || '',

  /** Quem emite o recibo de pagamento da assinatura. */
  RECIBO_EMISSOR_NOME: process.env.RECIBO_EMISSOR_NOME?.trim() || 'J.A. Clinics',
  RECIBO_EMISSOR_CNPJ: process.env.RECIBO_EMISSOR_CNPJ?.trim() || '',
  RECIBO_EMISSOR_ENDERECO: process.env.RECIBO_EMISSOR_ENDERECO?.trim() || '',

  /** Fila de e-mails, lembretes e conferência com o Mercado Pago. Padrão: ligado só em produção. */
  TAREFAS_COBRANCA: ligado('TAREFAS_COBRANCA', (process.env.NODE_ENV ?? 'development') === 'production'),
  /** Horário (São Paulo) em que os lembretes de cobrança podem sair. */
  LEMBRETES_JANELA: janelaDaEnv('LEMBRETES_JANELA', { inicio: 8, fim: 20 }),
  /** Cópia dos lembretes de atraso (D+1, D+3, bloqueio) para o e-mail da clínica. */
  EMAIL_COPIA_CLINICA: ligado('EMAIL_COPIA_CLINICA', true),

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
