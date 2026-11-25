import * as Y from 'yjs';
import type { BoardDecision, BoardMeta, BoardReport, Card, ContextChip, Section, StickyColor } from './types.ts';
import { decisionsMap, readDecisions } from './decision-schema.ts';

/*
  The shared document for one board (Build PRD 5). Everything in it reaches every
  connected browser, so nothing private ever goes in here.

    meta:     Y.Map  { title, titleSource, titleProposedBy, kind, decision, problemPosition }
    problem:  Y.Text (the frame, edited together)
    notes:    Y.Map<id, Y.Map { text: Y.Text, x, y, w, h, color, authorId, authorName, authorColor,
                                 origin, sectionId, reservedBy, reservedByName, reservedByColor, createdAt }>
    sections: Y.Map<id, Y.Map { title, titleSource, x, y, w, h, createdBy }>
    context:  Y.Map<id, Y.Map { type, source, title, summary, status, message, addedBy, addedByName, createdAt }>
    reports:  Y.Map<id, approved report as a plain object>
    decisions: Y.Map<id, Y.Map { text, reasons, scope, sectionId, sourceNoteIds, reportIds, status, lockedBy,
                                 lockedByName, lockedByColor, lockedAt, via, meetingChipId, reopenedBy,
                                 reopenedByName, reopenedAt, history, rich? }>
              Locked decisions (Locked_Decisions_PRD_v2.md section 4). Readers and writers live in
              decision-schema.ts. A deleted section leaves its decision locked with scope 'board' and
              the old sectionId kept, so the card can say "Section deleted".
*/

export const STICKY = 200;
export const PROBLEM_NODE_ID = 'board-problem';
export const PROBLEM_CARD_WIDTH = 560;
/** Section geometry shared by the large-idea section and meeting placement. */
export const SECTION_PAD = 28;
export const SECTION_HEAD = 64;
export const NOTE_GAP = 32;

export const parts = (doc: Y.Doc) => ({
  meta: doc.getMap<unknown>('meta'),
  problem: doc.getText('problem'),
  notes: doc.getMap<Y.Map<unknown>>('notes'),
  sections: doc.getMap<Y.Map<unknown>>('sections'),
  context: doc.getMap<Y.Map<unknown>>('context'),
  reports: doc.getMap<BoardReport>('reports'),
  decisions: decisionsMap(doc),
});

const str = (m: Y.Map<unknown>, k: string, d = '') => (typeof m.get(k) === 'string' ? (m.get(k) as string) : d);
const num = (m: Y.Map<unknown>, k: string, d = 0) => (typeof m.get(k) === 'number' ? (m.get(k) as number) : d);
const strOrNull = (m: Y.Map<unknown>, k: string) => (typeof m.get(k) === 'string' ? (m.get(k) as string) : null);

function savedProblemPosition(meta: Y.Map<unknown>): { x: number; y: number } | undefined {
  const value = meta.get('problemPosition') as { x?: unknown; y?: unknown } | undefined;
  return typeof value?.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y)
    ? { x: value.x, y: value.y }
    : undefined;
}

function defaultProblemPosition({ notes, sections }: ReturnType<typeof parts>) {
  let left = Infinity;
  let top = Infinity;
  for (const items of [notes, sections]) {
    items.forEach((item) => {
      left = Math.min(left, num(item, 'x'));
      top = Math.min(top, num(item, 'y'));
    });
  }
  return Number.isFinite(left) ? { x: left - PROBLEM_CARD_WIDTH - 80, y: top } : { x: 0, y: 0 };
}

/** Give older boards a stable starting position without touching their problem text. */
export function ensureProblemPosition(doc: Y.Doc): boolean {
  const p = parts(doc);
  if (savedProblemPosition(p.meta)) return false;
  p.meta.set('problemPosition', defaultProblemPosition(p));
  return true;
}

export function readNote(id: string, m: Y.Map<unknown>): Card {
  const t = m.get('text');
  return {
    id,
    text: t instanceof Y.Text ? t.toString() : '',
    x: num(m, 'x'),
    y: num(m, 'y'),
    w: num(m, 'w', STICKY),
    h: num(m, 'h', STICKY),
    color: (str(m, 'color', 'yellow') as StickyColor) ?? 'yellow',
    authorId: str(m, 'authorId'),
    author: str(m, 'authorName', 'Someone'),
    authorColor: str(m, 'authorColor', '#57544d'),
    origin: m.get('origin') === 'ai' ? 'ai' : 'human',
    sectionId: strOrNull(m, 'sectionId'),
    reservedBy: strOrNull(m, 'reservedBy'),
    reservedByName: strOrNull(m, 'reservedByName'),
    reservedByColor: strOrNull(m, 'reservedByColor'),
    createdAt: num(m, 'createdAt'),
    ...(m.get('source') === 'meeting'
      ? {
          source: 'meeting' as const,
          meetingChipId: strOrNull(m, 'meetingChipId') ?? undefined,
          kind: (['idea', 'question', 'decision'] as const).find((k) => k === m.get('kind')),
          sourceIds: Array.isArray(m.get('sourceIds')) ? (m.get('sourceIds') as string[]) : [],
        }
      : {}),
  };
}

export function readSection(id: string, m: Y.Map<unknown>): Section {
  return {
    id,
    title: str(m, 'title', 'Section'),
    titleSource: m.get('titleSource') === 'ai' ? 'ai' : 'user',
    x: num(m, 'x'),
    y: num(m, 'y'),
    w: num(m, 'w', 720),
    h: num(m, 'h', 320),
    createdBy: str(m, 'createdBy'),
  };
}

