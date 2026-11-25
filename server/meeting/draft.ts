import type { DraftDecision, MeetingDraft, MeetingDraftLooseT, MeetingDraftView } from '../../shared/meeting-schema.ts';
import type { Segment } from './segment.ts';

// Meeting addendum 7: checks after the draft parses. Pure, tested in draft.test.ts.

export const CAPS = { sections: 6, perSection: 8, total: 25, minNotes: 3, decisions: 5 };

/** Locked decisions in force as the prompt named them: per-call id (D1) and the real id. */
export type KnownDecision = { id: string; realId: string; text: string };

/**
 * Locked decisions PRD 8.3 and 8.4: the model's conflictsWith must name a decision in force. Unknown
 * ids are dropped (with the line), known ones map back to the real id.
 */
export function filterConflict(c: { conflictsWith?: string | null; conflictLine?: string }, known: KnownDecision[]) {
  const k = c.conflictsWith ? known.find((d) => d.id === c.conflictsWith!.trim().toUpperCase() || d.realId === c.conflictsWith) : undefined;
  return { conflictsWith: k?.realId ?? null, conflictLine: k ? cleanText(c.conflictLine ?? '').slice(0, 160) : '' };
}

const MD = /\*\*|__|`|^#+\s*|^\s*(?:[-*•▪◦–]|\d+[.)])\s+/g;
export const cleanText = (s: string) =>
  s
    .replace(MD, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
function overlap(a: string, b: string) {
  const A = new Set(norm(a).split(' ').filter((w) => w.length > 2));
  const B = new Set(norm(b).split(' ').filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let n = 0;
  A.forEach((w) => B.has(w) && n++);
  return n / Math.min(A.size, B.size);
}

export class InvalidDraft extends Error {}

/**
 * Steps 1 to 6 of section 7, in order. Throws InvalidDraft when fewer than 3 notes or no section
 * survive, so the caller can retry once with the reason appended.
 */
export function checkDraft(d: MeetingDraftLooseT | MeetingDraft, segments: Segment[], known: KnownDecision[] = []): MeetingDraft {
  const ids = new Set(segments.map((s) => s.id));
  const seen: string[] = [];
  let sections = d.sections.map((s) => ({
    title: cleanText(s.title).slice(0, 40),
    notes: s.notes
      // 1. Only ids that exist; a note with none left is dropped.
      .map((n) => ({ ...n, sourceIds: [...new Set(n.sourceIds.map((x) => x.trim().toUpperCase()))].filter((x) => ids.has(x)).slice(0, 3) }))
      .filter((n) => n.sourceIds.length > 0)
      // 2. Plain text. A "question" that is not phrased as one is a reported point: label it an idea.
      .map((n) => ({ ...n, text: cleanText(n.text).slice(0, 220) }))
      .map((n) => (n.kind === 'question' && !/[?？]/.test(n.text) ? { ...n, kind: 'idea' as const } : n))
      .filter((n) => n.text.length > 0)
      .map((n) => ({ text: n.text, kind: n.kind, sourceIds: n.sourceIds, ...filterConflict(n, known) })),
  }));
  // 3. Near-duplicates: same text anywhere on the draft, or high word overlap within a section.
  sections = sections.map((s) => {
    const kept: typeof s.notes = [];
    for (const n of s.notes) {
      const key = norm(n.text);
      if (seen.includes(key) || kept.some((k) => overlap(k.text, n.text) >= 0.85)) continue;
      seen.push(key);
      kept.push(n);
    }
    return { ...s, notes: kept };
  });
  // 4. Empty sections go.
  sections = sections.filter((s) => s.notes.length > 0 && s.title.length > 0);
  // 5. Caps: 6 sections, 8 a section, 25 in all, trimmed from the end of the longest sections.
  sections = sections.slice(0, CAPS.sections).map((s) => ({ ...s, notes: s.notes.slice(0, CAPS.perSection) }));
  let total = sections.reduce((a, s) => a + s.notes.length, 0);
  while (total > CAPS.total) {
    const longest = sections.reduce((m, s) => (s.notes.length > m.notes.length ? s : m));
    longest.notes.pop();
    total--;
  }
  // 6. Too little left.
  if (total < CAPS.minNotes || sections.length < 1)
    throw new InvalidDraft(`Only ${total} usable notes were left after checking source ids and duplicates. Return at least ${CAPS.minNotes} notes, each with sourceIds that appear in the meeting.`);
  return { title: cleanText(d.title).slice(0, 60), problem: cleanText(d.problem).slice(0, 300), sections, decisions: checkDecisions(d, sections, ids, known) };
}

/**
 * Locked decisions PRD 9A: plain text, clamped (300 and 500), real source ids only (none left: dropped),
 * no duplicates in the draft or of a decision already in force, at most 5. sectionRef becomes an
 * index into the checked sections, or null.
 */
function checkDecisions(d: MeetingDraftLooseT | MeetingDraft, sections: { title: string }[], ids: Set<string>, known: KnownDecision[]): DraftDecision[] {
  const raw = ((d as MeetingDraftLooseT).decisions ?? []) as { text: string; reasons?: string; sourceIds?: string[]; sectionRef?: string | null; sectionIndex?: number | null; conflictsWith?: string | null; conflictLine?: string }[];
  const out: DraftDecision[] = [];
  for (const x of raw) {
    const text = cleanText(x.text ?? '').slice(0, 300);
    const sourceIds = [...new Set((x.sourceIds ?? []).map((s) => s.trim().toUpperCase()))].filter((s) => ids.has(s)).slice(0, 5);
    if (!text || !sourceIds.length) continue;
    if (out.some((o) => norm(o.text) === norm(text) || overlap(o.text, text) >= 0.85)) continue;
    if (known.some((k) => norm(k.text) === norm(text) || overlap(k.text, text) >= 0.85)) continue;
    const ref = x.sectionRef ? norm(x.sectionRef) : '';
    const idx = typeof x.sectionIndex === 'number' ? x.sectionIndex : ref ? sections.findIndex((s) => norm(s.title) === ref) : -1;
    out.push({
      text,
      reasons: cleanText(x.reasons ?? '').slice(0, 500),
      sourceIds,
      sectionIndex: idx >= 0 && idx < sections.length ? idx : null,
      ...filterConflict(x, known),
    });
  }
  return out.slice(0, CAPS.decisions);
}

/** 7. Each note gets its source passages. Only ever sent to the owner. */
export function withPassages(d: MeetingDraft, segments: Segment[]): MeetingDraftView {
  const byId = new Map(segments.map((s) => [s.id, s]));
  return {
    ...d,
    decisions: (d.decisions ?? []).map((x) => ({ ...x, passages: x.sourceIds.map((id) => byId.get(id)).filter((p): p is Segment => Boolean(p)) })),
    sections: d.sections.map((s) => ({
      ...s,
      notes: s.notes.map((n) => ({ ...n, passages: n.sourceIds.map((id) => byId.get(id)).filter((p): p is Segment => Boolean(p)) })),
    })),
  };
}
