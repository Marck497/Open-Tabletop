// Nombres en español de los rasgos de clase del SRD 5.1. Los prefijos ("Fighting Style: …") y los paréntesis se traducen por partes.
const BASE = {
  Rage: 'Furia', 'Unarmored Defense': 'Defensa sin armadura', 'Reckless Attack': 'Ataque temerario', 'Danger Sense': 'Sentir el peligro', 'Primal Path': 'Senda primaria',
  Frenzy: 'Frenesí', 'Ability Score Improvement': 'Mejora de característica', 'Extra Attack': 'Ataque adicional', 'Fast Movement': 'Movimiento rápido',
  'Mindless Rage': 'Furia irracional', 'Path feature': 'Rasgo de senda', 'Feral Instinct': 'Instinto salvaje', 'Brutal Critical': 'Crítico brutal',
  'Intimidating Presence': 'Presencia intimidante', 'Relentless Rage': 'Furia incansable', Retaliation: 'Represalia', 'Persistent Rage': 'Furia persistente',
  'Indomitable Might': 'Poderío indómito', 'Primal Champion': 'Campeón primario', Spellcasting: 'Lanzamiento de conjuros', 'Bardic Inspiration': 'Inspiración bárdica',
  'Jack of All Trades': 'Polivalente', 'Song of Rest': 'Canción de descanso', 'Bard College': 'Colegio bárdico', 'Bonus Proficiencies': 'Competencias adicionales',
  'Cutting Words': 'Palabras hirientes', Expertise: 'Pericia', 'Font of Inspiration': 'Fuente de inspiración', Countercharm: 'Contraencantamiento',
  'Bard College feature': 'Rasgo de colegio bárdico', 'Additional Magical Secrets': 'Secretos mágicos adicionales', 'Magical Secrets': 'Secretos mágicos',
  'Peerless Skill': 'Habilidad sin par', 'Superior Inspiration': 'Inspiración superior', 'Divine Domain': 'Dominio divino', 'Domain Spells': 'Conjuros de dominio',
  'Bonus Proficiency': 'Competencia adicional', 'Disciple of Life': 'Discípulo de la vida', 'Channel Divinity': 'Canalizar divinidad', 'Turn Undead': 'Expulsar muertos vivientes',
  'Divine Domain feature': 'Rasgo de dominio divino', 'Preserve Life': 'Preservar la vida', 'Destroy Undead': 'Destruir muertos vivientes', 'Blessed Healer': 'Sanador bendito',
  'Divine Strike': 'Golpe divino', 'Divine Intervention': 'Intervención divina', 'Supreme Healing': 'Curación suprema', 'Divine Intervention Improvement': 'Intervención divina mejorada',
  Druidic: 'Druídico', 'Wild Shape': 'Forma salvaje', 'Druid Circle': 'Círculo druídico', 'Circle of the Land': 'Círculo de la tierra', 'Bonus Cantrip': 'Truco adicional',
  'Natural Recovery': 'Recuperación natural', 'Circle Spells': 'Conjuros de círculo', 'Druid Circle feature': 'Rasgo de círculo druídico', "Land's Stride": 'Zancada terrestre',
  "Nature's Ward": 'Protección de la naturaleza', "Nature's Sanctuary": 'Santuario de la naturaleza', 'Timeless Body': 'Cuerpo atemporal', 'Beast Spells': 'Conjuros bestiales',
  Archdruid: 'Archidruida', 'Fighting Style': 'Estilo de combate', Archery: 'Combate con arco', Defense: 'Defensa', Dueling: 'Combate con un arma',
  'Great Weapon Fighting': 'Combate con armas grandes', Protection: 'Protección', 'Two-Weapon Fighting': 'Combate con dos armas', 'Second Wind': 'Tomar aliento',
  'Action Surge': 'Oleada de acción', 'Martial Archetype': 'Arquetipo marcial', 'Improved Critical': 'Crítico mejorado', 'Remarkable Athlete': 'Atleta excepcional',
  'Martial Archetype feature': 'Rasgo de arquetipo marcial', Indomitable: 'Indómito', 'Additional Fighting Style': 'Estilo de combate adicional', 'Superior Critical': 'Crítico superior',
  Survivor: 'Superviviente', 'Martial Arts': 'Artes marciales', Ki: 'Ki', 'Flurry of Blows': 'Ráfaga de golpes', 'Patient Defense': 'Defensa paciente',
  'Step of the Wind': 'Paso del viento', 'Unarmored Movement': 'Movimiento sin armadura', 'Monastic Tradition': 'Tradición monástica', 'Deflect Missiles': 'Desviar proyectiles',
  'Open Hand Technique': 'Técnica de la mano abierta', 'Slow Fall': 'Caída lenta', 'Stunning Strike': 'Golpe aturdidor', 'Ki Empowered Strikes': 'Golpes potenciados por ki',
  'Monastic Tradition feature': 'Rasgo de tradición monástica', 'Wholeness of Body': 'Plenitud corporal', Evasion: 'Evasión', 'Stillness of Mind': 'Mente tranquila',
  'Purity of Body': 'Pureza corporal', Tranquility: 'Tranquilidad', 'Tongue of the Sun and Moon': 'Lengua del sol y la luna', 'Diamond Soul': 'Alma diamantina',
  'Quivering Palm': 'Palma temblorosa', 'Empty Body': 'Cuerpo vacío', 'Perfect Self': 'Perfección', 'Divine Sense': 'Sentidos divinos', 'Lay on Hands': 'Imposición de manos',
  'Divine Smite': 'Castigo divino', 'Divine Health': 'Salud divina', 'Sacred Oath': 'Juramento sagrado', 'Oath Spells': 'Conjuros de juramento', 'Sacred Weapon': 'Arma sagrada',
  'Turn the Unholy': 'Expulsar a los impíos', 'Aura of Protection': 'Aura de protección', 'Sacred Oath feature': 'Rasgo de juramento sagrado', 'Aura of Devotion': 'Aura de entrega',
  'Aura of Courage': 'Aura de valor', 'Improved Divine Smite': 'Castigo divino mejorado', 'Cleansing Touch': 'Toque purificador', 'Purity of Spirit': 'Pureza de espíritu',
  'Aura improvements': 'Auras mejoradas', 'Holy Nimbus': 'Nimbo sagrado', 'Favored Enemy': 'Enemigo predilecto', 'Natural Explorer': 'Explorador nato',
  'Ranger Archetype': 'Arquetipo de explorador', "Hunter's Prey": 'Presa del cazador', 'Colossus Slayer': 'Asesino de colosos', 'Giant Killer': 'Matagigantes',
  'Horde Breaker': 'Rompehordas', 'Primeval Awareness': 'Conciencia primigenia', 'Ranger Archetype feature': 'Rasgo de arquetipo de explorador',
  'Defensive Tactics': 'Tácticas defensivas', 'Escape the Horde': 'Escapar de la horda', 'Multiattack Defense': 'Defensa contra ataques múltiples', 'Steel Will': 'Voluntad de acero',
  'Hide in Plain Sight': 'Esconderse a plena vista', Multiattack: 'Ataque múltiple', Volley: 'Andanada', 'Whirlwind Attack': 'Ataque torbellino', Vanish: 'Desvanecerse',
  "Superior Hunter's Defense": 'Defensa superior del cazador', 'Stand Against the Tide': 'Contra la marea', 'Uncanny Dodge': 'Esquiva asombrosa', 'Feral Senses': 'Sentidos salvajes',
  'Foe Slayer': 'Asesino de enemigos', 'Sneak Attack': 'Ataque furtivo', "Thieves' Cant": 'Jerga de ladrones', 'Cunning Action': 'Acción astuta', 'Roguish Archetype': 'Arquetipo de pícaro',
  'Fast Hands': 'Manos rápidas', 'Second-Story Work': 'Trabajo en las alturas', 'Roguish Archetype feature': 'Rasgo de arquetipo de pícaro', 'Supreme Sneak': 'Sigilo supremo',
  'Reliable Talent': 'Talento fiable', 'Use Magic Device': 'Usar objeto mágico', Blindsense: 'Sentido ciego', 'Slippery Mind': 'Mente escurridiza', "Thief's Reflexes": 'Reflejos de ladrón',
  Elusive: 'Escurridizo', 'Stroke of Luck': 'Golpe de suerte', 'Sorcerous Origin': 'Origen hechicero', 'Dragon Ancestor': 'Antepasado dracónico', 'Draconic Resilience': 'Resistencia dracónica',
  'Font of Magic': 'Fuente de magia', 'Flexible Casting': 'Lanzamiento flexible', 'Creating Spell Slots': 'Crear espacios de conjuro', 'Converting Spell Slot': 'Convertir espacios de conjuro',
  Metamagic: 'Metamagia', 'Careful Spell': 'Conjuro cuidadoso', 'Distant Spell': 'Conjuro distante', 'Empowered Spell': 'Conjuro potenciado', 'Extended Spell': 'Conjuro prolongado',
  'Heightened Spell': 'Conjuro intensificado', 'Quickened Spell': 'Conjuro acelerado', 'Subtle Spell': 'Conjuro sutil', 'Twinned Spell': 'Conjuro duplicado',
  'Sorcerous Origin feature': 'Rasgo de origen hechicero', 'Elemental Affinity': 'Afinidad elemental', 'Dragon Wings': 'Alas de dragón', 'Draconic Presence': 'Presencia dracónica',
  'Sorcerous Restoration': 'Restablecimiento hechicero', 'Otherworldly Patron': 'Patrón de otro mundo', "Dark One's Blessing": 'Bendición del oscuro', 'Pact Magic': 'Magia del pacto',
  'Eldritch Invocations': 'Invocaciones sobrenaturales', 'Eldritch Invocation': 'Invocación sobrenatural', 'Otherworldly Patron feature': 'Rasgo de patrón de otro mundo',
  'Pact Boon': 'Don del pacto', 'Pact of the Chain': 'Pacto de la cadena', 'Pact of the Blade': 'Pacto del filo', 'Pact of the Tome': 'Pacto del tomo',
  "Dark One's Own Luck": 'Suerte del oscuro', 'Fiendish Resilience': 'Resistencia infernal', 'Mystic Arcanum': 'Arcano místico', 'Hurl Through Hell': 'Arrojar al infierno',
  'Eldritch Master': 'Maestro sobrenatural', 'Arcane Recovery': 'Recuperación arcana', 'Arcane Tradition': 'Tradición arcana', 'Evocation Savant': 'Experto en evocación',
  'Sculpt Spells': 'Esculpir conjuros', 'Arcane Tradition feature': 'Rasgo de tradición arcana', 'Potent Cantrip': 'Truco potente', 'Empowered Evocation': 'Evocación potenciada',
  Overchannel: 'Sobrecanalizar', 'Spell Mastery': 'Dominio de conjuros', 'Signature Spell': 'Conjuros característicos',
  // Invocaciones
  'Agonizing Blast': 'Descarga agonizante', 'Armor of Shadows': 'Armadura de sombras', 'Beast Speech': 'Habla bestial', 'Beguiling Influence': 'Influencia seductora',
  'Book of Ancient Secrets': 'Libro de secretos antiguos', "Devil's Sight": 'Vista del diablo', 'Eldritch Sight': 'Vista sobrenatural', 'Eldritch Spear': 'Lanza sobrenatural',
  'Eyes of the Rune Keeper': 'Ojos del guardián de runas', 'Fiendish Vigor': 'Vigor infernal', 'Gaze of Two Minds': 'Mirada de dos mentes', 'Mask of Many Faces': 'Máscara de muchas caras',
  'Misty Visions': 'Visiones brumosas', 'Repelling Blast': 'Descarga repulsora', 'Thief of Five Fates': 'Ladrón de cinco destinos', 'Voice of the Chain Master': 'Voz del amo de la cadena',
  'Mire the Mind': 'Embotar la mente', 'One with Shadows': 'Uno con las sombras', 'Sign of Ill Omen': 'Señal de mal agüero', 'Thirsting Blade': 'Filo sediento',
  'Bewitching Whispers': 'Susurros cautivadores', 'Dreadful Word': 'Palabra terrible', 'Sculptor of Flesh': 'Escultor de carne', 'Ascendant Step': 'Paso ascendente',
  'Minions of Chaos': 'Esbirros del caos', 'Otherworldly Leap': 'Salto de otro mundo', 'Whispers of the Grave': 'Susurros de la tumba', Lifedrinker: 'Bebedor de vida',
  'Chains of Carceri': 'Cadenas de Carceri', 'Master of Myriad Forms': 'Maestro de las mil formas', 'Visions of Distant Realms': 'Visiones de reinos lejanos', 'Witch Sight': 'Vista de bruja',
  // Tierras, colores y clases en los sufijos
  Arctic: 'Ártico', Coast: 'Costa', Desert: 'Desierto', Forest: 'Bosque', Grassland: 'Pradera', Mountain: 'Montaña', Swamp: 'Pantano',
  Bard: 'Bardo', Cleric: 'Clérigo', Druid: 'Druida', Paladin: 'Paladín', Ranger: 'Explorador', Sorcerer: 'Hechicero', Wizard: 'Mago',
};
const COLORS = { Black: 'Negro', Blue: 'Azul', Brass: 'Latón', Bronze: 'Bronce', Copper: 'Cobre', Gold: 'Oro', Green: 'Verde', Red: 'Rojo', Silver: 'Plata', White: 'Blanco' };
const DAMAGE = { Acid: 'ácido', Lightning: 'relámpago', Fire: 'fuego', Poison: 'veneno', Cold: 'frío' };

