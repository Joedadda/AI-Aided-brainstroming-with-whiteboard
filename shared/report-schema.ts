import { z } from 'zod';

// The fixed report template (Build PRD 12.4, Micro PRD RPT-1).
// Every finding, objection and rejected direction carries a reason:
// the schema will not accept one without it.
const reasoned = (what: string) =>
  z.object({
    text: z.string().min(1).describe(what),
    reason: z.string().min(1).describe('Why. Required.'),
  });

export const ReportSchema = z.object({
  title: z.string().min(1).describe('Short title, under 70 characters'),
  summary: z.string().min(1).describe('2 to 4 sentences. Reads on its own for a teammate who saw nothing else.'),
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

export type ReportBody = z.infer<typeof ReportSchema>;

/** The report when the canvas has no conversation yet: nothing was explored, so nothing is claimed (RPT-1). */
export const EMPTY_REPORT_TITLE = 'Nothing explored yet';
export function emptyReport(): ReportBody {
  return {
    title: EMPTY_REPORT_TITLE,
    summary: 'There was no conversation in this canvas, so there is nothing to report. Chat with the AI about your notes, then make the report again.',
    findings: [],
    evidence: [],
    objections: [],
    rejected_directions: [],
    open_questions: [],
  };
}

/** True when the report holds nothing to share: no findings, evidence, objections, rejected directions or open questions. */
export function isEmptyReport(b: ReportBody): boolean {
  return !b.findings.length && !b.evidence.length && !b.objections.length && !b.rejected_directions.length && !b.open_questions.length;
}
