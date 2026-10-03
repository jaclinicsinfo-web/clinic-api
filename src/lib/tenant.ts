import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';

export interface ContextoTenant {
  clinicaId: string | null;
  modoSistema: boolean;
}

export const contextoTenant = new AsyncLocalStorage<ContextoTenant>();

export function comTenant<T>(clinicaId: string, fn: () => Promise<T>): Promise<T> {
  return contextoTenant.run({ clinicaId, modoSistema: false }, fn);
}

export function comoSistema<T>(fn: () => Promise<T>): Promise<T> {
  return contextoTenant.run({ clinicaId: null, modoSistema: true }, fn);
}

type ExecutorTransacao = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;

let executorTransacao: ExecutorTransacao | null = null;

export function definirExecutorTransacao(executor: ExecutorTransacao): void {
  executorTransacao = executor;
}

export function transacao<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!executorTransacao) {
    throw new Error('Executor de transação não configurado.');
  }
  return executorTransacao(fn);
}
