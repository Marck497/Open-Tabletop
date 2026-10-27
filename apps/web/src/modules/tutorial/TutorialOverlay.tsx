import { useEffect, useState, type CSSProperties } from 'react';
import { useTutorial } from './store';
import { tr } from '../../core/i18n';

const CARD_W = 340;
const GAP = 12;
/** Alto aproximado de la tarjeta, para decidir si cabe encima o debajo. */
const CARD_H = 210;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Busca el elemento del paso y sigue su posición (puede moverse al cambiar de pestaña o redimensionar). */
function useTargetBox(target: string | undefined): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    setBox(null);
    if (!target) return;
    let frame = 0;
    let scrolled = false;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      const r = el?.getBoundingClientRect();
      const next = r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      if (el && next && !scrolled) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        scrolled = true;
      }
      setBox((prev) =>
        prev && next && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height ? prev : next,
      );
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return box;
}

/** Dónde poner la tarjeta: debajo del elemento si cabe, si no encima, y si no dentro, abajo del todo. */
function cardStyle(box: Box | null): CSSProperties {
  if (!box) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  const left = Math.max(GAP, Math.min(box.left + box.width / 2 - CARD_W / 2, window.innerWidth - CARD_W - GAP));
  if (box.top + box.height + GAP + CARD_H < window.innerHeight) return { left, top: box.top + box.height + GAP };
  if (box.top - GAP - CARD_H > 0) return { left, bottom: window.innerHeight - box.top + GAP };
  return { left, bottom: GAP * 2 };
}

/** Recorrido guiado: resalta cada parte de la interfaz con una tarjeta explicativa. No bloquea la mesa. */
export function TutorialOverlay() {
  const steps = useTutorial((s) => s.steps);
  const index = useTutorial((s) => s.index);
  const step = steps?.[index];
  const box = useTargetBox(step?.target);

  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => {
      const { go, close, index: i } = useTutorial.getState();
      if (e.key === 'Escape') return close();
      // Las flechas solo pasan de paso si no se está escribiendo.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'ArrowLeft') go(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  if (!steps || !step) return null;
  const { go, close } = useTutorial.getState();
  const last = index === steps.length - 1;
  const pad = 6;

  return (
    <div className="tour" aria-live="polite">
      {box ? (
        <div className="tour-spot" style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card card" role="dialog" aria-label={step.title} style={{ ...cardStyle(box), width: CARD_W }}>
        <div className="row spread">
          <strong>{step.title}</strong>
          <small className="muted">
            {index + 1} / {steps.length}
          </small>
        </div>
        <p>{step.body}</p>
        <div className="row spread">
          <button className="ghost small" onClick={close}>
            {tr('Saltar')}
          </button>
          <span className="row">
            {index > 0 && (
              <button className="small" onClick={() => go(index - 1)}>
                {tr('Anterior')}
              </button>
            )}
            <button className="small primary" onClick={() => go(index + 1)} autoFocus>
              {last ? tr('Terminar') : tr('Siguiente')}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
