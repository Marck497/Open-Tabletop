/**
 * Datos del SRD 5.1 de D&D (© Wizards of the Coast, licencia CC-BY-4.0), sacados de
 * 5e-bits/5e-database (MIT) con `scripts/srd/build.mjs`. Los nombres van en español;
 * las descripciones largas se quedan en el inglés original.
 */

/** Características con las claves de la hoja de 5e. */
export const SRD_ABILITIES = ['fue', 'des', 'con', 'int', 'sab', 'car'] as const;
export type SrdAbility = (typeof SRD_ABILITIES)[number];

export interface SrdText {
  name: string;
  /** Texto original en inglés. */
  desc: string;
}

export interface SrdSpellDamage {
  /** Tipo de daño en español ("fuego"). */
  type: string;
  /** Dados según el nivel del espacio (conjuros) o del personaje (trucos). */
  bySlot?: Record<string, string>;
  byLevel?: Record<string, string>;
}

export interface SrdSpell {
  id: string;
  name: string;
  en: string;
  /** 0 = truco. */
  level: number;
  school: string;
  time: string;
  range: string;
  /** "V, S, M (…)". */
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  /** Ids de las clases que lo tienen en su lista. */
  classes: string[];
  attack?: 'melee' | 'ranged';
  /** Característica de la salvación. */
  save?: SrdAbility;
  damage?: SrdSpellDamage[];
  /** Curación según el nivel del espacio ("MOD" = modificador de lanzamiento). */
  heal?: Record<string, string>;
  /** Área, en español ("esfera de 20 pies"). */
  area?: string;
  desc: string;
  higher?: string;
}

export interface SrdWeapon {
  martial: boolean;
  ranged: boolean;
  damage: string;
  type: string;
  /** Daño a dos manos (versátil). */
  twoHanded?: string;
  /** Alcance en pies ("80/320"), si es a distancia o arrojadiza. */
  range?: string;
  /** Propiedades en español. */
  props: string[];
  finesse: boolean;
}

export interface SrdArmor {
  kind: 'ligera' | 'intermedia' | 'pesada' | 'escudo';
  base: number;
  dex: boolean;
  maxDex?: number;
  str?: number;
  stealthDisadvantage: boolean;
}

export interface SrdItem {
  id: string;
  name: string;
  en: string;
  /** arma, armadura, equipo, herramienta, montura, mágico… */
  cat: string;
  /** Precio legible ("15 po"). */
  cost?: string;
  weight?: number;
  weapon?: SrdWeapon;
  armor?: SrdArmor;
  /** Contenido de los paquetes de equipo: [id, cantidad]. */
  contents?: [string, number][];
  /** Rareza (objetos mágicos). */
  rarity?: string;
  desc?: string;
}

/** Algo que se recibe en el equipo inicial: un objeto concreto o "elige N de una categoría". */
export type SrdGear = { id: string; qty: number } | { category: string; choose: number };

/** Elección de equipo inicial: cada opción es un lote de objetos. */
export interface SrdEquipChoice {
  options: SrdGear[][];
}

/** Rasgo con opciones entre las que se elige (estilos de combate, antepasados…). */
export interface SrdTrait extends SrdText {
  options?: SrdText[];
}

export interface SrdFeature extends SrdTrait {
  level: number;
}

export interface SrdSpellcasting {
  ability: SrdAbility;
  /** Prepara de su lista cada día (clérigo, druida, mago, paladín) o conoce un número fijo. */
  prepares: boolean;
  /** Por nivel (índice 0 = nivel 1): trucos conocidos, conjuros conocidos y espacios por nivel de conjuro. */
  levels: { cantrips: number; known?: number; slots: number[] }[];
}

export interface SrdSubclass {
  id: string;
  name: string;
  en: string;
  /** Nivel en que se elige. */
  level: number;
  features: SrdFeature[];
}

export interface SrdClass {
  id: string;
  name: string;
  en: string;
  hitDie: number;
  saves: SrdAbility[];
  /** Competencias con armaduras, armas y herramientas (en español). */
  proficiencies: string[];
  skills: { choose: number; from: string[] };
  equipment: { id: string; qty: number }[];
  equipmentChoices: SrdEquipChoice[];
  spellcasting?: SrdSpellcasting;
  features: SrdFeature[];
  subclasses: SrdSubclass[];
}

export interface SrdSubrace {
  id: string;
  name: string;
  en: string;
  bonuses: Partial<Record<SrdAbility, number>>;
  traits: SrdTrait[];
  skills: string[];
  proficiencies: string[];
  /** Idiomas adicionales a elección. */
  extraLanguages?: number;
  /** Truco a elegir de la lista de una clase (alto elfo). */
  cantrip?: { choose: number; classId: string };
}

export interface SrdRace {
  id: string;
  name: string;
  en: string;
  speed: number;
  size: string;
  bonuses: Partial<Record<SrdAbility, number>>;
  /** Puntos a repartir (semielfo: +1 a dos características distintas). */
  bonusChoice?: { choose: number; amount: number; from: SrdAbility[] };
  languages: string[];
  /** Idiomas adicionales a elección. */
  extraLanguages: number;
  /** Competencias en habilidades que da la especie. */
  skills: string[];
  skillChoice?: { choose: number; from: string[] };
  /** Otras competencias (armas, herramientas). */
  proficiencies: string[];
  traits: SrdTrait[];
  subraces: SrdSubrace[];
}

export interface SrdBackground {
  id: string;
  name: string;
  en: string;
  skills: string[];
  extraLanguages: number;
  equipment: { id: string; qty: number }[];
  /** Elecciones de equipo (símbolo sagrado…). */
  equipmentChoices: SrdEquipChoice[];
  gold: number;
  feature: SrdText;
}

export interface SrdData {
  spells: SrdSpell[];
  items: SrdItem[];
  /** Objetos de cada categoría usada en las elecciones de equipo. */
  categories: Record<string, { name: string; items: string[] }>;
  classes: SrdClass[];
  races: SrdRace[];
  backgrounds: SrdBackground[];
  languages: string[];
}
