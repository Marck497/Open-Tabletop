import { DEFAULT_TOKEN_AI, type AiBehavior, type TokenAi } from '../schemas/ai.js';
import { allFields, type SheetTemplate, type SheetValues } from '../schemas/sheet.js';
import { combatOf } from '../systems/index.js';
import { traitDefenses } from '../systems/defenses.js';
import { DAMAGE_TYPE_SUGGESTIONS } from '../schemas/homebrew.js';
import { tr } from '../i18n/index.js';

/**
 * Compendio de monstruos del SRD 5.1 de D&D (contenido bajo licencia CC-BY-4.0,
 * © Wizards of the Coast). Los datos son los del bloque de estadísticas; al añadir
 * uno a la partida se crea su hoja y el token ya viene con la IA configurada.
 */

export const MONSTER_SIZES = ['diminuto', 'pequeño', 'mediano', 'grande', 'enorme', 'gargantuesco'] as const;
export type MonsterSize = (typeof MONSTER_SIZES)[number];

/** Casillas de lado que ocupa cada tamaño. */
export const SIZE_CELLS: Record<MonsterSize, number> = { diminuto: 1, pequeño: 1, mediano: 1, grande: 2, enorme: 3, gargantuesco: 4 };

export interface MonsterAttack {
  name: string;
  /** Bono de ataque, p. ej. "+4". */
  bonus: string;
  damage: string;
  type: string;
  /** Cuerpo a cuerpo (alcance en casillas) o a distancia (alcance normal en casillas). */
  ranged?: boolean;
  reach: number;
}

export interface Monster {
  id: string;
  name: string;
  /** Nombre en inglés (el del SRD), para buscarlo. */
  en: string;
  size: MonsterSize;
  type: string;
  cr: string;
  ac: number;
  hp: number;
  hitDice: string;
  speed: number;
  /** Otras velocidades (volar, trepar...), como texto. */
  speedNote?: string;
  /** FUE, DES, CON, INT, SAB, CAR. */
  abilities: [number, number, number, number, number, number];
  attacks: MonsterAttack[];
  traits: string;
  /** Comportamiento por defecto de su IA. */
  behavior: AiBehavior;
}

type Row = [
  id: string,
  name: string,
  en: string,
  size: MonsterSize,
  type: string,
  cr: string,
  ac: number,
  hp: number,
  hitDice: string,
  speed: number,
  abilities: Monster['abilities'],
  attacks: [name: string, bonus: number, damage: string, type: string, reach: number, ranged?: boolean][],
  traits: string,
  behavior?: AiBehavior,
  speedNote?: string,
];

