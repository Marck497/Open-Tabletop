import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useLayout } from './store';

/** Borde izquierdo de la barra lateral: arrástralo para cambiar su ancho (doble clic, ancho normal). */
export function SideResizer() {
  const drag = useRef<{ right: number; id: number } | null>(null);
  const setSideWidth = useLayout((s) => s.setSideWidth);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const aside = e.currentTarget.parentElement;
    if (!aside) return;
    e.preventDefault();
    drag.current = { right: aside.getBoundingClientRect().right, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d && d.id === e.pointerId) setSideWidth(d.right - e.clientX);
  };
  const onPointerUp = () => (drag.current = null);

  return (
    <div
      className="side-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho de la barra lateral"
      title="Arrastra para cambiar el ancho (doble clic: ancho normal)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setSideWidth(300)}
    />
  );
}

/** Botón de la cabecera para esconder o mostrar la barra lateral; escondida, avisa de lo que hay sin leer. */
export function SideToggle({ unread }: { unread: number }) {
  const hidden = useLayout((s) => s.sideHidden);
  const toggleSide = useLayout((s) => s.toggleSide);
  return (
    <button
      className="ghost small side-toggle"
      onClick={() => toggleSide()}
      title={hidden ? 'Mostrar la barra lateral (B)' : 'Esconder la barra lateral para ver más tablero (B)'}
      aria-pressed={!hidden}
    >
      {hidden ? '⇤ Panel' : 'Panel ⇥'}
      {hidden && unread > 0 && <span className="unread">{unread > 99 ? '99+' : unread}</span>}
    </button>
  );
}
