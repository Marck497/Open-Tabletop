import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // El paquete compartido se incluye en el bundle; el resto de dependencias se instalan en producción.
  noExternal: ['@vtt/shared'],
});
