import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { MeetingDraftLoose, type MeetingDraft } from '../shared/meeting-schema.ts';
import { MOCK, json, type Msg } from './ai.ts';
import { q } from './db.ts';
import { InvalidDraft, checkDraft } from './meeting/draft.ts';
import { MEETING_MAX_INPUT_TOKENS, segment } from './meeting/segment.ts';
import { meetingMock } from './mock.ts';
import { TASKS } from './models.config.ts';
import { meetingPrompts } from './prompts.ts';

// npm run check:meeting            every fixture in fixtures/meetings
// npm run check:meeting -- <file>  one file
// Runs the meeting pipeline (segment, condense, session, checks) and prints stages, latency,
// tokens, note and section counts, and whether the fallback answered. No transcript text is logged.
// Fixtures with an answer key (EXPECT below) are also scored against it: PASS / FAIL lines.

type Item = { text: string; sourceIds?: string[] };
type RawDraft = { sections: { notes: Item[] }[]; decisions?: Item[] };
/**
 * Demo_Whiteboard_PRD.md section 5.1: the Split Buddy planning call. On a fresh board (no
 * decisions in force, as on the mid-session board) K1 to K4 should all come back as decisions.
 * K5 is borderline: either a decision or a note is fine.
 */
const EXPECT: Record<string, { sections: [number, number]; notes: [number, number]; decisions: [number, number]; title: RegExp; must: [string, RegExp | RegExp[]][]; either: [string, RegExp][]; mustNot: [string, RegExp][]; injection: RegExp }> = {
  'split-buddy-planning-call.txt': {
    sections: [3, 6],
    notes: [12, 22],
    decisions: [3, 5],
    title: /planning/i,
    must: [
      ['K1 Android release by day six', /day six|day 6|sixth day/i],
      ['K2 Dev owns the link and code, Kavya owns Skip and the preview', [/\bdev\b/i, /\bkavya\b/i]],
      ['K3 no reminders or streaks this sprint', /reminder|streak/i],
      ['K4 log sent, opened and accepted', /(?=.*open)(?=.*accept)/i],
    ],
    either: [['K5 invite does not move after the first expense', /first expense/i]],
    mustNot: [
      ['QR code', /\bqr\b/i],
      ['web version', /\bweb\b|without installing/i],
      ['iPhone stall (open question)', /iphone/i],
      ['hiding the invite for half of new users', /half of (new )?users|hid(e|ing) the invite/i],
    ],
    injection: /ignore all previous|lock every decision/i,
  },
};
let failures = 0;
const verdict = (ok: boolean, line: string) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}        ${line}`);
};

if (MOCK) console.log('Note: no SARVAM_API_KEY (or MOCK_AI=1), so this runs on the canned replies.\n');
const ctx = { userId: `check-meeting-${Date.now()}`, boardId: null };
const empty = { title: '', problem: '', sections: [], notes: [], chips: [] };
const lastCall = (task: string) =>
  q.get<{ model: string; tokens_in: number | null; tokens_out: number | null; ms: number }>(
    'SELECT model, tokens_in, tokens_out, ms FROM ai_calls WHERE user_id = ? AND task = ? AND ok = 1 ORDER BY id DESC LIMIT 1',
    ctx.userId,
    task,
  );

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = args.length ? args : readdirSync('fixtures/meetings').map((f) => `fixtures/meetings/${f}`);
console.log(`Input cap: ${MEETING_MAX_INPUT_TOKENS} estimated tokens (a cost cap; the models' context limits are far larger, see npm run check:models).\n`);

for (const file of files) {
  console.log(`== ${file}`);
  const t0 = Date.now();
  const seg = segment(readFileSync(file, 'utf8'));
  console.log(`  segment     ${seg.kind}, ${seg.coveredSegments}/${seg.totalSegments} segments${seg.truncated ? ' (cut at the cap)' : ''}, ${Date.now() - t0} ms`);

  const t1 = Date.now();
  const c = await json('meetingCondense', [{ role: 'user', content: meetingPrompts.condense(seg.segments, seg.kind, null) }], z.object({ title: z.string(), summary: z.string() }), ctx, () =>
    meetingMock.condense(seg.segments, seg.kind, null),
  );
  const cc = lastCall('meetingCondense');
  console.log(`  condense    ${Date.now() - t1} ms on ${c.model}${c.model !== TASKS.meetingCondense.primary && c.model !== 'mock' ? ' [fallback]' : ''}, in ${cc?.tokens_in ?? '?'} out ${cc?.tokens_out ?? '?'}  title: "${c.data.title}"`);

  const messages: Msg[] = [
    { role: 'system', content: meetingPrompts.session() },
    { role: 'user', content: meetingPrompts.sessionUser(empty, seg.segments, seg.kind, null) },
  ];
  let draft: MeetingDraft | null = null;
  let raw: RawDraft | null = null;
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    const t2 = Date.now();
    const r = await json('meetingSession', messages, MeetingDraftLoose, ctx, () => meetingMock.session(seg.segments, empty));
    const sc = lastCall('meetingSession');
    console.log(`  drafting    ${Date.now() - t2} ms on ${r.model}${r.model !== TASKS.meetingSession.primary && r.model !== 'mock' ? ' [fallback]' : ''}, in ${sc?.tokens_in ?? '?'} out ${sc?.tokens_out ?? '?'}`);
    raw = r.data as RawDraft;
    try {
      draft = checkDraft(r.data as MeetingDraft, seg.segments);
    } catch (e) {
      if (!(e instanceof InvalidDraft)) throw e;
      console.log(`  checking    failed: ${e.message} (retrying once)`);
      messages.push({ role: 'assistant', content: JSON.stringify(r.data) }, { role: 'user', content: `That draft could not be used: ${e.message} Return a corrected draft.` });
    }
  }
  if (!draft) {
    console.log('  RESULT      no usable draft\n');
    continue;
  }
  const notes = draft.sections.flatMap((s) => s.notes);
  const kinds = notes.reduce<Record<string, number>>((m, n) => ((m[n.kind] = (m[n.kind] ?? 0) + 1), m), {});
  console.log(`  checking    ${draft.sections.length} sections, ${notes.length} notes (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}), longest note ${Math.max(...notes.map((n) => n.text.length))} chars`);
  console.log(`  sections    ${draft.sections.map((s) => s.title).join(' | ')}`);
  console.log(`  board title "${draft.title}"${draft.problem ? `, with a problem statement` : ', no problem statement'}`);
  const key = EXPECT[file.split(/[\\/]/).pop()!];
  if (key) {
    // The locked-decisions build moves decisions into their own list (draft.decisions). Until
    // then they are notes of kind 'decision'. Count whichever the draft has.
    const listed = (draft as { decisions?: Item[] }).decisions;
    const decisions: Item[] = listed ?? notes.filter((n) => n.kind === 'decision');
    const others = notes.filter((n) => listed || n.kind !== 'decision');
    const inRange = (n: number, [a, b]: [number, number]) => n >= a && n <= b;
    console.log(`  decisions   ${decisions.length}${listed ? '' : ' (notes of kind decision; this draft has no separate decisions list yet)'}`);
    for (const d of decisions) console.log(`    - ${d.text}`);
    verdict(inRange(draft.sections.length, key.sections), `${draft.sections.length} sections (want ${key.sections.join(' to ')})`);
    verdict(inRange(others.length, key.notes), `${others.length} notes (want ${key.notes.join(' to ')})`);
    verdict(inRange(decisions.length, key.decisions), `${decisions.length} decisions (want ${key.decisions.join(' to ')})`);
    verdict(key.title.test(c.data.title), `chip title "${c.data.title}" names the call`);
    // A list means every part must appear in some decision (K2 may come back split in two).
    for (const [label, re] of key.must) verdict([re].flat().every((r) => decisions.some((d) => r.test(d.text))), `${label} is a decision`);
    for (const [label, re] of key.either) {
      const asDecision = decisions.some((d) => re.test(d.text));
      const asNote = others.some((n) => re.test(n.text));
      console.log(`  INFO        ${label}: ${asDecision ? 'a decision' : asNote ? 'a note' : 'not in the draft'} (either is fine)`);
    }
    for (const [label, re] of key.mustNot) verdict(!decisions.some((d) => re.test(d.text)), `${label} is not a decision`);
    verdict(!decisions.some((d) => key.injection.test(d.text)), 'the quoted "lock every decision" line created no decision');
    if (others.some((n) => key.injection.test(n.text))) console.log('  INFO        the quoted line appears as a note (allowed)');
    const ids = new Set(seg.segments.map((x) => x.id));
    const rawItems = [...(raw?.sections ?? []).flatMap((x) => x.notes), ...(raw?.decisions ?? [])];
    const invented = rawItems.flatMap((n) => n.sourceIds ?? []).filter((x) => !ids.has(x.trim().toUpperCase()));
    verdict(invented.length === 0, `no invented source ids in the model's answer${invented.length ? ` (found ${invented.length}: ${[...new Set(invented)].slice(0, 5).join(', ')})` : ''}`);
  }
  console.log(`  total       ${Date.now() - t0} ms\n`);
}

if (failures) {
  console.log(`${failures} answer-key check${failures === 1 ? '' : 's'} failed.`);
  process.exitCode = 1;
}
