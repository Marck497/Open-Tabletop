import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** Posición (dentro del tablero) y estado de una ventana flotante, guardados en este navegador. */
interface WindowState {
  x: number;
  y: number;
  minimized: boolean;
}

/** Barra de título que queda siempre a la vista al empujar la ventana fuera del tablero. */
const KEEP_VISIBLE = 48;

function read(key: string): WindowState | null {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as Partial<WindowState>) : null;
    return v && typeof v.x === 'number' && typeof v.y === 'number' ? { x: v.x, y: v.y, minimized: Boolean(v.minimized) } : null;
  } catch {
    return null;
  }
}
function write(key: string, v: WindowState) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: la ventana vuelve a su sitio al recargar */
  }
}

/** Mantiene la ventana dentro de su contenedor (al menos la barra de título). */
function clamp(el: HTMLElement, x: number, y: number) {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return { x, y };
  const maxX = Math.max(0, parent.clientWidth - Math.min(el.offsetWidth, KEEP_VISIBLE * 3));
  const maxY = Math.max(0, parent.clientHeight - KEEP_VISIBLE);
  return { x: Math.round(Math.max(0, Math.min(maxX, x))), y: Math.round(Math.max(0, Math.min(maxY, y))) };
}

const isControl = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('button, input, select, textarea, a, label, [contenteditable="true"]');

/**
 * Ventana que se arrastra por la barra de título, se minimiza y recuerda dónde la dejaste.
 * `fallback` da la esquina superior derecha inicial (distancia al borde derecho y arriba) si no hay nada guardado.
 */
export function useFloatingWindow(key: string, fallback: { right: number; top: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<WindowState | null>(() => read(key));
  const drag = useRef<{ dx: number; dy: number; id: number } | null>(null);

  // Primera vez: colocarla según `fallback`; siempre: que no quede fuera si el tablero ha encogido.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    setState((s) => {
      const base = s ?? { x: parent.clientWidth - el.offsetWidth - fallback.right, y: fallback.top, minimized: false };
      const c = clamp(el, base.x, base.y);
      return s && c.x === s.x && c.y === s.y ? s : { ...base, ...c };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (patch: Partial<WindowState>, save: boolean) =>
      setState((s) => {
        const next = { x: 0, y: 0, minimized: false, ...s, ...patch };
        if (save) write(key, next);
        return next;
      }),
    [key],
  );

  /** Para la barra de título: empezar a arrastrar salvo que se pulse un botón o un campo. */
  const onHandlePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (e.button !== 0 || !el || !state || isControl(e.target)) return;
    e.preventDefault();
    drag.current = { dx: e.clientX - state.x, dy: e.clientY - state.y, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandlePointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || d.id !== e.pointerId) return;
    update(clamp(el, e.clientX - d.dx, e.clientY - d.dy), false);
  };
  const onHandlePointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    update({}, true);
  };

  return {
    ref,
    /** Estilo de la ventana: oculta hasta saber dónde ponerla, para que no dé un salto. */
    style: state ? { left: state.x, top: state.y, maxHeight: `calc(100% - ${state.y + 12}px)` } : { right: fallback.right, top: fallback.top, visibility: 'hidden' as const },
    minimized: state?.minimized ?? false,
    toggleMinimized: () => update({ minimized: !state?.minimized }, true),
    handleProps: { onPointerDown: onHandlePointerDown, onPointerMove: onHandlePointerMove, onPointerUp: onHandlePointerUp, onPointerCancel: onHandlePointerUp },
  };
}