/** Paréntesis: "(1 die)", "(CR 1/2 or below)", "(2 uses)", "(d6)", "(6th level)"… */
function paren(p) {
  return p
    .replace(/^(\d+) (?:die|dice)$/, (_, n) => `${n} ${n === '1' ? 'dado' : 'dados'}`)
    .replace(/^(\d+) uses?$/, (_, n) => `${n} ${n === '1' ? 'uso' : 'usos'}`)
    .replace(/^(\d+)\/rest$/, '$1/descanso')
    .replace(/^(\d+) types?$/, (_, n) => `${n} ${n === '1' ? 'tipo' : 'tipos'}`)
    .replace(/^(\d+) enemies$/, '$1 enemigos')
    .replace(/^(\d+) terrain types?$/, (_, n) => `${n} ${n === '1' ? 'tipo' : 'tipos'} de terreno`)
    .replace(/^(\d+)th level$/, 'nivel $1')
    .replace(/^CR (\S+) or below(, no flying or swim speed|, no flying speed)?$/, (_, cr, x) => `VD ${cr} o menos${x ? (x.includes('swim') ? ', sin volar ni nadar' : ', sin volar') : ''}`);
}

export function featureEs(name) {
  const m = name.match(/^(.*?)(?: \(([^)]*)\))?$/);
  const head = m[1];
  const suffix = m[2] ? ` (${paren(m[2])})` : '';
  const dragon = head.match(/^Dragon Ancestor: (\w+) - (\w+) Damage$/);
  if (dragon) return `Antepasado dracónico: ${COLORS[dragon[1]]} (${DAMAGE[dragon[2]]})`;
  const parts = head.split(': ').map((p) => BASE[p] ?? p);
  return parts.join(': ') + suffix;
}
