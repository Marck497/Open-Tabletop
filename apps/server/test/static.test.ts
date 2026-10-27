import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeApp } from './helpers.js';

let built: Awaited<ReturnType<typeof makeApp>> | undefined;
afterEach(async () => {
  await built?.app.close();
});

describe('web compilada', () => {
  it('sirve la página en las rutas de la web, pero un archivo que falta es un 404', async () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-web-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>mesa</title>');
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'assets', 'app-1.js'), 'console.log(1)');
    built = await makeApp({ webDistDir: dist });
    const get = (url: string) => built!.app.inject({ method: 'GET', url });
    expect((await get('/c/1234')).body).toContain('mesa');
    expect((await get('/assets/app-1.js')).statusCode).toBe(200);
    // Un trozo de una versión anterior (el navegador lo pide tras actualizar): no puede devolver HTML.
    const stale = await get('/assets/app-0.js');
    expect(stale.statusCode).toBe(404);
    expect(stale.headers['content-type']).not.toMatch(/html/);
    expect((await get('/favicon-viejo.png')).statusCode).toBe(404);
  });
});
