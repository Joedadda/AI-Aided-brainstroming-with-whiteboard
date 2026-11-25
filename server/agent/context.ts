import type * as Y from 'yjs';
import { AGENT_LIMITS } from '../../shared/agent-schema.ts';
import { inForce, readDecisions, type Decision } from '../../shared/decision-schema.ts';
import { membersOf, readBoard } from '../../shared/ydoc.ts';

/*
  The agent's view of the board, built on the server from the shared document (PRD 6.1),
  so a client cannot slip text into the prompt. Only shared content: no private canvases,
  drafts or private context. Ids are replaced by short per-call refs (n1, s1, D1) that only
  this module maps back.
*/

export interface CtxNote {
  ref: string;
  id: string;
  text: string;
  author: string;
  origin: 'human' | 'ai';
  sectionId: string | null;
  sectionTitle: string | null;
  reservedBy: string | null;
  reservedByName: string | null;
}

export interface CtxSection {
  ref: string;
  id: string;
  title: string;
  /** Ids of every note in it (whole board, not just the scope). */
  memberIds: string[];
}

export interface CtxDecision {
  ref: string;
  id: string;
  text: string;
  reasons: string;
  scope: 'board' | 'section';
  sectionId: string | null;
  lockedAt: string;
}

export interface AgentContext {
  userId: string;
  instruction: string;
  problem: string;
  /** Notes in scope, in reading order. */
  notes: CtxNote[];
  /** Every note with text on the board (for duplicate checks). */
  allNotes: { id: string; text: string; sectionId: string | null }[];
  sections: CtxSection[];
  decisions: CtxDecision[];
  chips: { title: string; summary: string }[];
  selected: boolean;
  total: number;
  capped: boolean;
}

export function buildAgentContext(doc: Y.Doc, opts: { userId: string; instruction: string; selectedNoteIds: string[]; selectedSectionIds?: string[] }): AgentContext {
  const b = readBoard(doc);
  const withText = b.notes.filter((n) => n.text.trim());
  const sectionOf = (n: (typeof withText)[number]) => {
    if (n.sectionId && b.sections.some((s) => s.id === n.sectionId)) return n.sectionId;
    return b.sections.find((s) => membersOf(s, [n]).length > 0)?.id ?? null;
  };
  const secByNote = new Map(withText.map((n) => [n.id, sectionOf(n)]));

  // Sections in reading order: top to bottom, then left to right.
  const sections = [...b.sections].sort((a, c) => a.y - c.y || a.x - c.x);
  const sectionRefs = new Map(sections.map((s, i) => [s.id, `s${i + 1}`]));

  // Scope: the selection (plus notes in selected sections), else every note. Capped at 120:
  // selected first, then their sections, then the newest.
  const pickedSections = new Set(opts.selectedSectionIds ?? []);
  const selectedIds = new Set(opts.selectedNoteIds);
  const selected = withText.filter((n) => selectedIds.has(n.id) || pickedSections.has(secByNote.get(n.id) ?? ''));
  let scope = selected.length ? selected : withText;
  const capped = scope.length > AGENT_LIMITS.scopeNotes;
  if (capped) scope = [...scope].sort((a, c) => c.createdAt - a.createdAt).slice(0, AGENT_LIMITS.scopeNotes);

  const order = (n: (typeof withText)[number]) => {
    const sid = secByNote.get(n.id);
    const si = sid ? sections.findIndex((s) => s.id === sid) : sections.length;
    return [si, n.y, n.x] as const;
  };
  scope = [...scope].sort((a, c) => {
    const [as, ay, ax] = order(a);
    const [cs, cy, cx] = order(c);
    return as - cs || ay - cy || ax - cx;
  });

  const title = (id: string | null) => (id ? (sections.find((s) => s.id === id)?.title ?? null) : null);
  const notes: CtxNote[] = scope.map((n, i) => ({
    ref: `n${i + 1}`,
    id: n.id,
    text: n.text.trim(),
    author: n.author,
    origin: n.origin,
    sectionId: secByNote.get(n.id) ?? null,
    sectionTitle: title(secByNote.get(n.id) ?? null),
    reservedBy: n.reservedBy,
    reservedByName: n.reservedByName,
  }));

  const decisions: Decision[] = inForce(readDecisions(doc)).slice(0, 20);
  return {
    userId: opts.userId,
    instruction: opts.instruction,
    problem: b.problem,
    notes,
    allNotes: withText.map((n) => ({ id: n.id, text: n.text, sectionId: secByNote.get(n.id) ?? null })),
    sections: sections.map((s) => ({ ref: sectionRefs.get(s.id)!, id: s.id, title: s.title, memberIds: withText.filter((n) => secByNote.get(n.id) === s.id).map((n) => n.id) })),
    decisions: decisions.map((d, i) => ({ ref: `D${i + 1}`, id: d.id, text: d.text, reasons: d.reasons, scope: d.scope, sectionId: d.sectionId, lockedAt: d.lockedAt })),
    chips: b.chips.filter((c) => c.status === 'ready').map((c) => ({ title: c.title, summary: c.summary })),
    selected: selected.length > 0,
    total: withText.length,
    capped,
  };
}

/** The decision in force covering a section (same rule as coverOf: earliest lock wins). */
export function coveringDecision(c: AgentContext, sectionId: string): CtxDecision | null {
  return (
    c.decisions
      .filter((d) => d.scope === 'section' && d.sectionId === sectionId)
      .sort((a, b) => a.lockedAt.localeCompare(b.lockedAt) || a.id.localeCompare(b.id))[0] ?? null
  );
}