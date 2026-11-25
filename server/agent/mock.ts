import type { ModelIdeas, ModelPlanInput } from '../../shared/agent-schema.ts';
import { hasLockIntent } from '../../shared/agent-schema.ts';
import { norm, overlap, words } from './checks.ts';
import type { AgentContext, CtxNote } from './context.ts';
import { DIRECTIONS, IDEA_BANK_BY_ID, type BankNote } from '../cases/split-buddy.ts';

/*
  Offline stand-in for the agent (PRD 7, "Offline mock"). Used when MOCK_AI=1 or there is no key,
  so the demo cannot fail on a bad connection. Labelled by the existing Offline demo badge.
  It is not a test of the model.

  It recognises the scripted commands of Demo_Whiteboard_PRD.md section 6.1 by keywords and builds
  a plan from the notes actually on the board. Its output goes through the same checks as the model's.
*/

// ---------------------------------------------------------------------------------------------
// KEY PLANS: the scripted commands C1, C2, C4 and C7 (Split_Buddy_Board_v3_Full.md, Part 2
// section 6.1), built from the case file's answer key. Each returns null when the board does not
// hold the case notes, and then the generic mock below runs. C3, C5 and C6 need no key: the
// generic group, add-notes and lock plans already give the expected result.
// Notes are matched by id first (the seed uses i01 to i40), then by text.
// ---------------------------------------------------------------------------------------------
type KeyPlan = (c: AgentContext, instruction: string) => ModelPlanInput | null;

/** The case notes in scope, with their answer-key row. */
function caseNotes(c: AgentContext): { n: CtxNote; k: BankNote }[] {
  const byText = new Map(IDEA_BANK_BY_ID.map((k) => [norm(k.text), k]));
  const byId = new Map(IDEA_BANK_BY_ID.map((k) => [k.id, k]));
  return c.notes.flatMap((n) => {
    const k = byId.get(n.id) ?? byText.get(norm(n.text));
    return k ? [{ n, k }] : [];
  });
}
const refOf = (c: AgentContext, id: string) => {
  const k = IDEA_BANK_BY_ID.find((x) => x.id === id);
  return c.notes.find((n) => n.id === id || (k && norm(n.text) === norm(k.text)))?.ref ?? null;
};

