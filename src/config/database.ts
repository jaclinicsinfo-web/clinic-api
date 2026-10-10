import { Prisma, PrismaClient } from '@prisma/client';
import { isDev } from './env';
import { contextoTenant, definirExecutorTransacao } from '../lib/tenant';

const base = new PrismaClient({
  log: isDev ? ['warn', 'error'] : ['error'],
});

function sqlSessaoTenant(ctx: { clinicaId: string | null; modoSistema: boolean }) {
  return Prisma.sql`SELECT set_config('app.clinica_id', ${ctx.clinicaId ?? ''}, true),
                            set_config('app.modo_sistema', ${ctx.modoSistema ? 'on' : ''}, true)`;
}

// Abrir clínica cria unidade, 5 perfis, formas de pagamento e o administrador na mesma transação.
// O padrão de 5s do Prisma fica curto quando o banco responde devagar.
definirExecutorTransacao((fn) =>
  base.$transaction(
    async (tx) => {
      const ctx = contextoTenant.getStore();
      if (ctx) {
        await tx.$executeRaw(sqlSessaoTenant(ctx));
      }
      return fn(tx);
    },
    { maxWait: 10_000, timeout: 20_000 },
  ),
);

const estendido = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const ctx = contextoTenant.getStore();
        if (!ctx) {
          if (isDev) console.warn(`[tenant] query sem contexto: ${model}.${operation}`);
          return query(args);
        }

        const [, resultado] = await base.$transaction([
          base.$executeRaw(sqlSessaoTenant(ctx)),
          query(args),
        ]);
        return resultado;
      },
    },
  },
});

export type ClientePrisma = PrismaClient | Prisma.TransactionClient;

export const prisma = estendido as unknown as PrismaClient;

export async function conectarBanco(): Promise<void> {
  await prisma.$connect();
}

export async function desconectarBanco(): Promise<void> {
  await prisma.$disconnect();
}
