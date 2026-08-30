import { PrismaClient } from '@prisma/client';
import { isDev } from './env';

export const prisma = new PrismaClient({
  log: isDev ? ['warn', 'error'] : ['error'],
});

export async function conectarBanco(): Promise<void> {
  await prisma.$connect();
}

export async function desconectarBanco(): Promise<void> {
  await prisma.$disconnect();
}
