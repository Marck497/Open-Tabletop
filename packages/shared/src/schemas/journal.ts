import { z } from 'zod';

/**
 * Diario: notas y documentos (cartas, mapas, pistas...) que el DM prepara y
 * enseña a los jugadores cuando quiere.
 */
export interface Handout {
  id: string;
  campaignId: string;
  title: string;
  /** Texto con formato sencillo: # títulos, **negrita**, *cursiva* y listas con "- ". */
  body: string;
  imageAssetId: string | null;
  /** Notas que solo ve el DM (a los jugadores les llega vacío). */
  gmNotes: string;
  visibleToAll: boolean;
  /** Jugadores concretos que pueden verlo (si no es para todos). */
  sharedWith: string[];
  sortOrder: number;
  updatedAt: string;
}

export const handoutInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().max(50000),
  imageAssetId: z.string().nullable(),
  gmNotes: z.string().max(20000),
  visibleToAll: z.boolean(),
  sharedWith: z.array(z.string()).max(50),
  sortOrder: z.number().int(),
});
export const createHandoutSchema = handoutInputSchema.partial().extend({ title: handoutInputSchema.shape.title });
export const updateHandoutSchema = handoutInputSchema.partial();
export type CreateHandoutInput = z.input<typeof createHandoutSchema>;
export type UpdateHandoutInput = z.input<typeof updateHandoutSchema>;

/** Bloques de texto con formato sencillo, listos para pintar sin HTML. */
export type RichBlock = { type: 'h1' | 'h2' | 'h3' | 'p'; spans: RichSpan[] } | { type: 'ul'; items: RichSpan[][] };
export interface RichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/** **negrita** y *cursiva* dentro de una línea. */
export function parseInline(line: string): RichSpan[] {
  const spans: RichSpan[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) spans.push({ text: line.slice(last, m.index) });
    spans.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2]!, italic: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) spans.push({ text: line.slice(last) });
  return spans;
}

/** Convierte el texto en bloques: títulos con #, listas con "- " y párrafos separados por líneas en blanco. */
export function parseRichText(src: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let para: string[] = [];
  let list: RichSpan[][] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', spans: parseInline(para.join('\n')) });
    para = [];
    if (list) blocks.push({ type: 'ul', items: list });
    list = null;
  };
  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: `h${h[1]!.length}` as 'h1' | 'h2' | 'h3', spans: parseInline(h[2]!) });
    } else if (li) {
      if (para.length) {
        blocks.push({ type: 'p', spans: parseInline(para.join('\n')) });
        para = [];
      }
      (list ??= []).push(parseInline(li[1]!));
    } else if (!line.trim()) {
      flush();
    } else {
      if (list) {
        blocks.push({ type: 'ul', items: list });
        list = null;
      }
      para.push(line);
    }
  }
  flush();
  return blocks;
}
