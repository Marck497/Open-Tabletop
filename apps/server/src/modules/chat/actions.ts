import { z } from 'zod';
import {
  ActionError,
  actionsOf,
  checkSyntax,
  createResolver,
  evaluate,
  ExprError,
  restPatch,
  spendSlot,
  spendUse,
  splitRoll,
  type Character,
  type ChatMessage,
  type ChatRollPart,
  type DiceRoll,
  type PublicUser,
  type SheetRow,
  type SheetValues,
} from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, forbidden } from '../../core/errors.js';
import { secureRng } from '../dice/service.js';
import { canEditCharacter, createSheetService } from '../sheets/service.js';
import { createChatService } from './service.js';

const id = z.string().min(1).max(64);
const actionSchema = z.object({
  characterId: id,
  secret: z.boolean().optional(),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('attack'), rowId: id }),
    z.object({ kind: z.literal('cast'), rowId: id, slot: z.number().int().min(1).max(9).optional() }),
    z.object({ kind: z.literal('use'), rowId: id }),
    z.object({ kind: z.literal('rest'), rest: z.enum(['short', 'long']) }),
  ]),
});

const keptSum = (rolls: DiceRoll[]) => rolls.reduce((sum, r) => sum + r.kept.reduce((s, i) => s + (r.results[i] ?? 0), 0), 0);
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

export interface ActionResult {
  message: ChatMessage;
  before: Character;
  /** La hoja cambiada (espacios, usos, PG), si cambió. */
  after: Character | null;
}

