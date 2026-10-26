import { create } from 'zustand';
import { calibrateByMarked, calibrateByWidth, fitSceneToImage, type Box } from '@vtt/shared';
import { api } from '../../core/api';
import { updateItem } from '../board/history';
import { useBoard } from '../board/store';

/** Calibrar la cuadrícula de una imagen de mapa: qué imagen, el rectángulo marcado y cuántas casillas cubre. */
interface GridCalState {
  itemId: string | null;
  marked: Box | null;
  cols: number;
  rows: number;
  /** Al aplicar, cambiar el tamaño de la escena para que quepa la imagen entera. */
  fitScene: boolean;
  set: (patch: Partial<Omit<GridCalState, 'set'>>) => void;
}

export const useGridCal = create<GridCalState>((set) => ({
  itemId: null,
  marked: null,
  cols: 1,
  rows: 1,
  fitScene: true,
  set: (patch) => set(patch),
}));

/** Empieza a calibrar esa imagen (herramienta 📐 del tablero). */
export function startCalibration(itemId: string) {
  const item = useBoard.getState().items[itemId];
  if (item?.rotation) return useBoard.getState().showNotice('Quita el giro de la imagen antes de ajustar su cuadrícula.');
  useGridCal.getState().set({ itemId, marked: null });
  useBoard.getState().setTool('calibrate');
}

export function stopCalibration() {
  const { itemId } = useGridCal.getState();
  useGridCal.getState().set({ itemId: null, marked: null });
  useBoard.getState().setTool('select');
  if (itemId) useBoard.getState().select(itemId);
}

/** Aplica la calibración: por el rectángulo marcado o, con `widthCells`, por el ancho total de la imagen. */
export async function applyCalibration(widthCells?: number) {
  const { scene, items } = useBoard.getState();
  const { itemId, marked, cols, rows, fitScene } = useGridCal.getState();
  const item = itemId ? items[itemId] : undefined;
  if (!scene || !item) return;
  const g = scene.gridSize;
  let box = widthCells ? calibrateByWidth(item, widthCells, g) : marked ? calibrateByMarked(item, marked, cols, rows, g) : null;
  if (!box) return;
  try {
    if (fitScene) {
      const fit = fitSceneToImage(box, g);
      box = fit.image;
      if (fit.widthCells !== scene.widthCells || fit.heightCells !== scene.heightCells)
        await api.patch(`/scenes/${scene.id}`, { widthCells: fit.widthCells, heightCells: fit.heightCells });
    }
    await updateItem(scene.id, item.id, box);
    stopCalibration();
    useBoard.getState().showNotice('Cuadrícula ajustada. Si no cuadra del todo, vuelve a marcar más casillas (Ctrl+Z deshace).');
  } catch (e) {
    useBoard.getState().showNotice((e as Error).message);
  }
}
