import { randomBytes } from 'crypto';

export const DIAS_ACESSO_GRATUITO = 7;

export function gerarSenhaInicial(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let senha = '';
  for (const byte of bytes) senha += alfabeto[byte % alfabeto.length];
  return senha;
}

export function fimDoAcessoGratuito(aPartirDe = new Date()): Date {
  return new Date(aPartirDe.getTime() + DIAS_ACESSO_GRATUITO * 24 * 60 * 60 * 1000);
}

export function mensagemTrialEncerrado(clinica: {
  tipoAcesso: string;
  trialExpiraEm: Date | null;
}): string | null {
  if (clinica.tipoAcesso !== 'gratuito' || !clinica.trialExpiraEm) return null;
  if (clinica.trialExpiraEm.getTime() > Date.now()) return null;
  return 'O acesso gratuito de 7 dias desta clínica terminou. Assine um plano para continuar.';
}

export function formatarDataAcesso(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(data);
}
