import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tr } from '../../core/i18n';

interface Props {
  icon: string;
  label: string;
  title: string;
  /** Punto de color en el botón: la opción está encendida. */
  on?: boolean;
  /** Botones que siguen a la vista junto al menú (p. ej. la herramienta que estás usando). */
  inline?: ReactNode;
  children: ReactNode;
  'data-tour'?: string;
}

/** Botón de la barra de herramientas que despliega sus opciones, para no llenar la barra de interruptores. */
export function ToolMenu({ icon, label, title, on, inline, children, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="tool-group tool-menu" ref={ref} data-tour={rest['data-tour']}>
      <button className={`small ${open ? 'open' : ''}`} title={title} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {icon} {label}
        {on && <span className="tool-on" aria-label={tr('activado')} />}
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {inline}
      {open && (
        <div className="tool-menu-panel card" role="menu" aria-label={label} onClick={(e) => (e.target as HTMLElement).closest('[data-close]') && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
