import type { StatusDef } from '../schemas/sheet.js';

/** Condiciones de D&D 5e (y alguna marca útil más) para los tokens. */
export const DND5E_STATUSES: StatusDef[] = [
  { id: 'agarrado', label: 'Agarrado', icon: '✊', incapacitated: false },
  { id: 'apresado', label: 'Apresado', icon: '⛓️', incapacitated: false },
  { id: 'asustado', label: 'Asustado', icon: '😱', incapacitated: false },
  { id: 'aturdido', label: 'Aturdido', icon: '💫', incapacitated: true },
  { id: 'cegado', label: 'Cegado', icon: '🕶️', incapacitated: false },
  { id: 'derribado', label: 'Derribado', icon: '🛌', incapacitated: false },
  { id: 'ensordecido', label: 'Ensordecido', icon: '🔇', incapacitated: false },
  { id: 'envenenado', label: 'Envenenado', icon: '🤢', incapacitated: false },
  { id: 'hechizado', label: 'Hechizado', icon: '💘', incapacitated: false },
  { id: 'incapacitado', label: 'Incapacitado', icon: '🚫', incapacitated: true },
  { id: 'inconsciente', label: 'Inconsciente', icon: '💤', incapacitated: true },
  { id: 'invisible', label: 'Invisible', icon: '👻', incapacitated: false },
  { id: 'paralizado', label: 'Paralizado', icon: '🧊', incapacitated: true },
  { id: 'petrificado', label: 'Petrificado', icon: '🗿', incapacitated: true },
  { id: 'agotamiento', label: 'Agotamiento', icon: '😩', incapacitated: false },
  { id: 'concentracion', label: 'Concentración', icon: '🎯', incapacitated: false },
  { id: 'bendecido', label: 'Bendecido', icon: '✨', incapacitated: false },
  { id: 'marcado', label: 'Marcado', icon: '❗', incapacitated: false },
  { id: 'muerto', label: 'Muerto', icon: '💀', incapacitated: true },
];

export const GENERIC_STATUSES: StatusDef[] = [
  { id: 'herido', label: 'Herido', icon: '🩸', incapacitated: false },
  { id: 'aturdido', label: 'Aturdido', icon: '💫', incapacitated: true },
  { id: 'oculto', label: 'Oculto', icon: '👻', incapacitated: false },
  { id: 'marcado', label: 'Marcado', icon: '❗', incapacitated: false },
  { id: 'fuera', label: 'Fuera de combate', icon: '💀', incapacitated: true },
];
