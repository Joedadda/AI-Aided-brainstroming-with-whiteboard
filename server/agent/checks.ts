import { AGENT_LIMITS, hasLockIntent, type AgentIdea, type AgentPlan, type ModelIdeas, type ModelPlan, type NoteKind, type PlanStep, type PlanWarning } from '../../shared/agent-schema.ts';
import { coveringDecision, type AgentContext, type CtxNote } from './context.ts';

/*
  Plan checks (Whiteboard_Agent_PRD 6.3). Pure functions: the model's flat plan and the board
  context in, a safe AgentPlan out, or InvalidPlan with a reason the model can act on when re-asked.
  Tested in checks.test.ts.
*/

export class InvalidPlan extends Error {}

const OTHER = 'Other';
const NOT_SURE = 'Not sure';
export const NO_LOCK_LINE = 'I only lock when you ask me to.';
export const COVERED_LINE = 'This section is covered by a locked decision.';

// ---------- text helpers ----------

/** Plain text: no markdown, no list markers, no em dashes, one line. */
export function plain(s: string) {
  return s
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^\s*(#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, '')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s*–\s*/g, ' to ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut at a word boundary, never mid-word. */
export function clamp(s: string, max: number) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : s.slice(0, max)).replace(/[\s,;:.-]+$/, '');
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP = new Set(
  'the a an and or but of to in on for with at by from is are be was were it its this that these those as if then than so not no do does we you they our your their can could should would will just more most less very into over under about after before what which who how when where why there here also only one two'.split(' '),
);
export const words = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w)));

/** Word overlap (Jaccard) between two texts. */
export function overlap(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  A.forEach((w) => B.has(w) && n++);
  return n / (A.size + B.size - n);
}

const short = (t: string, n = 60) => (t.length > n ? `${clamp(t, n - 1)}…` : t);

// ---------- the check ----------

interface Bucket {
  ref: string; // '#s1' for a new section, or an existing section id
  isNew: boolean;
  title: string;
  noteIds: string[];
  modelRefs: string[];
}

