import { describe, expect, it } from 'vitest';
import { damageColor, fxForHomebrew, fxForRow, homebrewDataSchema, type HomebrewData } from '../src/index.js';

const data = (d: object) => homebrewDataSchema.parse(d);

describe('animaciones de ataques y hechizos', () => {
  it('"auto" se deduce del tipo de ataque, el área y si solo cura', () => {
    expect(fxForHomebrew({ kind: 'attack', data: data({ attack: 'melee', damage: [{ dice: '1d8', type: 'cortante' }] }) })).toMatchObject({ style: 'slash', color: '#e9edf2' });
    expect(fxForHomebrew({ kind: 'item', data: data({ attack: 'ranged', damage: [{ dice: '1d8', type: 'perforante' }] }) })?.style).toBe('arrow');
    expect(fxForHomebrew({ kind: 'spell', data: data({ attack: 'ranged', damage: [{ dice: '1d10', type: 'fuego' }] }) })).toMatchObject({ style: 'bolt', color: '#ff7a1a' });
    expect(fxForHomebrew({ kind: 'spell', data: data({ save: 'des', damage: [{ dice: '8d6', type: 'fuego' }], area: { shape: 'circle', size: 20 } }) })?.style).toBe('burst');
    expect(fxForHomebrew({ kind: 'item', data: data({ heal: '2d4 + 2', consumable: true }) })).toMatchObject({ style: 'heal', color: '#5ef08a' });
    expect(fxForHomebrew({ kind: 'spell', data: data({ level: 1 }) })?.style).toBe('aura');
    expect(fxForHomebrew({ kind: 'item', data: data({}) })).toBeNull();
    // Arma con daño mágico: el color es el del daño extra.
    expect(fxForHomebrew({ kind: 'attack', data: data({ attack: 'melee', damage: [{ dice: '1d8', type: 'cortante' }, { dice: '2d6', type: 'fuego' }] }) })?.color).toBe('#ff7a1a');
  });

  it('el estilo y el color elegidos mandan; "sin animación" no anima', () => {
    const d = data({ attack: 'melee', damage: [{ dice: '1d8', type: 'cortante' }], fx: { style: 'beam', color: '#123456' } });
    expect(fxForHomebrew({ kind: 'attack', data: d }, true)).toEqual({ style: 'beam', color: '#123456', crit: true });
    expect(fxForHomebrew({ kind: 'attack', data: data({ attack: 'melee', fx: { style: 'none' } }) })).toBeNull();
    expect(() => data({ fx: { color: 'rojo' } })).toThrow();
  });

  it('las creaciones guardadas antes (sin fx) usan "auto"', () => {
    const { fx: _fx, ...old } = data({ attack: 'ranged', damage: [{ dice: '1d6', type: 'frío' }] });
    expect(fxForHomebrew({ kind: 'spell', data: old as HomebrewData })).toMatchObject({ style: 'bolt', color: '#7fd8ff' });
  });

  it('filas de la hoja sin creación: por el nombre y el texto del daño', () => {
    expect(fxForRow('attack', 'Arco largo', '1d8 perforante').style).toBe('arrow');
    expect(fxForRow('attack', 'Hacha', '1d12 cortante')).toMatchObject({ style: 'slash', color: '#e9edf2' });
    expect(fxForRow('cast', 'Rayo de escarcha', '1d8 frío')).toMatchObject({ style: 'bolt', color: '#7fd8ff' });
    expect(fxForRow('cast', 'Curar heridas', '1d8 + 3')).toMatchObject({ style: 'heal' });
    expect(damageColor('3d6 Relámpago')).toBe('#fff36b');
    expect(damageColor('nada')).toBeNull();
  });
});
