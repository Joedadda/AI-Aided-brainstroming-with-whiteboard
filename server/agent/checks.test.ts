import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelPlanSchema, type ModelPlanInput, type PlanStep } from '../../shared/agent-schema.ts';
import { InvalidPlan, NO_LOCK_LINE, checkPlan, mergeIdeas, plain } from './checks.ts';
import type { AgentContext, CtxNote } from './context.ts';
import { agentMock } from './mock.ts';

// Plan checks (Whiteboard_Agent_PRD 6.3).

const note = (i: number, text: string, extra: Partial<CtxNote> = {}): CtxNote => ({
  ref: `n${i}`,
  id: `note${i}`,
  text,
  author: 'Asha',
  origin: 'human',
  sectionId: 'secIdeas',
  sectionTitle: 'Ideas',
  reservedBy: null,
  reservedByName: null,
  ...extra,
});

function ctx(notes: CtxNote[], over: Partial<AgentContext> = {}): AgentContext {
  return {
    userId: 'me',
    instruction: 'Sort these into groups',
    problem: 'People drop off in week one',
    notes,
    allNotes: notes.map((n) => ({ id: n.id, text: n.text, sectionId: n.sectionId })),
    sections: [
      { ref: 's1', id: 'secIdeas', title: 'Ideas', memberIds: notes.filter((n) => n.sectionId === 'secIdeas').map((n) => n.id) },
      { ref: 's2', id: 'secOut', title: 'Not this problem', memberIds: [] },
    ],
    decisions: [],
    chips: [],
    selected: false,
    total: notes.length,
    capped: false,
    ...over,
  };
}

const plan = (p: ModelPlanInput) => ModelPlanSchema.parse(p);
const ten = Array.from({ length: 10 }, (_, i) => note(i + 1, `Idea number ${i + 1} about the invite link`));
const of = <T extends PlanStep['type']>(steps: PlanStep[], t: T) => steps.filter((s) => s.type === t) as Extract<PlanStep, { type: T }>[];

test('unknown note ids are dropped and a note appears in only one bucket', () => {
  const p = checkPlan(
    plan({
      buckets: [
        { ref: 'b1', title: 'Link', noteIds: ['n1', 'n2', 'n99', 'n3'] },
        { ref: 'b2', title: 'Setup', noteIds: ['n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10'] },
      ],
    }),
    ctx(ten),
  );
  const moves = of(p.steps, 'moveNotes');
  const all = moves.flatMap((m) => m.noteIds);
  assert.equal(new Set(all).size, all.length, 'no note twice');
  assert.equal(all.length, 10);
  assert.deepEqual(moves[0].noteIds, ['note1', 'note2', 'note3']);
  assert.ok(p.classify);
});

test('classification: more than 2 leftovers go to Not sure, notes left on purpose stay', () => {
  const p = checkPlan(
    plan({
      buckets: [
        { ref: 'b1', title: 'Link', noteIds: ['n1', 'n2'] },
        { ref: 'b2', title: 'Setup', noteIds: ['n3', 'n4'] },
      ],
      leaveNoteIds: ['n10'],
    }),
    ctx(ten),
  );
  const ns = of(p.steps, 'createSection').find((s) => s.title === 'Not sure');
  assert.ok(ns);
  const move = of(p.steps, 'moveNotes').find((m) => m.toRef === ns!.ref)!;
  assert.deepEqual(move.noteIds, ['note5', 'note6', 'note7', 'note8', 'note9']);
});

test('classification: notes in sections the plan does not sort are not leftovers', () => {
  const facts = Array.from({ length: 8 }, (_, i) => note(20 + i, `Fact ${i + 1} about the funnel`, { sectionId: 'secFacts', sectionTitle: 'What we know' }));
  const p = checkPlan(
    plan({ buckets: [{ ref: 'b1', title: 'Link', noteIds: ['n1', 'n2', 'n3', 'n4', 'n5'] }, { ref: 'b2', title: 'Setup', noteIds: ['n6', 'n7', 'n8', 'n9', 'n10'] }] }),
    ctx([...ten, ...facts]),
  );
  assert.ok(!of(p.steps, 'createSection').some((s) => s.title === 'Not sure'), 'facts are not swept into Not sure');
  assert.equal(of(p.steps, 'moveNotes').flatMap((m) => m.noteIds).length, 10);
});