export const KEY_PLANS: Partial<Record<'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7', KeyPlan>> = {
  // C1: the seven direction sections. Facts, frame and restate notes stay where they are.
  C1: (c) => {
    const hits = caseNotes(c);
    if (hits.length < 20) return null;
    const ids = new Set(hits.map((h) => h.n.id));
    const buckets = DIRECTIONS.map((d, i) => ({
      ref: `b${i + 1}`,
      title: d.title,
      existingSectionId: '',
      noteIds: hits.filter((h) => h.k.dir === d.code).map((h) => h.n.ref),
    })).filter((b) => b.noteIds.length);
    return {
      kind: 'plan',
      summary: `Sorts ${hits.length} ideas into ${buckets.length} groups by what each one changes. The facts, the frame and the restate notes stay where they are.`,
      buckets,
      leaveNoteIds: c.notes.filter((n) => !ids.has(n.id)).map((n) => n.ref),
    };
  },
  // C2: effort buckets for the selected notes (the PRD selects the 10 in Fix the invite step).
  C2: (c) => {
    const hits = caseNotes(c).filter((h) => h.k.effort);
    if (hits.length < 3) return null;
    const groups: [string, 'S' | 'N' | 'L'][] = [['This sprint', 'S'], ['Next sprint', 'N'], ['Later', 'L']];
    const buckets = groups
      .map(([title, e], i) => ({ ref: `e${i + 1}`, title, existingSectionId: '', noteIds: hits.filter((h) => h.k.effort === e).map((h) => h.n.ref) }))
      .filter((b) => b.noteIds.length);
    return { kind: 'plan', summary: `Splits ${hits.length} notes by effort. Effort here is read from the notes and the facts on the board.`, buckets };
  },
  // C4: I39 repeats I02, and I40 overlaps the reminder notes I21, I23 and I24.
  C4: (c) => {
    const r = (id: string) => refOf(c, id);
    const [i02, i39, i40, i21, i23, i24] = ['i02', 'i39', 'i40', 'i21', 'i23', 'i24'].map(r);
    if (!i02 || !i39 || !i40) return null;
    return {
      kind: 'answer',
      summary: 'Reads the notes for ideas that say the same thing. Nothing is moved or deleted.',
      answer: {
        text: [
          '"Show the invite code on screen in case the link fails" says the same as "If the link fails, let people type a six-letter group code". Both are a code fallback for a broken link.',
          '"Reminders so people come back after the first week" is a vaguer version of the weekly summary, the day-two email and the daily streak notes.',
          'Both pairs are left on the board. Merge or remove them by hand if the group agrees.',
        ].join('\n'),
        noteIds: [i02, i39, i40, i21, i23, i24].filter((x): x is string => !!x),
      },
    };
  },
  // C7: with D4 (no reminders or streaks) locked, the reminder notes go against it. I21 is softer, I22 is not a conflict.
  C7: (c) => {
    const d4 = c.decisions.find((d) => /reminders? or streaks?/i.test(d.text));
    if (!d4) return null;
    const r = (id: string) => refOf(c, id);
    const clear = ['i23', 'i24', 'i25', 'i26', 'i40'].map(r).filter((x): x is string => !!x);
    if (clear.length < 3) return null;
    const soft = r('i21');
    return {
      kind: 'answer',
      summary: 'Checks the notes against the decisions in force. Nothing is moved.',
      answer: {
        text: [
          `These go against the locked decision "${first(d4.text, 90)}": the day-two email, the daily streak, the owes-money reminder, the rent-day reminder and the general reminders note.`,
          soft ? 'The weekly "who owes what" summary is a softer match: the decision keeps a weekly summary on the list for a later sprint, so it is not ruled out, only not this sprint.' : '',
          'Celebrating the first logged expense is not a reminder, so it does not go against it.',
        ].filter(Boolean).join('\n'),
        noteIds: soft ? [...clear, soft] : clear,
      },
    };
  },
};

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const first = (t: string, n = 40) => (t.length > n ? `${t.slice(0, n - 1).trim()}…` : t);

const OFFLINE_HELP =
  'In the offline demo I only know a few commands: sort into groups (by direction, effort or evidence), put notes in a section, add more ideas, find duplicates, check against locked decisions, and lock or unlock. Try one of those.';

export function agentMock(c: AgentContext, instruction: string): ModelPlanInput {
  const t = instruction.trim();
  const lower = t.toLowerCase();
  const key = scriptedKey(lower);
  const kp = key ? KEY_PLANS[key]?.(c, t) : null;
  if (kp) return kp;

  // Lock and unlock first: the wording decides.
  if (/\b(unlock|reopen)/.test(lower)) return reopenPlan(c, t);
  if (hasLockIntent(t)) return lockPlan(c, t);

  if (/duplicate|the same as|repeat/.test(lower)) return duplicatesAnswer(c);
  if (/against|conflict|contradict|go(es)? against/.test(lower)) return conflictAnswer(c);
  if (/missing|gap/.test(lower)) {
    return { kind: 'answer', answer: { text: 'The offline demo cannot judge what is missing. With live AI, the agent reads the notes and names directions nobody has covered yet.', noteIds: [] } };
  }
  if (/\brename\b/.test(lower)) return renamePlan(c, t);

  const named = sectionName(t);
  const wantsIdeas = /\bideas?\b|more like|come up with|brainstorm/.test(lower) && /more|new|few|come up|add|propose|brainstorm|parallel/.test(lower);
  if (named && !/:\s*\S/.test(t.split(/section (?:called|named)/i)[1] ?? '')) {
    return groupPlan(c, named, wantsIdeas);
  }
  if (/^add (?:\w+ )?notes?\b/.test(lower) && !t.includes(':')) {
    return { kind: 'clarify', question: 'Which notes should I add? Type them after a colon, separated by semicolons.' };
  }
  if (/\badd\b.*:/.test(lower)) return addNotesPlan(c, t, named);
  if (wantsIdeas) return ideasPlan(c);

  if (/\beffort\b|this sprint|next sprint|how big/.test(lower)) return effortPlan(c);
  if (/\bevidence\b|backed|supported by/.test(lower)) return evidencePlan(c);
  if (/\b(sort|group|classify|bucket|split|categori[sz]e|organi[sz]e|cluster|tidy|themes?|directions?)\b/.test(lower)) {
    if (words(t).size <= 1 && !/tidy/.test(lower)) return { kind: 'clarify', question: 'Sort them by what? For example by direction (what each one changes), by effort or by evidence.' };
    if (/who can build|by (owner|team|person)/.test(lower)) return { kind: 'clarify', question: `The offline demo cannot group by that. ${OFFLINE_HELP}` };
    return directionPlan(c);
  }
  return { kind: 'clarify', question: OFFLINE_HELP };
}

