import type { Asset } from './schemas/board.js';

/**
 * Panel de rendimiento: qué se considera «pesado» para una Raspberry Pi y para los navegadores
 * de los jugadores. Son umbrales orientativos; se avisa, nunca se bloquea.
 */
export const PERF_LIMITS = {
  /** Una imagen así ya tarda en bajar por wifi y ocupa mucha memoria de vídeo. */
  imageBytes: 5 * 1024 * 1024,
  /** Lado más largo en píxeles: por encima, muchos móviles y tablets no la pintan o van a tirones. */
  imageSide: 6000,
  audioBytes: 15 * 1024 * 1024,
  sceneItems: 400,
  sceneWalls: 1500,
  chatMessages: 5000,
  dbBytes: 300 * 1024 * 1024,
  /** Espacio libre mínimo en la tarjeta o disco donde están los datos. */
  freeBytes: 1024 * 1024 * 1024,
  rssBytes: 1.5 * 1024 * 1024 * 1024,
  /** Temperatura de la CPU (°C) a partir de la que la Pi empieza a bajar la velocidad. */
  cpuTemp: 75,
} as const;

export type PerfLevel = 'ok' | 'warn' | 'bad';

export interface PerfWarning {
  level: Exclude<PerfLevel, 'ok'>;
  text: string;
}

/** Archivo subido que no usa nada de la partida. */
export interface UnusedAsset {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}

export interface PerformanceReport {
  server: {
    /** Memoria que usa el servidor (bytes). */
    rss: number;
    totalMem: number;
    freeMem: number;
    /** Carga media de 1 minuto y número de núcleos. */
    load: number;
    cpus: number;
    /** °C, si el sistema lo expone (en la Pi sí). */
    cpuTemp: number | null;
    uptime: number;
    node: string;
  };
  disk: {
    /** Lo que ocupan los archivos de esta partida, la base de datos entera y lo que queda libre. */
    campaignFiles: number;
    campaignFileCount: number;
    database: number;
    free: number | null;
  };
  scenes: { id: string; name: string; items: number; walls: number }[];
  chatMessages: number;
  heavyAssets: (UnusedAsset & { why: string })[];
  unused: UnusedAsset[];
  /** Archivos en la carpeta de la partida que no están en la base de datos (restos de fallos). */
  orphanFiles: number;
  orphanBytes: number;
  warnings: PerfWarning[];
}

export interface CleanupResult {
  removed: number;
  freed: number;
}

/** Por qué un archivo es pesado (o null si no lo es). */
export function heavyAsset(a: Pick<Asset, 'mime' | 'size' | 'width' | 'height'>): string | null {
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (a.mime.startsWith('audio/')) return a.size > PERF_LIMITS.audioBytes ? `audio de ${mb(a.size)}` : null;
  const side = Math.max(a.width ?? 0, a.height ?? 0);
  if (side > PERF_LIMITS.imageSide) return `${a.width}×${a.height} px: redúcela a ${PERF_LIMITS.imageSide} px o menos`;
  if (a.size > PERF_LIMITS.imageBytes) return `imagen de ${mb(a.size)}: mejor en JPG o WEBP`;
  return null;
}

/** Tamaño legible: «1,2 MB». */
export function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}