export function checkPlan(m: ModelPlan, c: AgentContext): AgentPlan {
  const scope = { notes: c.notes.length, total: c.total, capped: c.capped, selected: c.selected };
  const noteByRef = new Map(c.notes.map((n) => [n.ref.toLowerCase(), n]));
  const sectionByRef = new Map(c.sections.map((s) => [s.ref.toLowerCase(), s]));
  const decisionByRef = new Map(c.decisions.map((d) => [d.ref.toLowerCase(), d]));
  const key = (r: string) => r.trim().toLowerCase();
  const empty = (extra: Partial<AgentPlan>): AgentPlan => ({ summary: '', warnings: [], steps: [], classify: false, noteState: {}, scope, ...extra });

  // Clarify: one question, no steps.
  if (m.kind === 'clarify') {
    const q = clamp(plain(m.question || m.summary), 300);
    if (!q) throw new InvalidPlan('A clarify reply needs a question in "question".');
    return empty({ summary: '', clarify: { question: q } });
  }

  // Answer only: text plus the notes it names. Nothing is written.
  if (m.kind === 'answer') {
    const ids = uniq(m.answer.noteIds.map((r) => noteByRef.get(key(r))?.id).filter((x): x is string => Boolean(x)));
    // Ids that slipped into the text become the note's first words.
    const text = m.answer.text
      .split('\n')
      .map((line) => plain(line.replace(/\b(n\d+)\b/gi, (_, r: string) => {
        const n = noteByRef.get(r.toLowerCase());
        return n ? `"${short(n.text, 40)}"` : r;
      })))
      .filter(Boolean)
      .join('\n')
      .slice(0, 2000);
    if (!text) throw new InvalidPlan('An answer reply needs text in answer.text.');
    return empty({ summary: clamp(plain(m.summary), 300), answer: { text, noteIds: ids } });
  }

  const warnings: PlanWarning[] = [];
  let summary = clamp(plain(m.summary), 300);
  const lockIntent = hasLockIntent(c.instruction);

  // ---- buckets: new sections and moves ----
  const assigned = new Set<string>();
  const reservedSkipped = new Set<string>();
  const buckets: Bucket[] = [];
  const bucketByModelRef = new Map<string, Bucket>();
  let newCount = 0;
  const movable = (n: CtxNote) => !n.reservedBy || n.reservedBy === c.userId;

  for (const b of m.buckets) {
    const existing = b.existingSectionId ? sectionByRef.get(key(b.existingSectionId)) : undefined;
    const title = clamp(plain(b.title), AGENT_LIMITS.sectionTitle) || existing?.title || '';
    if (!existing && !title) continue;
    // Same target twice (same existing section, or same new title): merge.
    let bucket = existing ? buckets.find((x) => !x.isNew && x.ref === existing.id) : buckets.find((x) => x.isNew && norm(x.title) === norm(title));
    // A new bucket named like an existing section in scope goes into that section.
    if (!bucket && !existing) {
      const same = c.sections.find((s) => norm(s.title) === norm(title));
      if (same) bucket = buckets.find((x) => !x.isNew && x.ref === same.id);
      if (!bucket && same) {
        bucket = { ref: same.id, isNew: false, title: same.title, noteIds: [], modelRefs: [] };
        buckets.push(bucket);
      }
    }
    if (!bucket) {
      bucket = existing
        ? { ref: existing.id, isNew: false, title: existing.title, noteIds: [], modelRefs: [] }
        : { ref: `#s${++newCount}`, isNew: true, title, noteIds: [], modelRefs: [] };
      buckets.push(bucket);
    }
    if (b.ref) {
      bucket.modelRefs.push(key(b.ref));
      bucketByModelRef.set(key(b.ref), bucket);
    }
    for (const r of b.noteIds) {
      const n = noteByRef.get(key(r));
      if (!n || assigned.has(n.id)) continue; // unknown ids dropped; first bucket wins
      if (!movable(n)) {
        reservedSkipped.add(n.id);
        continue;
      }
      assigned.add(n.id);
      if (!bucket.isNew && n.sectionId === bucket.ref) continue; // already there
      bucket.noteIds.push(n.id);
    }
  }

  const resolveTarget = (r: string): string | undefined => {
    if (!r) return undefined;
    const b = bucketByModelRef.get(key(r));
    if (b) return b.ref;
    const s = sectionByRef.get(key(r));
    if (s) return s.id;
    return undefined;
  };

  // ---- new notes (needed before the bucket-size rules, since a bucket may hold only new notes) ----
  const existingText = new Set(c.allNotes.map((n) => norm(n.text)));
  const newNoteRefs = new Map<string, string>(); // model ref -> '#n1'
  const newNotes: { ref: string; text: string; kind?: NoteKind; toRef?: string }[] = [];
  for (const n of m.newNotes) {
    const text = clamp(plain(n.text), AGENT_LIMITS.noteText);
    if (!text || existingText.has(norm(text)) || newNotes.some((x) => norm(x.text) === norm(text))) continue;
    if (newNotes.length >= AGENT_LIMITS.newNotes) break;
    const ref = `#n${newNotes.length + 1}`;
    if (n.ref) newNoteRefs.set(key(n.ref), ref);
    newNotes.push({ ref, text, kind: n.kind === 'idea' ? undefined : n.kind, toRef: resolveTarget(n.toRef) });
  }

  // ---- ideas ----
  const ideasCount = Math.round(m.ideas.count || 0);
  const ideas =
    ideasCount > 0
      ? {
          toRef: resolveTarget(m.ideas.toRef),
          count: Math.max(3, Math.min(AGENT_LIMITS.ideas, ideasCount)),
          angles: fillAngles(m.ideas.angles.map((a) => clamp(plain(a), 30)).filter(Boolean)),
        }
      : null;

  // ---- locks (instruction must carry lock intent) ----
  const lockSteps: Extract<PlanStep, { type: 'lockDecision' }>[] = [];
  const reopenSteps: Extract<PlanStep, { type: 'reopenDecision' }>[] = [];
  if (!lockIntent && (m.locks.length || m.reopen.length)) {
    if (!summary.includes(NO_LOCK_LINE)) summary = `${summary} ${NO_LOCK_LINE}`.trim();
  } else if (lockIntent) {
    const claimed = new Set<string>();
    for (const l of m.locks) {
      if (lockSteps.length >= AGENT_LIMITS.locks) break;
      const text = clamp(plain(l.text), AGENT_LIMITS.decisionText);
      if (!text || lockSteps.some((x) => norm(x.text) === norm(text))) continue; // same text twice: merged
      const target = l.scope === 'section' ? resolveTarget(l.sectionRef) : undefined;
      const scopeOut: 'board' | 'section' = target ? 'section' : 'board';
      let blocked: string | undefined;
      if (target && !target.startsWith('#')) {
        const cover = coveringDecision(c, target);
        if (cover) blocked = `Already covered by "${short(cover.text)}"`;
      }
      if (target && !blocked && claimed.has(target)) blocked = 'Another step in this plan already locks this section.';
      if (target && !blocked) claimed.add(target);
      const sourceRefs = uniq(
        l.sourceRefs
          .map((r) => newNoteRefs.get(key(r)) ?? noteByRef.get(key(r))?.id)
          .filter((x): x is string => Boolean(x)),
      ).slice(0, 20);
      lockSteps.push({
        type: 'lockDecision',
        ref: `#d${lockSteps.length + 1}`,
        text,
        reasons: clamp(plain(l.reasons), AGENT_LIMITS.decisionReasons),
        scope: scopeOut,
        ...(target ? { sectionRef: target } : {}),
        sourceRefs,
        reportIds: [],
        ...(blocked ? { blocked } : {}),
      });
    }
    for (const r of m.reopen) {
      const d = decisionByRef.get(key(r.decisionId));
      if (d && !reopenSteps.some((x) => x.decisionId === d.id)) reopenSteps.push({ type: 'reopenDecision', decisionId: d.id, text: d.text });
    }
  }

  const targetedBy = (ref: string) =>
    newNotes.filter((n) => n.toRef === ref).length + (ideas?.toRef === ref ? 1 : 0) + lockSteps.filter((l) => l.sectionRef === ref).length;

  // ---- classification rules ----
  const classify = buckets.filter((b) => b.noteIds.length || b.isNew).length >= 2;
  if (classify) {
    const left = new Set(m.leaveNoteIds.map((r) => noteByRef.get(key(r))?.id).filter(Boolean) as string[]);
    // Every note in scope once: leftovers go to "Not sure" if more than 2, else stay.
    // Only notes from the sections the plan is sorting count as leftovers. A whole-board sort of
    // the "Ideas" pile must not sweep the facts in "What we know" into "Not sure" (seen live).
    const sortedFrom = new Set(c.notes.filter((n) => assigned.has(n.id)).map((n) => n.sectionId));
    const leftovers = c.notes.filter((n) => movable(n) && !assigned.has(n.id) && !left.has(n.id) && sortedFrom.has(n.sectionId));
    if (leftovers.length > 2) {
      const ns = bucketNamed(buckets, NOT_SURE, () => `#s${++newCount}`);
      leftovers.forEach((n) => {
        assigned.add(n.id);
        ns.noteIds.push(n.id);
      });
    }
    // Buckets with fewer than 2 notes merge into "Other" (new buckets only; nothing else points at them).
    // A bucket the person named in the instruction stays, whatever its size ("this sprint, next sprint, later").
    const named = (title: string) => norm(title).length > 2 && norm(c.instruction).includes(norm(title));
    const small = buckets.filter((b) => b.isNew && norm(b.title) !== norm(OTHER) && norm(b.title) !== norm(NOT_SURE) && b.noteIds.length < 2 && b.noteIds.length > 0 && targetedBy(b.ref) === 0 && !named(b.title));
    if (small.length) {
      const other = bucketNamed(buckets, OTHER, () => `#s${++newCount}`);
      for (const b of small) {
        other.noteIds.push(...b.noteIds);
        b.noteIds = [];
        for (const r of b.modelRefs) bucketByModelRef.set(r, other);
      }
    }
  }
  // Drop new buckets left with nothing in them and nothing pointing at them.
  const kept = buckets.filter((b) => b.noteIds.length > 0 || (b.isNew && targetedBy(b.ref) > 0));
  // "Other" with a single note left after merging stays: there is nowhere else for it.

  // ---- limits ----
  const moved = kept.reduce((a, b) => a + b.noteIds.length, 0);
  if (moved > AGENT_LIMITS.moves) throw new InvalidPlan(`The plan moves ${moved} notes; the limit is ${AGENT_LIMITS.moves}.`);
  const newSections = kept.filter((b) => b.isNew).length;
  if (newSections > AGENT_LIMITS.sections) throw new InvalidPlan(`The plan makes ${newSections} sections; the limit is ${AGENT_LIMITS.sections}. Use fewer buckets.`);

  // ---- renames ----
  const renames: Extract<PlanStep, { type: 'renameSection' }>[] = [];
  for (const r of m.renames) {
    const s = sectionByRef.get(key(r.sectionId));
    const title = clamp(plain(r.title), AGENT_LIMITS.sectionTitle);
    if (s && title && title !== s.title && !renames.some((x) => x.sectionId === s.id)) renames.push({ type: 'renameSection', sectionId: s.id, title, from: s.title });
  }

  // ---- assemble, in apply order ----
  const steps: PlanStep[] = [];
  const keptRefs = new Set(kept.map((b) => b.ref));
  for (const b of kept) if (b.isNew) steps.push({ type: 'createSection', ref: b.ref, title: b.title });
  const coveredWarn = (sectionId: string | undefined) => Boolean(sectionId && !sectionId.startsWith('#') && coveringDecision(c, sectionId));
  for (const b of kept) {
    if (!b.noteIds.length) continue;
    const idx = steps.push({ type: 'moveNotes', noteIds: b.noteIds, toRef: b.ref }) - 1;
    const touchesCovered = coveredWarn(b.ref) || b.noteIds.some((id) => coveredWarn(c.notes.find((n) => n.id === id)?.sectionId ?? undefined));
    if (touchesCovered) warnings.push({ stepIndex: idx, text: COVERED_LINE });
  }
  const byTarget = new Map<string, typeof newNotes>();
  for (const n of newNotes) {
    const t = n.toRef && (keptRefs.has(n.toRef) || !n.toRef.startsWith('#')) ? n.toRef : '';
    byTarget.set(t, [...(byTarget.get(t) ?? []), n]);
  }
  for (const [t, ns] of byTarget) {
    const idx = steps.push({ type: 'addNotes', ...(t ? { toRef: t } : {}), notes: ns.map(({ ref, text, kind }) => ({ ref, text, ...(kind ? { kind } : {}) })) }) - 1;
    if (coveredWarn(t)) warnings.push({ stepIndex: idx, text: COVERED_LINE });
  }
  if (ideas) {
    const t = ideas.toRef && (keptRefs.has(ideas.toRef) || !ideas.toRef.startsWith('#')) ? ideas.toRef : undefined;
    const idx = steps.push({ type: 'proposeIdeas', ...(t ? { toRef: t } : {}), count: ideas.count, angles: ideas.angles }) - 1;
    if (coveredWarn(t)) warnings.push({ stepIndex: idx, text: COVERED_LINE });
  }
  steps.push(...renames);

  // Offer to remove a section the plan empties: all its notes move out, nothing moves in, not locked.
  const movedIds = new Set(kept.flatMap((b) => b.noteIds));
  for (const s of c.sections) {
    if (!s.memberIds.length || keptRefs.has(s.id) || coveringDecision(c, s.id)) continue;
    if (lockSteps.some((l) => l.sectionRef === s.id) || newNotes.some((n) => n.toRef === s.id) || ideas?.toRef === s.id) continue;
    if (s.memberIds.every((id) => movedIds.has(id))) steps.push({ type: 'removeEmptySection', sectionId: s.id, title: s.title });
  }
  // Locks last, so they can point at what the plan just made.
  for (const l of lockSteps) {
    if (l.sectionRef?.startsWith('#') && !keptRefs.has(l.sectionRef)) {
      delete l.sectionRef;
      l.scope = 'board';
    }
    l.sourceRefs = l.sourceRefs.filter((r) => !r.startsWith('#') || newNotes.some((n) => n.ref === r));
    steps.push(l);
  }
  steps.push(...reopenSteps);

  for (const id of reservedSkipped) {
    const n = c.notes.find((x) => x.id === id)!;
    warnings.push({ noteId: id, text: `${n.reservedByName ?? 'Someone'} is exploring "${short(n.text, 40)}" in a private canvas, so it stays where it is.` });
  }

  const noteState: AgentPlan['noteState'] = {};
  for (const id of movedIds) {
    const n = c.notes.find((x) => x.id === id)!;
    noteState[id] = { sectionId: n.sectionId, reservedBy: n.reservedBy, text: n.text };
  }

  if (!summary) summary = autoSummary(steps);
  return { summary, warnings, steps, classify, noteState, scope };
}

