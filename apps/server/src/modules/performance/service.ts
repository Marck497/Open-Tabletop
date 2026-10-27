import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { count, eq, inArray } from 'drizzle-orm';
import {
  tr,
  formatBytes,
  heavyAsset,
  PERF_LIMITS,
  type CleanupResult,
  type PerformanceReport,
  type PerfWarning,
  type UnusedAsset,
} from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { assets, boardItems, characters, chatMessages, handouts, homebrew, jukebox, macros, scenes } from '../../db/schema.js';
import { createAssetService } from '../assets/service.js';
import { createCampaignService } from '../campaigns/service.js';

/** Temperatura de la CPU en °C (en la Raspberry Pi la da el núcleo; en otros sistemas puede no estar). */
function cpuTemp(): number | null {
  try {
    const raw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    const t = Number(raw.trim()) / 1000;
    return Number.isFinite(t) && t > 0 ? Math.round(t * 10) / 10 : null;
  } catch {
    return null;
  }
}

function sizeOf(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

/**
 * Panel de rendimiento (solo DM): cuánto ocupa la partida, qué archivos no usa nada y se pueden
 * borrar, qué es demasiado pesado para la Pi o para los navegadores, y cómo va el servidor.
 */
export function createPerformanceService(ctx: AppContext) {
  const { db, config } = ctx;
  const campaigns = createCampaignService(ctx);
  const assetsSvc = createAssetService(ctx);
  const uploadsDir = path.join(config.dataDir, 'uploads');

  /**
   * Ids de archivos que usa algo de la partida. Además de las columnas que apuntan a un archivo
   * se busca el id en todo el texto (hojas, creaciones, diario, macros, chat...): mejor no borrar
   * de más.
   */
  function usedAssetIds(campaignId: string, ids: string[]): Set<string> {
    if (!ids.length) return new Set();
    const sceneRows = db.select().from(scenes).where(eq(scenes.campaignId, campaignId)).all();
    const sceneIds = sceneRows.map((s) => s.id);
    const texts: unknown[] = [
      sceneRows,
      sceneIds.length ? db.select().from(boardItems).where(inArray(boardItems.sceneId, sceneIds)).all() : [],
      db.select().from(characters).where(eq(characters.campaignId, campaignId)).all(),
      db.select().from(handouts).where(eq(handouts.campaignId, campaignId)).all(),
      db.select().from(homebrew).where(eq(homebrew.campaignId, campaignId)).all(),
      db.select().from(macros).where(eq(macros.campaignId, campaignId)).all(),
      db.select().from(jukebox).where(eq(jukebox.campaignId, campaignId)).all(),
      db.select({ text: chatMessages.text }).from(chatMessages).where(eq(chatMessages.campaignId, campaignId)).all(),
    ];
    const blob = JSON.stringify(texts);
    return new Set(ids.filter((id) => blob.includes(id)));
  }

  function report(campaignId: string, userId: string): PerformanceReport {
    campaigns.requireGm(campaignId, userId);
    const rows = db.select().from(assets).where(eq(assets.campaignId, campaignId)).all();
    const used = usedAssetIds(
      campaignId,
      rows.map((r) => r.id),
    );
    const brief = (r: (typeof rows)[number]): UnusedAsset => ({ id: r.id, name: r.name, mime: r.mime, size: r.size, createdAt: r.createdAt });

    // Archivos en disco que no tienen fila (restos de una subida o un borrado a medias).
    const known = new Set(rows.map((r) => path.basename(r.path)));
    const orphans = orphanFiles(campaignId, known);

    const sceneRows = db.select({ id: scenes.id, name: scenes.name, walls: scenes.walls }).from(scenes).where(eq(scenes.campaignId, campaignId)).all();
    const itemCounts = new Map(
      sceneRows.length
        ? db
            .select({ sceneId: boardItems.sceneId, n: count() })
            .from(boardItems)
            .where(
              inArray(
                boardItems.sceneId,
                sceneRows.map((s) => s.id),
              ),
            )
            .groupBy(boardItems.sceneId)
            .all()
            .map((r) => [r.sceneId, r.n])
        : [],
    );
    const sceneStats = sceneRows.map((s) => ({ id: s.id, name: s.name, items: itemCounts.get(s.id) ?? 0, walls: s.walls.length }));
    const chat = db.select({ n: count() }).from(chatMessages).where(eq(chatMessages.campaignId, campaignId)).get()?.n ?? 0;

    let free: number | null = null;
    try {
      const st = fs.statfsSync(config.dataDir);
      free = st.bavail * st.bsize;
    } catch {
      /* sin statfs */
    }
    const database = config.databasePath === ':memory:' ? 0 : sizeOf(config.databasePath) + sizeOf(`${config.databasePath}-wal`);
    const temp = cpuTemp();
    const rss = process.memoryUsage().rss;

    const heavy = rows.flatMap((r) => {
      const why = heavyAsset(r);
      return why ? [{ ...brief(r), why }] : [];
    });
    const unused = rows.filter((r) => !used.has(r.id)).map(brief);

    const warnings: PerfWarning[] = [];
    const warn = (level: PerfWarning['level'], text: string) => warnings.push({ level, text });
    if (free !== null && free < PERF_LIMITS.freeBytes) warn('bad', tr('Queda poco espacio en el disco: {0}. Borra archivos sin usar o copias viejas.', { '0': formatBytes(free) }));
    if (temp !== null && temp >= PERF_LIMITS.cpuTemp) warn(temp >= 80 ? 'bad' : 'warn', tr('La CPU está a {temp} °C: la Pi baja la velocidad para enfriarse. Ponle disipador o ventilador.', { temp }));
    if (rss > PERF_LIMITS.rssBytes) warn('warn', tr('El servidor usa {0} de memoria. Reiniciarlo la libera.', { '0': formatBytes(rss) }));
    if (database > PERF_LIMITS.dbBytes) warn('warn', tr('La base de datos ocupa {0}.', { '0': formatBytes(database) }));
    if (heavy.length) warn('warn', tr('{length} {1}: tardan en cargar en los móviles y en la wifi.', { length: heavy.length, '1': heavy.length === 1 ? tr('archivo pesado') : tr('archivos pesados') }));
    for (const s of sceneStats) {
      if (s.items > PERF_LIMITS.sceneItems) warn('warn', tr('La escena «{name}» tiene {items} objetos: puede ir a tirones. Junta dibujos o pásalos a la imagen del mapa.', { name: s.name, items: s.items }));
      if (s.walls > PERF_LIMITS.sceneWalls) warn('warn', tr('La escena «{name}» tiene {walls} paredes: la visión se calcula más despacio.', { name: s.name, walls: s.walls }));
    }
    if (chat > PERF_LIMITS.chatMessages) warn('warn', tr('El chat tiene {chat} mensajes: se cargan al entrar, aunque solo se ven los últimos.', { chat }));
    if (unused.length) warn('warn', tr('{length} {1} nada: {2} que puedes liberar.', { length: unused.length, '1': unused.length === 1 ? tr('archivo no lo usa') : tr('archivos no los usa'), '2': formatBytes(unused.reduce((a, u) => a + u.size, 0)) }));
    if (orphans.files.length) warn('warn', tr('{length} restos de subidas fallidas ({1}).', { length: orphans.files.length, '1': formatBytes(orphans.bytes) }));

    return {
      server: {
        rss,
        totalMem: os.totalmem(),
        freeMem: os.freemem(),
        load: Math.round(os.loadavg()[0]! * 100) / 100,
        cpus: os.cpus().length,
        cpuTemp: temp,
        uptime: Math.round(process.uptime()),
        node: process.version,
      },
      disk: { campaignFiles: rows.reduce((a, r) => a + r.size, 0), campaignFileCount: rows.length, database, free },
      scenes: sceneStats,
      chatMessages: chat,
      heavyAssets: heavy,
      unused,
      orphanFiles: orphans.files.length,
      orphanBytes: orphans.bytes,
      warnings,
    };
  }

  function orphanFiles(campaignId: string, known: Set<string>): { files: string[]; bytes: number } {
    const dir = path.join(uploadsDir, campaignId);
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return { files: [], bytes: 0 };
    }
    const files = names.filter((n) => !known.has(n)).map((n) => path.join(dir, n));
    return { files, bytes: files.reduce((a, f) => a + sizeOf(f), 0) };
  }

  /** Borra los archivos que se piden (solo si siguen sin usarse) y, si se quiere, los restos. */
  function cleanup(campaignId: string, userId: string, opts: { assetIds: string[]; orphans: boolean }): CleanupResult {
    campaigns.requireGm(campaignId, userId);
    const rows = opts.assetIds.length
      ? db
          .select()
          .from(assets)
          .where(inArray(assets.id, opts.assetIds))
          .all()
          .filter((r) => r.campaignId === campaignId)
      : [];
    const used = usedAssetIds(
      campaignId,
      rows.map((r) => r.id),
    );
    let removed = 0;
    let freed = 0;
    for (const r of rows) {
      if (used.has(r.id)) continue;
      assetsSvc.remove(r.id, userId);
      removed++;
      freed += r.size;
    }
    if (opts.orphans) {
      const known = new Set(
        db
          .select({ path: assets.path })
          .from(assets)
          .where(eq(assets.campaignId, campaignId))
          .all()
          .map((r) => path.basename(r.path)),
      );
      for (const f of orphanFiles(campaignId, known).files) {
        freed += sizeOf(f);
        fs.rmSync(f, { force: true, recursive: true });
        removed++;
      }
    }
    return { removed, freed };
  }

  return { report, cleanup };
}
