import { itemsInArea, type FxTarget } from '@vtt/shared';
import { useBoard } from '../board/store';

/**
 * A dónde va un ataque o un hechizo que se lanza ahora: los tokens marcados como objetivo y, si
 * hay una plantilla de área colocada, el área (y, sin objetivos marcados, los tokens que cubre).
 */
export function currentFxTarget(): FxTarget | undefined {
  const { scene, targets, myMeasure, items } = useBoard.getState();
  if (!scene) return undefined;
  const area = myMeasure && myMeasure.shape !== 'ruler' ? myMeasure : null;
  let targetIds = targets.filter((id) => items[id]);
  if (!targetIds.length && area) {
    const tokens = Object.values(items).filter((i) => !i.drawing && i.layer !== 'map');
    targetIds = itemsInArea(area, tokens, scene.gridSize).map((i) => i.id).slice(0, 20);
  }
  return { sceneId: scene.id, targetIds, area };
}
