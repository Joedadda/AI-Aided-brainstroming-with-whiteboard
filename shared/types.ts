import type { ReportBody } from './report-schema.ts';

export type { ReportBody };
/** Locked decisions (Locked_Decisions_PRD_v2.md section 4). The shape lives in decision-schema.ts. */
export type { Decision, DecisionRich, DecisionScope, DecisionStatus, DecisionVia } from './decision-schema.ts';

export type StickyColor = 'yellow' | 'pink' | 'blue' | 'green';

/** The temporary profile kept in localStorage (Build PRD 4). */
export interface Profile {
  userId: string;
  token: string;
  name: string;
  color: string;
}

/** Person shown in presence (awareness). Never stored. */
export interface Peer {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  /** World coordinates. */
  cursor?: { x: number; y: number } | null;
  selection?: string[];
}

/** A sticky note as the UI sees it, read out of the shared Yjs document. */
export interface Card {
  id: string;
  text: string;
  /** World coordinates of the top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  color: StickyColor;
  authorId: string;
  /** Author's display name. */
  author: string;
  authorColor: string;
  origin: 'human' | 'ai';
  sectionId: string | null;
  /** Set while someone has this note in a private canvas (MP-5). */
  reservedBy: string | null;
  reservedByName: string | null;
  reservedByColor: string | null;
  createdAt: number;
  /** Meeting addendum: set on notes placed from a meeting draft. */
  source?: 'meeting';
  meetingChipId?: string;
  kind?: 'idea' | 'question' | 'decision';
  sourceIds?: string[];
}

/** A labelled area. Notes belong to it by position, as in FigJam. */
export interface Section {
  id: string;
  title: string;
  titleSource: 'user' | 'ai';
  x: number;
  y: number;
  w: number;
  h: number;
  createdBy: string;
}

export interface ContextChip {
  id: string;
  type: 'link' | 'text' | 'meeting';
  /** The URL for a link, the original text for pasted text. */
  source: string;
  title: string;
  summary: string;
  status: 'pending' | 'ready' | 'error';
  message?: string;
  addedBy: string;
  addedByName: string;
  createdAt: number;
  /** Meeting chips: the source on the server (its passages back the notes drawn from it). */
  sourceId?: string;
  sourceName?: string;
  /** Meeting chips: the meeting text the AI read. Board context, so everyone on the board can read it. */
  fullText?: string;
}

/** blank: "New whiteboard". case: "Start a fresh case". example: "See a finished example". */
export type BoardKind = 'blank' | 'case' | 'mid' | 'example';

/** The decision card on the finished example. A static mock: written by the group, never by the AI. */
export interface BoardDecision {
  title: string;
  recordedBy: string;
  direction: string;
  reasons: string[];
  setAside: string[];
  effort: string;
  followUps: string[];
}

export interface BoardMeta {
  title: string;
  titleSource: 'user' | 'ai' | null;
  titleProposedBy: string | null;
  kind: BoardKind;
  decision: BoardDecision | null;
}

/** An approved report on the shared board. Drafts never reach the shared document. */
export interface BoardReport {
  id: string;
  explorationId: string;
  body: ReportBody;
  approvedBy: string;
  approvedByName: string;
  approvedByColor: string;
  approvedAt: number;
  createdAt: number;
  cardNoteIds: string[];
  /** Set when the author edited the AI's draft before approving. Older reports lack it. */
  editedAt?: number | null;
}

// ---------- Private data, served only to its owner ----------

export interface SnapshotNote {
  id: string;
  text: string;
  author: string;
}
export interface SnapshotChip {
  id: string;
  type: 'link' | 'text' | 'meeting';
  title: string;
  summary: string;
  source: string;
  /** Added inside the private canvas: only this exploration sees it. */
  private?: boolean;
  /** A private link whose page could not be read. Kept as a reference label only. */
  unread?: boolean;
}
/** Fixed at the moment the notes were taken, so the canvas context does not drift. */
export interface Snapshot {
  problem: string;
  boardTitle: string;
  notes: SnapshotNote[];
  chips: SnapshotChip[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: number;
}

export interface Exploration {
  id: string;
  boardId: string;
  status: 'open' | 'closed';
  snapshot: Snapshot;
  messages: ChatMessage[];
  draft: DraftReport | null;
  createdAt: number;
  ownerName: string;
  ownerColor: string;
  /** A saved exploration from the finished example, opened by someone else. */
  readOnly: boolean;
  /** Locked decisions in force on the board when fetched (owner only; empty on saved chats). */
  decisions?: import('./decision-schema.ts').Decision[];
}

export interface DraftReport {
  id: string;
  explorationId: string;
  status: 'draft' | 'approved';
  body: ReportBody;
  createdAt: number;
  /** When the author last edited the draft by hand, or null if it is as the AI wrote it. */
  editedAt?: number | null;
}

export interface Suggestion {
  id: string;
  text: string;
  prompt: string | null;
  used: boolean;
  createdAt: number;
  /** Locked decisions 8.3: the decision in force this idea goes against, if any (fresh ideas only). */
  conflictsWith?: string | null;
  conflictLine?: string;
}

export type OpinionAsk = 'strong' | 'missing' | 'risks' | 'connect' | 'custom';
