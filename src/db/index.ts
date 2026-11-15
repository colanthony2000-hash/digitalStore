import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    const host = process.env.SQL_HOST;
    const user = process.env.SQL_USER;
    const password = process.env.SQL_PASSWORD;
    const database = process.env.SQL_DB_NAME;

    const missing = databaseUrl
      ? []
      : [
          ['SQL_HOST', host],
          ['SQL_USER', user],
          ['SQL_PASSWORD', password],
          ['SQL_DB_NAME', database],
        ].filter(([, value]) => !value).map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`Missing required database configuration: ${missing.join(', ')}`);
    }

    const max = Number(process.env.SQL_POOL_MAX || 2);
    if (!Number.isInteger(max) || max < 1 || max > 10) {
      throw new Error('SQL_POOL_MAX must be an integer between 1 and 10.');
    }

    global._postgresPool = new Pool({
      ...(databaseUrl
        ? {
            // Normalize Neon URLs to strict hostname/certificate validation even if
            // a copied console URL uses the weaker `sslmode=require` setting.
            connectionString: (() => {
              const url = new URL(databaseUrl);
              if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
                throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
              }
              url.searchParams.set('sslmode', 'verify-full');
              return url.toString();
            })(),
            ssl: { rejectUnauthorized: true },
          }
        : { host, user, password, database }),
      max,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });

export async function checkDatabaseConnection(): Promise<void> {
  await db.execute(sql`SELECT 1`);
}

export async function closeDbPool(): Promise<void> {
  if (global._postgresPool) {
    const currentPool = global._postgresPool;
    global._postgresPool = undefined;
    await currentPool.end();
  }
}
