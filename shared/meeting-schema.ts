import { z } from 'zod';

// Meeting addendum, section 7: what the meetingSession task returns. The model gives text and
// segment ids only; layout and placement are code (shared/session-layout.ts).

export const NoteKind = z.enum(['idea', 'question', 'decision']);
export type NoteKind = z.infer<typeof NoteKind>;

export const MeetingDraftSchema = z.object({
  title: z.string().min(1).max(60).describe('Board title, at most 60 characters, names the topic, not a conclusion'),
  problem: z.string().max(300).describe('The question the group is trying to answer, or an empty string'),
  sections: z
    .array(
      z.object({
        title: z.string().min(1).max(40).describe('Topic label, at most 5 words'),
        notes: z
          .array(
            z.object({
              text: z.string().min(1).max(220).describe('One or two sentences, at most 200 characters'),
              kind: NoteKind,
              sourceIds: z.array(z.string()).min(1).max(3).describe('Ids of the meeting segments this note comes from, such as S4'),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(1)
    .max(6),
});

/**
 * Locked decisions PRD 9A: decisions the meeting reached, kept apart from the notes. They start
 * locked in the review sheet. `sectionIndex` points into `sections` (resolved by the server from
 * the model's sectionRef). `conflictsWith` is a real decision id in force, or null (PRD 8.3).
 */
export interface DraftDecision {
  text: string;
  reasons: string;
  sourceIds: string[];
  sectionIndex: number | null;
  conflictsWith: string | null;
  conflictLine: string;
}

/** A checked draft. `decisions` and the conflict fields are missing on drafts saved before 26 Nov. */
export type MeetingDraft = Omit<z.infer<typeof MeetingDraftSchema>, 'sections'> & {
  sections: { title: string; notes: { text: string; kind: NoteKind; sourceIds: string[]; conflictsWith?: string | null; conflictLine?: string }[] }[];
  decisions?: DraftDecision[];
};

export interface Passage {
  id: string;
  speaker?: string;
  text: string;
}

export interface Coverage {
  truncated: boolean;
  covered: number;
  total: number;
}

/** A draft as the owner sees it in the review sheet: each note carries its source passages. */
export interface MeetingDraftView {
  title: string;
  problem: string;
  sections: { title: string; notes: { text: string; kind: NoteKind; sourceIds: string[]; passages: Passage[]; conflictsWith?: string | null; conflictLine?: string }[] }[];
  decisions?: (DraftDecision & { passages: Passage[] })[];
}

/** What the person approved in the review sheet, for placement. */
export interface ApprovedSession {
  title: string;
  problem: string | null;
  sections: { title: string; notes: { text: string; kind: NoteKind; sourceIds: string[] }[] }[];
  /** Ticked decisions that start locked. `sectionIndex` points into `sections` above; null locks for the whole problem. */
  decisions?: { text: string; reasons: string; sectionIndex: number | null }[];
}

/**
 * What the server parses the model's answer with. Lengths and counts are clamped afterwards
 * (server/meeting/draft.ts), so a 62-character title does not throw away a whole draft.
 */
export const MeetingDraftLoose = z.object({
  title: z.string(),
  problem: z.string(),
  sections: z
    .array(
      z.object({
        title: z.string(),
        notes: z.array(
          z.object({
            text: z.string(),
            kind: NoteKind,
            sourceIds: z.array(z.string()),
            conflictsWith: z.string().nullable().optional().describe('Id of a locked decision (D1, D2) this note goes against, or null'),
            conflictLine: z.string().optional().describe('One short line saying how it goes against that decision, or empty'),
          }),
        ),
      }),
    )
    .min(1),
  decisions: z
    .array(
      z.object({
        text: z.string().describe('What the group agreed, one or two sentences, at most 300 characters'),
        reasons: z.string().optional().describe('What the meeting said in favour, at most 500 characters, or empty'),
        sourceIds: z.array(z.string()).describe('Ids of the segments where it was proposed and agreed'),
        sectionRef: z.string().nullable().optional().describe('Title of the draft section this decision belongs to, or null'),
        conflictsWith: z.string().nullable().optional().describe('Id of a locked decision (D1, D2) this goes against, or null'),
        conflictLine: z.string().optional(),
      }),
    )
    .optional()
    .describe('Decisions the meeting clearly agreed. At most 5. Empty when nothing was agreed'),
});
export type MeetingDraftLooseT = z.infer<typeof MeetingDraftLoose>;
