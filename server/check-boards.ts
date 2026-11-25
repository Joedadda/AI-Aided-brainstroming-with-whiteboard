/*
  npm run check:boards: seeds the three Split Buddy boards in memory and checks them against
  Split_Buddy_Board_v3_Full.md (Part 0 counts table, Part 1 section 13, Part 2 section 10).
  Then runs the offline agent's key plans for C1, C2, C4 and C7 on the seeded boards and scores
  them against the answer key. No server, no database, no AI calls.
*/
import * as Y from 'yjs';
import { ModelPlanSchema } from '../shared/agent-schema.ts';
import { readDecisions, inForce, coverOf } from '../shared/decision-schema.ts';
import { readBoard, membersOf } from '../shared/ydoc.ts';
import { buildAgentContext } from './agent/context.ts';
import { checkPlan } from './agent/checks.ts';
import { agentMock } from './agent/mock.ts';
import { DIRECTIONS, EXPLORATIONS, IDEA_BANK_BY_ID, MEETING_CHIP, notesIn, bankNote } from './cases/split-buddy.ts';
import { seedCase } from './demo-seed.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

function board(kind: 'case' | 'mid' | 'example') {
  const doc = new Y.Doc();
  seedCase(doc, kind);
  return { doc, b: readBoard(doc), decisions: readDecisions(doc) };
}

const isIdea = (id: string) => /^i\d\d$/.test(id);
const count = (b: ReturnType<typeof readBoard>, pred: (n: (typeof b.notes)[number]) => boolean) => b.notes.filter(pred).length;
const inSection = (b: ReturnType<typeof readBoard>, title: string) => {
  const s = b.sections.find((x) => x.title === title);
  return s ? membersOf(s, b.notes) : [];
};

// ---------- Fresh case ----------
{
  const { b, decisions } = board('case');
  console.log('\nFresh case');
  ok(count(b, (n) => /^p\d$/.test(n.id)) === 8, 'P1 to P8, blue', `${count(b, (n) => /^p\d$/.test(n.id))}`);
  ok(inSection(b, 'What we know').length === 8, 'facts sit in "What we know"');
  ok(count(b, (n) => isIdea(n.id)) === 0, 'no idea notes');
  ok(inSection(b, 'Ideas').length === 0 && b.sections.some((s) => s.title === 'Ideas'), 'an empty "Ideas" section');
  ok(inSection(b, 'Restate the problem in your own words').length === 0, 'empty restate section');
  ok(count(b, (n) => n.id.startsWith('opt-')) === 3, 'frame A to C');
  ok(b.chips.length === 0 && b.reports.length === 0 && decisions.length === 0, 'no context, reports or decisions');
}

// ---------- Mid-session ----------
{
  const { b, decisions } = board('mid');
  console.log('\nMid-session example');
  const ideas = b.notes.filter((n) => isIdea(n.id));
  ok(ideas.length === 40, 'exactly 40 idea notes', `${ideas.length}`);
  ok(inSection(b, 'Ideas').filter((n) => isIdea(n.id)).length === 40, 'all 40 in one "Ideas" section');
  const ideasSec = b.sections.find((s) => s.title === 'Ideas')!;
  ok(Math.abs(ideasSec.w - 1880) <= 40 && Math.abs(ideasSec.h - 1220) <= 40, 'Ideas is about 1,880 by 1,220', `${ideasSec.w} x ${ideasSec.h}`);
  const wrongAuthor = ideas.filter((n) => n.author.toLowerCase() !== bankNote(n.id).by);
  ok(wrongAuthor.length === 0, 'every author matches the answer key', wrongAuthor.map((n) => n.id).join(' '));
  const ai = ideas.filter((n) => n.origin === 'ai').map((n) => n.id).sort();
  ok(ai.join() === 'i09,i16,i22', 'three from AI: I09, I16, I22', ai.join(' '));
  const authors = ['kavya', 'dev', 'asha', 'meera'].map((a) => ideas.filter((n) => n.author.toLowerCase() === a).length);
  ok(authors.join() === '11,12,11,6', 'authors Kavya 11, Dev 12, Asha 11, Meera 6', authors.join(' '));
  ok(count(b, (n) => /^p\d$/.test(n.id)) === 8 && count(b, (n) => n.id.startsWith('rs-')) === 3, 'P1 to P8 and three restate notes');
  ok(b.chips.length === 4, 'four project context chips', `${b.chips.length}`);
  ok(b.reports.length === 0 && decisions.length === 0, 'no reports, no decisions');
  ok(b.meta.kind === 'mid', 'kind is mid');
}

