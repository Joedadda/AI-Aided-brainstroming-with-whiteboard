/*
  npm run check:agent [-- --runs 3]   Whiteboard_Agent_PRD section 11, "Quality script".
  Runs the scripted commands with live AI on the seeded Split Buddy boards and scores the plans
  against the answer key in server/cases/split-buddy.ts (Split_Buddy_Board_v3_Full.md Part 2 section 6):
    C1  sort the 40 ideas by direction on the mid-session board   target 34 of 40
    C2  effort buckets for the 10 "Fix the invite step" notes      I01 to I05, I39 / I06 I07 / I08 I35
    C4  duplicates                                                  I39 with I02, I40 with I21, I23 or I24
    C7  conflicts with the locked decisions (finished example)     I23 I24 I25 I26 I40, not I22
  MOCK_AI=1 runs the same thing on the offline key plans. Prints model, latency and tokens per call.
  Calls are logged in ai_calls under the user "check-agent"; use DATABASE_PATH to keep them apart.
*/
import 'dotenv/config';
import * as Y from 'yjs';
import { ModelPlanSchema, type AgentPlan, type ModelPlan } from '../shared/agent-schema.ts';
import { json } from './ai.ts';
import { q } from './db.ts';
import { buildAgentContext } from './agent/context.ts';
import { checkPlan } from './agent/checks.ts';
import { agentMock } from './agent/mock.ts';
import { AGENT_SYSTEM, agentUser } from './agent/prompts.ts';
import { bankNote, notesIn, type Direction } from './cases/split-buddy.ts';
import { seedCase } from './demo-seed.ts';

const runsArg = process.argv.indexOf('--runs');
const RUNS = runsArg > 0 ? Math.max(1, Number(process.argv[runsArg + 1]) || 1) : 3;
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 ? String(process.argv[onlyArg + 1] ?? '').toUpperCase().split(',') : null;
const want = (k: string) => !ONLY || ONLY.includes(k);
const ctx = { userId: 'check-agent', boardId: null };

function seeded(kind: 'mid' | 'example') {
  const doc = new Y.Doc();
  seedCase(doc, kind);
  return doc;
}

async function run(doc: Y.Doc, instruction: string, selectedNoteIds: string[] = []) {
  const c = buildAgentContext(doc, { userId: ctx.userId, instruction, selectedNoteIds });
  const messages = [
    { role: 'system' as const, content: AGENT_SYSTEM },
    { role: 'user' as const, content: agentUser(c) },
  ];
  const t0 = Date.now();
  const { data, model } = await json('agentPlan', messages, ModelPlanSchema, ctx, () => ModelPlanSchema.parse(agentMock(c, instruction)));
  const ms = Date.now() - t0;
  const usage = q.get<{ tokens_in: number; tokens_out: number }>(
    'SELECT tokens_in, tokens_out FROM ai_calls WHERE user_id = ? AND task = ? ORDER BY id DESC LIMIT 1',
    ctx.userId,
    'agentPlan',
  );
  const m = data as ModelPlan;
  return { c, m, plan: checkPlan(m, c), model, ms, usage };
}

const meta = (r: Awaited<ReturnType<typeof run>>) => `${r.model}, ${(r.ms / 1000).toFixed(1)} s${r.usage ? `, ${r.usage.tokens_in} in / ${r.usage.tokens_out} out` : ''}`;

/** Map each bucket to the key direction holding most of its notes; borderline notes count either way. */
function directionScore(p: AgentPlan) {
  let right = 0;
  const rows: string[] = [];
  const titleOf = new Map(p.steps.flatMap((s) => (s.type === 'createSection' ? [[s.ref, s.title] as const] : [])));
  for (const s of p.steps) {
    if (s.type !== 'moveNotes') continue;
    const keys = s.noteIds.filter((id) => /^i\d\d$/.test(id)).map(bankNote);
    const tally = new Map<Direction, number>();
    keys.forEach((k) => tally.set(k.dir, (tally.get(k.dir) ?? 0) + 1));
    const mapped = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const ok = keys.filter((k) => k.dir === mapped || k.second === mapped);
    right += ok.length;
    const wrong = keys.filter((k) => !ok.includes(k)).map((k) => `${k.id.toUpperCase()}(${k.dir})`);
    rows.push(`    ${(titleOf.get(s.toRef) ?? s.toRef).padEnd(34)} ${String(keys.length).padStart(2)} -> ${mapped ?? '-'}${wrong.length ? `   off: ${wrong.join(' ')}` : ''}`);
  }
  const moved = p.steps.flatMap((s) => (s.type === 'moveNotes' ? s.noteIds : []));
  return { right, rows, factsMoved: moved.filter((id) => /^p\d$/.test(id)).length };
}

let fails = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
};

