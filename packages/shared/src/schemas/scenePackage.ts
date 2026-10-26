import { z } from 'zod';
import { createItemSchema, fogSchema, sceneInputSchema } from './board.js';
import { terrainSchema } from './terrain.js';
import { wallsSchema } from './walls.js';

/**
 * Una escena suelta, lista para llevarla a otra partida: la escena con su suelo, paredes y
 * niebla, sus elementos y las imágenes que usan. Es lo que se guarda en la biblioteca de
 * escenas del DM y lo que se descarga con "Exportar escena". No lleva nada de los jugadores:
 * los tokens van sin dueños y sin hoja vinculada.
 */
export const SCENE_PACKAGE_FORMAT = 'vtt-scene';
export const SCENE_PACKAGE_VERSION = 1;
/** Tamaño máximo de un archivo de escena al importarlo (los mapas de Dungeondraft pesan bastante). */
export const MAX_SCENE_PACKAGE_BYTES = 100 * 1024 * 1024;
/** Escenas que puede guardar cada usuario en su biblioteca. */
export const MAX_LIBRARY_ENTRIES = 200;

const id = z.string().min(1).max(64);

export const scenePackageSchema = z.object({
  format: z.literal(SCENE_PACKAGE_FORMAT),
  version: z.number().int().min(1).max(SCENE_PACKAGE_VERSION),
  exportedAt: z.string().default(''),
  scene: sceneInputSchema.partial().extend({
    name: sceneInputSchema.shape.name,
    fog: fogSchema.optional(),
    walls: wallsSchema.default([]),
    terrain: terrainSchema.default(''),
  }),
  items: z.array(createItemSchema).max(5000).default([]),
  assets: z
    .array(
      z.object({
        id,
        name: z.string().max(200),
        mime: z.string().max(100),
        /** Contenido en base64. */
        data: z.string(),
      }),
    )
    .max(500)
    .default([]),
});
export type ScenePackage = z.infer<typeof scenePackageSchema>;
export type ScenePackageInput = z.input<typeof scenePackageSchema>;

/** Una escena guardada en la biblioteca (sin su contenido, para la lista). */
export interface SceneLibraryEntry {
  id: string;
  name: string;
  widthCells: number;
  heightCells: number;
  /** Elementos que lleva (tokens, objetos, imágenes...). */
  items: number;
  /** Tamaño guardado en bytes (con las imágenes). */
  size: number;
  createdAt: string;
}

export const libraryNameSchema = z.object({ name: z.string().trim().min(1).max(80).optional() });