const ROWS: Row[] = [
  ['plebeyo', 'Plebeyo', 'Commoner', 'mediano', 'Humanoide', '0', 10, 4, '1d8', 30, [10, 10, 10, 10, 10, 10], [['Garrote', 2, '1d4', 'contundente', 1]], '', 'cautious'],
  ['kobold', 'Kobold', 'Kobold', 'pequeño', 'Humanoide (kobold)', '1/8', 12, 5, '2d6 - 2', 30, [7, 15, 9, 8, 7, 8], [['Daga', 4, '1d4 + 2', 'perforante', 1], ['Honda', 4, '1d4 + 2', 'contundente', 6, true]], 'Sensibilidad a la luz solar. Tácticas de manada: ventaja si un aliado está a 5 pies del objetivo.', 'cautious'],
  ['rata-gigante', 'Rata gigante', 'Giant Rat', 'pequeño', 'Bestia', '1/8', 12, 7, '2d6', 30, [7, 15, 11, 2, 10, 4], [['Mordisco', 4, '1d4 + 2', 'perforante', 1]], 'Olfato agudo. Tácticas de manada.'],
  ['bandido', 'Bandido', 'Bandit', 'mediano', 'Humanoide', '1/8', 12, 11, '2d8 + 2', 30, [11, 12, 12, 10, 10, 10], [['Cimitarra', 3, '1d6 + 1', 'cortante', 1], ['Ballesta ligera', 3, '1d8 + 1', 'perforante', 16, true]], ''],
  ['guardia', 'Guardia', 'Guard', 'mediano', 'Humanoide', '1/8', 16, 11, '2d8 + 2', 30, [13, 12, 12, 10, 11, 10], [['Lanza', 3, '1d6 + 1', 'perforante', 1]], '', 'guard'],
  ['sectario', 'Sectario', 'Cultist', 'mediano', 'Humanoide', '1/8', 12, 9, '2d8', 30, [11, 12, 10, 10, 11, 10], [['Cimitarra', 3, '1d6 + 1', 'cortante', 1]], 'Devoción oscura: ventaja en salvaciones contra hechizado o asustado.'],
  ['acolito', 'Acólito', 'Acolyte', 'mediano', 'Humanoide', '1/4', 10, 9, '2d8', 30, [10, 10, 10, 10, 14, 11], [['Garrote', 2, '1d4', 'contundente', 1]], 'Lanzador de conjuros de nivel 1 (Sabiduría, CD 12): llama sagrada, curar heridas, bendición, santuario.', 'cautious'],
  ['goblin', 'Goblin', 'Goblin', 'pequeño', 'Humanoide (goblinoide)', '1/4', 15, 7, '2d6', 30, [8, 14, 10, 10, 8, 8], [['Cimitarra', 4, '1d6 + 2', 'cortante', 1], ['Arco corto', 4, '1d6 + 2', 'perforante', 16, true]], 'Huida ágil: puede retirarse o esconderse como acción adicional.', 'cautious'],
  ['esqueleto', 'Esqueleto', 'Skeleton', 'mediano', 'Muerto viviente', '1/4', 13, 13, '2d8 + 4', 30, [10, 14, 15, 6, 8, 5], [['Espada corta', 4, '1d6 + 2', 'perforante', 1], ['Arco corto', 4, '1d6 + 2', 'perforante', 16, true]], 'Vulnerable al daño contundente. Inmune al veneno y al agotamiento.'],
  ['zombi', 'Zombi', 'Zombie', 'mediano', 'Muerto viviente', '1/4', 8, 22, '3d8 + 9', 20, [13, 6, 16, 3, 6, 5], [['Golpe', 3, '1d6 + 1', 'contundente', 1]], 'Fortaleza de muerto viviente: si llega a 0 PG, salvación de CON (CD 5 + daño) para quedarse a 1 PG, salvo daño radiante o crítico.'],
  ['lobo', 'Lobo', 'Wolf', 'mediano', 'Bestia', '1/4', 13, 11, '2d8 + 2', 40, [12, 15, 12, 3, 12, 6], [['Mordisco', 4, '2d4 + 2', 'perforante', 1]], 'Tácticas de manada. Mordisco: salvación de FUE CD 11 o queda derribado.'],
  ['jabali', 'Jabalí', 'Boar', 'mediano', 'Bestia', '1/4', 11, 11, '2d8 + 2', 40, [13, 11, 12, 2, 9, 5], [['Colmillo', 3, '1d6 + 1', 'cortante', 1]], 'Carga: si avanza 20 pies en línea recta y acierta, +1d6 de daño y FUE CD 11 o derribado. Implacable (una vez por descanso).'],
  ['orco', 'Orco', 'Orc', 'mediano', 'Humanoide (orco)', '1/2', 13, 15, '2d8 + 6', 30, [16, 12, 16, 7, 11, 10], [['Gran hacha', 5, '1d12 + 3', 'cortante', 1], ['Jabalina', 5, '1d6 + 3', 'perforante', 6, true]], 'Agresivo: como acción adicional se mueve hacia un enemigo que vea.'],
  ['hobgoblin', 'Hobgoblin', 'Hobgoblin', 'mediano', 'Humanoide (goblinoide)', '1/2', 18, 11, '2d8 + 2', 30, [13, 12, 12, 10, 10, 9], [['Espada larga', 3, '1d8 + 1', 'cortante', 1], ['Arco largo', 3, '1d8 + 1', 'perforante', 30, true]], 'Ventaja marcial: +2d6 de daño una vez por turno si un aliado está a 5 pies del objetivo.'],
  ['gnoll', 'Gnoll', 'Gnoll', 'mediano', 'Humanoide (gnoll)', '1/2', 15, 22, '5d8', 30, [14, 12, 11, 6, 10, 7], [['Lanza', 4, '1d6 + 2', 'perforante', 1], ['Mordisco', 4, '1d4 + 2', 'perforante', 1], ['Arco largo', 3, '1d8 + 1', 'perforante', 30, true]], 'Desenfreno: si deja a una criatura a 0 PG, puede moverse y morder como acción adicional.'],
  ['hombre-lagarto', 'Hombre lagarto', 'Lizardfolk', 'mediano', 'Humanoide (hombre lagarto)', '1/2', 15, 22, '4d8 + 4', 30, [15, 10, 13, 7, 12, 7], [['Garrote pesado', 4, '1d6 + 2', 'contundente', 1], ['Mordisco', 4, '1d6 + 2', 'perforante', 1], ['Jabalina', 4, '1d6 + 2', 'perforante', 6, true]], 'Contiene la respiración 15 minutos. Multiataque: dos ataques cuerpo a cuerpo distintos.', 'melee', 'nadar 30'],
  ['matón', 'Matón', 'Thug', 'mediano', 'Humanoide', '1/2', 11, 32, '5d8 + 10', 30, [15, 11, 14, 10, 10, 11], [['Maza', 4, '1d6 + 2', 'contundente', 1], ['Ballesta pesada', 2, '1d10', 'perforante', 20, true]], 'Multiataque: dos golpes de maza. Tácticas de manada.'],
  ['oso-negro', 'Oso negro', 'Black Bear', 'mediano', 'Bestia', '1/2', 11, 19, '3d8 + 6', 40, [15, 10, 14, 2, 12, 7], [['Garras', 3, '2d4 + 2', 'cortante', 1], ['Mordisco', 3, '1d6 + 2', 'perforante', 1]], 'Multiataque: mordisco y garras. Olfato agudo.', 'melee', 'trepar 30'],
  ['sombra', 'Sombra', 'Shadow', 'mediano', 'Muerto viviente', '1/2', 12, 16, '3d8 + 3', 40, [6, 14, 13, 6, 10, 8], [['Drenar fuerza', 4, '2d6 + 2', 'necrótico', 1]], 'Amorfa, sigilo en la sombra (se esconde como acción adicional). Su ataque reduce la FUE en 1d4. Vulnerable al radiante.'],
  ['osgo', 'Osgo', 'Bugbear', 'mediano', 'Humanoide (goblinoide)', '1', 16, 27, '5d8 + 5', 30, [15, 14, 13, 8, 11, 9], [['Lucero del alba', 4, '2d8 + 2', 'perforante', 1], ['Jabalina', 4, '1d6 + 2', 'perforante', 6, true]], 'Bruto: un dado de daño extra con armas cuerpo a cuerpo. Ataque sorpresa: +2d6 si sorprende.'],
  ['necrofago', 'Necrófago', 'Ghoul', 'mediano', 'Muerto viviente', '1', 12, 22, '5d8', 30, [13, 15, 10, 7, 10, 6], [['Garras', 4, '2d4 + 2', 'cortante', 1], ['Mordisco', 2, '2d6 + 2', 'perforante', 1]], 'Garras: salvación de CON CD 10 o paralizado 1 minuto (salvo elfos y muertos vivientes).'],
  ['lobo-terrible', 'Lobo terrible', 'Dire Wolf', 'grande', 'Bestia', '1', 14, 37, '5d10 + 10', 50, [17, 15, 15, 3, 12, 7], [['Mordisco', 5, '2d6 + 3', 'perforante', 1]], 'Tácticas de manada. Mordisco: salvación de FUE CD 13 o derribado.'],
  ['arana-gigante', 'Araña gigante', 'Giant Spider', 'grande', 'Bestia', '1', 14, 26, '4d10 + 4', 30, [14, 16, 12, 2, 11, 4], [['Mordisco', 5, '1d8 + 3', 'perforante (+2d8 veneno, CON CD 11 mitad)', 1]], 'Trepa por telarañas y paredes. Telaraña (recarga 5-6): ataque a distancia +5, apresa al objetivo.', 'melee', 'trepar 30'],
  ['oso-pardo', 'Oso pardo', 'Brown Bear', 'grande', 'Bestia', '1', 11, 34, '4d10 + 12', 40, [19, 10, 16, 2, 13, 7], [['Garras', 6, '2d6 + 4', 'cortante', 1], ['Mordisco', 6, '1d8 + 4', 'perforante', 1]], 'Multiataque: mordisco y garras. Olfato agudo.', 'melee', 'trepar 30'],
  ['arpia', 'Arpía', 'Harpy', 'mediano', 'Monstruosidad', '1', 11, 38, '7d8 + 7', 20, [12, 13, 12, 7, 10, 13], [['Garras', 3, '2d4 + 1', 'cortante', 1], ['Garrote', 3, '1d4 + 1', 'contundente', 1]], 'Canción seductora: SAB CD 11 o queda hechizado y va hacia ella.', 'melee', 'volar 40'],
  ['espectro', 'Espectro', 'Specter', 'mediano', 'Muerto viviente', '1', 12, 22, '5d8', 0, [1, 14, 11, 10, 10, 11], [['Drenar vida', 4, '3d6', 'necrótico', 1]], 'Incorpóreo: atraviesa criaturas y objetos. Drenar vida reduce los PG máximos (CON CD 10).', 'melee', 'volar 50'],
  ['capitan-bandido', 'Capitán bandido', 'Bandit Captain', 'mediano', 'Humanoide', '2', 15, 65, '10d8 + 20', 30, [15, 16, 14, 14, 11, 14], [['Cimitarra', 5, '1d6 + 3', 'cortante', 1], ['Daga', 5, '1d4 + 3', 'perforante', 1]], 'Multiataque: dos cimitarras y una daga. Parada: +2 a la CA contra un ataque como reacción.'],
  ['ogro', 'Ogro', 'Ogre', 'grande', 'Gigante', '2', 11, 59, '7d10 + 21', 40, [19, 8, 16, 5, 7, 7], [['Gran garrote', 6, '2d8 + 4', 'contundente', 1], ['Jabalina', 6, '2d6 + 4', 'perforante', 6, true]], ''],
  ['gargola', 'Gárgola', 'Gargoyle', 'mediano', 'Elemental', '2', 15, 52, '7d8 + 21', 30, [15, 11, 16, 6, 11, 7], [['Garras', 4, '1d6 + 2', 'cortante', 1], ['Mordisco', 4, '1d6 + 2', 'perforante', 1]], 'Falsa apariencia: inmóvil parece una estatua. Resistente a armas no mágicas.', 'guard', 'volar 60'],
  ['mimeto', 'Mimeto', 'Mimic', 'mediano', 'Monstruosidad', '2', 12, 58, '9d8 + 18', 15, [17, 12, 15, 5, 13, 8], [['Mordisco', 5, '1d8 + 3', 'perforante (+1d8 ácido)', 1], ['Seudópodo', 5, '1d8 + 3', 'contundente (y queda pegado)', 1]], 'Cambiaformas (se hace pasar por un objeto). Adhesivo: lo que toca queda apresado (CD 13).', 'guard'],
  ['cubo-gelatinoso', 'Cubo gelatinoso', 'Gelatinous Cube', 'grande', 'Cieno', '2', 6, 84, '8d10 + 40', 15, [14, 3, 20, 1, 6, 1], [['Seudópodo', 4, '3d6', 'ácido', 1]], 'Transparente. Engullir: entra en el espacio de criaturas (DES CD 12) y las disuelve (6d6 ácido por turno).'],
  ['ankheg', 'Ankheg', 'Ankheg', 'grande', 'Monstruosidad', '2', 14, 39, '6d10 + 6', 30, [17, 11, 13, 1, 13, 6], [['Mordisco', 5, '2d6 + 3', 'cortante (+1d4 ácido)', 1]], 'Excava (10 pies). Rocía ácido (recarga 6): línea de 30 pies, 3d6 ácido (DES CD 13 mitad).', 'melee', 'excavar 10'],
  ['oso-lechuza', 'Oso lechuza', 'Owlbear', 'grande', 'Monstruosidad', '3', 13, 59, '7d10 + 21', 40, [20, 12, 17, 3, 12, 7], [['Garras', 7, '2d8 + 5', 'cortante', 1], ['Pico', 7, '1d10 + 5', 'perforante', 1]], 'Multiataque: pico y garras. Vista y olfato agudos.'],
  ['minotauro', 'Minotauro', 'Minotaur', 'grande', 'Monstruosidad', '3', 14, 76, '9d10 + 27', 40, [18, 11, 16, 6, 16, 9], [['Gran hacha', 6, '2d12 + 4', 'cortante', 1], ['Cornada', 6, '2d8 + 4', 'perforante', 1]], 'Carga: si avanza 10 pies y acierta la cornada, +2d8 y FUE CD 14 o empujado y derribado. Memoria laberíntica.'],
  ['tumulario', 'Tumulario', 'Wight', 'mediano', 'Muerto viviente', '3', 14, 45, '6d8 + 18', 30, [15, 14, 16, 10, 13, 15], [['Espada larga', 4, '1d8 + 2', 'cortante', 1], ['Drenar vida', 4, '1d6 + 2', 'necrótico', 1], ['Arco largo', 4, '1d8 + 2', 'perforante', 30, true]], 'Multiataque: dos espadazos o uno y drenar vida. Sensibilidad a la luz solar.'],
  ['basilisco', 'Basilisco', 'Basilisk', 'mediano', 'Monstruosidad', '3', 15, 52, '8d8 + 16', 20, [16, 8, 15, 2, 8, 7], [['Mordisco', 5, '2d6 + 3', 'perforante (+2d6 veneno)', 1]], 'Mirada petrificante: quien empiece su turno a 30 pies y lo vea, CON CD 12 o empieza a convertirse en piedra.'],
  ['perro-infernal', 'Perro infernal', 'Hell Hound', 'mediano', 'Infernal', '3', 15, 45, '7d8 + 14', 50, [17, 12, 14, 6, 13, 6], [['Mordisco', 5, '1d8 + 3', 'perforante (+2d6 fuego)', 1]], 'Inmune al fuego. Aliento de fuego (recarga 5-6): cono de 15 pies, 6d6 fuego (DES CD 12 mitad). Tácticas de manada.'],
  ['manticora', 'Mantícora', 'Manticore', 'grande', 'Monstruosidad', '3', 14, 68, '8d10 + 24', 30, [17, 16, 17, 7, 12, 8], [['Púas de la cola', 5, '1d8 + 3', 'perforante', 20, true], ['Mordisco', 5, '1d8 + 3', 'perforante', 1], ['Garra', 5, '1d6 + 3', 'cortante', 1]], 'Multiataque: tres ataques (mordisco y dos garras, o tres púas). 24 púas que vuelven a crecer.', 'ranged', 'volar 50'],
  ['veterano', 'Veterano', 'Veteran', 'mediano', 'Humanoide', '3', 17, 58, '9d8 + 18', 30, [16, 13, 14, 10, 11, 10], [['Espada larga', 5, '1d8 + 3', 'cortante', 1], ['Espada corta', 5, '1d6 + 3', 'perforante', 1], ['Ballesta pesada', 3, '1d10 + 1', 'perforante', 20, true]], 'Multiataque: dos espadazos y una espada corta.'],
  ['caballero', 'Caballero', 'Knight', 'mediano', 'Humanoide', '3', 18, 52, '8d8 + 16', 30, [16, 11, 14, 11, 11, 15], [['Mandoble', 5, '2d6 + 3', 'cortante', 1], ['Ballesta pesada', 2, '1d10', 'perforante', 20, true]], 'Multiataque: dos mandobles. Valiente. Liderazgo y parada.'],
  ['aparicion', 'Aparición', 'Wraith', 'mediano', 'Muerto viviente', '5', 13, 67, '9d8 + 27', 0, [6, 16, 16, 12, 14, 15], [['Drenar vida', 6, '4d8 + 3', 'necrótico', 1]], 'Incorpórea. Resistente a armas no mágicas. Crea espectros con los humanoides que mata.', 'melee', 'volar 60'],
  ['trol', 'Trol', 'Troll', 'grande', 'Gigante', '5', 15, 84, '8d10 + 40', 30, [18, 13, 20, 7, 9, 7], [['Garra', 7, '2d6 + 4', 'cortante', 1], ['Mordisco', 7, '1d6 + 4', 'perforante', 1]], 'Multiataque: mordisco y dos garras. Regeneración: recupera 10 PG al inicio de su turno salvo daño de ácido o fuego.'],
  ['gigante-colinas', 'Gigante de las colinas', 'Hill Giant', 'enorme', 'Gigante', '5', 13, 105, '10d12 + 40', 40, [21, 8, 19, 5, 9, 6], [['Gran garrote', 8, '3d8 + 5', 'contundente', 2], ['Roca', 8, '3d10 + 5', 'contundente', 12, true]], 'Multiataque: dos golpes de gran garrote.'],
  ['mago', 'Mago', 'Mage', 'mediano', 'Humanoide', '6', 12, 40, '9d8', 30, [9, 14, 11, 17, 12, 11], [['Rayo de fuego', 6, '2d10', 'fuego', 24, true], ['Daga', 5, '1d4 + 2', 'perforante', 1]], 'Lanzador de nivel 9 (Inteligencia, CD 14): armadura de mago (CA 15), escudo, misil mágico, bola de fuego, contraconjuro, invisibilidad mayor, cono de frío...', 'ranged'],
  ['dragon-rojo-joven', 'Dragón rojo joven', 'Young Red Dragon', 'grande', 'Dragón', '10', 18, 178, '17d10 + 85', 40, [23, 10, 21, 14, 11, 19], [['Mordisco', 10, '2d10 + 6', 'perforante (+1d6 fuego)', 2], ['Garra', 10, '2d6 + 6', 'cortante', 1]], 'Multiataque: mordisco y dos garras. Aliento de fuego (recarga 5-6): cono de 30 pies, 16d6 fuego (DES CD 17 mitad). Inmune al fuego.', 'melee', 'trepar 40, volar 80'],
];