// ---------- Finished example ----------
{
  const { doc, b, decisions } = board('example');
  console.log('\nFinished example');
  const ideas = b.notes.filter((n) => isIdea(n.id));
  ok(ideas.length === 40, '40 idea notes', `${ideas.length}`);
  for (const d of DIRECTIONS) {
    const members = inSection(b, d.title).map((n) => n.id).sort();
    const want = notesIn(d.code).map((n) => n.id).sort();
    ok(members.join() === want.join(), `"${d.title}" holds exactly its ${want.length} notes`, members.length === want.length ? '' : `${members.length}`);
  }
  const homes = ideas.map((n) => b.sections.filter((s) => membersOf(s, [n]).length).length);
  ok(homes.every((h) => h === 1), 'no idea note in two sections');
  ok(inSection(b, 'Inside option C: four changes').length === 4, 'Inside option C: four green notes');
  ok(b.reports.length === 3, 'three reports');
  const onBoard = new Set(b.notes.map((n) => n.id));
  const missing = b.reports.flatMap((r) => r.cardNoteIds.filter((id) => !onBoard.has(id)));
  ok(missing.length === 0, 'every "notes used" id is on the board', missing.join(' '));
  ok(b.reports.every((r) => r.cardNoteIds.length === 7), 'each report lists 7 notes used');
  ok(decisions.length === 7 && inForce(decisions).length === 6, '7 decisions, 6 in force', `${decisions.length}, ${inForce(decisions).length}`);
  const order = decisions.map((d) => d.id.replace('d_sb', 'D')).join(' ');
  ok(order === 'D6 D5 D4 D1 D3 D2 D7', 'listed D6 D5 D4 D1 D3 D2 then D7', order);
  const park = b.sections.find((s) => s.title === 'Not this problem')!;
  const ret = b.sections.find((s) => s.title === 'Bring people back')!;
  ok(coverOf(decisions, park.id)?.id === 'd_sb3' && coverOf(decisions, ret.id)?.id === 'd_sb4', 'D3 and D4 cover their sections (two Locked pills)');
  const pills = b.sections.filter((s) => coverOf(decisions, s.id)).length;
  ok(pills === 2, 'exactly two sections locked', `${pills}`);
  const d1 = decisions.find((d) => d.id === 'd_sb1')!;
  ok(!!d1.rich && d1.rich.because.length === 7 && d1.rich.setAside.length === 3 && d1.rich.followUps.length === 5 && !!d1.rich.unknowns, 'D1 has the v3 card: 7 reasons, 3 set aside, 5 follow-ups, unknowns');
  ok(d1.reportIds.length === 3, 'D1 links the three reports');
  const srcMissing = decisions.flatMap((d) => d.sourceNoteIds.filter((id) => !onBoard.has(id)));
  ok(srcMissing.length === 0, 'every decision source note is on the board', srcMissing.join(' '));
  ok(decisions.find((d) => d.id === 'd_sb1')!.sourceNoteIds.join() === 'i01,i02,i03,i31,i39', 'D1 sources I01 I02 I03 I31 I39');
  const d7 = decisions.find((d) => d.id === 'd_sb7')!;
  ok(d7.status === 'reopened' && d7.reopenedByName === 'Dev' && d7.sourceNoteIds.join() === 'i11,i20', 'D7 reopened by Dev, sources I11 I20');
  ok(decisions.filter((d) => d.via === 'meeting').every((d) => d.meetingChipId === MEETING_CHIP.id), 'D4 to D6 point at the meeting chip');
  ok(b.chips.length === 5 && b.chips.some((c) => c.id === MEETING_CHIP.id && c.type === 'meeting'), '4 project chips plus the meeting chip');
  const docText = JSON.stringify(doc.toJSON());
  // Board context is readable by everyone (user decision, 25 Nov): the meeting chip carries the call.
  ok(/Meera \(00:05\)/.test(b.chips.find((c) => c.id === MEETING_CHIP.id)?.fullText ?? ''), 'the meeting chip carries the planning call text');
  void docText;
  ok(!/12 Android phones|office drawer|recruited by email/.test(JSON.stringify(decisions)), 'decisions hold no private facts');
  const nums = EXPLORATIONS.map((e) => e.report.summary).join(' ') + d1.reasons + d1.rich!.because.join(' ');
  ok(/33/.test(nums) && /5 of the 33/.test(nums) && /53 of the 60/.test(nums), 'the funnel numbers agree (33 at the step, 5 of 33, 53 of 60)');
}