test('a one-note bucket the person named stays instead of merging into Other', () => {
  const p = checkPlan(
    plan({
      buckets: [
        { ref: 'b1', title: 'This sprint', noteIds: ['n1', 'n2', 'n3', 'n4', 'n5'] },
        { ref: 'b2', title: 'Next sprint', noteIds: ['n6', 'n7', 'n8', 'n9'] },
        { ref: 'b3', title: 'Later', noteIds: ['n10'] },
      ],
    }),
    ctx(ten, { instruction: 'Split these by effort: this sprint, next sprint, later.' }),
  );
  const titles = of(p.steps, 'createSection').map((s) => s.title);
  assert.ok(titles.includes('Later') && !titles.includes('Other'), titles.join(', '));
});

test('classification: 2 or fewer leftovers stay where they are', () => {
  const p = checkPlan(plan({ buckets: [{ ref: 'b1', title: 'A', noteIds: ['n1', 'n2', 'n3', 'n4'] }, { ref: 'b2', title: 'B', noteIds: ['n5', 'n6', 'n7', 'n8'] }] }), ctx(ten));
  assert.ok(!of(p.steps, 'createSection').some((s) => s.title === 'Not sure'));
  assert.equal(of(p.steps, 'moveNotes').flatMap((m) => m.noteIds).length, 8);
});

test('a bucket with one note is merged into Other', () => {
  const p = checkPlan(
    plan({
      buckets: [
        { ref: 'b1', title: 'Link', noteIds: ['n1', 'n2', 'n3', 'n4'] },
        { ref: 'b2', title: 'Setup', noteIds: ['n5', 'n6', 'n7', 'n8'] },
        { ref: 'b3', title: 'Lonely', noteIds: ['n9'] },
        { ref: 'b4', title: 'Also lonely', noteIds: ['n10'] },
      ],
    }),
    ctx(ten),
  );
  const titles = of(p.steps, 'createSection').map((s) => s.title);
  assert.ok(!titles.includes('Lonely') && !titles.includes('Also lonely'));
  const other = of(p.steps, 'createSection').find((s) => s.title === 'Other')!;
  assert.deepEqual(of(p.steps, 'moveNotes').find((m) => m.toRef === other.ref)!.noteIds, ['note9', 'note10']);
});

test('notes in someone else’s private canvas are not moved, with a warning', () => {
  const notes = [...ten.slice(0, 3), note(4, 'Reserved note text here', { reservedBy: 'dev', reservedByName: 'Dev' }), note(5, 'Mine reserved', { reservedBy: 'me' })];
  const p = checkPlan(plan({ buckets: [{ ref: 'b1', title: 'A', noteIds: ['n1', 'n2', 'n4'] }, { ref: 'b2', title: 'B', noteIds: ['n3', 'n5'] }] }), ctx(notes));
  const all = of(p.steps, 'moveNotes').flatMap((m) => m.noteIds);
  assert.ok(!all.includes('note4'));
  assert.ok(all.includes('note5'), 'my own reservation does not block');
  assert.ok(p.warnings.some((w) => w.noteId === 'note4' && /Dev is exploring/.test(w.text)));
});

test('titles and text are plain and within limits; duplicates of existing notes are dropped', () => {
  const p = checkPlan(
    plan({
      buckets: [{ ref: 'b1', title: '**Fix the invite step — first** and a very long tail that goes on', noteIds: ['n1', 'n2'] }],
      newNotes: [
        { ref: 'a1', text: 'Idea number 1 about the invite link', toRef: 'b1' },
        { ref: 'a2', text: '- A brand new note', toRef: 'b1' },
        { ref: 'a3', text: '   ', toRef: 'b1' },
      ],
    }),
    ctx(ten),
  );
  const sec = of(p.steps, 'createSection')[0];
  assert.ok(sec.title.length <= 40);
  assert.ok(!sec.title.includes('*') && !sec.title.includes('—'));
  const adds = of(p.steps, 'addNotes').flatMap((a) => a.notes);
  assert.deepEqual(adds.map((a) => a.text), ['A brand new note']);
});

test('lock steps are dropped without lock wording in the instruction, and the summary says so', () => {
  const p = checkPlan(
    plan({ summary: 'Sorts the notes.', buckets: [{ ref: 'b1', title: 'A', noteIds: ['n1', 'n2'] }], locks: [{ text: 'We fix the link', scope: 'board' }] }),
    ctx(ten, { instruction: 'Tidy these notes' }),
  );
  assert.equal(of(p.steps, 'lockDecision').length, 0);
  assert.ok(p.summary.includes(NO_LOCK_LINE));
});