function bucketNamed(buckets: Bucket[], title: string, nextRef: () => string) {
  let b = buckets.find((x) => x.isNew && norm(x.title) === norm(title));
  if (!b) {
    b = { ref: nextRef(), isNew: true, title, noteIds: [], modelRefs: [] };
    buckets.push(b);
  }
  return b;
}

const DEFAULT_ANGLES = ['From the data', 'A smaller version', 'From another product'];
function fillAngles(a: string[]) {
  const out = uniq(a).slice(0, 3);
  for (const d of DEFAULT_ANGLES) if (out.length < 3 && !out.some((x) => norm(x) === norm(d))) out.push(d);
  return out;
}

function uniq<T>(xs: T[]) {
  return [...new Set(xs)];
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function autoSummary(steps: PlanStep[]) {
  const secs = steps.filter((s) => s.type === 'createSection').length;
  const moves = steps.reduce((a, s) => a + (s.type === 'moveNotes' ? s.noteIds.length : 0), 0);
  const adds = steps.reduce((a, s) => a + (s.type === 'addNotes' ? s.notes.length : 0), 0);
  const locks = steps.filter((s) => s.type === 'lockDecision').length;
  const parts = [secs && `makes ${n(secs, 'section')}`, moves && `moves ${n(moves, 'note')}`, adds && `adds ${n(adds, 'note')}`, locks && `locks ${n(locks, 'decision')}`].filter(Boolean);
  if (!parts.length) return 'Nothing to change.';
  const s = parts.join(', ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

// ---------- ideas (PRD 6.4) ----------

/**
  Merge one angle's ideas into what is already shown: plain, within limits, not a duplicate of a
  note on the board or another idea (normalised text, or a large word overlap), and a conflict only
  when it names a real decision in force.
*/
export function mergeIdeas(
  got: ModelIdeas,
  angle: string,
  opts: { existing: string[]; shown: AgentIdea[]; perAngle: number; total: number; decisions: { ref: string; id: string }[]; newId: () => string },
): AgentIdea[] {
  const out: AgentIdea[] = [];
  for (const i of got.ideas) {
    if (opts.shown.length + out.length >= opts.total || out.length >= opts.perAngle) break;
    const text = clamp(plain(i.text), AGENT_LIMITS.noteText);
    if (text.length < 8) continue;
    const against = [...opts.existing, ...opts.shown.map((x) => x.text), ...out.map((x) => x.text)];
    if (against.some((t) => norm(t) === norm(text) || overlap(t, text) >= 0.6)) continue;
    const d = opts.decisions.find((x) => x.ref.toLowerCase() === i.conflictsWith.trim().toLowerCase());
    out.push({ id: opts.newId(), text, angle, conflictsWith: d ? d.id : null, conflictLine: d ? clamp(plain(i.conflictLine), 140) : '' });
  }
  return out;
}
