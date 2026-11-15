import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_USER;
const password = process.env.SQL_PASSWORD;

if (!databaseUrl && (!sqlHost || !sqlDbName || !user || !password)) {
  throw new Error(
    'Set DATABASE_URL, or provide SQL_HOST, SQL_DB_NAME, SQL_USER, and SQL_PASSWORD.'
  );
}

const neonDatabaseUrl = databaseUrl
  ? (() => {
      const url = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
      }
      // Keep schema operations aligned with the app's strict Neon TLS settings.
      url.searchParams.set('sslmode', 'verify-full');
      return url.toString();
    })()
  : undefined;

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: neonDatabaseUrl
    ? { url: neonDatabaseUrl }
    : {
        host: sqlHost!,
        user: user!,
        password: password!,
        database: sqlDbName!,
        ssl: false,
      },
  verbose: true,
});
