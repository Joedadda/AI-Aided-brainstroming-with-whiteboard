import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MeetingInputError, segment } from './segment.ts';

const long = (n: number, w = 'word') => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

test('speaker lines: merged per turn, labels kept', () => {
  const r = segment(`Asha: We lose most people in the first week. That is the whole problem.
Asha: I want one fix this sprint.
Dev: The invite link is broken on some Android phones, I think.
Kavya: In testing most people skipped the invite step entirely.
Dev: So maybe the invite is the thing to look at first?`);
  assert.equal(r.kind, 'transcript');
  assert.deepEqual(r.segments.map((s) => s.speaker), ['Asha', 'Dev', 'Kavya', 'Dev']);
  assert.match(r.segments[0].text, /first week\. That is the whole problem\. I want one fix/);
  assert.equal(r.segments[0].id, 'S1');
  assert.equal(r.truncated, false);
});

test('speaker with a timestamp in brackets, and on a line of its own', () => {
  const r = segment(`Asha (00:01): Morning everyone, let us look at the drop-off numbers today.
Dev (00:15): Sure, I pulled the logs from last week for the setup flow.
Meera  00:40
I mostly want to know which step loses people.
Asha  01:02
Agreed, and whether the reviews match what the logs say.`);
  assert.deepEqual(r.segments.map((s) => s.speaker), ['Asha', 'Dev', 'Meera', 'Asha']);
  assert.doesNotMatch(r.segments.map((s) => s.text).join(' '), /00:|01:/);
});

test('WebVTT: header, cue ids, timings and tags stripped, <v> voices kept', () => {
  const r = segment(`WEBVTT

NOTE exported from the call tool

1
00:00:01.000 --> 00:00:04.000
<v Asha>We need to decide on one fix for this sprint today.</v>

2
00:00:04.500 --> 00:00:08.000
<v Dev>The <i>invite</i> link fails on about a third of Android phones.</v>

3
00:00:08.500 --> 00:00:12.000
<v Asha>Then the invite step might be where people stall.</v>`);
  assert.deepEqual(r.segments.map((s) => s.speaker), ['Asha', 'Dev', 'Asha']);
  assert.equal(r.segments[1].text, 'The invite link fails on about a third of Android phones.');
  assert.doesNotMatch(JSON.stringify(r), /WEBVTT|-->|NOTE|<i>/);
});

test('SRT with speaker labels in the cue text', () => {
  const r = segment(`1
00:00:01,000 --> 00:00:03,000
Asha: Let us start with the retention numbers for new users.

2
00:00:03,500 --> 00:00:06,000
Asha: Six in ten stop within a week.

3
00:00:06,500 --> 00:00:09,000
Dev: Most of them never invite anyone, from what I can see in the logs this month.`);
  assert.deepEqual(r.segments.map((s) => s.speaker), ['Asha', 'Dev']);
  assert.match(r.segments[0].text, /new users\. Six in ten/);
  assert.doesNotMatch(r.segments.map((s) => s.text).join(' '), /^\d+$|-->/m);
});

test('SRT without speakers is joined and split by sentence', () => {
  const r = segment(`1
00:00:01,000 --> 00:00:03,000
we talked about the setup flow and

2
00:00:03,000 --> 00:00:06,000
how long it takes. Then we looked at reviews.

3
00:00:06,000 --> 00:00:09,000
Two reviews call it confusing and both mention the invite not working at all.`);
  assert.equal(r.segments.length, 1);
  assert.match(r.segments[0].text, /setup flow and how long it takes\. Then we looked/);
  assert.equal(r.segments[0].speaker, undefined);
});

test('plain paragraphs split on blank lines, short scraps dropped', () => {
  const r = segment(`We met to talk about why new users leave in their first week and what to do this sprint.

Okay.

The team agreed the invite step needs a closer look before anything else, because testers skipped it.

Nobody knows yet how many users are on Android, which matters for the link bug.`);
  assert.equal(r.segments.length, 3);
  assert.ok(r.segments.every((s) => s.text.split(' ').length >= 3));
  assert.equal(r.kind, 'summary'); // under 400 words, no speakers
});

test('bullet summary: kind summary, headings prefix their bullets', () => {
  const r = segment(`## Decisions
- Fix the invite link on Android first
- Redraw the invite screen

## Open questions
- What share of users are on Android?
- Does inviting cause retention or only mark committed users?
- Should reminders wait until next quarter?`);
  assert.equal(r.kind, 'summary');
  assert.equal(r.segments.length, 5);
  assert.equal(r.segments[0].text, 'Decisions: Fix the invite link on Android first');
  assert.match(r.segments[2].text, /^Open questions: What share/);
});

test('a turn over 120 words is split at sentence boundaries, same speaker', () => {
  const sentence = 'This sentence has exactly ten words in it for counting. ';
  const r = segment(`Asha: ${sentence.repeat(30)}\nDev: Fine by me, let us do that then.\nAsha: Good, thank you all.`);
  const asha = r.segments.filter((s) => s.speaker === 'Asha');
  assert.ok(asha.length >= 3);
  assert.ok(asha.every((s) => s.text.split(' ').length <= 121));
});

test('over the cap: keeps the start, reports coverage', () => {
  const paras = Array.from({ length: 40 }, (_, i) => `Part ${i} ${long(60, `p${i}w`)}.`).join('\n\n');
  const r = segment(paras, 2000);
  assert.equal(r.truncated, true);
  assert.equal(r.totalSegments, 40);
  assert.ok(r.coveredSegments > 0 && r.coveredSegments < 40);
  assert.equal(r.segments.length, r.coveredSegments);
  assert.equal(r.segments.at(-1)!.id, `S${r.coveredSegments}`);
  const est = r.segments.reduce((a, s) => a + Math.ceil(s.text.length / 3.5) + 8, 0);
  assert.ok(est <= 2000);
});

test('too short is refused with a code', () => {
  assert.throws(() => segment('Asha: hi.\nDev: hello there.'), (e: unknown) => e instanceof MeetingInputError && e.code === 'too_short');
});

test('too large is refused with a code', () => {
  assert.throws(() => segment('x'.repeat(200_001)), (e: unknown) => e instanceof MeetingInputError && e.code === 'too_large');
});

test('"Note:" once is not a speaker', () => {
  const r = segment(`Note: this summary was written after the call by the product manager.

We agreed that the invite step is where most testers stalled, and that the link bug matters.

We did not agree on reminders, which several people think would annoy users.`);
  assert.ok(r.segments.every((s) => !s.speaker));
});
