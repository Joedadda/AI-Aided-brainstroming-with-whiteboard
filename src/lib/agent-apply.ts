import * as Y from 'yjs';
import type { AgentIdea, AgentPlan, PlanStep } from '../../shared/agent-schema.ts';
import { readDecisions, reopenDecisionIn, writeDecision, type DecisionActor } from '../../shared/decision-schema.ts';
import { GROUP_GAP, KIND_COLOR, SECTION_GAP, SECTIONS_PER_ROW, boundsOf, sectionSize, type Rect } from '../../shared/session-layout.ts';
import type { Card } from '../../shared/types.ts';
import { NOTE_GAP, SECTION_HEAD, SECTION_PAD, STICKY, membersOf, parts, readBoard, writeNote, writeSection } from '../../shared/ydoc.ts';

/*
  Whiteboard agent, apply (PRD 3.3 and 7). Runs inside applyAsOneStep, so the whole plan is one
  LOCAL transaction and one undo step, locks included. Order: create sections, move notes, add
  notes, picked ideas, locks, renames, remove empty sections, reopen.
*/

/** Tick keys. Ideas and "remove empty section" start unticked; everything else starts ticked. */
export const tickKey = {
  section: (ref: string) => `sec:${ref}`,
  move: (noteId: string) => `move:${noteId}`,
  newNote: (ref: string) => `new:${ref}`,
  idea: (id: string) => `idea:${id}`,
  lock: (ref: string) => `lock:${ref}`,
  rename: (sectionId: string) => `rename:${sectionId}`,
  remove: (sectionId: string) => `remove:${sectionId}`,
  reopen: (id: string) => `reopen:${id}`,
};
export const isOn = (ticks: Record<string, boolean>, key: string) => ticks[key] ?? !(key.startsWith('idea:') || key.startsWith('remove:'));

export interface Choices {
  ticks: Record<string, boolean>;
  /** Edited section titles (by ref) and note text (by ref). */
  edits: Record<string, string>;
  ideas: AgentIdea[];
}

export interface ApplyResult {
  sections: number;
  moved: number;
  added: number;
  ideas: number;
  locks: number;
  renamed: number;
  removed: number;
  reopened: number;
  /** Notes that changed while the person was reviewing, left alone. */
  skipped: number;
  /** Section locks written as board locks because the section was already covered. */
  downgraded: number;
  /** New and moved ids, for framing. */
  ids: string[];
}

const uid = () => Math.random().toString(36).slice(2, 12);
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const ofType = <T extends PlanStep['type']>(steps: PlanStep[], t: T) => steps.filter((s) => s.type === t) as Extract<PlanStep, { type: T }>[];

type Item = { kind: 'move'; card: Card } | { kind: 'new'; ref: string; text: string; color: Card['color'] } | { kind: 'idea'; text: string };

/** Which moved notes are still safe to move (PRD 7, stale check). */
export function freshMoves(doc: Y.Doc, plan: AgentPlan, me: string, ticks: Record<string, boolean>) {
  const b = readBoard(doc);
  const cards = new Map(b.notes.map((n) => [n.id, n]));
  const sectionOf = (c: Card) => (c.sectionId && b.sections.some((s) => s.id === c.sectionId) ? c.sectionId : (b.sections.find((s) => membersOf(s, [c]).length) ?? null)?.id ?? null);
  let skipped = 0;
  const ok = new Set<string>();
  for (const m of ofType(plan.steps, 'moveNotes')) {
    if (m.toRef.startsWith('#') && !isOn(ticks, tickKey.section(m.toRef))) continue;
    for (const id of m.noteIds) {
      if (!isOn(ticks, tickKey.move(id))) continue;
      const c = cards.get(id);
      const was = plan.noteState[id];
      if (!c || !was || sectionOf(c) !== was.sectionId || (c.reservedBy && c.reservedBy !== me)) {
        skipped++;
        continue;
      }
      ok.add(id);
    }
  }
  return { ok, skipped };
}

