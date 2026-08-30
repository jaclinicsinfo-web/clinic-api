import { execSync } from 'node:child_process';

export function aplicarMigracoes(): void {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
}
