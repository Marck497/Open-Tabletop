import { create } from 'zustand';
import type { BoardItem, BoardLayer, DrawingType, Fog, Measure, MeasureShape, PointerAuthor, Scene, SceneState, Wall, WallKind } from '@vtt/shared';

export type Tool = 'select' | 'measure' | 'ping' | 'draw' | 'walls' | 'map' | 'fog-reveal' | 'fog-hide';

export interface DrawStyle {
  type: DrawingType;
  stroke: string;
  strokeWidth: number;
  /** Rellenar rectángulos y elipses con el mismo color, semitransparente. */
  filled: boolean;
}

export interface TemplatePreset {
  shape: Exclude<MeasureShape, 'ruler'>;
  /** Radio, largo o lado en casillas. */
  cells: number;
  label: string;
}

export interface RemoteMeasure extends PointerAuthor {
  measure: Measure;
}

export interface Ping extends PointerAuthor {
  id: number;
  x: number;
  y: number;
}

interface BoardState {
  scene: Scene | null;
  items: Record<string, BoardItem>;
  selectedId: string | null;
  /** Tokens marcados como objetivo (solo en este navegador): a ellos van los ataques y hechizos. */
  targets: string[];
  tool: Tool;
  /** Capa en la que trabaja el DM (los elementos de otras capas no se pueden seleccionar). */
  activeLayer: BoardLayer;
  /** Posiciones temporales mientras alguien arrastra un token. */
  moving: Record<string, { x: number; y: number }>;
  /** Centro de la vista actual en coordenadas de escena (para colocar elementos nuevos). */
  viewCenter: { x: number; y: number };
  /** Forma de la herramienta de medir. */
  measureShape: MeasureShape;
  /** Mi medición actual (también la ven los demás). */
  myMeasure: Measure | null;
  /** Plantilla de tamaño fijo (la de un hechizo): al colocarla solo se elige el origen y la dirección. */
  templatePreset: TemplatePreset | null;
  /** Mediciones de los demás, por usuario. */
  remoteMeasures: Record<string, RemoteMeasure>;
  pings: Ping[];
  draw: DrawStyle;
  /** Petición del DM de centrar la vista en un punto. */
  focus: { x: number; y: number; n: number } | null;
  /** Herramienta de paredes: qué tipo se dibuja (o borrar). */
  wallMode: WallKind | 'erase';
  /** El DM ve la oscuridad como la ven los jugadores. */
  previewVision: boolean;
  /** Aviso breve sobre el tablero (p. ej. "Está cerrada con llave"). */
  notice: string | null;

  load: (state: SceneState) => void;
  clear: () => void;
  setScene: (scene: Scene) => void;
  setFog: (fog: Fog) => void;
  upsert: (item: BoardItem) => void;
  remove: (id: string) => void;
  setMoving: (id: string, pos: { x: number; y: number } | null) => void;
  select: (id: string | null) => void;
  toggleTarget: (id: string) => void;
  clearTargets: () => void;
  setTool: (tool: Tool) => void;
  setActiveLayer: (layer: BoardLayer) => void;
  setViewCenter: (c: { x: number; y: number }) => void;
  setMeasureShape: (shape: MeasureShape) => void;
  startTemplate: (preset: TemplatePreset) => void;
  setDraw: (patch: Partial<DrawStyle>) => void;
  setMyMeasure: (m: Measure | null) => void;
  setRemoteMeasure: (author: PointerAuthor, m: Measure | null) => void;
  addPing: (ping: Omit<Ping, 'id'>, focus?: boolean) => void;
  setWalls: (walls: Wall[]) => void;
  setWallMode: (mode: WallKind | 'erase') => void;
  setPreviewVision: (on: boolean) => void;
  showNotice: (text: string) => void;
}

let noticeTimer: ReturnType<typeof setTimeout> | undefined;

let pingSeq = 0;
const PING_MS = 2000;

