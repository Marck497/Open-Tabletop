import { create } from 'zustand';
import {
  generateCave,
  generateDungeon,
  normalizeTerrain,
  paintPrefab,
  terrainById,
  withAutoWalls,
  type CreateItemInput,
  type PlacedPrefab,
  type Scene,
  type Wall,
} from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { useBoard } from '../board/store';
import { newWallId } from '../board/Walls';

/** Herramientas del editor de mapas. */
export type MapTool = 'brush' | 'rect' | 'fill' | 'erase' | 'room' | 'door' | 'picker' | 'stamp' | 'prefab';

/**
 * Elementos que puso un paso del editor (objetos, los de una sala prediseñada): deshacer los borra
 * y rehacer los vuelve a crear. Lo comparten el paso de deshacer y el de rehacer, que van apuntando sus ids.
 */
export interface Placed {
  ids: string[];
  inputs: CreateItemInput[];
}

interface Snapshot {
  sceneId: string;
  terrain: string;
  walls: Wall[];
  placed?: Placed;
}

const MAX_UNDO = 60;

interface MapEditorState {
  mode: MapTool;
  /** Terreno con el que se pinta. */
  code: string;
  /** Lado del pincel en casillas. */
  brush: number;
  /** Rehacer las paredes al pintar (donde el suelo toca el vacío o un muro). */
  autoWalls: boolean;
  /** Objeto (emoji) que se coloca y su tamaño en casillas. */
  stamp: string;
  stampSize: number;
  /** Sala prediseñada elegida y cuántos cuartos de vuelta está girada. */
  prefab: string;
  prefabTurns: number;
  /** Terreno mientras se arrastra el pincel (aún sin guardar). */
  draft: string | null;
  undo: Snapshot[];
  redo: Snapshot[];

  setMode: (mode: MapTool) => void;
  setCode: (code: string) => void;
  setBrush: (n: number) => void;
  setAutoWalls: (on: boolean) => void;
  setStamp: (stamp: string) => void;
  setStampSize: (n: number) => void;
  setPrefab: (id: string) => void;
  rotatePrefab: () => void;
  setDraft: (t: string | null) => void;
}

export const useMapEditor = create<MapEditorState>((set) => ({
  mode: 'brush',
  code: 'p',
  brush: 1,
  autoWalls: true,
  stamp: '🌲',
  stampSize: 1,
  prefab: 'taberna',
  prefabTurns: 0,
  draft: null,
  undo: [],
  redo: [],
  setMode: (mode) => set({ mode }),
  setCode: (code) => set((s) => ({ code, mode: s.mode === 'erase' || s.mode === 'picker' || s.mode === 'door' || s.mode === 'stamp' || s.mode === 'prefab' ? 'brush' : s.mode })),
  setBrush: (brush) => set({ brush }),
  setAutoWalls: (autoWalls) => set({ autoWalls }),
  setStamp: (stamp) => set({ stamp, mode: 'stamp' }),
  setStampSize: (stampSize) => set({ stampSize }),
  setPrefab: (prefab) => set({ prefab, mode: 'prefab' }),
  rotatePrefab: () => set((s) => ({ prefabTurns: (s.prefabTurns + 1) % 4 })),
  setDraft: (draft) => set({ draft }),
}));

const snap = (scene: Scene): Snapshot => ({ sceneId: scene.id, terrain: normalizeTerrain(scene.terrain, scene.widthCells, scene.heightCells), walls: scene.walls });

/** Guarda en el historial el estado actual (antes de un cambio). `placed`: elementos que va a crear ese cambio. */
export function remember(scene: Scene, placed?: Placed) {
  useMapEditor.setState((s) => ({ undo: [...s.undo.filter((x) => x.sceneId === scene.id), { ...snap(scene), placed }].slice(-MAX_UNDO), redo: [] }));
}

/** Crea los elementos de un paso y apunta sus ids (para poder deshacerlo). */
async function createPlaced(sceneId: string, placed: Placed) {
  placed.ids = [];
  for (const item of placed.inputs) placed.ids.push((await emitAck('item:create', { sceneId, item })).id);
}

/** Borra los elementos de un paso (los que ya no estén, se ignoran). */
async function removePlaced(sceneId: string, placed: Placed) {
  for (const id of placed.ids) await emitAck('item:delete', { sceneId, id }).catch(() => undefined);
  placed.ids = [];
}

/** Pone elementos en el mapa (objetos) como un paso que se puede deshacer. */
export function placeItems(scene: Scene, inputs: CreateItemInput[]) {
  const placed: Placed = { ids: [], inputs };
  remember(scene, placed);
  return createPlaced(scene.id, placed).catch((e: Error) => useBoard.getState().showNotice(e.message));
}

/** Aplica y guarda suelo y paredes (se ve al momento; si el servidor lo rechaza, se avisa). */
function apply(scene: Scene, terrain: string, walls: Wall[]) {
  useBoard.getState().setScene({ ...scene, terrain, walls });
  return emitAck('terrain:set', { sceneId: scene.id, terrain, walls }).catch((e: Error) => useBoard.getState().showNotice(e.message));
}

