import { useEffect } from 'react';
import { create } from 'zustand';
import { emitAck } from '../../core/socket';
import { updateItem } from '../board/history';
import { useBoard } from '../board/store';
import { useLayout } from '../layout/store';
import { sidebarTabs } from '../layout/tabs';
import { tr } from '../../core/i18n';

/**
 * Atajos de teclado de la mesa. Los de la escena (Supr, Esc, Ctrl+Z…) viven en el tablero;
 * aquí van los de herramientas, capas, mover con las flechas, pasar turno y la ayuda (?).
 */
interface Shortcut {
  keys: string;
  label: string;
  gmOnly?: boolean;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: 'V', label: tr('Seleccionar y mover') },
  { keys: 'R', label: tr('Regla') },
  { keys: 'P', label: tr('Ping') },
  { keys: 'D', label: tr('Dibujar') },
  { keys: 'W', label: tr('Paredes y puertas'), gmOnly: true },
  { keys: 'M', label: tr('Editor de mapas'), gmOnly: true },
  { keys: '1 · 2 · 3', label: tr('Capa de mapa, tokens o DM'), gmOnly: true },
  { keys: tr('Flechas'), label: tr('Mover el token seleccionado una casilla') },
  { keys: 'C', label: tr('Centrar la vista en el token seleccionado (o en el tuyo)') },
  { keys: 'N', label: tr('Pasar turno (el DM, o tú en tu turno)') },
  { keys: tr('Mayús+1 · 2 · 3…'), label: tr('Abrir una pestaña de la barra lateral (Chat, Personajes, Diario…)') },
  { keys: 'B', label: tr('Esconder o mostrar la barra lateral') },
  { keys: tr('Supr'), label: tr('Borrar lo seleccionado') },
  { keys: 'Ctrl+Z · Ctrl+Y', label: tr('Deshacer · rehacer') },
  { keys: 'Esc', label: tr('Soltar la selección, los objetivos y la medición') },
  { keys: tr('Clic derecho · Espacio'), label: tr('Arrastrando un token o midiendo: punto de giro para cambiar de dirección') },
  { keys: tr('Alt+clic'), label: tr('Apuntar a un token (objetivo de ataques y hechizos)') },
  { keys: tr('Doble clic'), label: tr('Ping (con Mayús, el DM centra la vista de todos)') },
  { keys: '?', label: tr('Esta ayuda') },
];

/** Si la ayuda está abierta (también la abre el botón ⌨ de la barra). */
export const useShortcutHelp = create<{ open: boolean; toggle: (open?: boolean) => void }>((set) => ({
  open: false,
  toggle: (open) => set((s) => ({ open: open ?? !s.open })),
}));

const isTyping = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');

export function Shortcuts({ campaignId, isGm, meId }: { campaignId: string; isGm: boolean; meId: string }) {
  const help = useShortcutHelp((s) => s.open);
  const setHelp = useShortcutHelp((s) => s.toggle);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const board = useBoard.getState();
      const { scene, selectedId, items } = board;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (key === '?') return setHelp();
      if (key === 'Escape') return setHelp(false);

      // Pestañas de la barra lateral: Mayús + número (se mira la tecla física, no el símbolo que escribe).
      const digit = e.shiftKey ? /^Digit([1-9])$/.exec(e.code) : null;
      if (digit) {
        const tab = sidebarTabs(isGm)[Number(digit[1]) - 1];
        if (!tab) return;
        e.preventDefault();
        useLayout.getState().setTab(tab.id);
        useLayout.getState().toggleSide(false);
        return;
      }
      // Con el editor de mapas abierto, las letras son sus herramientas (B pincel, R rectángulo, P puerta…); M lo cierra.
      if (board.tool === 'map' && /^[a-z]$/.test(key) && key !== 'm') return;
      if (key === 'b') {
        e.preventDefault();
        useLayout.getState().toggleSide();
        return;
      }

      const tools: Record<string, () => void> = {
        v: () => board.setTool('select'),
        r: () => board.setMeasureShape('ruler'),
        p: () => board.setTool('ping'),
        d: () => board.setTool('draw'),
        ...(isGm
          ? {
              w: () => board.setWallMode(board.wallMode),
              m: () => board.setTool(board.tool === 'map' ? 'select' : 'map'),
              '1': () => board.setActiveLayer('map'),
              '2': () => board.setActiveLayer('token'),
              '3': () => board.setActiveLayer('gm'),
            }
          : {}),
      };
      if (tools[key] && scene) {
        e.preventDefault();
        tools[key]();
        return;
      }

      if (key === 'n') {
        e.preventDefault();
        void emitAck('initiative:action', { campaignId, type: 'next' }).catch((err: Error) => board.showNotice(err.message));
        return;
      }

      const sel = selectedId ? items[selectedId] : undefined;
      if (key === 'c' && scene) {
        const target = sel ?? Object.values(items).find((i) => i.layer === 'token' && !i.drawing && i.ownerIds.includes(meId));
        if (!target) return;
        useBoard.setState({ focus: { x: target.x + target.width / 2, y: target.y + target.height / 2, n: Date.now() } });
        return;
      }

      const step: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (step[key] && scene && sel && board.tool === 'select') {
        const mine = isGm ? sel.layer === board.activeLayer : sel.layer === 'token' && sel.ownerIds.includes(meId);
        if (!mine) return;
        e.preventDefault();
        const [dx, dy] = step[key];
        const g = scene.gridSize;
        void updateItem(scene.id, sel.id, { x: sel.x + dx * g, y: sel.y + dy * g }).catch((err: Error) => board.showNotice(err.message));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [campaignId, isGm, meId]);

  if (!help) return null;
  return (
    <div className="modal-backdrop" onClick={() => setHelp(false)}>
      <div className="modal card shortcuts-help" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr('Atajos de teclado')}>
        <h2>{tr('⌨ Atajos de teclado')}</h2>
        <table>
          <tbody>
            {SHORTCUTS.filter((s) => isGm || !s.gmOnly).map((s) => (
              <tr key={s.keys}>
                <td>
                  <kbd>{s.keys}</kbd>
                </td>
                <td>{s.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button onClick={() => setHelp(false)}>{tr('Cerrar')}</button>
        </div>
      </div>
    </div>
  );
}
