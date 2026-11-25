import { z } from 'zod';
import type { Snapshot } from './types.ts';

// The fixed report template (Build PRD 12.4, Micro PRD RPT-1).
// Every finding, objection and rejected direction carries a reason:
// the schema will not accept one without it.
const reasoned = (what: string) =>
  z.object({
    text: z.string().min(1).describe(what),
    reason: z.string().min(1).describe('Why. Required.'),
  });

export const GeneratedReportSchema = z.object({
  title: z.string().min(1).describe('Short title, under 70 characters'),
  summary: z.string().min(1).describe('One or two sentences on what was explored and where the discussion ended.'),
  findings: z.array(reasoned('What the exploration found')).describe('Only what the exploration supports. Uncertain items go to open_questions.'),
  evidence: z
    .array(
      z.object({
        text: z.string().min(1).describe('A fact or a note behind a finding'),
        source: z.string().nullable().describe('Where it came from: a note author, a context title or a link. Null if none.'),
        supports: z.number().int().min(1).describe('The number of the finding it supports, starting at 1'),
      }),
    )
    .describe('Only evidence present in the given context or the conversation. Never invent sources.'),
  objections: z.array(reasoned('The strongest argument against the direction')),
  rejected_directions: z.array(reasoned('An option that was considered and dropped')),
  open_questions: z.array(z.object({ text: z.string().min(1) })).describe('What is still unknown, including anything the AI is unsure of'),
});

export const REPORT_DECISION_LIMIT = 2000;
export const ReportSchema = GeneratedReportSchema.extend({
  decision: z.string().trim().min(1).max(REPORT_DECISION_LIMIT).optional(),
});

export type ReportBody = z.infer<typeof ReportSchema>;

/** Older snapshots only stored the cards taken into the canvas. */
export function reportNotes(snapshot: Snapshot) {
  const reserved = snapshot.reservedNoteIds ? new Set(snapshot.reservedNoteIds) : null;
  const notes = snapshot.notes.filter((note) => !reserved || reserved.has(note.id));
  return [...new Map([...notes, ...(snapshot.focusedNotes ?? [])].map((note) => [note.id, note])).values()];
}

/** The report when the canvas has no conversation yet: nothing was explored, so nothing is claimed (RPT-1). */
export const EMPTY_REPORT_TITLE = 'Nothing explored yet';
const EMPTY_REPORT_SUMMARY = 'There was no conversation in this canvas, so there is nothing to report. Chat with the AI about your notes, then make the report again.';
export function emptyReport(): ReportBody {
  return {
    title: EMPTY_REPORT_TITLE,
    summary: EMPTY_REPORT_SUMMARY,
    findings: [],
    evidence: [],
    objections: [],
    rejected_directions: [],
    open_questions: [],
  };
}

/** True when the report is still the empty placeholder generated before any conversation. */
export function isEmptyReport(b: ReportBody): boolean {
  return b.summary === EMPTY_REPORT_SUMMARY && !b.decision && !b.findings.length && !b.evidence.length
    && !b.objections.length && !b.rejected_directions.length && !b.open_questions.length;
}