export function applyPlan(doc: Y.Doc, plan: AgentPlan, choices: Choices, actor: DecisionActor): ApplyResult {
  const { ticks, edits } = choices;
  const on = (k: string) => isOn(ticks, k);
  const b = readBoard(doc);
  const p = parts(doc);
  const t0 = Date.now();
  const res: ApplyResult = { sections: 0, moved: 0, added: 0, ideas: 0, locks: 0, renamed: 0, removed: 0, reopened: 0, skipped: 0, downgraded: 0, ids: [] };

  const { ok, skipped } = freshMoves(doc, plan, actor.id, ticks);
  res.skipped = skipped;
  const cards = new Map(b.notes.map((n) => [n.id, n]));

  // ---- what goes where ----
  const items = new Map<string, Item[]>(); // target ref ('#s1', a section id, or '' for loose)
  const push = (t: string, i: Item) => items.set(t, [...(items.get(t) ?? []), i]);
  const created = ofType(plan.steps, 'createSection').filter((s) => on(tickKey.section(s.ref)));
  const createdRefs = new Set(created.map((s) => s.ref));
  const liveTarget = (t: string | undefined) => {
    if (!t) return '';
    if (t.startsWith('#')) return createdRefs.has(t) ? t : null; // null: its section was unticked
    return b.sections.some((s) => s.id === t) ? t : '';
  };
  for (const m of ofType(plan.steps, 'moveNotes')) {
    const t = liveTarget(m.toRef);
    if (t === null) continue;
    for (const id of m.noteIds) if (ok.has(id)) push(t, { kind: 'move', card: cards.get(id)! });
  }
  const newRefToId = new Map<string, string>();
  for (const a of ofType(plan.steps, 'addNotes')) {
    const t = liveTarget(a.toRef);
    if (t === null) continue;
    for (const n of a.notes) {
      const text = (edits[tickKey.newNote(n.ref)] ?? n.text).trim();
      if (on(tickKey.newNote(n.ref)) && text) push(t, { kind: 'new', ref: n.ref, text, color: KIND_COLOR[n.kind ?? 'idea'] });
    }
  }
  const ideaStep = ofType(plan.steps, 'proposeIdeas')[0];
  if (ideaStep) {
    const t = liveTarget(ideaStep.toRef);
    if (t !== null) for (const i of choices.ideas) if (on(tickKey.idea(i.id))) push(t, { kind: 'idea', text: i.text });
  }
  // A new section exists only if something goes in it, or a ticked lock points at it.
  const lockTargets = new Set(ofType(plan.steps, 'lockDecision').filter((l) => on(tickKey.lock(l.ref)) && !l.blocked && l.sectionRef).map((l) => l.sectionRef!));
  const toCreate = created.filter((s) => (items.get(s.ref)?.length ?? 0) > 0 || lockTargets.has(s.ref));

  // ---- layout: new sections ----
  const movingIds = new Set([...ok]);
  const obstacles: Rect[] = [...b.notes.filter((n) => !movingIds.has(n.id)), ...b.sections].map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  const sized = toCreate.map((s) => ({ s, ...sectionSize(items.get(s.ref)?.length ?? 0) }));
  // Relative rows of up to 4 sections.
  const rel: { ref: string; x: number; y: number; w: number; h: number }[] = [];
  let rowY = 0;
  for (let i = 0; i < sized.length; i += SECTIONS_PER_ROW) {
    let x = 0;
    let rowH = 0;
    for (const z of sized.slice(i, i + SECTIONS_PER_ROW)) {
      rel.push({ ref: z.s.ref, x, y: rowY, w: z.w, h: z.h });
      x += z.w + SECTION_GAP;
      rowH = Math.max(rowH, z.h);
    }
    rowY += rowH + SECTION_GAP;
  }
  const group = boundsOf(rel) ?? { x: 0, y: 0, w: 0, h: 0 };
  const all = boundsOf([...b.notes, ...b.sections].map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })));
  const below = all ? { x: all.x, y: all.y + all.h + GROUP_GAP } : { x: 0, y: 0 };
  let origin = below;
  if (!plan.classify && sized.length) {
    // Grouping a selection: next to the notes (and the sections they sit in), right if there is room, else below.
    const moved = [...movingIds].map((id) => cards.get(id)!).filter(Boolean);
    const home = b.sections.filter((s) => moved.some((c) => membersOf(s, [c]).length));
    const anchor = boundsOf([...moved, ...home].map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })));
    if (anchor) {
      const free = (o: { x: number; y: number }) => !obstacles.some((r) => overlaps(r, { x: o.x - 40, y: o.y - 40, w: group.w + 80, h: group.h + 80 }));
      const right = { x: anchor.x + anchor.w + SECTION_GAP, y: anchor.y };
      const under = { x: anchor.x, y: anchor.y + anchor.h + SECTION_GAP };
      origin = free(right) ? right : free(under) ? under : below;
    }
  }
  const placedSections = new Map<string, Rect & { id: string }>();
  for (const r of rel) {
    const s = toCreate.find((x) => x.ref === r.ref)!;
    const id = uid();
    const rect = { id, x: Math.round(origin.x + r.x), y: Math.round(origin.y + r.y), w: r.w, h: r.h };
    const title = (edits[tickKey.section(s.ref)] ?? s.title).trim().slice(0, 40) || 'Untitled section';
    writeSection(doc, { id, title, titleSource: 'ai', x: rect.x, y: rect.y, w: rect.w, h: rect.h, createdBy: actor.id });
    placedSections.set(s.ref, rect);
    res.sections++;
    res.ids.push(id);
  }

  // ---- write notes into their places ----
  let order = 0;
  const writeItem = (it: Item, x: number, y: number, sectionId: string | null) => {
    if (it.kind === 'move') {
      const m = p.notes.get(it.card.id);
      if (!m) return;
      m.set('x', Math.round(x));
      m.set('y', Math.round(y));
      m.set('sectionId', sectionId);
      res.moved++;
      res.ids.push(it.card.id);
      return;
    }
    const id = uid();
    writeNote(doc, {
      id,
      text: it.text,
      x,
      y,
      color: it.kind === 'new' ? it.color : 'yellow',
      authorId: actor.id,
      authorName: actor.name,
      authorColor: actor.color,
      origin: 'ai', // the AI never owns a note: credited to the person who pressed Apply
      sectionId,
      createdAt: t0 + order++,
    });
    if (it.kind === 'new') {
      newRefToId.set(it.ref, id);
      res.added++;
    } else res.ideas++;
    res.ids.push(id);
  };

  for (const [ref, rect] of placedSections) {
    (items.get(ref) ?? []).forEach((it, j) =>
      writeItem(it, rect.x + SECTION_PAD + (j % 2) * (STICKY + NOTE_GAP), rect.y + SECTION_HEAD + Math.floor(j / 2) * (STICKY + NOTE_GAP), rect.id),
    );
  }

  // Existing sections: free grid slots after what is already there; the section grows if needed.
  for (const [target, list] of items) {
    if (!target || target.startsWith('#')) continue;
    const sm = p.sections.get(target);
    const sec = b.sections.find((s) => s.id === target);
    if (!sm || !sec) continue;
    const stay: Rect[] = b.notes.filter((n) => !movingIds.has(n.id) && membersOf(sec, [n]).length).map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
    const cols = Math.max(1, Math.floor((sec.w - 2 * SECTION_PAD + NOTE_GAP) / (STICKY + NOTE_GAP)));
    let slot = 0;
    let bottom = sec.y + sec.h;
    for (const it of list) {
      let r: Rect;
      do {
        r = { x: sec.x + SECTION_PAD + (slot % cols) * (STICKY + NOTE_GAP), y: sec.y + SECTION_HEAD + Math.floor(slot / cols) * (STICKY + NOTE_GAP), w: STICKY, h: STICKY };
        slot++;
      } while (stay.some((s) => overlaps(s, r)) && slot < 400);
      stay.push(r);
      bottom = Math.max(bottom, r.y + r.h + SECTION_PAD);
      writeItem(it, r.x, r.y, sec.id);
    }
    if (bottom > sec.y + sec.h) sm.set('h', Math.round(bottom - sec.y));
  }

  // Loose new notes and ideas (no section): one row below everything, including the new group.
  const loose = items.get('') ?? [];
  if (loose.length) {
    const top = placedSections.size && origin === below ? below.y + group.h + SECTION_GAP : below.y;
    loose.forEach((it, j) => writeItem(it, below.x + j * (STICKY + NOTE_GAP), top, null));
  }

  // ---- locks, in the person's name, via the agent ----
  for (const l of ofType(plan.steps, 'lockDecision')) {
    if (!on(tickKey.lock(l.ref)) || l.blocked) continue;
    let sectionId: string | null = null;
    if (l.scope === 'section' && l.sectionRef) {
      sectionId = l.sectionRef.startsWith('#') ? (placedSections.get(l.sectionRef)?.id ?? null) : p.sections.has(l.sectionRef) ? l.sectionRef : null;
    }
    const sourceNoteIds = l.sourceRefs.map((r) => (r.startsWith('#') ? newRefToId.get(r) : p.notes.has(r) ? r : undefined)).filter((x): x is string => Boolean(x));
    const w = writeDecision(doc, { text: l.text, reasons: l.reasons, scope: sectionId ? 'section' : 'board', sectionId, sourceNoteIds, reportIds: l.reportIds }, actor, { via: 'agent' });
    if (w.downgraded && sectionId) res.downgraded++;
    res.locks++;
  }

  // ---- renames ----
  for (const r of ofType(plan.steps, 'renameSection')) {
    const m = p.sections.get(r.sectionId);
    if (!m || !on(tickKey.rename(r.sectionId))) continue;
    m.set('title', r.title);
    m.set('titleSource', 'ai');
    res.renamed++;
  }

  // ---- remove a section the plan emptied (unticked by default; only if still empty and not locked) ----
  const now = readBoard(doc);
  const ds = readDecisions(doc);
  for (const r of ofType(plan.steps, 'removeEmptySection')) {
    if (!on(tickKey.remove(r.sectionId))) continue;
    const sec = now.sections.find((s) => s.id === r.sectionId);
    if (!sec || membersOf(sec, now.notes).length || ds.some((d) => d.status === 'locked' && d.scope === 'section' && d.sectionId === sec.id)) continue;
    p.sections.delete(sec.id);
    res.removed++;
  }

  // ---- reopen ----
  for (const r of ofType(plan.steps, 'reopenDecision')) {
    if (on(tickKey.reopen(r.decisionId)) && reopenDecisionIn(doc, r.decisionId, actor)) res.reopened++;
  }
  return res;
}

