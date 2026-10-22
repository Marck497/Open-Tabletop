import { useEffect, useMemo, useRef } from 'react';
import { Image as KImage } from 'react-konva';
import type Konva from 'konva';
import type { Scene } from '@vtt/shared';
import { paintTerrain, pixelsPerCell } from './textures';

/**
 * Suelo pintado de la escena. Se dibuja en un lienzo aparte y solo se repintan las casillas
 * que cambian (y sus vecinas, por las sombras), así pintar con el pincel va fluido.
 */
export function TerrainLayer({ scene, terrain }: { scene: Scene; terrain: string }) {
  const { widthCells: w, heightCells: h, gridSize: g } = scene;
  const ppc = pixelsPerCell(w, h, g);
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w * ppc;
    c.height = h * ppc;
    return c;
  }, [w, h, ppc]);
  const painted = useRef<{ canvas: HTMLCanvasElement; terrain: string } | null>(null);
  const imageRef = useRef<Konva.Image>(null);

  useEffect(() => {
    const prev = painted.current;
    if (prev?.canvas === canvas && prev.terrain === terrain) return;
    if (prev?.canvas !== canvas || prev.terrain.length !== terrain.length) paintTerrain(canvas, terrain, w, h, ppc);
    else {
      const dirty = new Set<number>();
      for (let i = 0; i < terrain.length; i++) {
        if (terrain[i] === prev.terrain[i]) continue;
        const x = i % w;
        dirty.add(i);
        if (x > 0) dirty.add(i - 1);
        if (x < w - 1) dirty.add(i + 1);
        if (i >= w) dirty.add(i - w);
        if (i + w < w * h) dirty.add(i + w);
      }
      paintTerrain(canvas, terrain, w, h, ppc, dirty);
    }
    painted.current = { canvas, terrain };
    imageRef.current?.getLayer()?.batchDraw();
  }, [canvas, terrain, w, h, ppc]);

  return <KImage ref={imageRef} image={canvas} width={w * g} height={h * g} listening={false} />;
}
