import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PerformanceReport } from '@vtt/shared';
import { makeApp, registerUser } from './helpers.js';

let built: Awaited<ReturnType<typeof makeApp>>;
afterEach(async () => {
  await built?.app.close();
});

function multipart(buf: Buffer, filename: string, mime: string) {
  const boundary = '----vtt';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('panel de rendimiento', () => {
  it('encuentra los archivos sin usar y los restos, y solo borra lo que nada usa', async () => {
    built = await makeApp();
    const { app, ctx } = built;
    const gm = await registerUser(app, 'eldm');
    const pl = await registerUser(app, 'jugador');
    const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
    const { campaign } = (await req(gm.cookie, 'POST', '/campaigns', { name: 'La Mina' })).json();
    await req(pl.cookie, 'POST', '/campaigns/join', { inviteCode: campaign.inviteCode });
    const upload = async (name: string) => {
      const up = multipart(PNG_1x1, name, 'image/png');
      return (await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/assets`, payload: up.payload, headers: { ...up.headers, cookie: gm.cookie } })).json().asset as { id: string };
    };
    const avatar = await upload('avatar.png');
    const inNotes = await upload('nota.png');
    const loose = await upload('suelta.png');
    const { character } = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'Thorin' })).json();
    await req(gm.cookie, 'PATCH', `/characters/${character.id}`, { avatarAssetId: avatar.id });
    // Un id dentro del texto de un documento también cuenta como usado.
    await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/handouts`, { title: 'Mapa', body: `![](/api/assets/${inNotes.id})` });
    // Un resto en la carpeta de la partida que no está en la base de datos.
    fs.writeFileSync(path.join(ctx.config.dataDir, 'uploads', campaign.id, 'resto.png'), Buffer.alloc(1000));

    expect((await req(pl.cookie, 'GET', `/campaigns/${campaign.id}/performance`)).statusCode).toBe(403);
    const report: PerformanceReport = (await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/performance`)).json().report;
    expect(report.unused.map((u) => u.id)).toEqual([loose.id]);
    expect(report.orphanFiles).toBe(1);
    expect(report.orphanBytes).toBe(1000);
    expect(report.disk.campaignFileCount).toBe(3);
    expect(report.scenes).toHaveLength(1);
    expect(report.warnings.some((w) => w.text.includes('no lo usa'))).toBe(true);

    // Aunque se pidan todos, los que se usan no se borran.
    const res = await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/performance/cleanup`, { assetIds: [avatar.id, inNotes.id, loose.id], orphans: true });
    expect(res.json().result).toEqual({ removed: 2, freed: PNG_1x1.length + 1000 });
    const after: PerformanceReport = (await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/performance`)).json().report;
    expect(after.unused).toEqual([]);
    expect(after.orphanFiles).toBe(0);
    expect(after.disk.campaignFileCount).toBe(2);
    expect((await req(gm.cookie, 'GET', `/assets/${avatar.id}`)).statusCode).toBe(200);
  });
});
