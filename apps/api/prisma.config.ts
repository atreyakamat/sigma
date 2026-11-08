import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Falls back to the local docker-compose database (infrastructure/docker/docker-compose.yml)
// so `prisma generate` (run on postinstall) never fails when no .env is present.
const databaseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://sigma:sigma@localhost:5432/sigma?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