export const MONSTERS: Monster[] = ROWS.map(([id, name, en, size, type, cr, ac, hp, hitDice, speed, abilities, attacks, traits, behavior, speedNote]) => ({
  id,
  name,
  en,
  size,
  type,
  cr,
  ac,
  hp,
  hitDice,
  speed,
  speedNote,
  abilities,
  attacks: attacks.map(([n, bonus, damage, t, reach, ranged]) => ({ name: n, bonus: `+${bonus}`, damage, type: t, reach, ranged })),
  traits,
  behavior: behavior ?? (attacks[0]?.[5] ? 'ranged' : 'melee'),
}));

export const monsterById = (id: string) => MONSTERS.find((m) => m.id === id);

/** Valor numérico del valor de desafío ("1/4" → 0.25). */
export function crValue(cr: string): number {
  const [a, b] = cr.split('/').map(Number);
  return b ? a! / b : a!;
}

/** Bono de competencia según el VD. */
export const proficiencyOf = (cr: string) => 2 + Math.floor(Math.max(0, Math.ceil(crValue(cr)) - 1) / 4);

const ABILITY_KEYS = ['fue', 'des', 'con', 'int', 'sab', 'car'] as const;

/**
 * Valores de la hoja para un monstruo. Usa el mapeo de combate de la plantilla (CA, PG,
 * velocidad, tabla de ataques) y, si existen, los campos de la plantilla de 5e; los campos
 * que la plantilla no tenga se ignoran, así que vale aunque el DM la haya cambiado.
 */
