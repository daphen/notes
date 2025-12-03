import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

// Use WebSocket connection for proper transaction support
const pool = new Pool({
  connectionString: process.env.NOTES_POSTGRES_URL || process.env.DATABASE_URL!,
});

export const db = drizzle(pool, { schema });