// ---------- Agent key plans on the seeded boards ----------
console.log('\nAgent key plans (offline mock), scored against the answer key');
function plan(doc: Y.Doc, instruction: string, selectedNoteIds: string[] = []) {
  const c = buildAgentContext(doc, { userId: 'check', instruction, selectedNoteIds });
  const m = ModelPlanSchema.parse(agentMock(c, instruction));
  return { c, m, p: checkPlan(m, c) };
}
{
  const { doc } = board('mid');
  const { c, p } = plan(doc, 'Sort all the ideas into directions based on what each one changes.');
  const secs = p.steps.filter((s) => s.type === 'createSection');
  ok(secs.length === 7, 'C1: seven sections', `${secs.length}`);
  // Score: map each bucket to the key direction holding most of its notes; borderline notes count either way.
  let right = 0;
  for (const s of p.steps) {
    if (s.type !== 'moveNotes') continue;
    const keys = s.noteIds.map((id) => bankNote(id)).filter(Boolean);
    const tally = new Map<string, number>();
    keys.forEach((k) => tally.set(k.dir, (tally.get(k.dir) ?? 0) + 1));
    const mapped = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    right += keys.filter((k) => k.dir === mapped || k.second === mapped).length;
  }
  ok(right >= 34, 'C1: direction score 34 of 40 or better', `${right} of 40`);
  const moved = p.steps.flatMap((s) => (s.type === 'moveNotes' ? s.noteIds : []));
  ok(moved.length === 40 && new Set(moved).size === 40 && moved.every(isIdea), 'C1: each idea moves once, facts and frame stay');
  ok(p.steps.some((s) => s.type === 'removeEmptySection'), 'C1: offers to remove the empty "Ideas" section');
  void c;
}
{
  const { doc } = board('example');
  const inv = notesIn('INV').map((n) => n.id);
  const { p } = plan(doc, 'Split these by effort: this sprint, next sprint, later.', inv);
  const buckets = new Map<string, string[]>();
  const titleOf = new Map(p.steps.flatMap((s) => (s.type === 'createSection' ? [[s.ref, s.title] as const] : [])));
  for (const s of p.steps) if (s.type === 'moveNotes') buckets.set(titleOf.get(s.toRef) ?? s.toRef, [...s.noteIds].sort());
  const want = { 'This sprint': ['i01', 'i02', 'i03', 'i04', 'i05', 'i39'], 'Next sprint': ['i06', 'i07'], Later: ['i08', 'i35'] };
  const got = Object.entries(want).every(([t, ids]) => (buckets.get(t) ?? []).join() === ids.join());
  ok(got, 'C2: This sprint I01 to I05 and I39, Next sprint I06 I07, Later I08 I35', [...buckets].map(([t, ids]) => `${t}: ${ids.join(' ')}`).join('; '));
}
{
  const { doc } = board('mid');
  const { m } = plan(doc, 'Which of these look like duplicates?');
  const c = buildAgentContext(doc, { userId: 'check', instruction: '', selectedNoteIds: [] });
  const ids = m.answer.noteIds.map((r) => c.notes.find((n) => n.ref === r)?.id);
  ok(m.kind === 'answer' && ids.includes('i39') && ids.includes('i02') && ids.includes('i40') && ['i21', 'i23', 'i24'].some((x) => ids.includes(x)), 'C4: names I39 with I02, and I40 with the reminder notes', ids.join(' '));
}
{
  const { doc } = board('example');
  const { m } = plan(doc, 'Do any of these go against what we locked?');
  const c = buildAgentContext(doc, { userId: 'check', instruction: '', selectedNoteIds: [] });
  const ids = m.answer.noteIds.map((r) => c.notes.find((n) => n.ref === r)?.id);
  ok(m.kind === 'answer' && ['i23', 'i24', 'i25', 'i26', 'i40'].every((x) => ids.includes(x)) && !ids.includes('i22'), 'C7: names I23 I24 I25 I26 I40, not I22', ids.join(' '));
}

// ---------- The answer key itself ----------
console.log('\nAnswer key');
const tot = DIRECTIONS.map((d) => `${d.code} ${notesIn(d.code).length}`).join(', ');
ok(tot === 'INV 10, VAL 6, ONB 6, RET 7, EXP 4, LRN 4, PARK 3', 'totals by direction', tot);
const effort = ['S', 'N', 'L'].map((e) => IDEA_BANK_BY_ID.filter((n) => n.effort === e).length).join(' ');
ok(effort === '22 10 5', 'effort 22 / 10 / 5', effort);
const ev = ['Backed', 'Mixed', 'Against', 'Untested'].map((e) => IDEA_BANK_BY_ID.filter((n) => n.evidence === e).length).join(' ');
ok(ev === '15 2 4 16', 'evidence 15 / 2 / 4 / 16', ev);
ok(IDEA_BANK_BY_ID.filter((n) => n.second).length === 8, 'eight borderline notes');

console.log(`\n${fails ? `${fails} FAILED` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