export function monsterValues(template: SheetTemplate, m: Monster): SheetValues {
  const keys = new Set(allFields(template).map((f) => f.key));
  const out: SheetValues = {};
  const put = (key: string | undefined, value: SheetValues[string]) => {
    if (key && keys.has(key)) out[key] = value;
  };
  const combat = combatOf(template);
  put(combat?.ac, m.ac);
  put(combat?.hp, m.hp);
  put(combat?.hpMax, m.hp);
  put(combat?.speed, m.speed);
  if (combat?.attacks && keys.has(combat.attacks.list)) {
    const { list, name, attack, damage } = combat.attacks;
    const hasType = allFields(template).some((f) => f.key === list && f.columns?.some((c) => c.key === 'tipo'));
    out[list] = m.attacks.map((a, i) => ({
      _id: `a${i}`,
      [name]: tr(a.name),
      [attack]: a.bonus,
      [damage]: a.damage,
      ...(hasType
        ? { tipo: a.ranged ? tr('{type}, a distancia {feet} pies', { type: tr(a.type), feet: a.reach * 5 }) : a.reach > 1 ? tr('{type}, alcance {feet} pies', { type: tr(a.type), feet: a.reach * 5 }) : tr(a.type) }
        : {}),
    }));
  }
  ABILITY_KEYS.forEach((k, i) => put(k, m.abilities[i]!));
  // El bono de competencia de la plantilla de 5e sale del nivel: se elige uno que dé el del VD.
  put('nivel', (proficiencyOf(m.cr) - 2) * 4 + 1);
  put('clase', tr('Monstruo (VD {cr})', { cr: m.cr }));
  put('raza', `${tr(m.type)}, ${tr(m.size)}`);
  put('dados_golpe', m.hitDice);
  const notes = [m.speedNote ? tr('Velocidad: {speed} pies, {note}.', { speed: m.speed, note: tr(m.speedNote) }) : '', m.traits && tr(m.traits), `${m.en} — SRD 5.1 (CC-BY-4.0).`]
    .filter(Boolean)
    .join('\n\n');
  // Resistencias, inmunidades y vulnerabilidades escritas en los rasgos, a los campos de la hoja.
  const def = traitDefenses(m.traits, DAMAGE_TYPE_SUGGESTIONS);
  const map = combat?.defenses;
  if (map) {
    if (def.resist.length) put(map.resist, def.resist.join(', '));
    if (def.immune.length) put(map.immune, def.immune.join(', '));
    if (def.vulnerable.length) put(map.vulnerable, def.vulnerable.join(', '));
  }
  if (keys.has('rasgos')) out.rasgos = notes;
  else put('notas', notes);
  return out;
}

/** IA con la que viene el token del monstruo. */
export function monsterAi(m: Monster): TokenAi {
  const melee = m.attacks.find((a) => !a.ranged);
  const ranged = m.attacks.find((a) => a.ranged);
  const behavior = m.behavior === 'ranged' && !ranged ? 'melee' : m.behavior;
  // Usa el primer ataque del tipo que va con su comportamiento.
  const main = behavior === 'ranged' ? ranged : (melee ?? ranged);
  return {
    ...DEFAULT_TOKEN_AI,
    enabled: true,
    behavior,
    reach: melee?.reach ?? 1,
    range: ranged?.reach ?? DEFAULT_TOKEN_AI.range,
    attackIndex: main ? m.attacks.indexOf(main) : 0,
  };
}
