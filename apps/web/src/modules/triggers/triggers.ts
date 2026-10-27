import { TRIGGER_COLORS, TRIGGER_ICONS, type BoardItem, type TriggerKind } from '@vtt/shared';
import { addItem } from '../board/actions';
import { updateItem } from '../board/history';
import { useBoard } from '../board/store';
import { tr } from '../../core/i18n';

/** Trampas y zonas de aviso de la escena abierta (rectángulos de la capa del DM con `trigger`). */
export const isTrigger = (i: BoardItem) => !!i.trigger;
export const triggersOf = (items: Record<string, BoardItem>) =>
  Object.values(items)
    .filter(isTrigger)
    .sort((a, b) => a.name.localeCompare(b.name) || a.y - b.y || a.x - b.x);

/** Pone una trampa o zona de 2 × 2 casillas en el centro de la vista (capa del DM) y la selecciona para configurarla. */
export function addTrigger(kind: TriggerKind) {
  const { scene, items } = useBoard.getState();
  if (!scene) return;
  const n = triggersOf(items).filter((i) => i.trigger!.kind === kind).length + 1;
  const size = scene.gridSize * 2;
  useBoard.getState().setActiveLayer('gm');
  return addItem({
    layer: 'gm',
    width: size,
    height: size,
    name: `${kind === 'trap' ? tr('Trampa') : tr('Zona')} ${n}`,
    drawing: { type: 'zone', text: TRIGGER_ICONS[kind], stroke: TRIGGER_COLORS[kind] },
    trigger: kind === 'trap' ? { kind, save: '', damage: '' } : { kind },
  });
}

/** Vuelve a armar una trampa que ya saltó. */
export function rearm(item: BoardItem) {
  const scene = useBoard.getState().scene;
  if (scene && item.trigger) return updateItem(scene.id, item.id, { trigger: { ...item.trigger, active: true } });
}
