import { randomUUID } from 'node:crypto';
import { and, desc, eq, lt } from 'drizzle-orm';
import { splitRoll, type CampaignRole, type ChatMessage, type PublicUser } from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest } from '../../core/errors.js';
import { chatMessages } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';
import { createSheetService, canEditCharacter } from '../sheets/service.js';
import { createDiceService } from '../dice/service.js';

type Row = typeof chatMessages.$inferSelect;
const toMessage = (r: Row): ChatMessage => ({ ...r, userId: r.userId ?? '', whisperTo: r.whisperTo ?? null, roll: r.roll ?? null });

const MAX_TEXT = 2000;
const PAGE = 100;

export function canSeeMessage(m: ChatMessage, role: CampaignRole, userId: string): boolean {
  if (m.userId === userId) return true;
  if (m.secret) return role === 'gm';
  if (m.whisperTo) return m.whisperTo.includes(userId);
  return true;
}

/** Chat de la partida: mensajes, comandos (/r, /gr, /w, /em) y tiradas. */
export function createChatService(ctx: AppContext) {
  const { db } = ctx;
  const campaigns = createCampaignService(ctx);
  const sheets = createSheetService(ctx);
  const dice = createDiceService(ctx);

  function insert(m: Omit<ChatMessage, 'id' | 'createdAt'>): ChatMessage {
    const id = randomUUID();
    db.insert(chatMessages).values({ ...m, id }).run();
    return toMessage(db.select().from(chatMessages).where(eq(chatMessages.id, id)).get()!);
  }

  function history(campaignId: string, userId: string, before?: string): ChatMessage[] {
    const role = campaigns.requireMember(campaignId, userId);
    const where = before
      ? and(eq(chatMessages.campaignId, campaignId), lt(chatMessages.createdAt, before))
      : eq(chatMessages.campaignId, campaignId);
    // Se piden más de la cuenta porque algunos se filtran (susurros ajenos).
    const rows = db.select().from(chatMessages).where(where).orderBy(desc(chatMessages.createdAt)).limit(PAGE * 3).all();
    return rows
      .map(toMessage)
      .filter((m) => canSeeMessage(m, role, userId))
      .slice(0, PAGE)
      .reverse();
  }

  function clear(campaignId: string, userId: string) {
    campaigns.requireGm(campaignId, userId);
    db.delete(chatMessages).where(eq(chatMessages.campaignId, campaignId)).run();
  }

  /** Tirada desde la hoja, la barra de chat o un comando. */
  function roll(user: PublicUser, req: Parameters<typeof dice.roll>[1]): ChatMessage {
    const outcome = dice.roll(user, req);
    const msg = insert({
      campaignId: req.campaignId,
      userId: user.id,
      userName: user.displayName,
      characterId: outcome.characterId,
      characterName: outcome.characterName,
      kind: 'roll',
      text: '',
      roll: outcome.roll,
      whisperTo: null,
      secret: req.secret ?? false,
    });
    if (req.toInitiative) {
      ctx.events.emit('initiative:rolled', {
        campaignId: req.campaignId,
        userId: user.id,
        characterId: outcome.characterId,
        name: outcome.characterName ?? user.displayName,
        value: outcome.roll.total,
      });
    }
    return msg;
  }

  /** Interpreta lo que escribe el usuario en el chat. */
  function send(user: PublicUser, campaignId: string, rawText: string, asCharacterId?: string | null): ChatMessage {
    campaigns.requireMember(campaignId, user.id);
    const text = rawText.trim();
    if (!text) throw badRequest('Mensaje vacío');
    if (text.length > MAX_TEXT) throw badRequest('Mensaje demasiado largo');

    // Hablar como un personaje propio.
    let characterId: string | null = null;
    let characterName: string | null = null;
    if (asCharacterId) {
      const { character, role } = sheets.access(asCharacterId, user.id);
      if (character.campaignId !== campaignId || !canEditCharacter(character, role, user.id)) throw badRequest('Personaje no válido');
      characterId = character.id;
      characterName = character.name;
    }

    const cmd = /^\/(\w+)\s*(.*)$/s.exec(text);
    const base = { campaignId, userId: user.id, userName: user.displayName, characterId, characterName, roll: null, whisperTo: null, secret: false };

    if (!cmd) return insert({ ...base, kind: 'text', text });
    const [, name, rest = ''] = cmd;
    switch (name!.toLowerCase()) {
      case 'r':
      case 'roll':
      case 'gr': {
        const { expression, label } = splitRoll(rest);
        if (!expression) throw badRequest('Escribe una tirada, p. ej. /r 1d20+5');
        return roll(user, { campaignId, expression, label, characterId, secret: name === 'gr' });
      }
      case 'w': {
        const members = campaigns.get(campaignId, user.id).members;
        // El nombre puede tener espacios: se busca el más largo que encaje.
        const target = [...members]
          .sort((a, b) => b.displayName.length - a.displayName.length)
          .find((m) => rest.toLowerCase().startsWith(m.displayName.toLowerCase() + ' ') || rest.toLowerCase().startsWith(m.username + ' '));
        if (!target) throw badRequest('No encuentro a quién susurrar. Usa: /w Nombre mensaje');
        const prefix = rest.toLowerCase().startsWith(target.displayName.toLowerCase() + ' ') ? target.displayName : target.username;
        const body = rest.slice(prefix.length).trim();
        if (!body) throw badRequest('Mensaje vacío');
        return insert({ ...base, kind: 'text', text: body, whisperTo: [target.id] });
      }
      case 'em':
      case 'me':
        if (!rest.trim()) throw badRequest('Escribe la acción');
        return insert({ ...base, kind: 'emote', text: rest.trim() });
      default:
        throw badRequest('Comando desconocido: /{name}', { name });
    }
  }

  return { history, clear, roll, send, insert };
}

export { splitRoll };
