import { create } from 'zustand';
import type { Coverage, MeetingDraftView } from '../shared/meeting-schema.ts';
import type { BoardMeta, BoardReport, Card, ContextChip, Decision, Peer, Section } from '../shared/types.ts';

/** A session being built from a meeting, kept by source id so it survives the panel closing. */
export type MeetingBuild =
  | { status: 'building'; stage: 'reading' | 'drafting' | 'checking' }
  | { status: 'ready'; draftId: string; draft: MeetingDraftView; coverage: Coverage }
  | { status: 'error'; error: string };

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'refused';

export interface OpenCanvas {
  id: string;
  noteCount: number;
  messageCount: number;
  createdAt: number;
}

/** A private AI answer about selected notes (SN). Lives only in this browser. */
export interface OpinionState {
  noteIds: string[];
  ask: string;
  text: string;
  status: 'streaming' | 'done' | 'error';
  error?: string;
  opinionId?: string;
  citations: Record<string, string>;
}

interface State {
  // ---- Mirror of the shared document (read-only here; write through lib/board.ts) ----
  boardId: string | null;
  synced: boolean;
  status: ConnStatus;
  meta: BoardMeta;
  problem: string;
  cards: Card[];
  sections: Section[];
  chips: ContextChip[];
  reports: BoardReport[];
  /** Locked decisions: in force first (newest first), then reopened. */
  decisions: Decision[];
  peers: Peer[];
  canUndo: boolean;
  canRedo: boolean;

  // ---- Local UI state ----
  selected: string[];
  editingId?: string;
  /** Notes to outline while hovering a citation in an AI answer. */
  highlight: string[];
  /** Notes to select and frame when the board next renders (from a report's "Notes used"). */
  reveal?: string[];
  justLanded?: string;
  /** "Deleted 2 notes. Undo" toast. */
  deletedLabel?: string;
  /** "AI named this board" toast: the title it chose. Shown to everyone on the board. */
  titleToast?: string;
  /** "Locked: ..." toast after this person locks a decision. `notice` replaces the text when the lock was moved to the whole problem. */
  lockToast?: { id: string; text: string; notice?: string };
  /** Large-idea prompts for this person's own notes (6.2). */
  largeIdea: Record<string, { sectionTitle: string; reason: string }>;
  myCanvases: OpenCanvas[];
  opinion: OpinionState | null;
  /** Which left sidebar panel is showing (Board, Context, AI ideas, Answer). */
  dock: 'board' | 'context' | 'ideas' | 'answer';
  /** The sidebar panel is open beside the icon rail; closed leaves the rail only. */
  dockOpen: boolean;
  /** The Problem card floats on the board when true. Kept per browser, across boards. */
  problemPinned: boolean;
  /** Meeting addendum: builds by source id, the open review sheet, and the "draft is ready" toast. */
  meetingBuilds: Record<string, MeetingBuild>;
  meetingSheet?: { sourceId: string; chipId: string };
  meetingToast?: { sourceId: string; chipId: string };
  /** Bumped after a session lands, so owner chips re-read "Session built, N notes". */
  meetingTick: number;

  set: (patch: Partial<State>) => void;
}

export const emptyMeta: BoardMeta = { title: '', titleSource: null, titleProposedBy: null, kind: 'blank', decision: null };

export const initialBoardState = {
  boardId: null,
  synced: false,
  status: 'connecting' as ConnStatus,
  meta: emptyMeta,
  problem: '',
  cards: [] as Card[],
  sections: [] as Section[],
  chips: [] as ContextChip[],
  reports: [] as BoardReport[],
  decisions: [] as Decision[],
  peers: [] as Peer[],
  canUndo: false,
  canRedo: false,
  selected: [] as string[],
  editingId: undefined,
  highlight: [] as string[],
  reveal: undefined,
  justLanded: undefined,
  deletedLabel: undefined,
  titleToast: undefined,
  lockToast: undefined,
  largeIdea: {},
  myCanvases: [] as OpenCanvas[],
  opinion: null,
  dock: 'board' as State['dock'],
  dockOpen: true,
  meetingBuilds: {} as Record<string, MeetingBuild>,
  meetingSheet: undefined,
  meetingToast: undefined,
  meetingTick: 0,
};

const PINNED_KEY = 'problem-pinned';
const readPinned = () => {
  try {
    return localStorage.getItem(PINNED_KEY) !== 'false';
  } catch {
    return true;
  }
};
export function setProblemPinned(on: boolean) {
  try {
    localStorage.setItem(PINNED_KEY, String(on));
  } catch {
    // Storage blocked: keep the choice for this visit only.
  }
  useStore.setState({ problemPinned: on });
}

export const useStore = create<State>()((set) => ({
  ...initialBoardState,
  problemPinned: readPinned(),
  set: (patch) => set(patch),
}));