/** Botones de acción de las hojas. Las tiradas, como todas, se hacen en el servidor. */
export function createSheetActions(ctx: AppContext) {
  const sheets = createSheetService(ctx);
  const chat = createChatService(ctx);

  /** Tira una expresión de la hoja; con `crit`, añade otra vez los dados (doble de dados en 5e). */
  function rollText(text: string, resolve: (name: string) => unknown, crit = false): (ChatRollPart & { note: string }) | null {
    const { expression, label } = splitRoll(text);
    if (!expression) return null;
    try {
      const first = evaluate(expression, { resolve, rng: secureRng });
      let total = first.value;
      let rolls = first.rolls;
      if (crit && first.rolls.length) {
        const again = evaluate(expression, { resolve, rng: secureRng });
        total += keptSum(again.rolls);
        rolls = [...rolls, ...again.rolls];
      }
      return { label: '', expression, total: Math.max(0, Math.round(total)), rolls, note: label };
    } catch (e) {
      if (e instanceof ExprError) return null;
      throw e;
    }
  }

  function run(user: PublicUser, input: unknown): ActionResult {
    const req = actionSchema.parse(input);
    const { character, role } = sheets.access(req.characterId, user.id);
    if (!canEditCharacter(character, role, user.id)) throw forbidden('No puedes usar esta hoja');
    const template = sheets.getTemplate(character.campaignId);
    const a = actionsOf(template);
    const values = character.values;
    const rowOf = (list: string, rowId: string) => {
      const rows = values[list];
      const row = Array.isArray(rows) ? (rows as SheetRow[]).find((r) => r._id === rowId) : undefined;
      if (!row) throw badRequest('Esa fila ya no existe');
      return row;
    };
    const base = {
      campaignId: character.campaignId,
      userId: user.id,
      userName: user.displayName,
      characterId: character.id,
      characterName: character.name,
      whisperTo: null,
      secret: req.secret ?? false,
    };
    let patch: SheetValues | null = null;
    let message: ChatMessage;
    const action = req.action;

    try {
      switch (action.kind) {
        case 'attack': {
          if (!a.attacks) throw badRequest('Esta hoja no tiene tabla de ataques');
          const row = rowOf(a.attacks.list, action.rowId);
          const resolve = createResolver(template, values, row);
          const name = String(row[a.attacks.name] || 'Ataque');
          // Ataque (si el bono es un número o una fórmula; un "CD 13 DES" no se tira).
          const bonus = String(row[a.attacks.attack] ?? '').trim();
          const attack = bonus && !checkSyntax(bonus) ? rollText(`1d20 + @{${a.attacks.attack}}`, resolve) : null;
          const d20 = attack?.rolls.find((r) => r.sides === 20);
          const natural = d20 ? d20.results[d20.kept[0] ?? 0] : undefined;
          const critFrom = Math.min(20, Math.max(2, a.attacks.crit ? num(row[a.attacks.crit]) || 20 : 20));
          const crit = natural !== undefined && natural >= critFrom;
          const parts: ChatRollPart[] = [];
          const damage = rollText(String(row[a.attacks.damage] ?? ''), resolve, crit);
          if (damage) parts.push({ ...damage, label: `Daño${damage.note ? ` (${damage.note})` : ''}${crit ? ' ×2 dados' : ''}` });
          const extra = a.attacks.extra ? rollText(String(row[a.attacks.extra] ?? ''), resolve, crit) : null;
          if (extra) parts.push({ ...extra, label: `Extra${extra.note ? ` (${extra.note})` : ''}` });
          const verdict = crit ? ' — ¡crítico!' : natural === 1 ? ' — pifia' : '';
          if (attack) {
            message = chat.insert({ ...base, kind: 'roll', text: '', roll: { label: `${name}${verdict}`, expression: attack.expression, total: attack.total, rolls: attack.rolls, parts, crit } });
          } else if (parts.length) {
            const [first, ...rest] = parts;
            message = chat.insert({ ...base, kind: 'roll', text: '', roll: { ...first!, label: `${name}${bonus ? ` (${bonus})` : ''}: ${first!.label.toLowerCase()}`, parts: rest } });
          } else throw badRequest(`${name} no tiene tirada de ataque ni de daño`);
          break;
        }
        case 'cast': {
          if (!a.spells) throw badRequest('Esta hoja no tiene tabla de conjuros');
          const row = rowOf(a.spells.list, action.rowId);
          const name = String(row[a.spells.name] || 'Conjuro');
          const level = Math.max(0, Math.round(num(row[a.spells.level])));
          let how = 'truco';
          if (level > 0) {
            const spent = spendSlot(template, values, level, action.slot);
            patch = spent.patch;
            how = `espacio de nivel ${spent.slot}, quedan ${spent.left}/${spent.max}`;
          }
          const effect = rollText(String(row[a.spells.effect] ?? ''), createResolver(template, values, row));
          message = effect
            ? chat.insert({ ...base, kind: 'roll', text: '', roll: { label: `${name} (${how})${effect.note ? `: ${effect.note}` : ''}`, expression: effect.expression, total: effect.total, rolls: effect.rolls } })
            : chat.insert({ ...base, kind: 'emote', text: `lanza ${name} (${how}).`, roll: null });
          break;
        }
        case 'use': {
          const used = spendUse(template, values, action.rowId);
          patch = used.patch;
          message = chat.insert({ ...base, kind: 'emote', text: `usa ${used.name || 'un recurso'} (quedan ${used.left}/${used.max}).`, roll: null });
          break;
        }
        case 'rest': {
          const rest = restPatch(template, values, action.rest);
          patch = Object.keys(rest.patch).length ? rest.patch : null;
          const what = action.rest === 'long' ? 'un descanso largo' : 'un descanso corto';
          message = chat.insert({
            ...base,
            kind: 'emote',
            text: rest.recovered.length ? `hace ${what} y recupera ${listEs(rest.recovered)}.` : `hace ${what} (no tenía nada que recuperar).`,
            roll: null,
          });
          break;
        }
      }
    } catch (e) {
      if (e instanceof ActionError) throw badRequest(e.message);
      throw e;
    }
    const after = patch ? sheets.update(character.id, user.id, { values: patch }).after : null;
    return { message, before: character, after };
  }

  return { run };
}

/** "a, b y c". */
function listEs(items: string[]) {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}
