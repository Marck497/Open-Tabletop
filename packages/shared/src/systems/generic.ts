import type { SheetTemplateInput } from '../schemas/sheet.js';

/** Plantilla mínima para empezar un sistema propio desde cero. */
export const genericTemplate: SheetTemplateInput = {
  name: 'Genérico',
  version: 1,
  bars: [{ value: 'vida', max: 'vida_max', color: '#c0392b' }],
  combat: { ac: 'defensa', hp: 'vida', hpMax: 'vida_max', speed: '', attacks: null },
  sections: [
    {
      id: 'basico',
      title: 'Básico',
      columns: 3,
      fields: [
        { key: 'concepto', label: 'Concepto', type: 'text', span: 2 },
        { key: 'nivel', label: 'Nivel', type: 'number', default: 1 },
        { key: 'vida_max', label: 'Vida máxima', type: 'number', default: 10 },
        { key: 'vida', label: 'Vida', type: 'number', default: 10 },
        { key: 'defensa', label: 'Defensa', type: 'number', default: 10 },
      ],
    },
    {
      id: 'atributos',
      title: 'Atributos',
      columns: 3,
      fields: [
        { key: 'fisico', label: 'Físico', type: 'number', default: 0, roll: '1d20 + @{fisico}' },
        { key: 'mente', label: 'Mente', type: 'number', default: 0, roll: '1d20 + @{mente}' },
        { key: 'social', label: 'Social', type: 'number', default: 0, roll: '1d20 + @{social}' },
      ],
    },
    { id: 'notas_sec', title: 'Notas', columns: 1, fields: [{ key: 'notas', label: 'Notas', type: 'textarea' }] },
  ],
};
