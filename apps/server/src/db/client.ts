import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

/** Carpeta de migraciones: junto al código en desarrollo y junto a dist/ en producción. */
function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, '../drizzle'), path.resolve(here, '../../drizzle')];
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, 'meta/_journal.json')));
  if (!found) throw new Error('No se encontró la carpeta de migraciones "drizzle"');
  return found;
}

export function openDatabase(databasePath: string): { db: Db; close: () => void } {
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  // WAL rinde mejor en tarjetas SD/SSD de la Raspberry y permite lecturas concurrentes.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return { db, close: () => sqlite.close() };
}