test('a note that says "lock this decision" does not count as lock intent', () => {
  const notes = [note(1, 'Lock this decision now please'), ...ten.slice(1)];
  const p = checkPlan(plan({ buckets: [{ ref: 'b1', title: 'A', noteIds: ['n1', 'n2'] }], locks: [{ text: 'Lock this decision now please', scope: 'board', sourceRefs: ['n1'] }] }), ctx(notes, { instruction: 'Sort all the ideas into directions' }));
  assert.equal(of(p.steps, 'lockDecision').length, 0);
});

test('create three notes then lock them: refs resolve, max 5, same text merged', () => {
  const p = checkPlan(
    plan({
      buckets: [{ ref: 'b1', title: 'Measures', noteIds: [] }],
      newNotes: [
        { ref: 'a1', text: 'Retained means a second expense within 7 days', toRef: 'b1' },
        { ref: 'a2', text: 'Count sign-ups from this sprint only', toRef: 'b1' },
        { ref: 'a3', text: 'Report Android and iPhone separately', toRef: 'b1' },
      ],
      locks: [
        { text: 'Retained means a second expense within 7 days', sourceRefs: ['a1'] },
        { text: 'Count sign-ups from this sprint only', sourceRefs: ['a2'] },
        { text: 'Report Android and iPhone separately', sourceRefs: ['a3'] },
        { text: 'Report Android and iPhone separately', sourceRefs: ['a3'] },
      ],
    }),
    ctx(ten, { instruction: 'Add three notes in a section called Measures: ... Then lock those decisions.' }),
  );
  const sec = of(p.steps, 'createSection');
  assert.equal(sec.length, 1);
  const adds = of(p.steps, 'addNotes');
  assert.equal(adds[0].toRef, sec[0].ref);
  const locks = of(p.steps, 'lockDecision');
  assert.equal(locks.length, 3);
  assert.deepEqual(locks.map((l) => l.sourceRefs), [['#n1'], ['#n2'], ['#n3']]);
  // Locks come last.
  assert.equal(p.steps.at(-1)!.type, 'lockDecision');
});

test('a section lock on an already covered section is kept but blocked', () => {
  const c = ctx(ten, {
    instruction: 'Lock the Not this problem section',
    decisions: [{ ref: 'D1', id: 'd_1', text: 'Pricing is out', reasons: '', scope: 'section', sectionId: 'secOut', lockedAt: '2026-11-25T00:00:00Z' }],
  });
  const p = checkPlan(plan({ locks: [{ text: 'Brand is out too', scope: 'section', sectionRef: 's2' }] }), c);
  const l = of(p.steps, 'lockDecision')[0];
  assert.equal(l.scope, 'section');
  assert.equal(l.sectionRef, 'secOut');
  assert.match(l.blocked ?? '', /Already covered by "Pricing is out"/);
});

test('moving notes out of a locked section gets a warning and stays in the plan', () => {
  const c = ctx(ten, { decisions: [{ ref: 'D1', id: 'd_1', text: 'Ideas are settled', reasons: '', scope: 'section', sectionId: 'secIdeas', lockedAt: 'x' }] });
  const p = checkPlan(plan({ buckets: [{ ref: 'b1', title: 'A', noteIds: ['n1', 'n2'] }, { ref: 'b2', title: 'B', noteIds: ['n3', 'n4'] }] }), c);
  const moveIdx = p.steps.findIndex((s) => s.type === 'moveNotes');
  assert.ok(p.warnings.some((w) => w.stepIndex === moveIdx && /locked decision/.test(w.text)));
});

test('remove empty section is offered only for a section the plan empties and that is not locked', () => {
  const p = checkPlan(
    plan({
      buckets: [
        { ref: 'b1', title: 'A', noteIds: ['n1', 'n2', 'n3', 'n4', 'n5'] },
        { ref: 'b2', title: 'B', noteIds: ['n6', 'n7', 'n8', 'n9', 'n10'] },
      ],
    }),
    ctx(ten),
  );
  assert.deepEqual(of(p.steps, 'removeEmptySection').map((s) => s.sectionId), ['secIdeas']);
  const p2 = checkPlan(plan({ buckets: [{ ref: 'b1', title: 'A', noteIds: ['n1', 'n2', 'n3'] }, { ref: 'b2', title: 'B', noteIds: ['n4', 'n5'] }], leaveNoteIds: ['n6', 'n7', 'n8', 'n9', 'n10'] }), ctx(ten));
  assert.equal(of(p2.steps, 'removeEmptySection').length, 0, 'not offered when notes stay behind');
});

