import { describe, expect, it } from 'vitest';
import { parseRichText } from '../src/index.js';

describe('texto con formato', () => {
  it('títulos, párrafos, listas, negrita y cursiva', () => {
    const blocks = parseRichText('# La carta\n\nQuerido **Ana**,\nte *espero*.\n\n- uno\n- dos\nfin');
    expect(blocks).toEqual([
      { type: 'h1', spans: [{ text: 'La carta' }] },
      { type: 'p', spans: [{ text: 'Querido ' }, { text: 'Ana', bold: true }, { text: ',\nte ' }, { text: 'espero', italic: true }, { text: '.' }] },
      { type: 'ul', items: [[{ text: 'uno' }], [{ text: 'dos' }]] },
      { type: 'p', spans: [{ text: 'fin' }] },
    ]);
  });

  it('no interpreta HTML: es texto', () => {
    expect(parseRichText('<script>x</script>')).toEqual([{ type: 'p', spans: [{ text: '<script>x</script>' }] }]);
  });
});
