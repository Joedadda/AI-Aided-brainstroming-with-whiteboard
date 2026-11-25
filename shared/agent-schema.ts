import { z } from 'zod';

/*
  Whiteboard agent (Whiteboard_Agent_PRD.md, section 5). Shared by the server (router, checks,
  mock) and the client (panel, apply).

  Two shapes:
  - ModelPlanSchema: what the model returns. Flat, every key present, so strict json_schema works
    on every Sarvam model. It uses per-call refs (n1, s1, D1) that only the server can map back.
  - AgentPlan: what the server sends after its checks (section 6.3). Real note, section and
    decision ids, plus temporary refs ('#s1', '#n1') for things the plan creates. The client
    resolves those on apply. Real ids never start with '#'.
*/

export const AGENT_LIMITS = {
  instruction: 500,
  noteText: 120,
  sectionTitle: 40,
  moves: 60,
  newNotes: 12,
  sections: 12,
  locks: 5,
  ideas: 12,
  scopeNotes: 120,
  refinements: 3,
  decisionText: 300,
  decisionReasons: 500,
} as const;

export type NoteKind = 'idea' | 'question' | 'decision';

// ---------- What the model returns ----------

const str = z.string().default('');
const strs = z.array(z.string()).default([]);

export const ModelPlanSchema = z.object({
  kind: z.enum(['plan', 'answer', 'clarify']).default('plan'),
  summary: str,
  buckets: z
    .array(z.object({ ref: str, title: str, existingSectionId: str, noteIds: strs }))
    .default([]),
  leaveNoteIds: strs,
  renames: z.array(z.object({ sectionId: str, title: str })).default([]),
  newNotes: z
    .array(z.object({ ref: str, text: str, toRef: str, kind: z.enum(['idea', 'question', 'decision']).default('idea') }))
    .default([]),
  ideas: z.object({ toRef: str, count: z.number().default(0), angles: strs }).default({ toRef: '', count: 0, angles: [] }),
  locks: z
    .array(z.object({ text: str, reasons: str, scope: z.enum(['board', 'section']).default('board'), sectionRef: str, sourceRefs: strs }))
    .default([]),
  reopen: z.array(z.object({ decisionId: str })).default([]),
  answer: z.object({ text: str, noteIds: strs }).default({ text: '', noteIds: [] }),
  question: str,
});
export type ModelPlan = z.infer<typeof ModelPlanSchema>;
export type ModelPlanInput = z.input<typeof ModelPlanSchema>;

export const IdeasSchema = z.object({
  ideas: z.array(z.object({ text: str, conflictsWith: str, conflictLine: str })).default([]),
});
export type ModelIdeas = z.infer<typeof IdeasSchema>;

// ---------- What the client gets ----------

export type PlanStep =
  | { type: 'createSection'; ref: string; title: string }
  /** toRef: a '#s' ref from createSection, or an existing section id. */
  | { type: 'moveNotes'; noteIds: string[]; toRef: string }
  | { type: 'renameSection'; sectionId: string; title: string; from: string }
  | { type: 'addNotes'; toRef?: string; notes: { ref: string; text: string; kind?: NoteKind }[] }
  /** Resolved into ideas by the server, streamed as `idea` events. */
  | { type: 'proposeIdeas'; toRef?: string; count: number; angles: string[] }
  | { type: 'removeEmptySection'; sectionId: string; title: string }
  | {
      type: 'lockDecision';
      ref: string;
      text: string;
      reasons: string;
      scope: 'board' | 'section';
      /** A '#s' ref or an existing section id. */
      sectionRef?: string;
      /** '#n' refs or existing note ids. */
      sourceRefs: string[];
      reportIds: string[];
      /** Set when the section is already covered by a decision in force: shown disabled. */
      blocked?: string;
    }
  | { type: 'reopenDecision'; decisionId: string; text: string };

export type StepOf<T extends PlanStep['type']> = Extract<PlanStep, { type: T }>;

export interface PlanWarning {
  stepIndex?: number;
  noteId?: string;
  text: string;
}

export interface AgentPlan {
  summary: string;
  warnings: PlanWarning[];
  steps: PlanStep[];
  answer?: { text: string; noteIds: string[] };
  clarify?: { question: string };
  /** True when the plan sorts notes into two or more buckets (whole-board layout below content). */
  classify: boolean;
  /** Each moved note's state when the plan was made, for the stale check on apply. */
  noteState: Record<string, { sectionId: string | null; reservedBy: string | null; text: string }>;
  scope: { notes: number; total: number; capped: boolean; selected: boolean };
}

export interface AgentIdea {
  id: string;
  text: string;
  angle: string;
  /** A decision in force this idea goes against (Locked Decisions PRD 8.3), or null. */
  conflictsWith: string | null;
  conflictLine: string;
}

export type AgentStage = 'reading' | 'planning' | 'checking';

export type AgentErrorCode = 'vague' | 'too_large' | 'rate_limited' | 'model_failed' | 'invalid_plan' | 'not_found';

/** Lock intent in the person's own words (Locked Decisions PRD 9.3). Never read from board text. */
export const LOCK_INTENT = /\b(lock|locks|locked|locking|finali[sz]e[ds]?|finali[sz]ing|make (?:it|this|that|them|these|those) final|unlock|unlocks|reopen|reopens)\b/i;

export const hasLockIntent = (instruction: string) => LOCK_INTENT.test(instruction);
