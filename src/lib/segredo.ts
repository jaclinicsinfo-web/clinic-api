import crypto from 'crypto';
import { env } from '../config/env';

const MASCARA = '••••••••';

function chaveCriptografia(): Buffer {
  const segredo = env.CREDENTIALS_KEY || env.JWT_SECRET;
  return crypto.createHash('sha256').update(segredo).digest();
}

export function cifrarSegredo(texto: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chaveCriptografia(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, cifrado]).toString('base64');
}

export function decifrarSegredo(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const buffer = Buffer.from(payload, 'base64');
    if (buffer.length < 29) return null;
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const cifrado = buffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', chaveCriptografia(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function mascararSegredo(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (valor.length <= 8) return MASCARA;
  return `${valor.slice(0, 4)}${MASCARA}${valor.slice(-4)}`;
}

export function ehValorMascarado(valor: string | null | undefined): boolean {
  if (!valor) return true;
  const texto = valor.trim();
  return texto.length === 0 || texto.includes('•');
}

export function mascararPresente(cifrado: string | null | undefined): string | null {
  return cifrado ? MASCARA : null;
}
