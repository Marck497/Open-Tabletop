import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, registerUser } from './helpers.js';

let app: Awaited<ReturnType<typeof makeApp>>['app'];
afterEach(() => app?.close());

async function setup() {
  ({ app } = await makeApp());
  const gm = await registerUser(app, 'eldm');
  const player = await registerUser(app, 'jugador');
  const created = await app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gm.cookie },
    payload: { name: 'La Mina Perdida' },
  });
  expect(created.statusCode).toBe(201);
  return { gm, player, campaign: created.json().campaign };
}

describe('campañas', () => {
  it('el creador es DM y ve el código de invitación', async () => {
    const { campaign } = await setup();
    expect(campaign.role).toBe('gm');
    expect(campaign.systemId).toBe('dnd5e');
    expect(campaign.inviteCode).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('un jugador se une con el código, no ve el código y no puede editar', async () => {
    const { campaign, player } = await setup();
    const join = await app.inject({
      method: 'POST',
      url: '/api/campaigns/join',
      headers: { cookie: player.cookie },
      payload: { inviteCode: campaign.inviteCode.toLowerCase() },
    });
    expect(join.json().campaign.role).toBe('player');

    const detail = await app.inject({ url: `/api/campaigns/${campaign.id}`, headers: { cookie: player.cookie } });
    expect(detail.json().campaign.inviteCode).toBeUndefined();
    expect(detail.json().campaign.members).toHaveLength(2);

    const edit = await app.inject({
      method: 'PATCH',
      url: `/api/campaigns/${campaign.id}`,
      headers: { cookie: player.cookie },
      payload: { name: 'Hackeada' },
    });
    expect(edit.statusCode).toBe(403);
  });

  it('quien no es miembro recibe 404', async () => {
    const { campaign, player } = await setup();
    const res = await app.inject({ url: `/api/campaigns/${campaign.id}`, headers: { cookie: player.cookie } });
    expect(res.statusCode).toBe(404);
  });

  it('regenerar el código invalida el anterior', async () => {
    const { campaign, gm, player } = await setup();
    const regen = await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/invite`, headers: { cookie: gm.cookie } });
    expect(regen.json().inviteCode).not.toBe(campaign.inviteCode);
    const join = await app.inject({
      method: 'POST',
      url: '/api/campaigns/join',
      headers: { cookie: player.cookie },
      payload: { inviteCode: campaign.inviteCode },
    });
    expect(join.statusCode).toBe(404);
  });

  it('el DM puede ascender a co-DM y expulsar; el creador no puede ser expulsado', async () => {
    const { campaign, gm, player } = await setup();
    await app.inject({ method: 'POST', url: '/api/campaigns/join', headers: { cookie: player.cookie }, payload: { inviteCode: campaign.inviteCode } });

    const promote = await app.inject({
      method: 'PATCH',
      url: `/api/campaigns/${campaign.id}/members/${player.user.id}`,
      headers: { cookie: gm.cookie },
      payload: { role: 'gm' },
    });
    expect(promote.statusCode).toBe(200);

    const kickOwner = await app.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaign.id}/members/${gm.user.id}`,
      headers: { cookie: player.cookie },
    });
    expect(kickOwner.statusCode).toBe(400);

    const kick = await app.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaign.id}/members/${player.user.id}`,
      headers: { cookie: gm.cookie },
    });
    expect(kick.statusCode).toBe(200);
    const list = await app.inject({ url: '/api/campaigns', headers: { cookie: player.cookie } });
    expect(list.json().campaigns).toHaveLength(0);
  });

  it('solo el creador puede borrar la partida', async () => {
    const { campaign, gm } = await setup();
    const del = await app.inject({ method: 'DELETE', url: `/api/campaigns/${campaign.id}`, headers: { cookie: gm.cookie } });
    expect(del.statusCode).toBe(200);
    const list = await app.inject({ url: '/api/campaigns', headers: { cookie: gm.cookie } });
    expect(list.json().campaigns).toHaveLength(0);
  });
});
