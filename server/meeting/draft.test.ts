import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvalidDraft, checkDraft, withPassages } from './draft.ts';

const segs = Array.from({ length: 10 }, (_, i) => ({ id: `S${i + 1}`, speaker: i % 2 ? 'Dev' : 'Asha', text: `Segment ${i + 1} text` }));
const note = (text: string, sourceIds = ['S1'], kind: 'idea' | 'question' | 'decision' = 'idea') => ({ text, kind, sourceIds });

test('unknown source ids are dropped, and a note left with none goes', () => {
  const d = checkDraft(
    { title: 'T', problem: '', sections: [{ title: 'A', notes: [note('Keep me please', ['S1', 'S99']), note('Drop me now', ['S42']), note('Also kept here', ['s2']), note('Third one stays', ['S3'])] }] },
    segs,
  );
  assert.deepEqual(
    d.sections[0].notes.map((n) => [n.text, n.sourceIds]),
    [
      ['Keep me please', ['S1']],
      ['Also kept here', ['S2']],
      ['Third one stays', ['S3']],
    ],
  );
});

test('markdown and bullet prefixes are stripped', () => {
  const d = checkDraft({ title: '**Board**', problem: '', sections: [{ title: '## Pricing', notes: [note('- **Bold** idea one'), note('2. Second idea `code`', ['S2']), note('*Third* idea', ['S3'])] }] }, segs);
  assert.equal(d.title, 'Board');
  assert.equal(d.sections[0].title, 'Pricing');
  assert.deepEqual(d.sections[0].notes.map((n) => n.text), ['Bold idea one', 'Second idea code', 'Third idea']);
});

test('near duplicates are removed', () => {
  const d = checkDraft(
    {
      title: 'T',
      problem: '',
      sections: [
        { title: 'A', notes: [note('Fix the invite link on Android.'), note('fix the invite link on android', ['S2']), note('Fix the invite link on Android phones', ['S3']), note('Redraw the screen', ['S4'])] },
        { title: 'B', notes: [note('Fix the invite link on Android!', ['S5']), note('Ask about reminders', ['S6'])] },
      ],
    },
    segs,
  );
  assert.deepEqual(d.sections[0].notes.map((n) => n.text), ['Fix the invite link on Android.', 'Redraw the screen']);
  assert.deepEqual(d.sections[1].notes.map((n) => n.text), ['Ask about reminders']);
});

test('empty sections are dropped and caps apply from the longest section', () => {
  const many = (p: string, n: number) => Array.from({ length: n }, (_, i) => note(`${p} distinct idea number ${i} about ${p}${i}x`, [`S${(i % 10) + 1}`]));
  const d = checkDraft(
    {
      title: 'T',
      problem: '',
      sections: [
        { title: 'Empty', notes: [note('gone', ['S77'])] },
        { title: 'A', notes: many('alpha', 8) },
        { title: 'B', notes: many('beta', 8) },
        { title: 'C', notes: many('gamma', 8) },
        { title: 'D', notes: many('delta', 5) },
      ],
    },
    segs,
  );
  assert.equal(d.sections.length, 4);
  assert.equal(d.sections.reduce((a, s) => a + s.notes.length, 0), 25);
  assert.equal(d.sections.find((s) => s.title === 'D')!.notes.length, 5);
});

test('fewer than 3 notes left is invalid', () => {
  assert.throws(() => checkDraft({ title: 'T', problem: '', sections: [{ title: 'A', notes: [note('One'), note('Two', ['S99'])] }] }, segs), InvalidDraft);
});

test('passages are attached by id', () => {
  const v = withPassages({ title: 'T', problem: '', sections: [{ title: 'A', notes: [note('x', ['S2', 'S3'])] }] }, segs);
  assert.deepEqual(v.sections[0].notes[0].passages.map((p) => p.id), ['S2', 'S3']);
  assert.equal(v.sections[0].notes[0].passages[0].speaker, 'Dev');
});

test('a "question" with no question mark becomes an idea', () => {
  const d = checkDraft({ title: 'T', problem: '', sections: [{ title: 'A', notes: [note('Four offices cancelled', ['S1'], 'question'), note('Who owns this?', ['S2'], 'question'), note('Ship it', ['S3'], 'decision')] }] }, segs);
  assert.deepEqual(d.sections[0].notes.map((n) => n.kind), ['idea', 'question', 'decision']);
});

// ---- Locked decisions (PRD 8.4, 9A; acceptance check 17) ----

const known = [{ id: 'D1', realId: 'd_real1', text: 'Fix the invite step first' }];

test('an unknown conflictsWith id from the model is dropped; a known one maps to the real id', () => {
  const d = checkDraft(
    {
      title: 'T',
      problem: '',
      sections: [
        {
          title: 'A',
          notes: [
            { ...note('Start with reminders'), conflictsWith: 'D1', conflictLine: 'Puts reminders first' },
            { ...note('Some other idea', ['S2']), conflictsWith: 'D9', conflictLine: 'Made up' },
            { ...note('Third idea here', ['S3']), conflictsWith: 'd_invented' },
          ],
        },
      ],
    },
    segs,
    known,
  );
  assert.deepEqual(
    d.sections[0].notes.map((n) => [n.conflictsWith, n.conflictLine]),
    [
      ['d_real1', 'Puts reminders first'],
      [null, ''],
      [null, ''],
    ],
  );
});

test('meeting decisions: real ids only, capped at 5, no duplicates of each other or of a decision in force, sectionRef resolved', () => {
  const dec = (text: string, sourceIds = ['S1'], sectionRef: string | null = null) => ({ text, reasons: 'Because', sourceIds, sectionRef });
  const d = checkDraft(
    {
      title: 'T',
      problem: '',
      sections: [{ title: 'Owners', notes: [note('One idea'), note('Two idea', ['S2']), note('Three idea', ['S3'])] }],
      decisions: [
        dec('Android release by day six', ['S1'], 'Owners'),
        dec('Android release by day six'),
        dec('Fix the invite step first'),
        dec('No source left', ['S99']),
        dec('Decision three'),
        dec('Decision four'),
        dec('Decision five'),
        dec('Decision six'),
        dec('Decision seven'),
      ],
    },
    segs,
    known,
  );
  assert.equal(d.decisions!.length, 5);
  assert.equal(d.decisions![0].sectionIndex, 0);
  assert.ok(!d.decisions!.some((x) => /invite step|No source/.test(x.text)));
  assert.equal(d.decisions!.filter((x) => x.text === 'Android release by day six').length, 1);
});
