import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Card } from './types.ts';
import { GROUP_GAP, layoutSessionDraft, sectionSize, type Rect } from './session-layout.ts';
import { STICKY, membersOf } from './ydoc.ts';

const notes = (n: number, kind: 'idea' | 'question' | 'decision' = 'idea') => Array.from({ length: n }, (_, i) => ({ text: `n${i}`, kind, sourceIds: ['S1'] }));
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('empty board: the group is centred on the view', () => {
  const r = layoutSessionDraft({ sections: [{ title: 'A', notes: notes(3) }], existing: [], viewCentre: { x: 1000, y: 500 } });
  assert.equal(Math.round(r.bounds.x + r.bounds.w / 2), 1000);
  assert.equal(Math.round(r.bounds.y + r.bounds.h / 2), 500);
});

test('board with content: below it, left-aligned, with the gap', () => {
  const existing = [
    { x: -300, y: 0, w: 200, h: 200 },
    { x: 400, y: -100, w: 720, h: 600 },
  ];
  const r = layoutSessionDraft({ sections: [{ title: 'A', notes: notes(2) }], existing, viewCentre: { x: 0, y: 0 } });
  assert.equal(r.bounds.x, -300);
  assert.equal(r.bounds.y, 500 + GROUP_GAP);
  for (const s of r.sections) for (const e of existing) assert.ok(!hit(s, e));
});

test('every note sits inside its own section and no other (membership is geometric)', () => {
  const r = layoutSessionDraft({
    sections: [
      { title: 'A', notes: notes(8) },
      { title: 'B', notes: notes(1, 'question') },
      { title: 'C', notes: notes(5, 'decision') },
      { title: 'D', notes: notes(3) },
      { title: 'E', notes: notes(2) },
    ],
    existing: [],
    viewCentre: { x: 0, y: 0 },
  });
  for (const s of r.sections) {
    const cards = s.notes.map((n, i) => ({ id: `${s.title}${i}`, x: n.x, y: n.y, w: STICKY, h: STICKY }) as Card);
    assert.equal(membersOf(s, cards).length, s.notes.length);
    for (const other of r.sections) if (other !== s) assert.equal(membersOf(other, cards).length, 0);
  }
  // No two sections overlap; the fifth wraps to a second row.
  for (const a of r.sections) for (const b of r.sections) if (a !== b) assert.ok(!hit(a, b));
  assert.ok(r.sections[4].y > r.sections[0].y);
  assert.equal(r.sections[4].x, r.sections[0].x);
});

test('kinds map to colours; notes fill two columns in reading order', () => {
  const r = layoutSessionDraft({ sections: [{ title: 'A', notes: [...notes(4), ...notes(1, 'question'), ...notes(1, 'decision')] }], existing: [], viewCentre: { x: 0, y: 0 } });
  const s = r.sections[0];
  assert.deepEqual(s.notes.map((n) => n.color), ['yellow', 'yellow', 'yellow', 'yellow', 'pink', 'green']);
  assert.equal(s.w, sectionSize(6).w);
  assert.equal(s.h, sectionSize(6).h);
  assert.ok(s.notes[1].x > s.notes[0].x);
  assert.equal(s.notes[1].y, s.notes[0].y);
  assert.ok(s.notes[2].y > s.notes[0].y);
  assert.equal(s.notes[2].x, s.notes[0].x);
});