/** Guarda un terreno nuevo; con paredes automáticas, las rehace. `force` las rehace siempre (habitaciones). */
export function commitTerrain(scene: Scene, terrain: string, opts: { force?: boolean; walls?: Wall[] } = {}) {
  const base = opts.walls ?? scene.walls;
  const walls = useMapEditor.getState().autoWalls || opts.force ? withAutoWalls(base, terrain, scene.widthCells, scene.heightCells, scene.gridSize) : base;
  return apply(scene, terrain, walls);
}

/** Pone o quita una puerta en un lado de casilla. */
export function toggleDoorAt(scene: Scene, edge: { x1: number; y1: number; x2: number; y2: number }) {
  remember(scene);
  const same = (w: Wall) => !w.auto && ((w.x1 === edge.x1 && w.y1 === edge.y1 && w.x2 === edge.x2 && w.y2 === edge.y2) || (w.x1 === edge.x2 && w.y1 === edge.y2 && w.x2 === edge.x1 && w.y2 === edge.y1));
  const existing = scene.walls.find(same);
  const manual = existing ? scene.walls.filter((w) => w !== existing) : [...scene.walls, { id: newWallId(), ...edge, kind: 'door' as const, open: false, locked: false }];
  const terrain = normalizeTerrain(scene.terrain, scene.widthCells, scene.heightCells);
  const auto = useMapEditor.getState().autoWalls || scene.walls.some((w) => w.auto);
  return apply(scene, terrain, auto ? withAutoWalls(manual, terrain, scene.widthCells, scene.heightCells, scene.gridSize) : manual);
}

export function undo() {
  const scene = useBoard.getState().scene;
  const { undo } = useMapEditor.getState();
  const prev = undo[undo.length - 1];
  if (!scene || !prev || prev.sceneId !== scene.id) return;
  useMapEditor.setState((s) => ({ undo: s.undo.slice(0, -1), redo: [...s.redo, { ...snap(scene), placed: prev.placed }] }));
  void apply(scene, prev.terrain, prev.walls);
  if (prev.placed) void removePlaced(scene.id, prev.placed);
}

export function redo() {
  const scene = useBoard.getState().scene;
  const { redo } = useMapEditor.getState();
  const next = redo[redo.length - 1];
  if (!scene || !next || next.sceneId !== scene.id) return;
  useMapEditor.setState((s) => ({ redo: s.redo.slice(0, -1), undo: [...s.undo, { ...snap(scene), placed: next.placed }] }));
  void apply(scene, next.terrain, next.walls);
  if (next.placed) void createPlaced(scene.id, next.placed).catch((e: Error) => useBoard.getState().showNotice(e.message));
}

/**
 * Coloca una sala prediseñada (ya girada) con su esquina en la casilla (x0, y0): pinta su suelo,
 * pone sus puertas y paredes (las de exterior, solo si están activadas las automáticas) y sus objetos.
 */
export async function placePrefab(scene: Scene, prefab: PlacedPrefab, x0: number, y0: number, outdoor = false) {
  const { widthCells: w, heightCells: h, gridSize: g } = scene;
  const terrain = paintPrefab(normalizeTerrain(scene.terrain, w, h), w, h, prefab, x0, y0);
  const doors: Wall[] = prefab.doors.map((d) => ({
    id: newWallId(),
    x1: (x0 + d.x1) * g,
    y1: (y0 + d.y1) * g,
    x2: (x0 + d.x2) * g,
    y2: (y0 + d.y2) * g,
    kind: 'door',
    open: false,
    locked: d.locked,
  }));
  const inputs: CreateItemInput[] = prefab.objects.map((o) => ({
    layer: 'map',
    x: (x0 + o.x) * g,
    y: (y0 + o.y) * g,
    width: o.size * g,
    height: o.size * g,
    drawing: { type: 'stamp', text: o.emoji },
    light: o.light,
  }));
  const placed: Placed = { ids: [], inputs };
  remember(scene, placed);
  await commitTerrain(scene, terrain, { force: !outdoor, walls: [...scene.walls, ...doors] });
  await createPlaced(scene.id, placed).catch((e: Error) => useBoard.getState().showNotice(e.message));
}

/** Sustituye el mapa por uno generado (mazmorra o cueva), con sus paredes y puertas. */
export function generate(scene: Scene, kind: 'dungeon' | 'cave') {
  const { widthCells: w, heightCells: h, gridSize: g } = scene;
  const seed = Math.floor(Math.random() * 2 ** 31);
  // Si el suelo elegido es de interior se usa para las salas; si no, losas (mazmorra) o suelo de cueva.
  const { code } = useMapEditor.getState();
  const floor = terrainById(code)?.group === 'Interior' ? code : undefined;
  const map = kind === 'dungeon' ? generateDungeon(w, h, { seed, floor }) : generateCave(w, h, { seed, floor: floor ?? 'o' });
  remember(scene);
  const doors: Wall[] = map.doors.map((d) => ({ id: newWallId(), x1: d.x1 * g, y1: d.y1 * g, x2: d.x2 * g, y2: d.y2 * g, kind: 'door', open: false, locked: false }));
  return apply(scene, map.terrain, withAutoWalls(doors, map.terrain, w, h, g));
}

/** Borra todo el suelo pintado y las paredes automáticas. */
export function clearTerrain(scene: Scene) {
  remember(scene);
  return apply(scene, '', scene.walls.filter((w) => !w.auto));
}
