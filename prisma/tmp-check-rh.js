const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.modo_sistema', 'on', true)`;

    const cols = await tx.$queryRawUnsafe(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_name IN ('registros_ponto', 'holerites')
      ORDER BY table_name, ordinal_position
    `);
    console.log(JSON.stringify(cols, null, 2));

    const mig = await tx.$queryRawUnsafe(`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      WHERE migration_name LIKE '%rh%'
         OR migration_name LIKE '%ponto%'
         OR migration_name LIKE '%holerite%'
         OR migration_name LIKE '%20260911%'
    `);
    console.log("migrations", JSON.stringify(mig, null, 2));
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
