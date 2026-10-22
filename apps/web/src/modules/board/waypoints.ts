/**
 * Puntos de giro: mientras se arrastra con el botón izquierdo (un token o la regla), un clic
 * derecho deja un punto y el camino sigue desde ahí, para doblar esquinas o rodear paredes.
 *
 * Se escucha la ventana en la fase de captura al cargar este módulo, antes de que Konva lo haga
 * al crear el tablero: así el botón derecho no llega a Konva, que soltaría el token arrastrado.
 */
let onTurn: (() => void) | null = null;

/** Activa (al empezar a arrastrar) o desactiva (al soltar) el clic derecho para dejar puntos. */
export function listenTurns(fn: (() => void) | null) {
  onTurn = fn;
}

/** Deja un punto de giro si se está arrastrando (también con la barra espaciadora). */
export function addTurn(): boolean {
  if (!onTurn) return false;
  onTurn();
  return true;
}

if (typeof window !== 'undefined') {
  const swallow = (e: MouseEvent) => {
    if (!onTurn || e.button !== 2) return false;
    e.stopImmediatePropagation();
    e.preventDefault();
    return true;
  };
  window.addEventListener('mousedown', (e) => swallow(e) && onTurn?.(), true);
  window.addEventListener('mouseup', swallow, true);
  window.addEventListener('contextmenu', (e) => onTurn && e.preventDefault(), true);
}