const C1 = 'Sort all the ideas into directions based on what each one changes.';
const scores: number[] = [];
const titles: string[][] = [];
if (want('C1')) console.log(`C1, ${RUNS} runs on the mid-session board (target 34 of 40)`);
for (let i = 0; want('C1') && i < RUNS; i++) {
  const r = await run(seeded('mid'), C1);
  const s = directionScore(r.plan);
  scores.push(s.right);
  titles.push(r.plan.steps.filter((x) => x.type === 'createSection').map((x) => (x.type === 'createSection' ? x.title : '')));
  console.log(`  run ${i + 1}: ${s.right} of 40, ${titles[i].length} sections, facts moved ${s.factsMoved} (${meta(r)})`);
  s.rows.forEach((row) => console.log(row));
  ok(s.right >= 34, `C1 run ${i + 1}: 34 of 40 or better`);
  ok(s.factsMoved === 0, `C1 run ${i + 1}: the facts stay in What we know`);
}
if (want('C1')) console.log(`  scores: ${scores.join(', ')}  (mean ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)})`);

if (want('C2')) {
  console.log('\nC2, effort for the Fix the invite step notes');
  const r = await run(seeded('example'), 'Split these by effort: this sprint, next sprint, later.', notesIn('INV').map((n) => n.id));
  const titleOf = new Map(r.plan.steps.flatMap((s) => (s.type === 'createSection' ? [[s.ref, s.title] as const] : [])));
  const got = new Map<string, string[]>();
  for (const s of r.plan.steps) if (s.type === 'moveNotes') got.set((titleOf.get(s.toRef) ?? s.toRef).toLowerCase(), [...s.noteIds].sort());
  console.log(`  ${[...got].map(([t, ids]) => `${t}: ${ids.join(' ')}`).join('; ')} (${meta(r)})`);
  const later = [...got].find(([t]) => /later/.test(t))?.[1] ?? [];
  const now = [...got].find(([t]) => /this sprint/.test(t))?.[1] ?? [];
  const nowRight = ['i01', 'i02', 'i03', 'i04', 'i05', 'i39'].filter((x) => now.includes(x)).length;
  ok(later.includes('i08') && later.includes('i35'), 'C2: I08 and I35 in Later');
  ok(nowRight >= 5, `C2: at least 5 of the 6 this-sprint notes in This sprint (${nowRight})`);
}

if (want('C4')) {
  console.log('\nC4, duplicates');
  const r = await run(seeded('mid'), 'Which of these look like duplicates?');
  const ids = r.m.answer.noteIds.map((ref) => r.c.notes.find((n) => n.ref === ref)?.id);
  console.log(`  ${r.m.kind}: ${ids.join(' ')} (${meta(r)})`);
  console.log(`  ${r.m.answer.text.replace(/\n/g, '\n  ')}`);
  ok(r.m.kind === 'answer' && r.plan.steps.length === 0, 'C4: answer only, no steps');
  ok(ids.includes('i39') && ids.includes('i02'), 'C4: names I39 with I02');
  ok(ids.includes('i40') && ['i21', 'i23', 'i24'].some((x) => ids.includes(x)), 'C4: names I40 with I21, I23 or I24');
}

// C7 on the finished example: D4 (no reminders or streaks) rules out the reminder notes and option B;
// D3 (no pricing, branding or dark mode) rules out I36 to I38. No other decision in force rules out a
// note, so any other note named is a false flag. I21 (weekly summary) is a fair, softer match.
const C7_FAIR = new Set(['i21', 'i23', 'i24', 'i25', 'i26', 'i40', 'opt-b', 'i36', 'i37', 'i38']);
const C7_RUNS = ONLY ? RUNS : 1;
for (let i = 0; want('C7') && i < C7_RUNS; i++) {
  if (i === 0) console.log('\nC7, conflicts with the locked decisions (finished example)');
  const r = await run(seeded('example'), 'Do any of these go against what we locked?');
  const ids = [...new Set(r.m.answer.noteIds.map((ref) => r.c.notes.find((n) => n.ref === ref)?.id).filter((x): x is string => !!x))];
  const falseFlags = ids.filter((x) => !C7_FAIR.has(x));
  console.log(`  run ${i + 1}: ${ids.join(' ')}  false: ${falseFlags.join(' ') || 'none'} (${meta(r)})`);
  const clear = ['i23', 'i24', 'i25', 'i26', 'i40'].filter((x) => ids.includes(x)).length;
  ok(clear >= 4, `C7 run ${i + 1}: at least 4 of I23 I24 I25 I26 I40 (${clear})`);
  ok(!ids.includes('i22'), `C7 run ${i + 1}: not I22`);
  ok(falseFlags.length <= 1, `C7 run ${i + 1}: at most one note no decision rules out (${falseFlags.length})`);
}

console.log(`\n${fails ? `${fails} FAILED` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