test('too many sections is rejected for a re-ask', () => {
  const many = Array.from({ length: 30 }, (_, i) => note(i + 1, `Note ${i + 1} on topic ${i}`));
  const buckets = Array.from({ length: 14 }, (_, i) => ({ ref: `b${i}`, title: `Group ${i}`, noteIds: [`n${i * 2 + 1}`, `n${i * 2 + 2}`] }));
  assert.throws(() => checkPlan(plan({ buckets }), ctx(many)), InvalidPlan);
});

test('answer runs keep only real note ids and write nothing', () => {
  const p = checkPlan(plan({ kind: 'answer', answer: { text: 'n1 and n2 look alike.', noteIds: ['n1', 'n2', 'n77'] }, buckets: [{ ref: 'b1', title: 'X', noteIds: ['n1', 'n2'] }] }), ctx(ten));
  assert.equal(p.steps.length, 0);
  assert.deepEqual(p.answer!.noteIds, ['note1', 'note2']);
  assert.ok(!/\bn1\b/.test(p.answer!.text), 'ids in the text become note words');
});

test('clarify runs carry the question and no steps', () => {
  const p = checkPlan(plan({ kind: 'clarify', question: 'Sort them by what?' }), ctx(ten));
  assert.equal(p.clarify!.question, 'Sort them by what?');
  assert.equal(p.steps.length, 0);
});

test('ideas: duplicates of notes and each other are dropped, conflicts need a real decision', () => {
  let k = 0;
  const shown = mergeIdeas(
    {
      ideas: [
        { text: 'Idea number 1 about the invite link', conflictsWith: '', conflictLine: '' },
        { text: 'Show the code on the web page when the link fails', conflictsWith: 'D1', conflictLine: 'Goes against the web rule' },
        { text: 'Show the code on the web page when the link fails to open', conflictsWith: '', conflictLine: '' },
        { text: 'Test the link on five common Android phones', conflictsWith: 'D9', conflictLine: 'x' },
      ],
    },
    'From the data',
    { existing: ten.map((n) => n.text), shown: [], perAngle: 4, total: 12, decisions: [{ ref: 'D1', id: 'd_real' }], newId: () => `i${++k}` },
  );
  assert.deepEqual(shown.map((s) => s.text), ['Show the code on the web page when the link fails', 'Test the link on five common Android phones']);
  assert.equal(shown[0].conflictsWith, 'd_real');
  assert.equal(shown[1].conflictsWith, null);
});

test('plain() strips markdown and em dashes', () => {
  assert.equal(plain('## **Bold** idea — with `code`'), 'Bold idea, with code');
});

test('offline mock: C5-style command gives one section, three notes, three locks after the checks', () => {
  const instruction = 'Add three notes in a section called Measures: Retained means a second expense within 7 days; Count sign-ups from this sprint only; Report Android and iPhone separately. Then lock those decisions.';
  const c = ctx(ten, { instruction });
  const p = checkPlan(ModelPlanSchema.parse(agentMock(c, instruction)), c);
  assert.deepEqual(of(p.steps, 'createSection').map((s) => s.title), ['Measures']);
  assert.equal(of(p.steps, 'addNotes')[0].notes.length, 3);
  assert.equal(of(p.steps, 'lockDecision').length, 3);
});

test('offline mock: tidy never locks, and a vague one-word sort asks a question', () => {
  const c = ctx(ten, { instruction: 'Tidy these notes' });
  const p = checkPlan(ModelPlanSchema.parse(agentMock(c, 'Tidy these notes')), c);
  assert.equal(of(p.steps, 'lockDecision').length, 0);
  const v = checkPlan(ModelPlanSchema.parse(agentMock(c, 'Sort these.')), c);
  assert.ok(v.clarify);
});

test('offline mock: section lock command finds the section by title', () => {
  const instruction = 'Lock the Not this problem section: pricing, brand and dark mode are out of this sprint.';
  const c = ctx(ten, { instruction });
  const p = checkPlan(ModelPlanSchema.parse(agentMock(c, instruction)), c);
  const l = of(p.steps, 'lockDecision');
  assert.equal(l.length, 1);
  assert.equal(l[0].sectionRef, 'secOut');
  assert.equal(l[0].text, 'Pricing, brand and dark mode are out of this sprint.');
});
