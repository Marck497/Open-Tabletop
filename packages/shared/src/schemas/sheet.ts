import { z } from 'zod';
import { evaluate } from '../expr.js';

/**
 * Plantilla de hoja de personaje. Es solo datos: el DM puede editarla entera
 * (o cambiarla por la de otro sistema) sin tocar código.
 */
export const FIELD_TYPES = ['text', 'number', 'textarea', 'checkbox', 'select', 'computed', 'list'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texto',
  number: 'Número',
  textarea: 'Texto largo',
  checkbox: 'Casilla',
  select: 'Lista de opciones',
  computed: 'Calculado (fórmula)',
  list: 'Tabla (filas repetibles)',
};

const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-z_][a-z0-9_]*$/i, 'Solo letras sin tildes, números y "_" (sin empezar por número)');

const baseField = {
  key: keySchema,
  label: z.string().max(80),
  /** Fórmula para los campos calculados. */
  formula: z.string().max(500).optional(),
  /** Tirada asociada (muestra un botón 🎲). Puede usar @{campo}. */
  roll: z.string().max(500).optional(),
  /** Nombre de la tirada en el chat; por defecto, la etiqueta. */
  rollLabel: z.string().max(80).optional(),
  options: z.array(z.object({ value: z.string().max(80), label: z.string().max(80) })).max(100).optional(),
  default: z.union([z.string().max(5000), z.number(), z.boolean()]).optional(),
  /** Ancho en columnas de la sección (1 a 6). */
  span: z.number().int().min(1).max(6).optional(),
  hint: z.string().max(200).optional(),
  /** Al tirar este campo, el resultado entra en el orden de iniciativa. */
  initiative: z.boolean().optional(),
};

export interface SheetField {
  key: string;
  label: string;
  type: FieldType;
  formula?: string;
  roll?: string;
  rollLabel?: string;
  options?: { value: string; label: string }[];
  default?: string | number | boolean;
  span?: number;
  hint?: string;
  initiative?: boolean;
  /** Solo para tablas: columnas de cada fila. */
  columns?: SheetField[];
}

export const sheetFieldSchema: z.ZodType<SheetField> = z.lazy(() =>
  z.object({
    ...baseField,
    type: z.enum(FIELD_TYPES),
    columns: z.array(sheetFieldSchema).max(30).optional(),
  }),
);

export const sheetSectionSchema = z.object({
  id: keySchema,
  title: z.string().max(80),
  /** Columnas de la rejilla de la sección. */
  columns: z.number().int().min(1).max(6).default(2),
  fields: z.array(sheetFieldSchema).max(200),
});
export type SheetSection = z.infer<typeof sheetSectionSchema>;

export const tokenBarSchema = z.object({
  value: keySchema,
  max: keySchema.optional(),
  color: z.string().max(32).default('#c0392b'),
});

/**
 * Qué campos de la hoja usa el combate automático (IA de enemigos): CA, PG,
 * velocidad y la tabla de ataques. Son datos de la plantilla, así que sirven
 * para cualquier sistema.
 */
export const combatMappingSchema = z.object({
  /** Fórmula o campo con la defensa a superar (CA en 5e). */
  ac: z.string().max(200).default(''),
  /** Campo numérico de vida actual: al recibir daño se le resta. */
  hp: z.string().max(64).default(''),
  hpMax: z.string().max(200).default(''),
  /** Campo de puntos de golpe temporales (se dibujan en azul encima de la barra de vida). */
  hpTemp: z.string().max(64).default(''),
  /** Fórmula o campo con la velocidad, en las unidades de la escena (pies). */
  speed: z.string().max(200).default(''),
  /**
   * Tabla de ataques: columnas con el nombre, la tirada de ataque y la de daño, y opcionalmente
   * el daño extra (p. ej. "1d6 fuego") y desde qué número del d20 es crítico (20 por defecto).
   */
  attacks: z
    .object({ list: keySchema, name: keySchema, attack: keySchema, damage: keySchema, extra: keySchema.optional(), crit: keySchema.optional() })
    .nullable()
    .default(null),
  /** Tabla de conjuros: nombre, nivel (0 = truco) y tirada de efecto. Al lanzarlos se gasta un espacio. */
  spells: z.object({ list: keySchema, name: keySchema, level: keySchema, effect: keySchema }).nullable().optional(),
  /**
   * Espacios de conjuro por nivel: claves con {n} para el nivel ("espacios_{n}_max"). `pact` es una
   * casilla que, marcada, hace que los espacios se recuperen también con un descanso corto (brujo).
   */
  slots: z.object({ max: z.string().max(64), used: z.string().max(64), pact: z.string().max(64).default('') }).nullable().optional(),
  /** Tabla de recursos con usos (furia, ki, canalizar divinidad…): usos que quedan, máximo y cuándo se recargan. */
  resources: z.object({ list: keySchema, name: keySchema, uses: keySchema, max: keySchema, recharge: keySchema }).nullable().optional(),
  /** Inventario: nombre, cantidad y peso. Los objetos consumibles de las creaciones restan de la cantidad. */
  inventory: z.object({ list: keySchema, name: keySchema, qty: keySchema, weight: keySchema.optional() }).nullable().optional(),
  /** Campos de las salvaciones con {a} para la característica ("sv_{a}"): con ellos se tiran las salvaciones de las áreas. */
  saves: z.string().max(64).optional(),
  /** Fórmulas o campos del bono de ataque y la CD de conjuro, que usan de serie los hechizos nuevos. */
  spellAttack: z.string().max(200).optional(),
  spellDc: z.string().max(200).optional(),
  /** Modificador de lanzamiento (lo que suman las curaciones del SRD). */
  spellMod: z.string().max(200).optional(),
  /** Campos de texto con los tipos de daño (separados por comas) a los que es resistente, inmune o vulnerable. */
  defenses: z.object({ resist: z.string().max(64), immune: z.string().max(64), vulnerable: z.string().max(64) }).nullable().optional(),
});
export type CombatMapping = z.infer<typeof combatMappingSchema>;