function scriptedKey(lower: string): keyof typeof KEY_PLANS | null {
  if (lower.startsWith('sort all the ideas into directions')) return 'C1';
  if (lower.startsWith('split these by effort')) return 'C2';
  if (lower.startsWith('put these in a section called android link')) return 'C3';
  if (lower.startsWith('which of these look like duplicates')) return 'C4';
  if (lower.startsWith('add three notes in a section called measures')) return 'C5';
  if (lower.startsWith('lock the not this problem section')) return 'C6';
  if (lower.startsWith('do any of these go against what we locked')) return 'C7';
  return null;
}

const sectionName = (t: string) => /section (?:called|named) ["“']?([^:."”'\n]+?)["”']?(?=[:.,]| and | then |$)/i.exec(t)?.[1]?.trim() ?? null;

// ---------- grouping ----------

/** Buckets by shared words: the most common content words that cover at least 2 notes each. */
function directionPlan(c: AgentContext): ModelPlanInput {
  const notes = c.notes.filter((n) => !n.reservedBy || n.reservedBy === c.userId);
  if (!notes.length) return { kind: 'answer', answer: { text: 'There is nothing to sort yet.', noteIds: [] } };
  const freq = new Map<string, number>();
  const ws = new Map(notes.map((n) => [n.id, words(n.text)]));
  ws.forEach((set) => set.forEach((w) => freq.set(w, (freq.get(w) ?? 0) + 1)));
  const left = new Set(notes.map((n) => n.id));
  const buckets: { ref: string; title: string; existingSectionId: string; noteIds: string[] }[] = [];
  const ranked = [...freq.entries()].filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [w] of ranked) {
    if (buckets.length >= 7) break;
    const hit = notes.filter((n) => left.has(n.id) && ws.get(n.id)!.has(w));
    if (hit.length < 2) continue;
    hit.forEach((n) => left.delete(n.id));
    buckets.push({ ref: `b${buckets.length + 1}`, title: cap(w), existingSectionId: '', noteIds: hit.map((n) => n.ref) });
  }
  if (buckets.length < 2) {
    return { kind: 'clarify', question: 'These notes share too few words for the offline demo to sort them. Try live AI, or say which groups you want.' };
  }
  const rest = notes.filter((n) => left.has(n.id));
  if (rest.length) buckets.push({ ref: 'b99', title: 'Not sure', existingSectionId: '', noteIds: rest.map((n) => n.ref) });
  const moved = notes.length;
  return {
    kind: 'plan',
    summary: `Sorts ${moved} notes into ${buckets.length} groups by the words they share. The offline demo groups by wording, not meaning.`,
    buckets,
  };
}

const EFFORT = {
  small: /\b(copy|text|label|wording|button|log|track|rename|link|bug|fix|skip|explain|tooltip|email|message|show|hide)\b/i,
  big: /\b(build|new|redesign|rewrite|integrat\w*|platform|app|web|system|engine|ai|machine|automatic|sync|rebuild)\b/i,
};

