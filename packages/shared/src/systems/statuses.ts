import type { StatusDef } from '../schemas/sheet.js';

/** Condiciones de D&D 5e (y alguna marca útil más) para los tokens. */
export const DND5E_STATUSES: StatusDef[] = [
  { id: 'agarrado', label: 'Agarrado', icon: '✊', incapacitated: false, kind: 'debuff' },
  { id: 'apresado', label: 'Apresado', icon: '⛓️', incapacitated: false, kind: 'debuff' },
  { id: 'asustado', label: 'Asustado', icon: '😱', incapacitated: false, kind: 'debuff' },
  { id: 'aturdido', label: 'Aturdido', icon: '💫', incapacitated: true, kind: 'debuff' },
  { id: 'cegado', label: 'Cegado', icon: '🕶️', incapacitated: false, kind: 'debuff' },
  { id: 'derribado', label: 'Derribado', icon: '🛌', incapacitated: false, kind: 'debuff' },
  { id: 'ensordecido', label: 'Ensordecido', icon: '🔇', incapacitated: false, kind: 'debuff' },
  { id: 'envenenado', label: 'Envenenado', icon: '🤢', incapacitated: false, kind: 'debuff' },
  { id: 'hechizado', label: 'Hechizado', icon: '💘', incapacitated: false, kind: 'debuff' },
  { id: 'incapacitado', label: 'Incapacitado', icon: '🚫', incapacitated: true, kind: 'debuff' },
  { id: 'inconsciente', label: 'Inconsciente', icon: '💤', incapacitated: true, kind: 'debuff' },
  { id: 'invisible', label: 'Invisible', icon: '👻', incapacitated: false },
  { id: 'paralizado', label: 'Paralizado', icon: '🧊', incapacitated: true, kind: 'debuff' },
  { id: 'petrificado', label: 'Petrificado', icon: '🗿', incapacitated: true, kind: 'debuff', resist: 'todo' },
  { id: 'agotamiento', label: 'Agotamiento', icon: '😩', incapacitated: false, kind: 'debuff' },
  { id: 'concentracion', label: 'Concentración', icon: '🎯', incapacitated: false, concentration: 'con' },
  { id: 'bendecido', label: 'Bendecido', icon: '✨', incapacitated: false, kind: 'buff' },
  { id: 'acelerado', label: 'Acelerado', icon: '⚡', incapacitated: false, kind: 'buff' },
  { id: 'inspirado', label: 'Inspiración bárdica', icon: '🎵', incapacitated: false, kind: 'buff' },
  { id: 'escudo', label: 'Escudo de fe', icon: '🛡️', incapacitated: false, kind: 'buff' },
  { id: 'furia', label: 'Furia', icon: '💢', incapacitated: false, kind: 'buff', resist: 'contundente, perforante, cortante' },
  { id: 'heroismo', label: 'Heroísmo', icon: '🦁', incapacitated: false, kind: 'buff' },
  { id: 'resistencia', label: 'Resistencia al daño', icon: '🪨', incapacitated: false, kind: 'buff', resist: 'todo' },
  { id: 'debilitado', label: 'Debilitado (maldición, Perdición…)', icon: '🩸', incapacitated: false, kind: 'debuff' },
  { id: 'marcado', label: 'Marcado', icon: '❗', incapacitated: false },
  { id: 'muerto', label: 'Muerto', icon: '💀', incapacitated: true, kind: 'debuff' },
];

export const GENERIC_STATUSES: StatusDef[] = [
  { id: 'herido', label: 'Herido', icon: '🩸', incapacitated: false, kind: 'debuff' },
  { id: 'reforzado', label: 'Reforzado', icon: '✨', incapacitated: false, kind: 'buff' },
  { id: 'aturdido', label: 'Aturdido', icon: '💫', incapacitated: true, kind: 'debuff' },
  { id: 'oculto', label: 'Oculto', icon: '👻', incapacitated: false },
  { id: 'marcado', label: 'Marcado', icon: '❗', incapacitated: false },
  { id: 'fuera', label: 'Fuera de combate', icon: '💀', incapacitated: true },
];