/** The live counts line under a plan (PRD 3.3 footer). */
export function countsLine(plan: AgentPlan, choices: Choices) {
  const on = (k: string) => isOn(choices.ticks, k);
  const secs = ofType(plan.steps, 'createSection').filter((s) => on(tickKey.section(s.ref)));
  const live = new Set(secs.map((s) => s.ref));
  const okTarget = (t?: string) => !t || !t.startsWith('#') || live.has(t);
  const moves = ofType(plan.steps, 'moveNotes')
    .filter((m) => okTarget(m.toRef))
    .reduce((a, m) => a + m.noteIds.filter((id) => on(tickKey.move(id))).length, 0);
  const adds = ofType(plan.steps, 'addNotes')
    .filter((a) => okTarget(a.toRef))
    .reduce((a, s) => a + s.notes.filter((n) => on(tickKey.newNote(n.ref)) && (choices.edits[tickKey.newNote(n.ref)] ?? n.text).trim()).length, 0);
  const ideaStep = ofType(plan.steps, 'proposeIdeas')[0];
  const ideas = ideaStep && okTarget(ideaStep.toRef) ? choices.ideas.filter((i) => on(tickKey.idea(i.id))).length : 0;
  const locks = ofType(plan.steps, 'lockDecision').filter((l) => on(tickKey.lock(l.ref)) && !l.blocked && (!l.sectionRef || okTarget(l.sectionRef))).length;
  const renames = ofType(plan.steps, 'renameSection').filter((r) => on(tickKey.rename(r.sectionId))).length;
  const removes = ofType(plan.steps, 'removeEmptySection').filter((r) => on(tickKey.remove(r.sectionId))).length;
  const reopens = ofType(plan.steps, 'reopenDecision').filter((r) => on(tickKey.reopen(r.decisionId))).length;
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const parts = [
    secs.length && n(secs.length, 'section'),
    moves && `${n(moves, 'note')} ${moves === 1 ? 'moves' : 'move'}`,
    adds && n(adds, 'new note'),
    ideas && n(ideas, 'idea'),
    locks && n(locks, 'decision'),
    renames && n(renames, 'rename'),
    removes && n(removes, 'section', 'sections') + ' removed',
    reopens && n(reopens, 'decision') + ' reopened',
  ].filter(Boolean) as string[];
  return { text: parts.join(', '), total: moves + adds + ideas + locks + renames + removes + reopens + secs.length };
}

