import path from 'node:path';

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  /** Ruta del fichero SQLite, o ':memory:' en tests. */
  databasePath: string;
  registrationCode: string | null;
  cookieSecure: boolean;
  /** Carpeta con la web compilada; null si no se sirve (modo desarrollo). */
  webDistDir: string | null;
  sessionTtlDays: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(env.DATA_DIR ?? './data');
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    dataDir,
    databasePath: env.DATABASE_PATH ?? path.join(dataDir, 'vtt.db'),
    registrationCode: env.REGISTRATION_CODE?.trim() || null,
    cookieSecure: env.COOKIE_SECURE === 'true',
    webDistDir: env.WEB_DIST_DIR ? path.resolve(env.WEB_DIST_DIR) : null,
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 30),
  };
}