export const useBoard = create<BoardState>((set) => ({
  scene: null,
  items: {},
  selectedId: null,
  targets: [],
  tool: 'select',
  activeLayer: 'token',
  moving: {},
  viewCenter: { x: 0, y: 0 },
  measureShape: 'ruler',
  myMeasure: null,
  templatePreset: null,
  remoteMeasures: {},
  pings: [],
  draw: { type: 'path', stroke: '#e8b25a', strokeWidth: 4, filled: false },
  focus: null,
  wallMode: 'wall',
  previewVision: false,
  notice: null,

  load: ({ scene, items }) =>
    set((s) => ({
      ...(s.scene?.id !== scene.id ? { remoteMeasures: {}, myMeasure: null, pings: [], targets: [] } : {}),
      scene,
      items: Object.fromEntries(items.map((i) => [i.id, i])),
      moving: {},
      selectedId: items.some((i) => i.id === s.selectedId) ? s.selectedId : null,
      targets: s.targets.filter((id) => items.some((i) => i.id === id)),
    })),
  clear: () => set({ scene: null, items: {}, selectedId: null, targets: [], moving: {}, remoteMeasures: {}, myMeasure: null, pings: [] }),
  setScene: (scene) => set((s) => (s.scene?.id === scene.id ? { scene } : {})),
  setFog: (fog) => set((s) => (s.scene ? { scene: { ...s.scene, fog } } : {})),
  upsert: (item) =>
    set((s) => {
      const { [item.id]: _, ...moving } = s.moving;
      return { items: { ...s.items, [item.id]: item }, moving };
    }),
  remove: (id) =>
    set((s) => {
      const { [id]: _, ...items } = s.items;
      return { items, selectedId: s.selectedId === id ? null : s.selectedId, targets: s.targets.filter((t) => t !== id) };
    }),
  setMoving: (id, pos) =>
    set((s) => {
      const { [id]: _, ...rest } = s.moving;
      return { moving: pos ? { ...rest, [id]: pos } : rest };
    }),
  select: (selectedId) => set({ selectedId }),
  toggleTarget: (id) => set((s) => ({ targets: s.targets.includes(id) ? s.targets.filter((t) => t !== id) : [...s.targets, id].slice(-20) })),
  clearTargets: () => set({ targets: [] }),
  setTool: (tool) => set({ tool, selectedId: null, templatePreset: null }),
  setActiveLayer: (activeLayer) => set({ activeLayer, selectedId: null }),
  setViewCenter: (viewCenter) => set({ viewCenter }),
  setMeasureShape: (measureShape) => set({ measureShape, tool: 'measure', selectedId: null, templatePreset: null }),
  startTemplate: (templatePreset) => set({ measureShape: templatePreset.shape, tool: 'measure', selectedId: null, templatePreset }),
  setMyMeasure: (myMeasure) => set({ myMeasure }),
  setDraw: (patch) => set((s) => ({ draw: { ...s.draw, ...patch }, tool: 'draw', selectedId: null })),
  setRemoteMeasure: (author, measure) =>
    set((s) => {
      const { [author.userId]: _, ...rest } = s.remoteMeasures;
      return { remoteMeasures: measure ? { ...rest, [author.userId]: { ...author, measure } } : rest };
    }),
  addPing: (ping, focus) => {
    const id = ++pingSeq;
    set((s) => ({ pings: [...s.pings, { ...ping, id }], ...(focus ? { focus: { x: ping.x, y: ping.y, n: id } } : {}) }));
    setTimeout(() => set((s) => ({ pings: s.pings.filter((p) => p.id !== id) })), PING_MS);
  },
  setWalls: (walls) => set((s) => (s.scene ? { scene: { ...s.scene, walls } } : {})),
  setWallMode: (wallMode) => set({ wallMode, tool: 'walls', selectedId: null }),
  setPreviewVision: (previewVision) => set({ previewVision }),
  showNotice: (notice) => {
    clearTimeout(noticeTimer);
    set({ notice });
    noticeTimer = setTimeout(() => set({ notice: null }), 2500);
  },
}));

export const LAYER_LABELS: Record<BoardLayer, string> = { map: 'Mapa', token: 'Tokens', gm: 'DM (oculta)' };
