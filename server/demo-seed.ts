import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as Y from 'yjs';
import { writeDecision } from '../shared/decision-schema.ts';
import type { BoardKind, BoardReport, ChatMessage, Snapshot, SnapshotChip, StickyColor } from '../shared/types.ts';
import { STICKY, parts, writeNote, writeSection } from '../shared/ydoc.ts';
import {
  DECISIONS,
  DESIGN_QUESTION,
  DIRECTIONS,
  EXPLORATIONS,
  FRAME,
  HANDOUTS,
  IDEA_BANK,
  MEETING_CHIP,
  OPTION_C_NOTES,
  OPTION_C_SECTION,
  OPTIONS,
  PEOPLE,
  PROJECT_CONTEXT,
  PUBLIC_FACTS,
  RESTATES,
  TITLE,
  noteById,
  notesIn,
  type PersonKey,
} from './cases/split-buddy.ts';

// The three Split Buddy boards (Split_Buddy_Board_v3_Full.md), all derived from
// server/cases/split-buddy.ts so they cannot drift.
// Seeds never write meta.decision any more: decisions live in doc.getMap('decisions').

export const PROBLEM = `${FRAME}\n\n${DESIGN_QUESTION}`;

/** The Sprint planning call on the finished example (Split_Buddy_Board_v3_Full.md Part 3). */
const PLANNING_CALL_TEXT = readFileSync(new URL('../fixtures/meetings/split-buddy-planning-call.txt', import.meta.url), 'utf8').trim();

const GAP = 32;
const PAD = 28;
const HEAD = 64;
const ROW_GAP = 60;
const col = (i: number) => PAD + i * (STICKY + GAP);
const width = (cols: number) => col(cols) - GAP + PAD;
const height = (rows: number) => HEAD + rows * STICKY + (rows - 1) * GAP + PAD;

interface SeedSection {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const SECTION_GAP = 40;
const FACT_COLS = 4;
const DIR_COLS = 4;
const IDEA_COLS = 8;
const IDEA_ROWS = 5;

/** Row 1 on every case board: Frame, Restate, What we know (P1 to P8, 4 across, 2 down). */
const ROW1_H = height(2);
const ROW1: SeedSection[] = [
  { id: 's-frame', title: 'Frame: three options', x: 0, y: 0, w: width(3), h: height(1) },
  { id: 's-restate', title: 'Restate the problem in your own words', x: width(3) + SECTION_GAP, y: 0, w: width(3), h: height(1) },
  { id: 's-facts', title: 'What we know', x: 2 * (width(3) + SECTION_GAP), y: 0, w: width(FACT_COLS), h: ROW1_H },
];
const ROW2_Y = ROW1_H + ROW_GAP;

/** Fresh case: an empty "Ideas" section, ready for people. */
const FRESH_SECTIONS: SeedSection[] = [...ROW1, { id: 's-ideas', title: 'Ideas', x: 0, y: ROW2_Y, w: width(6), h: height(2) }];

/** Mid-session: one "Ideas" section, 8 columns by 5 rows, about 1,880 by 1,220 px. */
const MID_SECTIONS: SeedSection[] = [...ROW1, { id: 's-ideas', title: 'Ideas', x: 0, y: ROW2_Y, w: width(IDEA_COLS), h: height(IDEA_ROWS) }];

/**
 * Finished example (v3 7.3): the seven direction sections, 4 notes across, ordered by ID, wrapping
 * to a second row after four sections. Then "Inside option C: four changes".
 */
function finishedSections(): SeedSection[] {
  const out = [...ROW1];
  let y = ROW2_Y;
  for (const row of [DIRECTIONS.slice(0, 4), DIRECTIONS.slice(4)]) {
    const rows = Math.max(...row.map((d) => Math.ceil(notesIn(d.code).length / DIR_COLS)));
    row.forEach((d, i) => out.push({ id: d.sectionId, title: d.title, x: i * (width(DIR_COLS) + SECTION_GAP), y, w: width(DIR_COLS), h: height(rows) }));
    y += height(rows) + ROW_GAP;
  }
  out.push({ id: OPTION_C_SECTION.id, title: OPTION_C_SECTION.title, x: 0, y, w: width(OPTION_C_NOTES.length), h: height(1) });
  return out;
}

const slot = (sections: SeedSection[], sectionId: string, i: number, row = 0) => {
  const s = sections.find((x) => x.id === sectionId)!;
  return { x: s.x + col(i), y: s.y + HEAD + row * (STICKY + GAP), sectionId: s.id };
};

/** Stable offset of up to 10 px in x and y, from the note id, so the pile looks hand-placed. */
const jitter = (id: string, salt: number) => {
  let h = salt;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 21) - 10;
};