export function resultLine(r: ApplyResult) {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const bits = [
    r.moved && `${n(r.moved, 'note')} moved${r.sections ? ` into ${n(r.sections, 'section')}` : ''}`,
    !r.moved && r.sections && `${n(r.sections, 'section')} made`,
    r.added && `${n(r.added, 'note')} added`,
    r.ideas && `${n(r.ideas, 'idea')} placed`,
    r.locks && `${n(r.locks, 'decision')} locked`,
    r.renamed && `${n(r.renamed, 'section')} renamed`,
    r.removed && `${n(r.removed, 'empty section')} removed`,
    r.reopened && `${n(r.reopened, 'decision')} reopened`,
  ].filter(Boolean);
  let s = bits.length ? `Done. ${bits.join(', ')}.` : 'Nothing was changed.';
  s = s.replace(/^Done\. (\w)/, (_, c: string) => `Done. ${c.toUpperCase()}`);
  if (r.skipped) s += ` ${n(r.skipped, 'note')} changed while you were reviewing and ${r.skipped === 1 ? 'was' : 'were'} left alone.`;
  if (r.downgraded) s += ` ${n(r.downgraded, 'section')} was already locked, so ${r.downgraded === 1 ? 'that lock covers' : 'those locks cover'} the whole problem instead.`;
  return s;
}