function effortPlan(c: AgentContext): ModelPlanInput {
  const groups: Record<string, CtxNote[]> = { 'This sprint': [], 'Next sprint': [], Later: [] };
  for (const n of c.notes) {
    const g = EFFORT.big.test(n.text) ? 'Later' : EFFORT.small.test(n.text) ? 'This sprint' : 'Next sprint';
    groups[g].push(n);
  }
  return bucketsPlan(groups, `Effort here is a guess from the wording of the notes. Sorts ${c.notes.length} notes into this sprint, next sprint and later.`);
}

function evidencePlan(c: AgentContext): ModelPlanInput {
  const groups: Record<string, CtxNote[]> = { Backed: [], Mixed: [], Against: [], Untested: [] };
  for (const n of c.notes) {
    const g = /\b(but|however|although|only some|half)\b/i.test(n.text)
      ? 'Mixed'
      : /\d|percent|%|of every|tested|survey|data|interview/i.test(n.text)
        ? 'Backed'
        : /\b(did not|didn't|no one|nobody|never|disliked|failed)\b/i.test(n.text)
          ? 'Against'
          : 'Untested';
    groups[g].push(n);
  }
  return bucketsPlan(groups, 'Evidence here is read from the wording of the notes: numbers and tests count as backed.');
}

function bucketsPlan(groups: Record<string, CtxNote[]>, summary: string): ModelPlanInput {
  const buckets = Object.entries(groups)
    .filter(([, ns]) => ns.length)
    .map(([title, ns], i) => ({ ref: `b${i + 1}`, title, existingSectionId: '', noteIds: ns.map((n) => n.ref) }));
  return { kind: 'plan', summary, buckets };
}

/** "Put these in a section called X", optionally with ideas. */
function groupPlan(c: AgentContext, title: string, ideas: boolean): ModelPlanInput {
  const ns = c.selected ? c.notes : [];
  return {
    kind: 'plan',
    summary: `Puts ${ns.length} ${ns.length === 1 ? 'note' : 'notes'} in a section called ${title}${ideas ? ' and proposes more ideas for it' : ''}.`,
    buckets: [{ ref: 'b1', title, existingSectionId: '', noteIds: ns.map((n) => n.ref) }],
    ideas: ideas ? { toRef: 'b1', count: 6, angles: ['From the data', 'A smaller version', 'From another product'] } : undefined,
  };
}

function ideasPlan(c: AgentContext): ModelPlanInput {
  // Into the section most of the scope sits in, else a new one.
  const counts = new Map<string, number>();
  c.notes.forEach((n) => n.sectionId && counts.set(n.sectionId, (counts.get(n.sectionId) ?? 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const sec = c.sections.find((s) => s.id === top);
  if (sec) return { kind: 'plan', summary: `Proposes more ideas for ${sec.title}.`, ideas: { toRef: sec.ref, count: 6, angles: [] } };
  return { kind: 'plan', summary: 'Proposes more ideas in a new section.', buckets: [{ ref: 'b1', title: 'More ideas', existingSectionId: '', noteIds: [] }], ideas: { toRef: 'b1', count: 6, angles: [] } };
}

function splitItems(t: string) {
  const after = t.slice(t.indexOf(':') + 1);
  const body = after.split(/\.\s+(?:then|and then)\b|\bthen lock\b|\band lock\b/i)[0];
  return body
    .split(/;|\n/)
    .map((s) => s.trim().replace(/^and\s+/i, '').replace(/[.]+$/, ''))
    .filter((s) => s.length > 1);
}

function addNotesPlan(c: AgentContext, t: string, named: string | null): ModelPlanInput {
  const items = splitItems(t);
  const lock = hasLockIntent(t);
  const target = named ? c.sections.find((s) => norm(s.title) === norm(named)) : undefined;
  const toRef = target ? target.ref : named ? 'b1' : '';
  return {
    kind: 'plan',
    summary: `Adds ${items.length} ${items.length === 1 ? 'note' : 'notes'}${named ? ` in ${named}` : ''}${lock ? ' and locks each as a decision' : ''}.`,
    buckets: named && !target ? [{ ref: 'b1', title: named, existingSectionId: '', noteIds: [] }] : [],
    newNotes: items.map((text, i) => ({ ref: `a${i + 1}`, text, toRef, kind: 'idea' as const })),
    locks: lock ? items.map((text, i) => ({ text, reasons: '', scope: 'board' as const, sectionRef: '', sourceRefs: [`a${i + 1}`] })) : [],
  };
}

// ---------- locks ----------

function lockPlan(c: AgentContext, t: string): ModelPlanInput {
  if (/\badd\b.*:/i.test(t) || sectionName(t)) {
    if (/\badd\b/i.test(t)) return addNotesPlan(c, t, sectionName(t));
  }
  // "Lock the <name> section: <reason>"
  const m = /lock (?:the )?(.+?) section\b[:,.]?\s*(.*)$/i.exec(t);
  if (m) {
    const name = m[1].replace(/^["“']|["”']$/g, '').trim();
    const sec = c.sections.find((s) => norm(s.title) === norm(name)) ?? c.sections.find((s) => overlap(s.title, name) >= 0.5);
    if (sec) {
      const reason = m[2].trim().replace(/[.]+$/, '');
      const text = reason ? `${cap(reason)}.` : `${sec.title} is settled.`;
      return { kind: 'plan', summary: `Locks the ${sec.title} section as a decision.`, locks: [{ text, reasons: '', scope: 'section', sectionRef: sec.ref, sourceRefs: [] }] };
    }
    return { kind: 'clarify', question: `I could not find a section called "${name}". Which section should I lock?` };
  }
  // "Lock X, Y and Z as decisions" / "Lock the decision that X"
  const body = t
    .replace(/^.*?\block(?:ing)?\b\s*(?:in\s+)?(?:the decisions? that|that)?\s*/i, '')
    .replace(/\s*,?\s*as (?:a )?decisions?\.?$/i, '')
    .replace(/[.]+$/, '');
  const items = body.split(/;|,\s*(?:and\s+)?|\s+and\s+/).map((s) => s.trim()).filter((s) => s.split(' ').length >= 3);
  if (!items.length) {
    // Lock the selected notes.
    if (c.selected && c.notes.length && c.notes.length <= 5) {
      return {
        kind: 'plan',
        summary: `Locks ${c.notes.length} selected ${c.notes.length === 1 ? 'note' : 'notes'} as decisions.`,
        locks: c.notes.map((n) => ({ text: n.text, reasons: '', scope: 'board' as const, sectionRef: '', sourceRefs: [n.ref] })),
      };
    }
    return { kind: 'clarify', question: 'What should I lock? Type the decision, or select the notes it comes from.' };
  }
  return {
    kind: 'plan',
    summary: `Locks ${items.length} ${items.length === 1 ? 'decision' : 'decisions'}.`,
    locks: items.slice(0, 5).map((text) => ({ text: `${cap(text)}.`, reasons: '', scope: 'board' as const, sectionRef: '', sourceRefs: [] })),
  };
}

function reopenPlan(c: AgentContext, t: string): ModelPlanInput {
  if (!c.decisions.length) return { kind: 'answer', answer: { text: 'Nothing is locked on this board, so there is nothing to unlock.', noteIds: [] } };
  const scored = c.decisions
    .map((d) => {
      const sec = d.sectionId ? c.sections.find((s) => s.id === d.sectionId)?.title ?? '' : '';
      return { d, score: Math.max(overlap(d.text, t), overlap(sec, t)) };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score === 0) return { kind: 'clarify', question: 'Which decision should I unlock? Name a few words from it.' };
  return { kind: 'plan', summary: `Unlocks "${first(best.d.text, 60)}".`, reopen: [{ decisionId: best.d.ref }] };
}

function renamePlan(c: AgentContext, t: string): ModelPlanInput {
  const m = /rename (?:the |that )?(.+?)(?: section)? to ["“']?(.+?)["”']?\.?$/i.exec(t);
  const sec = m ? (c.sections.find((s) => norm(s.title) === norm(m[1])) ?? c.sections.find((s) => overlap(s.title, m[1]) >= 0.5)) : undefined;
  if (!m || !sec) return { kind: 'clarify', question: 'Which section should I rename, and to what?' };
  return { kind: 'plan', summary: `Renames ${sec.title} to ${m[2]}.`, renames: [{ sectionId: sec.ref, title: m[2] }] };
}

// ---------- answers ----------

function duplicatesAnswer(c: AgentContext): ModelPlanInput {
  const pairs: [CtxNote, CtxNote, number][] = [];
  for (let i = 0; i < c.notes.length; i++)
    for (let j = i + 1; j < c.notes.length; j++) {
      const o = overlap(c.notes[i].text, c.notes[j].text);
      if (o >= 0.3) pairs.push([c.notes[i], c.notes[j], o]);
    }
  pairs.sort((a, b) => b[2] - a[2]);
  const top = pairs.slice(0, 4);
  if (!top.length) return { kind: 'answer', answer: { text: 'I found no notes that look like duplicates. The offline demo compares wording only.', noteIds: [] } };
  return {
    kind: 'answer',
    summary: 'Compares the wording of the notes. Nothing is moved or deleted.',
    answer: {
      text: ['These look alike in wording:', ...top.map(([a, b]) => `"${first(a.text)}" and "${first(b.text)}"`)].join('\n'),
      noteIds: [...new Set(top.flatMap(([a, b]) => [a.ref, b.ref]))],
    },
  };
}

function conflictAnswer(c: AgentContext): ModelPlanInput {
  if (!c.decisions.length) return { kind: 'answer', answer: { text: 'Nothing is locked on this board yet, so there is nothing to check against.', noteIds: [] } };
  const hits: { n: CtxNote; d: (typeof c.decisions)[number] }[] = [];
  for (const n of c.notes) {
    const nw = words(n.text);
    for (const d of c.decisions) {
      let k = 0;
      words(d.text).forEach((w) => nw.has(w) && k++);
      if (k >= 2) {
        hits.push({ n, d });
        break;
      }
    }
  }
  if (!hits.length) return { kind: 'answer', answer: { text: 'None of these notes share enough words with a locked decision to flag. The offline demo compares wording only.', noteIds: [] } };
  return {
    kind: 'answer',
    answer: {
      text: ['These notes may go against a locked decision:', ...hits.slice(0, 8).map(({ n, d }) => `"${first(n.text)}" against "${first(d.text, 60)}"`)].join('\n'),
      noteIds: hits.slice(0, 8).map((h) => h.n.ref),
    },
  };
}

// ---------- ideas ----------

const IDEA_TEMPLATES: Record<string, ((topic: string) => string)[]> = {
  'From the data': [
    (t) => `Log how often ${t} fails before changing anything, so the fix can be measured.`,
    (t) => `Compare people who finish ${t} with people who stop, and look for the step where they part.`,
    (t) => `Ask the five most recent people who dropped at ${t} what they expected to happen.`,
  ],
  'A smaller version': [
    (t) => `Try the simplest change to ${t} on half of new users for one week.`,
    (t) => `Cut ${t} down to one screen and see if more people get through.`,
    (t) => `Ship a plain text fallback for ${t} first, then improve it.`,
  ],
  'From another product': [
    (t) => `Copy how chat apps handle ${t}: one tap, then a short code to type if the tap fails.`,
    (t) => `Borrow the progress line other setup flows use, so ${t} feels shorter.`,
    (t) => `Send a reminder about ${t} the way delivery apps do, once, at a useful moment.`,
  ],
};

export function ideasMock(angle: string, sectionTitle: string): ModelIdeas {
  const t = sectionTitle.trim();
  // Keep names like "Android link" as written; only a leading capital becomes lower case.
  const topic = !t ? 'this step' : /^[A-Z][a-z]/.test(t) && !/^[A-Z][a-z]+ [A-Z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
  const set = IDEA_TEMPLATES[angle] ?? [
    (t: string) => `Look at ${t} from the newest user's side and remove one step.`,
    (t: string) => `Write down what ${t} should look like in a week, then test the smallest part.`,
    (t: string) => `Ask someone outside the team to try ${t} and note where they pause.`,
  ];
  return { ideas: set.map((f) => ({ text: f(topic), conflictsWith: '', conflictLine: '' })) };
}
