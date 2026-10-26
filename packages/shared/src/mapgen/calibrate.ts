/**
 * Calibrar la cuadrícula de una imagen de mapa (una que trae su propia cuadrícula dibujada) para que
 * coincida con la de la escena: se marca un rectángulo de N × M casillas de la imagen y se escala y
 * mueve la imagen para que esas casillas midan y caigan justo como las de la escena.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Hasta qué fracción de casilla se considera que ya está alineado (para no dejar un hueco de 1 píxel). */
const SNAP = 0.03;

/**
 * Cuántas casillas cubre `px` píxeles, redondeando si sobra muy poco: una franja de menos de un
 * sexto de casilla (lo que suele dejar marcar a mano con algo de error) no merece una casilla más.
 */
const cellsOf = (px: number, g: number) => {
  const n = px / g;
  return n - Math.floor(n) < 0.15 ? Math.max(1, Math.floor(n)) : Math.ceil(n);
};

/**
 * Imagen recalibrada: `marked` es el rectángulo marcado sobre ella (en coordenadas de la escena) y
 * `cols` × `rows` las casillas de la imagen que cubre. Devuelve su nueva caja, con esas casillas
 * del tamaño de las de la escena y su esquina sobre una línea de la cuadrícula.
 */
export function calibrateByMarked(image: Box, marked: Box, cols: number, rows: number, g: number): Box {
  const sx = (cols * g) / marked.width;
  const sy = (rows * g) / marked.height;
  // Dónde queda la esquina marcada dentro de la imagen ya escalada.
  const offX = (marked.x - image.x) * sx;
  const offY = (marked.y - image.y) * sy;
  const gridX = Math.round((image.x + offX) / g) * g;
  const gridY = Math.round((image.y + offY) / g) * g;
  return { x: gridX - offX, y: gridY - offY, width: image.width * sx, height: image.height * sy };
}

/** Imagen que mide `cols` casillas de ancho (el alto, en proporción), con su esquina en la cuadrícula. */
export function calibrateByWidth(image: Box, cols: number, g: number): Box {
  const s = (cols * g) / image.width;
  return { x: Math.round(image.x / g) * g, y: Math.round(image.y / g) * g, width: cols * g, height: image.height * s };
}

/**
 * Lleva la imagen a la esquina de la escena (moviéndola casillas enteras, así no se descalibra) y
 * dice el tamaño de escena en casillas para que quepa entera (máximo 200 × 200).
 */
export function fitSceneToImage(image: Box, g: number): { image: Box; widthCells: number; heightCells: number } {
  const near = (v: number) => {
    let r = v - Math.floor(v / g) * g;
    if (r > g / 2) r -= g;
    return Math.abs(r) < g * SNAP ? 0 : r;
  };
  const x = near(image.x);
  const y = near(image.y);
  return {
    image: { ...image, x, y },
    widthCells: Math.max(1, Math.min(200, cellsOf(x + image.width, g))),
    heightCells: Math.max(1, Math.min(200, cellsOf(y + image.height, g))),
  };
}
