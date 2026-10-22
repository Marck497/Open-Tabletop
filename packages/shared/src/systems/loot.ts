import { z } from 'zod';
import { allFields, type SheetRow, type SheetTemplate, type SheetValues } from '../schemas/sheet.js';
import { actionsOf } from './actions.js';
import { BUILTIN_TEMPLATES, combatOf } from './index.js';

/**
 * Botín y tesoro: el DM reparte objetos y monedas a las hojas. Los objetos van al inventario
 * (si ya lo tiene, suma la cantidad) y las monedas a sus campos. Qué campos son las monedas
 * lo dice la plantilla (`combat.coins`); las antiguas usan los de la 5e si existen.
 */
const expr = z.string().trim().max(100);

export const lootItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  qty: z.number().int().min(1).max(9999).default(1),
  weight: z.number().min(0).max(100000).optional(),
  /** Creación (objeto) enlazada: al darla se añaden también sus filas de ataque o recursos. */
  entryId: z.string().max(64).nullable().default(null),
  /** Para quién (id de personaje). */
  to: z.string().min(1).max(64),
});
export type LootItem = z.infer<typeof lootItemSchema>;

export const lootSchema = z.object({
  campaignId: z.string().min(1).max(64),
  /** Quiénes reciben las monedas. */
  characterIds: z.array(z.string().min(1).max(64)).max(30).default([]),
  items: z.array(lootItemSchema).max(60).default([]),
  /** Monedas por campo: número o tirada ("4d6*10"), que se tira en el servidor. */
  coins: z.record(z.string().max(64), expr).default({}),
  /** Las monedas se reparten a partes iguales (el resto, a los primeros) o cada uno recibe la cantidad entera. */
  coinMode: z.enum(['split', 'each']).default('split'),
});
export type LootInput = z.input<typeof lootSchema>;

/** Campos de monedas de la plantilla, con su nombre (de menor a mayor valor en 5e). */
export function coinsOf(template: SheetTemplate): { key: string; label: string }[] {
  const fields = allFields(template);
  const keys = combatOf(template)?.coins ?? BUILTIN_TEMPLATES.dnd5e!.template.combat!.coins ?? [];
  return keys.flatMap((k) => {
    const f = fields.find((x) => x.key === k && x.type === 'number');
    return f ? [{ key: k, label: f.label }] : [];
  });
}

/** Reparte `total` entre `n` a partes iguales; lo que sobra, uno más a los primeros. */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0));
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/**
 * Cambios en una hoja al darle objetos y monedas. `rowsFor` da las filas nuevas de un objeto
 * (las de su creación, o una de inventario) cuando no lo tiene ya. Devuelve los cambios y el resumen.
 */
export function lootPatch(
  template: SheetTemplate,
  values: SheetValues,
  give: { items: { name: string; qty: number; entryId: string | null; rows: { list: string; row: Omit<SheetRow, '_id'> }[] }[]; coins: Record<string, number> },
  newId: () => string,
): { patch: SheetValues; got: string[] } {
  const inv = actionsOf(template).inventory;
  const patch: SheetValues = {};
  const got: string[] = [];
  const list = (key: string): SheetRow[] => (Array.isArray(patch[key] ?? values[key]) ? ((patch[key] ?? values[key]) as SheetRow[]) : []);

  for (const it of give.items) {
    const rows = inv ? list(inv.list) : [];
    const have = inv ? rows.find((r) => (it.entryId ? r._ref === it.entryId : !r._ref && norm(r[inv.name]) === norm(it.name))) : undefined;
    if (inv && have) {
      patch[inv.list] = rows.map((r) => (r === have ? { ...r, [inv.qty]: (Number(r[inv.qty]) || 0) + it.qty } : r));
    } else {
      for (const { list: key, row } of it.rows) {
        const isInv = inv && key === inv.list;
        patch[key] = [...list(key), { ...row, ...(isInv ? { [inv.qty]: it.qty } : {}), _id: newId() } as SheetRow];
      }
    }
    got.push(it.qty > 1 ? `${it.qty}× ${it.name}` : it.name);
  }
  for (const c of coinsOf(template)) {
    const n = give.coins[c.key] ?? 0;
    if (!n) continue;
    patch[c.key] = Math.max(0, (Number(values[c.key]) || 0) + n);
    got.push(`${n} ${c.label.toLowerCase()}`);
  }
  return { patch, got };
}
