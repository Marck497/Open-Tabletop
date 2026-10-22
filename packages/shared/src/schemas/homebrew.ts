import { z } from 'zod';
import { checkSyntax } from '../expr.js';
import { FX_STYLES } from '../fx.js';

/**
 * Creaciones de la mesa: hechizos, ataques y objetos hechos (o copiados del SRD y retocados)
 * por el DM o los jugadores. Son datos: al añadirlos a una hoja, sus filas quedan enlazadas
 * (`_ref`) y los botones de acción, la IA y las plantillas de área usan lo que diga aquí.
 */
export const HOMEBREW_KINDS = ['spell', 'attack', 'item'] as const;
export type HomebrewKind = (typeof HOMEBREW_KINDS)[number];
export const HOMEBREW_KIND_LABELS: Record<HomebrewKind, string> = { spell: 'Hechizo', attack: 'Ataque', item: 'Objeto' };
export const HOMEBREW_KIND_ICONS: Record<HomebrewKind, string> = { spell: '✨', attack: '⚔', item: '🎒' };

export const ATTACK_KINDS = ['none', 'melee', 'ranged'] as const;
export type AttackKind = (typeof ATTACK_KINDS)[number];
export const ATTACK_KIND_LABELS: Record<AttackKind, string> = { none: 'Sin tirada de ataque', melee: 'Cuerpo a cuerpo', ranged: 'A distancia' };

/** Formas de área; son las mismas que las plantillas del tablero. */
export const AREA_SHAPES = ['none', 'circle', 'cone', 'line', 'square'] as const;
export type AreaShape = (typeof AREA_SHAPES)[number];
export const AREA_SHAPE_LABELS: Record<AreaShape, string> = { none: 'Sin área', circle: 'Esfera / círculo (radio)', cone: 'Cono (largo)', line: 'Línea (largo)', square: 'Cubo (lado)' };

export const RECHARGES = ['largo', 'corto', ''] as const;

/** Sugerencias para el tipo de daño (se puede escribir cualquier otro). */
export const DAMAGE_TYPE_SUGGESTIONS = ['ácido', 'contundente', 'cortante', 'frío', 'fuego', 'fuerza', 'necrótico', 'perforante', 'psíquico', 'radiante', 'relámpago', 'trueno', 'veneno'];

const expr = z.string().trim().max(300);
const text = (max: number) => z.string().max(max).default('');

export const damagePartSchema = z.object({ dice: expr, type: z.string().trim().max(40).default('') });
export type DamagePart = z.infer<typeof damagePartSchema>;

export const homebrewDataSchema = z
  .object({
    description: text(10000),
    // Hechizo
    /** 0 = truco. */
    level: z.number().int().min(0).max(9).default(1),
    school: text(40),
    castTime: text(60),
    range: text(60),
    components: text(200),
    duration: text(60),
    concentration: z.boolean().default(false),
    ritual: z.boolean().default(false),
    // Objeto
    category: text(40),
    rarity: text(40),
    weight: z.number().min(0).max(100000).default(0),
    cost: text(40),
    attunement: z.boolean().default(false),
    /** Se gasta al usarlo (pociones, pergaminos…): resta uno de la cantidad del inventario. */
    consumable: z.boolean().default(false),
    // Mecánica
    attack: z.enum(ATTACK_KINDS).default('none'),
    /** Bono de ataque: número o fórmula con @{campos} de la hoja ("@{conj_ataque}", "5"). */
    attackBonus: expr.default(''),
    /** Número mínimo del d20 para crítico. */
    critFrom: z.number().int().min(2).max(20).default(20),
    /** Característica de la salvación (la parte {a} del patrón de salvaciones de la plantilla); '' = sin salvación. */
    save: z.string().trim().max(48).default(''),
    /** CD: número o fórmula ("@{conj_cd}", "13"). */
    saveDc: expr.default(''),
    /** Si se salva, recibe la mitad del daño (si no, nada). */
    saveHalf: z.boolean().default(true),
    damage: z.array(damagePartSchema).max(6).default([]),
    heal: expr.default(''),
    /** Dados que se suman al primer daño (o a la curación) por cada nivel de espacio por encima del suyo. */
    upcast: expr.default(''),
    area: z.object({ shape: z.enum(AREA_SHAPES).default('none'), size: z.number().min(0).max(1000).default(0) }).prefault({}),
    /** Estados que se ponen a los objetivos alcanzados (o que fallan la salvación). */
    conditions: z.array(z.string().max(40)).max(10).default([]),
    /** Estado que se pone al lanzador al usarlo (p. ej. concentración). */
    selfStatus: text(40),
    /** Usos (0 = sin límite) y cuándo se recargan. */
    uses: z.number().int().min(0).max(99).default(0),
    recharge: z.enum(RECHARGES).default('largo'),
    /** Animación en el tablero al usarla: estilo ("auto" se deduce) y color ('' = el del tipo de daño). */
    fx: z
      .object({
        style: z.enum(FX_STYLES).default('auto'),
        color: z.string().regex(/^(#[0-9a-fA-F]{6})?$/).default(''),
      })
      .prefault({}),
  })
  .superRefine((d, ctx) => {
    const check = (value: string, path: (string | number)[], what: string) => {
      const err = value ? checkSyntax(value) : null;
      if (err) ctx.addIssue({ code: 'custom', path, message: `${what}: ${err}` });
    };
    check(d.attackBonus, ['attackBonus'], 'Bono de ataque');
    check(d.saveDc, ['saveDc'], 'CD de salvación');
    check(d.heal, ['heal'], 'Curación');
    check(d.upcast, ['upcast'], 'Mejora por nivel');
    d.damage.forEach((p, i) => check(p.dice, ['damage', i, 'dice'], `Daño ${i + 1}`));
  });
export type HomebrewData = z.infer<typeof homebrewDataSchema>;
export type HomebrewDataInput = z.input<typeof homebrewDataSchema>;

export interface HomebrewEntry {
  id: string;
  campaignId: string;
  /** Quién la creó. Si `shared`, la ve toda la mesa (solo el DM comparte). El DM las ve todas. */
  ownerId: string;
  shared: boolean;
  kind: HomebrewKind;
  name: string;
  data: HomebrewData;
  updatedAt: string;
}

export const createHomebrewSchema = z.object({
  kind: z.enum(HOMEBREW_KINDS),
  name: z.string().trim().min(1).max(80),
  shared: z.boolean().default(false),
  data: homebrewDataSchema.prefault({}),
});
export const updateHomebrewSchema = createHomebrewSchema.partial();
export type CreateHomebrewInput = z.input<typeof createHomebrewSchema>;
export type UpdateHomebrewInput = z.input<typeof updateHomebrewSchema>;
