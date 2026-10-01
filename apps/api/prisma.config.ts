import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `prisma generate` (postinstall) não conecta ao banco, então o fallback evita quebrar
    // o install num clone novo, sem .env. Comandos que conectam (migrate) falham com a URL fake.
    url: process.env['DATABASE_URL'] ?? 'postgresql://invalid:invalid@localhost:5432/invalid',
  },
});
