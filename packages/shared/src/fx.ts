import type { HomebrewData, HomebrewKind } from './schemas/homebrew.js';
import type { Measure } from './schemas/measure.js';

/**
 * Animaciones del tablero al atacar o lanzar un hechizo. Son datos: cada creación elige su estilo
 * y color (o "auto", que se deduce del tipo de ataque, el área y el tipo de daño) y el servidor
 * manda a cada uno solo lo que puede ver.
 */
export const FX_STYLES = ['auto', 'none', 'slash', 'arrow', 'bolt', 'beam', 'burst', 'heal', 'aura'] as const;
export type FxStyle = (typeof FX_STYLES)[number];
export type FxCueStyle = Exclude<FxStyle, 'auto' | 'none'>;
export const FX_STYLE_LABELS: Record<FxStyle, string> = {
  auto: 'Automática',
  none: 'Sin animación',
  slash: '⚔ Tajo (cuerpo a cuerpo)',
  arrow: '🏹 Flecha (a distancia)',
  bolt: '✨ Proyectil mágico',
  beam: '⚡ Rayo continuo',
  burst: '💥 Explosión',
  heal: '💚 Curación',
  aura: '🔆 Aura',
};

/** Lo que hay que animar (sin posiciones: las pone el servidor con los tokens). */
export interface FxCue {
  style: FxCueStyle;
  /** Color #rrggbb. */
  color: string;
  /** Crítico: más grande y con un destello extra. */
  crit: boolean;
}

/** Animación tal como llega a cada cliente, ya filtrada por lo que ve. */
export interface BoardFx extends FxCue {
  id: string;
  /** Centro del token que ataca (null si no está o no lo ve). */
  from: { x: number; y: number } | null;
  /** Objetivos: centro y radio de cada token. */
  to: { x: number; y: number; r: number }[];
  /** Plantilla de área colocada al lanzarlo. */
  area: Measure | null;
}

const DEFAULT_WEAPON = '#e9edf2';
const DEFAULT_SPELL = '#b98cff';
export const HEAL_COLOR = '#5ef08a';

/** Color de cada tipo de daño (sin tildes ni mayúsculas). */
const DAMAGE_COLORS: [RegExp, string][] = [
  [/fuego|fire|igneo|llama/, '#ff7a1a'],
  [/frio|cold|hielo/, '#7fd8ff'],
  [/relampago|rayo|electric|lightning/, '#fff36b'],
  [/trueno|thunder|sonico/, '#6fa8ff'],
  [/acido|acid/, '#9be03a'],
  [/veneno|poison/, '#5fbf3a'],
  [/necrotic|sombra/, '#9a6bd6'],
  [/radiante|radiant|sagrado/, '#ffe27a'],
  [/fuerza|force/, '#d27dff'],
  [/psiquic|psychic/, '#ff6ec7'],
  [/cortante|slashing|perforante|piercing|contundente|bludgeoning/, DEFAULT_WEAPON],
];

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Color del primer tipo de daño reconocible en el texto ("8d6 fuego"), o null. */
export function damageColor(text: string): string | null {
  const t = plain(text);
  for (const [re, color] of DAMAGE_COLORS) if (re.test(t)) return color;
  return null;
}

/** Color para la animación: el elegido, el del tipo de daño, verde si cura o el de por defecto. */
function colorOf(chosen: string | undefined, damageText: string, heals: boolean, magic: boolean) {
  if (chosen && /^#[0-9a-f]{6}$/i.test(chosen)) return chosen;
  const magical = damageColor(damageText.replace(/cortante|perforante|contundente/gi, ''));
  if (magical) return magical;
  if (heals) return HEAL_COLOR;
  return damageColor(damageText) ?? (magic ? DEFAULT_SPELL : DEFAULT_WEAPON);
}

/** Estilo "auto" de una creación según cómo ataca, su área y si solo cura. */
export function autoFxStyle(kind: HomebrewKind, d: Pick<HomebrewData, 'attack' | 'area' | 'damage' | 'heal' | 'save' | 'conditions'>): FxCueStyle | null {
  const hasDamage = d.damage.some((p) => p.dice.trim());
  if (d.heal.trim() && !hasDamage) return 'heal';
  if (d.attack === 'melee') return 'slash';
  if (d.attack === 'ranged') return kind === 'spell' ? 'bolt' : 'arrow';
  if (d.area.shape !== 'none' && d.area.size > 0) return 'burst';
  if (kind === 'spell') return hasDamage || d.save ? 'bolt' : 'aura';
  return hasDamage ? 'slash' : null;
}

/** Animación de una creación (null = ninguna). */
export function fxForHomebrew(entry: { kind: HomebrewKind; data: HomebrewData }, crit = false): FxCue | null {
  const d = entry.data;
  // Las creaciones guardadas antes de existir las animaciones no traen `fx`.
  const chosen = d.fx as HomebrewData['fx'] | undefined;
  const style = !chosen || chosen.style === 'auto' ? autoFxStyle(entry.kind, d) : chosen.style === 'none' ? null : chosen.style;
  if (!style) return null;
  const damageText = d.damage.map((p) => p.type).join(' ');
  return { style, color: colorOf(chosen?.color, damageText, !!d.heal.trim(), entry.kind === 'spell'), crit };
}

const RANGED_WEAPON = /arco|ballesta|honda|dardo|jabalina|flecha|virote|cerbatana|bow|crossbow|sling|dart|javelin/;

/**
 * Animación de una fila de la hoja sin creación enlazada: se deduce del nombre y del texto del daño
 * ("Arco largo" dispara una flecha; "Bola de fuego, 8d6 fuego" lanza un proyectil naranja).
 */
export function fxForRow(kind: 'attack' | 'cast', name: string, damageText: string, crit = false): FxCue {
  const t = plain(`${name} ${damageText}`);
  if (kind === 'cast') {
    const heals = /cura|sana|heal/.test(t) && !damageColor(damageText.replace(/cortante|perforante|contundente/gi, ''));
    return { style: heals ? 'heal' : 'bolt', color: colorOf(undefined, damageText, heals, true), crit };
  }
  return { style: RANGED_WEAPON.test(t) ? 'arrow' : 'slash', color: colorOf(undefined, damageText, false, false), crit };
}
