import { describe, expect, it } from 'vitest';
import { trackPosition } from '../src/index.js';

describe('música sincronizada', () => {
  it('calcula por dónde va una pista', () => {
    expect(trackPosition(1000, 31000, 100, false)).toBe(30);
    expect(trackPosition(0, 250000, 100, true)).toBe(50);
    expect(trackPosition(0, 250000, 100, false)).toBeNull();
  });
});
