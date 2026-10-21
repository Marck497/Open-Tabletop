import { z } from 'zod';

/**
 * IA básica de enemigos: cada token puede tener un comportamiento. En su turno de
 * iniciativa el servidor decide adónde se mueve, a quién ataca y tira los dados.
 */
export const AI_BEHAVIORS = ['melee', 'ranged', 'cautious', 'guard'] as const;
export type AiBehavior = (typeof AI_BEHAVIORS)[number];
export const AI_BEHAVIOR_LABELS: Record<AiBehavior, string> = {
  melee: 'Cuerpo a cuerpo: va a por su objetivo y ataca',
  ranged: 'A distancia: mantiene la distancia y dispara',
  cautious: 'Prudente: ataca, pero huye cuando está malherido',
  guard: 'Guardián: no se mueve hasta que alguien se acerca',
};

export const AI_TARGETS = ['nearest', 'weakest', 'random'] as const;
export type AiTarget = (typeof AI_TARGETS)[number];
export const AI_TARGET_LABELS: Record<AiTarget, string> = {
  nearest: 'El más cercano',
  weakest: 'El más herido',
  random: 'Al azar',
};

export const tokenAiSchema = z.object({
  enabled: z.boolean().default(true),
  behavior: z.enum(AI_BEHAVIORS).default('melee'),
  target: z.enum(AI_TARGETS).default('nearest'),
  /** Alcance cuerpo a cuerpo, en casillas. */
  reach: z.number().int().min(1).max(10).default(1),
  /** Alcance de los ataques a distancia, en casillas. */
  range: z.number().int().min(1).max(100).default(12),
  /** Guardián: distancia (casillas) a la que reacciona. */
  guardRadius: z.number().int().min(1).max(100).default(6),
  /** Prudente: huye por debajo de esta fracción de vida (0,25 = 25 %). */
  fleeBelow: z.number().min(0).max(1).default(0.25),
  /** Para tokens sin hoja (o para sustituir lo que diga la hoja). */
  speed: z.number().min(0).max(1000).nullable().default(null),
  attackName: z.string().trim().max(60).default(''),
  attack: z.string().trim().max(200).default(''),
  damage: z.string().trim().max(200).default(''),
  /** Qué ataque de la tabla de la hoja usa (por defecto, el primero). */
  attackIndex: z.number().int().min(0).max(50).default(0),
});
export type TokenAi = z.infer<typeof tokenAiSchema>;
export type TokenAiInput = z.input<typeof tokenAiSchema>;

export const DEFAULT_TOKEN_AI: TokenAi = tokenAiSchema.parse({});

/** Ajustes de IA de la partida (se guardan con el orden de iniciativa). */
export interface AiSettings {
  /** Los enemigos con IA actúan solos al llegar su turno y lo pasan al acabar. */
  auto: boolean;
  /** Resta el daño de los ataques que impactan a la vida del objetivo. */
  applyDamage: boolean;
}
export const DEFAULT_AI_SETTINGS: AiSettings = { auto: false, applyDamage: true };