const HOUR = 3_600_000;

/** A saved exploration on the finished example. Inserted into SQLite by the caller. */
export interface ExampleRow {
  id: string;
  userId: string;
  snapshot: Snapshot;
  messages: ChatMessage[];
  createdAt: number;
}

type CaseKind = Exclude<BoardKind, 'blank'>;

/**
 * kind 'case': the fresh case. kind 'mid': the mid-session example (the main demo board).
 * kind 'example': the finished example. Returns the saved explorations the example needs,
 * so the caller can store them.
 */
export function seedCase(doc: Y.Doc, kind: CaseKind, makeId: () => string = randomUUID): ExampleRow[] {
  const p = parts(doc);
  const solved = kind === 'example';
  const mid = kind === 'mid';
  const sections = solved ? finishedSections() : mid ? MID_SECTIONS : FRESH_SECTIONS;
  const now = Date.now();
  // Times read as a story that happened over the last few days (decisions use "hours before seed").
  const T0 = now - 130 * HOUR;
  const f = PEOPLE.facilitator;
  type Pos = ReturnType<typeof slot>;
  const note = (id: string, text: string, color: StickyColor, pos: Pos, by: { id: string; name: string; color: string }, t: number, origin: 'human' | 'ai' = 'human') =>
    writeNote(doc, { id, text, color, x: pos.x, y: pos.y, sectionId: pos.sectionId, authorId: by.id, authorName: by.name, authorColor: by.color, origin, createdAt: t });
  const at = (sectionId: string, i: number, row = 0) => slot(sections, sectionId, i, row);

  doc.transact(() => {
    p.meta.set('kind', kind);
    p.meta.set('title', TITLE);
    p.meta.set('titleSource', 'user');
    p.meta.set('titleProposedBy', null);
    p.problem.insert(0, PROBLEM);
    for (const s of sections) writeSection(doc, { ...s, titleSource: 'user', createdBy: f.id });

    OPTIONS.forEach((o, i) => note(o.id, o.text, 'green', at('s-frame', i), f, T0 + i * 1000));
    PUBLIC_FACTS.forEach((fact, i) => note(fact.id, fact.text, 'blue', at('s-facts', i % FACT_COLS, Math.floor(i / FACT_COLS)), f, T0 + 10_000 + i * 1000));

    if (kind === 'case') return;

    RESTATES.forEach((r, i) => note(r.id, r.text, 'yellow', at('s-restate', i), r.by, T0 + 60_000 + i * 1000));

    PROJECT_CONTEXT.forEach((c, i) => {
      const m = new Y.Map<unknown>();
      m.set('type', c.type);
      m.set('source', c.source);
      m.set('title', c.title);
      m.set('summary', c.summary);
      m.set('status', 'ready');
      m.set('addedBy', PEOPLE.asha.id);
      m.set('addedByName', PEOPLE.asha.name);
      m.set('createdAt', T0 + 30_000 + i * 1000);
      p.context.set(c.id, m);
    });

    if (mid) {
      // The 40-note pile, unsorted, in the fixed order (v3 7.2), each moved by up to 10 px.
      IDEA_BANK.forEach((n, i) => {
        const pos = at('s-ideas', i % IDEA_COLS, Math.floor(i / IDEA_COLS));
        const by = PEOPLE[n.by];
        note(n.id, n.text, 'yellow', { ...pos, x: pos.x + jitter(n.id, 1), y: pos.y + jitter(n.id, 2) }, by, T0 + 120_000 + i * 1000, n.ai ? 'ai' : 'human');
      });
      return;
    }

    // The same 40 notes, sorted into their direction sections, ordered by ID, 4 across.
    for (const d of DIRECTIONS) {
      notesIn(d.code).forEach((n, i) => {
        const t = T0 + 120_000 + Number(n.id.slice(1)) * 1000;
        note(n.id, n.text, 'yellow', at(d.sectionId, i % DIR_COLS, Math.floor(i / DIR_COLS)), PEOPLE[n.by], t, n.ai ? 'ai' : 'human');
      });
    }
    // Part C: what the group would build inside option C, written after the reports.
    OPTION_C_NOTES.forEach((c, i) => note(c.id, c.text, 'green', at(OPTION_C_SECTION.id, i), PEOPLE.asha, now - 74 * HOUR + i * 1000));

    // PRD 4.2: the meeting chip. Since 25 Nov (user decision) board context is readable by everyone on
    // the board, so the chip carries the planning call's text (fixtures/meetings/split-buddy-planning-call.txt).
    const by = PEOPLE[MEETING_CHIP.by];
    const m = new Y.Map<unknown>();
    m.set('type', MEETING_CHIP.type);
    m.set('source', MEETING_CHIP.source);
    m.set('title', MEETING_CHIP.title);
    m.set('summary', MEETING_CHIP.summary);
    m.set('status', 'ready');
    m.set('addedBy', by.id);
    m.set('addedByName', by.name);
    m.set('createdAt', now - MEETING_CHIP.hoursBefore * HOUR);
    m.set('sourceName', MEETING_CHIP.source);
    m.set('fullText', PLANNING_CALL_TEXT);
    p.context.set(MEETING_CHIP.id, m);
  });

  if (!solved) return [];

  // Saved explorations and their approved reports. They finish a few hours before D1 is locked.
  const R0 = now - 80 * HOUR;
  const boardChips: SnapshotChip[] = PROJECT_CONTEXT.map((c) => ({ id: c.id, type: c.type, title: c.title, summary: c.summary, source: c.source }));
  const rows: ExampleRow[] = [];
  const reportOf: Partial<Record<PersonKey, string>> = {};
  doc.transact(() => {
    EXPLORATIONS.forEach((e, i) => {
      const who = PEOPLE[e.who];
      const hand = HANDOUTS[e.who];
      // The Reports list shows the newest first, so Kavya's report is the latest one.
      const start = R0 + HOUR * (EXPLORATIONS.length - i);
      const snapshot: Snapshot = {
        problem: PROBLEM,
        boardTitle: TITLE,
        notes: e.cards.map((id) => {
          const n = noteById(id)!;
          return { id, text: n.text, author: n.by.name };
        }),
        chips: [...boardChips, { ...hand.note, private: true }, { ...hand.more, private: true }, { ...hand.link, private: true, unread: true }],
      };
      const id = makeId();
      rows.push({
        id,
        userId: who.id,
        snapshot,
        messages: e.messages.map((m, j) => ({ id: makeId(), role: m.role, text: m.text, at: start + 60_000 + j * 45_000 })),
        createdAt: start,
      });
      const report: BoardReport = {
        id: makeId(),
        explorationId: id,
        approvedBy: who.id,
        approvedByName: who.name,
        approvedByColor: who.color,
        createdAt: start + 900_000,
        approvedAt: start + 1_200_000,
        cardNoteIds: e.cards,
        body: e.report,
      };
      reportOf[e.who] = report.id;
      p.reports.set(report.id, report);
    });
  });

  // PRD section 4: seven decisions, six in force, D7 reopened by Dev.
  doc.transact(() => {
    const iso = (hoursBefore: number) => new Date(now - hoursBefore * HOUR).toISOString();
    const onBoard = new Set<string>();
    p.notes.forEach((_, id) => onBoard.add(id));
    for (const d of DECISIONS) {
      const by = PEOPLE[d.by];
      const lockedAt = iso(d.hoursBefore);
      // D3 and D4 cover "Not this problem" and "Bring people back". The sections exist by now.
      const sectionId = d.sectionId && p.sections.has(d.sectionId) ? d.sectionId : null;
      const reopenedBy = d.reopened ? PEOPLE[d.reopened.by] : null;
      const reopenedAt = d.reopened ? iso(d.reopened.hoursBefore) : null;
      writeDecision(
        doc,
        {
          text: d.text,
          reasons: d.reasons,
          scope: sectionId ? 'section' : 'board',
          sectionId,
          sourceNoteIds: d.sourceNoteIds.filter((id) => onBoard.has(id)),
          reportIds: d.reports.map((w) => reportOf[w]).filter((x): x is string => !!x),
        },
        { id: by.id, name: by.name, color: by.color },
        {
          id: d.id,
          lockedAt,
          via: d.via,
          meetingChipId: d.via === 'meeting' ? MEETING_CHIP.id : null,
          rich: d.rich,
          status: d.reopened ? 'reopened' : 'locked',
          reopened: reopenedBy && reopenedAt ? { by: reopenedBy.id, byName: reopenedBy.name, at: reopenedAt } : undefined,
          history: [
            { action: 'lock', by: by.id, byName: by.name, at: lockedAt },
            ...(reopenedBy && reopenedAt ? [{ action: 'reopen' as const, by: reopenedBy.id, byName: reopenedBy.name, at: reopenedAt }] : []),
          ],
        },
      );
    }
  });
  return rows;
}

export function seedBlank(doc: Y.Doc) {
  const p = parts(doc);
  doc.transact(() => {
    p.meta.set('kind', 'blank');
    p.meta.set('title', '');
    p.meta.set('titleSource', null);
    p.meta.set('titleProposedBy', null);
  });
}
