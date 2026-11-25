import type { NoteKind } from './meeting-schema.ts';
import type { StickyColor } from './types.ts';
import { NOTE_GAP, SECTION_HEAD, SECTION_PAD, STICKY } from './ydoc.ts';

// Meeting addendum 9: where an approved session goes on the canvas. Pure; tested in
// session-layout.test.ts. The model never chooses positions.

/** Idea yellow, question pink, decision green (the board's own note colours). */
export const KIND_COLOR: Record<NoteKind, StickyColor> = { idea: 'yellow', question: 'pink', decision: 'green' };

/**
 * Each section is two notes wide and fills left to right, top to bottom (the board's reading order).
 * One column was too narrow: the section header squeezed its own title to a single letter.
 */
export const COLS = 2;
export const SECTION_GAP = 80;
export const SECTIONS_PER_ROW = 4;
/** Space between existing content and the new group. */
export const GROUP_GAP = 160;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutInput {
  sections: { title: string; notes: { text: string; kind: NoteKind; sourceIds: string[] }[] }[];
  /** Existing notes and sections in world coordinates. */
  existing: Rect[];
  /** Used only when the board is empty. */
  viewCentre: { x: number; y: number };
}

export interface LaidSection extends Rect {
  title: string;
  notes: { text: string; kind: NoteKind; sourceIds: string[]; color: StickyColor; x: number; y: number }[];
}

export function sectionSize(n: number) {
  const rows = Math.ceil(Math.max(n, 1) / COLS);
  const cols = COLS;
  return { w: SECTION_PAD * 2 + cols * STICKY + (cols - 1) * NOTE_GAP, h: SECTION_HEAD + rows * STICKY + (rows - 1) * NOTE_GAP + SECTION_PAD };
}

export const boundsOf = (rs: Rect[]): Rect | null => {
  if (!rs.length) return null;
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

export function layoutSessionDraft(input: LayoutInput): { sections: LaidSection[]; bounds: Rect } {
  // Relative layout first: columns of sections, wrapping after SECTIONS_PER_ROW.
  const rel: LaidSection[] = [];
  let rowY = 0;
  for (let i = 0; i < input.sections.length; i += SECTIONS_PER_ROW) {
    const row = input.sections.slice(i, i + SECTIONS_PER_ROW);
    let x = 0;
    let rowH = 0;
    for (const s of row) {
      const size = sectionSize(s.notes.length);
      rel.push({
        title: s.title,
        x,
        y: rowY,
        ...size,
        notes: s.notes.map((n, j) => ({
          ...n,
          color: KIND_COLOR[n.kind],
          x: x + SECTION_PAD + (j % COLS) * (STICKY + NOTE_GAP),
          y: rowY + SECTION_HEAD + Math.floor(j / COLS) * (STICKY + NOTE_GAP),
        })),
      });
      x += size.w + SECTION_GAP;
      rowH = Math.max(rowH, size.h);
    }
    rowY += rowH + SECTION_GAP;
  }
  const size = boundsOf(rel) ?? { x: 0, y: 0, w: 0, h: 0 };

  // Then the origin: below everything already there, left-aligned with it; or centred on the view.
  const content = boundsOf(input.existing);
  const origin = content
    ? { x: content.x, y: content.y + content.h + GROUP_GAP }
    : { x: input.viewCentre.x - size.w / 2, y: input.viewCentre.y - size.h / 2 };
  const ox = Math.round(origin.x);
  const oy = Math.round(origin.y);
  const sections = rel.map((s) => ({ ...s, x: s.x + ox, y: s.y + oy, notes: s.notes.map((n) => ({ ...n, x: n.x + ox, y: n.y + oy })) }));
  return { sections, bounds: { x: ox, y: oy, w: size.w, h: size.h } };
}
