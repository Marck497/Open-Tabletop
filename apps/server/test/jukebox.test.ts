import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, JukeboxState, ServerToClientEvents } from '@vtt/shared';
import { looksLikeAudio } from '../src/modules/assets/service.js';
import { listenWithRealtime, registerUser } from './helpers.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let server: Awaited<ReturnType<typeof listenWithRealtime>>;
const clients: Client[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.app.close();
});
const call = <T>(c: Client, ev: keyof ClientToServerEvents, payload: unknown) =>
  new Promise<AckResult<T>>((r) => (c.emit as (...a: unknown[]) => void)(ev, payload, r));

function multipart(buf: Buffer, filename: string, mime: string) {
  const boundary = '----vtt';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
// Cabecera "OggS" y relleno: suficiente para pasar la comprobación de formato.
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(996, 7)]);

describe('música', () => {
  it('reconoce audio por sus primeros bytes', () => {
    expect(looksLikeAudio(OGG)).toBe(true);
    expect(looksLikeAudio(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)]))).toBe(true);
    expect(looksLikeAudio(Buffer.from('<html><script>alert(1)</script></html>'))).toBe(false);
  });

  it('el DM sube audio, lo pone y todos reciben el estado; el audio se sirve por rangos', async () => {
    server = await listenWithRealtime();
    const { app } = server;
    const gm = await registerUser(app, 'eldm');
    const pl = await registerUser(app, 'ana');
    const { campaign } = (await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: gm.cookie }, payload: { name: 'X' } })).json();
    await app.inject({ method: 'POST', url: '/api/campaigns/join', headers: { cookie: pl.cookie }, payload: { inviteCode: campaign.inviteCode } });

    const up = multipart(OGG, 'Taberna.ogg', 'audio/ogg');
    const res = await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/assets`, payload: up.payload, headers: { ...up.headers, cookie: gm.cookie } });
    expect(res.statusCode).toBe(201);
    const { asset } = res.json();
    const fake = multipart(Buffer.from('<html>no soy audio</html>'), 'x.mp3', 'audio/mpeg');
    expect((await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/assets`, payload: fake.payload, headers: { ...fake.headers, cookie: gm.cookie } })).statusCode).toBe(400);

    // Rangos (para saltar al punto de la canción).
    const part = await app.inject({ url: `/api/assets/${asset.id}`, headers: { cookie: pl.cookie, range: 'bytes=0-3' } });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 0-3/1000');
    expect(part.body).toBe('OggS');
    expect((await app.inject({ url: `/api/assets/${asset.id}`, headers: { cookie: pl.cookie, range: 'bytes=5000-' } })).statusCode).toBe(416);

    const mk = async (cookie: string) => {
      const c: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
      clients.push(c);
      await call(c, 'campaign:join', { campaignId: campaign.id });
      return c;
    };
    const gmC = await mk(gm.cookie);
    const plC = await mk(pl.cookie);
    const act = (c: Client, action: object) => call(c, 'jukebox:action', { campaignId: campaign.id, ...action });

    const added = new Promise<JukeboxState>((r) => plC.once('jukebox:updated', ({ state }) => r(state)));
    expect((await act(gmC, { type: 'add', assetId: asset.id })).ok).toBe(true);
    const state = await added;
    expect(state.tracks[0]).toMatchObject({ name: 'Taberna', loop: true, startedAt: null });
    const id = state.tracks[0]!.id;

    const playing = new Promise<{ state: JukeboxState; serverNow: number }>((r) => plC.once('jukebox:updated', r));
    await act(gmC, { type: 'play', id });
    const p = await playing;
    expect(p.state.tracks[0]!.startedAt).toBeGreaterThan(0);
    expect(p.serverNow).toBeGreaterThanOrEqual(p.state.tracks[0]!.startedAt!);

    // La jugadora no puede tocar la música, y no se puede añadir una imagen como pista.
    expect((await act(plC, { type: 'stopAll' })).ok).toBe(false);
    expect((await act(gmC, { type: 'update', id, patch: { volume: 3 } })).ok).toBe(false);
    const got = await call<{ state: JukeboxState }>(plC, 'jukebox:get', { campaignId: campaign.id });
    expect(got.ok && got.data.state.tracks[0]!.startedAt).toBeTruthy();
    await act(gmC, { type: 'stopAll' });
    const after = await call<{ state: JukeboxState }>(plC, 'jukebox:get', { campaignId: campaign.id });
    expect(after.ok && after.data.state.tracks[0]!.startedAt).toBeNull();
  });
});