/** Estado que se puede marcar en un token (condiciones de 5e, concentración...). */
export const statusDefSchema = z.object({
  id: keySchema,
  label: z.string().trim().min(1).max(40),
  /** Emoji o símbolo corto que se dibuja sobre el token. */
  icon: z.string().trim().min(1).max(8),
  /** La criatura no puede actuar (la IA se salta su turno y no la ataca si además está a 0 PG). */
  incapacitated: z.boolean().default(false),
  /** Bufo (verde) o perjuicio (rojo); sin marcar, neutro. */
  kind: z.enum(['buff', 'debuff']).optional(),
  /** Tipos de daño a los que da resistencia mientras se tiene (separados por comas; «todo» = cualquiera). */
  resist: z.string().max(200).optional(),
  /**
   * Concentración: al recibir daño se tira esta salvación (la parte {a} de las salvaciones, «con» en 5e)
   * contra CD max(10, daño / 2); si falla, o cae a 0 PG, se le quita el estado.
   */
  concentration: z.string().max(40).optional(),
});
export type StatusDef = z.infer<typeof statusDefSchema>;

export const sheetTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    version: z.number().int().default(1),
    sections: z.array(sheetSectionSchema).max(50),
    /** Barras que se dibujan sobre los tokens vinculados (p. ej. puntos de golpe). */
    bars: z.array(tokenBarSchema).max(3).default([]),
    combat: combatMappingSchema.optional(),
    /** Estados para los tokens. Si no hay, se usan las condiciones de 5e. */
    statuses: z.array(statusDefSchema).max(60).optional(),
  })
  .superRefine((t, ctx) => {
    const seen = new Set<string>();
    for (const s of t.sections)
      for (const f of s.fields) {
        if (seen.has(f.key)) ctx.addIssue({ code: 'custom', message: `Clave repetida: "${f.key}"`, path: ['sections'] });
        seen.add(f.key);
      }
  });
export type SheetTemplate = z.infer<typeof sheetTemplateSchema>;
export type SheetTemplateInput = z.input<typeof sheetTemplateSchema>;

/** Valores de una hoja: escalares o filas de tablas. */
export type SheetValue = string | number | boolean | SheetRow[];
export type SheetRow = Record<string, string | number | boolean> & { _id: string };
export type SheetValues = Record<string, SheetValue>;

export function allFields(template: SheetTemplate): SheetField[] {
  return template.sections.flatMap((s) => s.fields);
}

/** Valores iniciales de un personaje nuevo según la plantilla. */
export function defaultValues(template: SheetTemplate): SheetValues {
  const values: SheetValues = {};
  for (const f of allFields(template)) {
    if (f.type === 'computed') continue;
    if (f.type === 'list') values[f.key] = [];
    else if (f.default !== undefined) values[f.key] = f.default;
    else values[f.key] = f.type === 'number' ? 0 : f.type === 'checkbox' ? false : '';
  }
  return values;
}

/**
 * Crea un resolutor de referencias para fórmulas y tiradas: busca primero en la fila
 * (si la hay), luego en los valores y por último en los campos calculados.
 */
export function createResolver(template: SheetTemplate, values: SheetValues, row?: SheetRow) {
  const fields = new Map(allFields(template).map((f) => [f.key, f]));
  const cache = new Map<string, number>();
  const stack = new Set<string>();

  function resolve(name: string): unknown {
    if (row && name in row) return row[name];
    const field = fields.get(name);
    if (field?.type === 'computed') return computed(field);
    const v = values[name];
    return Array.isArray(v) ? v.length : v;
  }

  function computed(field: SheetField): number {
    if (cache.has(field.key)) return cache.get(field.key)!;
    if (stack.has(field.key) || !field.formula) return 0; // ciclo o sin fórmula
    stack.add(field.key);
    let value = 0;
    try {
      value = evaluate(field.formula, { resolve: (n) => resolve(n) }).value;
    } catch {
      value = 0;
    }
    stack.delete(field.key);
    cache.set(field.key, value);
    return value;
  }

  return resolve;
}

/** Valores de todos los campos calculados (para mostrarlos). */
export function computeAll(template: SheetTemplate, values: SheetValues): Record<string, number> {
  const resolve = createResolver(template, values);
  const out: Record<string, number> = {};
  for (const f of allFields(template)) if (f.type === 'computed') out[f.key] = Number(resolve(f.key)) || 0;
  return out;
}