export function readChip(id: string, m: Y.Map<unknown>): ContextChip {
  const status = m.get('status');
  return {
    id,
    type: m.get('type') === 'text' ? 'text' : m.get('type') === 'meeting' ? 'meeting' : 'link',
    source: str(m, 'source'),
    title: str(m, 'title'),
    summary: str(m, 'summary'),
    status: status === 'ready' || status === 'error' ? status : 'pending',
    message: strOrNull(m, 'message') ?? undefined,
    addedBy: str(m, 'addedBy'),
    addedByName: str(m, 'addedByName', 'Someone'),
    createdAt: num(m, 'createdAt'),
    sourceId: strOrNull(m, 'sourceId') ?? undefined,
    sourceName: strOrNull(m, 'sourceName') ?? undefined,
    fullText: strOrNull(m, 'fullText') ?? undefined,
  };
}

export function readMeta(doc: Y.Doc): BoardMeta {
  const m = parts(doc).meta;
  const ts = m.get('titleSource');
  const kind = m.get('kind');
  const decision = m.get('decision');
  return {
    title: str(m as Y.Map<unknown>, 'title'),
    titleSource: ts === 'user' || ts === 'ai' ? ts : null,
    titleProposedBy: strOrNull(m as Y.Map<unknown>, 'titleProposedBy'),
    kind: kind === 'case' || kind === 'mid' || kind === 'example' ? kind : 'blank',
    decision: decision && typeof decision === 'object' ? (decision as BoardDecision) : null,
  };
}

export function readBoard(doc: Y.Doc) {
  const p = parts(doc);
  const notes: Card[] = [];
  p.notes.forEach((m, id) => notes.push(readNote(id, m)));
  notes.sort((a, b) => a.createdAt - b.createdAt);
  const sections: Section[] = [];
  p.sections.forEach((m, id) => sections.push(readSection(id, m)));
  const chips: ContextChip[] = [];
  p.context.forEach((m, id) => chips.push(readChip(id, m)));
  chips.sort((a, b) => a.createdAt - b.createdAt);
  const reports: BoardReport[] = [];
  p.reports.forEach((r) => reports.push(r));
  reports.sort((a, b) => a.approvedAt - b.approvedAt);
  return {
    meta: readMeta(doc),
    problem: p.problem.toString(),
    problemPosition: savedProblemPosition(p.meta) ?? defaultProblemPosition(p),
    notes, sections, chips, reports, decisions: readDecisions(doc),
  };
}

export interface NewNote {
  id: string;
  text: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  color: StickyColor;
  authorId: string;
  authorName: string;
  authorColor: string;
  origin?: 'human' | 'ai';
  sectionId?: string | null;
  reservedBy?: { id: string; name: string; color: string } | null;
  createdAt?: number;
  /** Meeting addendum: notes drawn from a meeting. */
  meeting?: { chipId: string; kind: 'idea' | 'question' | 'decision'; sourceIds: string[] };
}

/** Call inside a transaction. */
export function writeNote(doc: Y.Doc, n: NewNote) {
  const m = new Y.Map<unknown>();
  const text = new Y.Text();
  text.insert(0, n.text);
  m.set('text', text);
  m.set('x', Math.round(n.x));
  m.set('y', Math.round(n.y));
  m.set('w', n.w ?? STICKY);
  m.set('h', n.h ?? STICKY);
  m.set('color', n.color);
  m.set('authorId', n.authorId);
  m.set('authorName', n.authorName);
  m.set('authorColor', n.authorColor);
  m.set('origin', n.origin ?? 'human');
  m.set('sectionId', n.sectionId ?? null);
  m.set('reservedBy', n.reservedBy?.id ?? null);
  m.set('reservedByName', n.reservedBy?.name ?? null);
  m.set('reservedByColor', n.reservedBy?.color ?? null);
  m.set('createdAt', n.createdAt ?? Date.now());
  if (n.meeting) {
    m.set('source', 'meeting');
    m.set('meetingChipId', n.meeting.chipId);
    m.set('kind', n.meeting.kind);
    m.set('sourceIds', n.meeting.sourceIds);
  }
  parts(doc).notes.set(n.id, m);
  return m;
}

export function writeSection(doc: Y.Doc, s: Section) {
  const m = new Y.Map<unknown>();
  m.set('title', s.title);
  m.set('titleSource', s.titleSource);
  m.set('x', Math.round(s.x));
  m.set('y', Math.round(s.y));
  m.set('w', Math.round(s.w));
  m.set('h', Math.round(s.h));
  m.set('createdBy', s.createdBy);
  parts(doc).sections.set(s.id, m);
  return m;
}

/** Notes whose centre sits inside a section belong to it (FigJam behaviour). */
export function membersOf(section: Pick<Section, 'x' | 'y' | 'w' | 'h'>, cards: Card[]): Card[] {
  return cards.filter((c) => {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    return cx >= section.x && cx <= section.x + section.w && cy >= section.y && cy <= section.y + section.h;
  });
}

/**
 * Change a Y.Text to match a new string with the smallest edit (common prefix and suffix kept),
 * so two people typing in different places of one note both keep their words (MP-3).
 */
export function applyTextDiff(t: Y.Text, next: string) {
  const prev = t.toString();
  if (prev === next) return;
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  if (endPrev > start) t.delete(start, endPrev - start);
  if (endNext > start) t.insert(start, next.slice(start, endNext));
}
