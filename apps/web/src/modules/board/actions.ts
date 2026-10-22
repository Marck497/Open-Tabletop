import type { Asset, BoardLayer, CreateItemInput, UpdateItemInput } from '@vtt/shared';
import { createItem, updateItem } from './history';
import { useBoard } from './store';

/** Crea un elemento centrado en la vista actual, alineado a la cuadrícula. */
export function addItem(input: Omit<CreateItemInput, 'x' | 'y'>) {
  const { scene, viewCenter, select, items } = useBoard.getState();
  if (!scene) return;
  const g = scene.gridSize;
  let x = Math.round((viewCenter.x - input.width / 2) / g) * g;
  const y = Math.round((viewCenter.y - input.height / 2) / g) * g;
  // Si ya hay algo en esa casilla de la misma capa, correrlo a la derecha para que no se apilen.
  const occupied = (px: number) =>
    Object.values(items).some(
      (i) => i.layer === input.layer && !i.drawing && i.x < px + input.width - 1 && px < i.x + i.width - 1 && i.y < y + input.height - 1 && y < i.y + i.height - 1,
    );
  for (let n = 0; n < 20 && occupied(x); n++) x += g;
  return createItem(scene.id, { ...input, x, y }).then((item) => select(item.id));
}

/** Crea un elemento a partir de una imagen: en la capa de mapa, a tamaño real; si no, de una casilla. */
export function addImageItem(asset: Asset, layer: BoardLayer) {
  const { scene } = useBoard.getState();
  if (!scene) return;
  const g = scene.gridSize;
  const ratio = asset.width && asset.height ? asset.width / asset.height : 1;
  const [width, height] =
    layer === 'map' && asset.width && asset.height ? [asset.width, asset.height] : ratio >= 1 ? [g, g / ratio] : [g * ratio, g];
  return addItem({ layer, width, height, assetId: asset.id, name: layer === 'map' ? '' : asset.name.replace(/\.[^.]+$/, '') });
}

export function updateSelected(patch: UpdateItemInput) {
  const { scene, selectedId } = useBoard.getState();
  if (!scene || !selectedId) return;
  return updateItem(scene.id, selectedId, patch);
}
