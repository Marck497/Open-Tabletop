import { describe, expect, it } from 'vitest';
import { parseTutorialCommand } from '../src/index.js';

describe('parseTutorialCommand', () => {
  it('reconoce el comando y el rol pedido', () => {
    expect(parseTutorialCommand('/tutorial')).toEqual({ role: null });
    expect(parseTutorialCommand('  /TUTORIAL  ')).toEqual({ role: null });
    expect(parseTutorialCommand('/tutorial jugador')).toEqual({ role: 'player' });
    expect(parseTutorialCommand('/tutorial DM')).toEqual({ role: 'gm' });
    expect(parseTutorialCommand('/tutorial algo')).toEqual({ role: null });
  });

  it('no confunde otros mensajes', () => {
    expect(parseTutorialCommand('/tutoriales')).toBeNull();
    expect(parseTutorialCommand('/r 1d20')).toBeNull();
    expect(parseTutorialCommand('quiero el /tutorial')).toBeNull();
    expect(parseTutorialCommand('/tutorial dm ahora')).toBeNull();
  });
});
