import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import type { BoardReport, Peer, Section, StickyColor } from '../../shared/types.ts';
import { coverOf, inForce, readDecisions, relockDecisionIn, reopenDecisionIn, writeDecision, type DecisionInput, type DecisionVia } from '../../shared/decision-schema.ts';
import type { ApprovedSession } from '../../shared/meeting-schema.ts';
import { layoutSessionDraft, type Rect } from '../../shared/session-layout.ts';
import { PROBLEM_NODE_ID, STICKY, applyTextDiff, membersOf, parts, readBoard, writeNote, writeSection } from '../../shared/ydoc.ts';
import { initialBoardState, useStore } from '../store.ts';
import { getProfile, myNoteColor } from './profile.ts';

// One live board at a time: the shared Yjs document, its websocket provider, presence
// and an undo manager scoped to this person's own edits (WB-6).

const LOCAL = Symbol('local-edit');

let doc: Y.Doc | null = null;
let provider: HocuspocusProvider | null = null;
let undo: Y.UndoManager | null = null;
let currentId: string | null = null;
let frame = 0;

const uid = () => Math.random().toString(36).slice(2, 12);

let timer = 0;

function mirror() {
  if (!doc) return;
  cancelAnimationFrame(frame);
  window.clearTimeout(timer);
  // One copy per frame, with a short timer as a backstop: browsers pause animation frames in
  // background tabs (and some embedded views pause them without marking the tab hidden), and the
  // board must still show what others did (user report, 25 Nov). Whichever fires first copies.
  const run = () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    mirrorNow();
  };
  frame = requestAnimationFrame(run);
  timer = window.setTimeout(run, document.hidden ? 50 : 150);
}

// Coming back to the tab: copy at once, in case anything was missed while it was hidden.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && doc) mirrorNow();
  });
}

/** Copy the shared document into the UI store. Batched to one per frame by mirror(). */
function mirrorNow(extra: Partial<ReturnType<typeof useStore.getState>> = {}) {
  {
    if (!doc) return;
    const b = readBoard(doc);
    const s = useStore.getState();
    // Drop selections of notes that no longer exist (deleted by someone else).
    const ids = new Set(b.notes.map((n) => n.id));
    useStore.setState({
      meta: b.meta,
      problem: b.problem,
      problemPosition: b.problemPosition,
      cards: b.notes,
      sections: b.sections,
      chips: b.chips,
      reports: b.reports,
      decisions: b.decisions,
      selected: s.selected.filter((id) => ids.has(id) || b.sections.some((x) => x.id === id)),
      canUndo: (undo?.undoStack.length ?? 0) > 0,
      canRedo: (undo?.redoStack.length ?? 0) > 0,
      ...extra,
    });
  }
}

function readPeers() {
  if (!provider?.awareness) return;
  const self = provider.awareness.clientID;
  const me = getProfile()?.userId;
  const peers: Peer[] = [];
  provider.awareness.getStates().forEach((st, clientId) => {
    // Skip this browser, and this person's own stale entry left by a reload (it times out after 30 s).
    if (clientId === self || !st.user || st.user.userId === me) return;
    peers.push({ clientId, ...st.user, cursor: st.cursor ?? null, selection: st.selection ?? [] });
  });
  useStore.setState({ peers });
}

export function connect(boardId: string) {
  if (currentId === boardId && doc) return;
  disconnect();
  const profile = getProfile();
  if (!profile) return;
  currentId = boardId;
  doc = new Y.Doc();
  useStore.setState({ ...initialBoardState, boardId, status: 'connecting' });

  const p = parts(doc);
  undo = new Y.UndoManager([p.notes, p.sections, p.problem, p.meta, p.context, p.decisions], { trackedOrigins: new Set([LOCAL]), captureTimeout: 400 });
  undo.on('stack-item-added', mirror);
  undo.on('stack-item-popped', mirror);
  doc.on('update', mirror);

  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/collab`;
  provider = new HocuspocusProvider({
    url: wsUrl,
    name: boardId,
    document: doc,
    token: profile.token,
    onStatus: ({ status }) => {
      const s = useStore.getState().status;
      if (s === 'refused') return;
      // MP-4: after the first sync, a drop shows "Reconnecting"; edits made meanwhile merge on resync.
      useStore.setState({ status: status === 'connected' ? 'connected' : useStore.getState().synced ? 'reconnecting' : 'connecting' });
    },
    onSynced: () => {
      // The board's content and the "synced" flag must land together, or the first-open
      // framing would see an empty board.
      cancelAnimationFrame(frame);
      mirrorNow({ synced: true, status: 'connected' });
    },
    onAuthenticationFailed: () => useStore.setState({ status: 'refused' }),
  });
  provider.awareness?.setLocalStateField('user', { userId: profile.userId, name: profile.name, color: profile.color });
  provider.awareness?.on('change', readPeers);
}

export function disconnect() {
  cancelAnimationFrame(frame);
  window.clearTimeout(timer);
  provider?.destroy();
  undo?.destroy();
  doc?.destroy();
  provider = null;
  undo = null;
  doc = null;
  currentId = null;
}

/** Re-announce the name and colour after the person changes them. */
export function refreshPresence() {
  const profile = getProfile();
  if (profile) provider?.awareness?.setLocalStateField('user', { userId: profile.userId, name: profile.name, color: profile.color });
}

// ---------- presence ----------

let lastCursor = 0;
let cursorTimer = 0;
/** World coordinates. Throttled to about 20 updates a second (WB-11). */
export function setCursor(pos: { x: number; y: number } | null) {
  const send = () => {
    lastCursor = performance.now();
    provider?.awareness?.setLocalStateField('cursor', pos);
  };
  clearTimeout(cursorTimer);
  if (pos === null || performance.now() - lastCursor > 50) send();
  else cursorTimer = window.setTimeout(send, 50);
}

export function setSelectionPresence(ids: string[]) {
  provider?.awareness?.setLocalStateField('selection', ids);
}

// ---------- edits (all tagged LOCAL so undo only reverts this person's own changes) ----------

const tx = (fn: (d: Y.Doc) => void) => {
  if (doc) doc.transact(() => fn(doc!), LOCAL);
};

function me() {
  const p = getProfile()!;
  return { id: p.userId, name: p.name, color: p.color };
}

function sectionAt(x: number, y: number, w = STICKY, h = STICKY): string | null {
  const s = useStore.getState().sections.find((s) => membersOf(s, [{ x, y, w, h } as never]).length > 0);
  return s?.id ?? null;
}

export const board = {
  /** New note centred on a world point. Returns its id. */
  addNote(at: { x: number; y: number }, opts: { text?: string; origin?: 'human' | 'ai'; color?: StickyColor } = {}) {
    const id = uid();
    const u = me();
    // Each person has a note colour (assigned, or picked in the profile menu).
    const color = opts.color ?? myNoteColor();
    const x = Math.round(at.x - STICKY / 2);
    const y = Math.round(at.y - STICKY / 2);
    tx((d) =>
      writeNote(d, {
        id,
        text: opts.text ?? '',
        x,
        y,
        color,
        authorId: u.id,
        authorName: u.name,
        authorColor: u.color,
        origin: opts.origin ?? 'human',
        sectionId: sectionAt(x, y),
      }),
    );
    return id;
  },

  /** Live, character-level edit of a note (Y.Text), so two people can type in one note. */
  setText(id: string, text: string) {
    tx((d) => {
      const t = parts(d).notes.get(id)?.get('text');
      if (t instanceof Y.Text) applyTextDiff(t, text);
    });
  },

  noteText(id: string): Y.Text | null {
    const t = doc ? parts(doc).notes.get(id)?.get('text') : null;
    return t instanceof Y.Text ? t : null;
  },

  setColor(ids: string[], color: StickyColor) {
    tx((d) => ids.forEach((id) => parts(d).notes.get(id)?.set('color', color)));
  },

  /** Commit positions after a drag. Last write wins (MP-3). */
  moveItems(moves: { id: string; x: number; y: number }[]) {
    tx((d) => {
      const p = parts(d);
      for (const m of moves) {
        if (m.id === PROBLEM_NODE_ID) {
          p.meta.set('problemPosition', { x: Math.round(m.x), y: Math.round(m.y) });
          continue;
        }
        const n = p.notes.get(m.id);
        const s = p.sections.get(m.id);
        const target = n ?? s;
        if (!target) continue;
        target.set('x', Math.round(m.x));
        target.set('y', Math.round(m.y));
      }
      // Keep each moved note's sectionId in step with where it now sits.
      const sections = useStore.getState().sections.map((s) => {
        const mv = moves.find((m) => m.id === s.id);
        return mv ? { ...s, x: mv.x, y: mv.y } : s;
      });
      for (const m of moves) {
        const n = p.notes.get(m.id);
        if (!n) continue;
        const w = (n.get('w') as number) ?? STICKY;
        const h = (n.get('h') as number) ?? STICKY;
        const inS = sections.find((s) => membersOf(s, [{ x: m.x, y: m.y, w, h } as never]).length > 0);
        n.set('sectionId', inS?.id ?? null);
      }
    });
  },

  deleteItems(ids: string[]) {
    const s = useStore.getState();
    const cards = s.cards.filter((c) => ids.includes(c.id));
    const sections = s.sections.filter((x) => ids.includes(x.id));
    if (!cards.length && !sections.length) return;
    tx((d) => {
      const p = parts(d);
      ids.forEach((id) => {
        p.notes.delete(id);
        p.sections.delete(id);
      });
      // Locked decisions PRD 4: a deleted section's decision stays locked and covers the whole
      // problem. The old sectionId is kept so the card can say "Section deleted". Same undo step.
      p.decisions.forEach((m) => {
        if (m.get('scope') === 'section' && sections.some((x) => x.id === m.get('sectionId'))) m.set('scope', 'board');
      });
    });
    // A note deleted while still empty is a cancelled add: no undo toast for that.
    const worth = cards.some((c) => c.text.trim()) || sections.length > 0;
    const label = [
      cards.length ? `${cards.length} ${cards.length === 1 ? 'note' : 'notes'}` : '',
      sections.length ? `${sections.length} ${sections.length === 1 ? 'section' : 'sections'}` : '',
    ]
      .filter(Boolean)
      .join(' and ');
    useStore.setState({ selected: s.selected.filter((x) => !ids.includes(x)), deletedLabel: worth ? label : s.deletedLabel });
  },

  addSection(at: { x: number; y: number }, opts: { title?: string; titleSource?: 'user' | 'ai'; rect?: { x: number; y: number; w: number; h: number } } = {}) {
    const id = uid();
    const n = useStore.getState().sections.length + 1;
    const w = opts.rect?.w ?? 720;
    const h = opts.rect?.h ?? 320;
    const s: Section = {
      id,
      title: opts.title ?? `Section ${n}`,
      titleSource: opts.titleSource ?? 'user',
      x: Math.round(opts.rect?.x ?? at.x - w / 2),
      y: Math.round(opts.rect?.y ?? at.y - 32),
      w,
      h,
      createdBy: me().id,
    };
    tx((d) => writeSection(d, s));
    return id;
  },

  updateSection(id: string, patch: Partial<Pick<Section, 'title' | 'titleSource' | 'x' | 'y' | 'w' | 'h'>>) {
    tx((d) => {
      const m = parts(d).sections.get(id);
      if (!m) return;
      Object.entries(patch).forEach(([k, v]) => m.set(k, typeof v === 'number' ? Math.round(v) : v));
    });
  },

  problemText(): Y.Text | null {
    return doc ? parts(doc).problem : null;
  },

  setProblem(text: string) {
    tx((d) => applyTextDiff(parts(d).problem, text));
  },

  setTitle(title: string, source: 'user' | 'ai') {
    tx((d) => {
      const m = parts(d).meta;
      m.set('title', title.trim());
      m.set('titleSource', title.trim() ? source : null);
    });
  },

  /**
   * 6.1: claim the right to propose a title. Yjs has no compare-and-set across browsers,
   * so claim, wait for the round trip, and only the browser whose claim survived calls the AI.
   */
  async claimTitle(): Promise<boolean> {
    if (!doc) return false;
    const u = me();
    const m = parts(doc).meta;
    if (m.get('titleProposedBy') || m.get('titleSource')) return false;
    doc.transact(() => m.set('titleProposedBy', u.id)); // not LOCAL: undo should not revert a claim
    await new Promise((r) => setTimeout(r, 900));
    return parts(doc).meta.get('titleProposedBy') === u.id && !parts(doc).meta.get('titleSource');
  },

  /** Release the title claim (after a failed AI call, or on leaving mid-claim) so anyone can claim again. */
  resetTitleClaim() {
    doc?.transact(() => parts(doc!).meta.set('titleProposedBy', null));
  },

  // ---- context chips (CX) ----
  /** For a meeting, `source` is only the name the person gave it: the transcript never enters the shared doc. */
  addChip(type: 'link' | 'text' | 'meeting', source: string) {
    const id = uid();
    const u = me();
    tx((d) => {
      const m = new Y.Map<unknown>();
      m.set('type', type);
      m.set('source', source);
      m.set('title', type === 'link' ? source : type === 'meeting' ? source || 'Meeting' : source.slice(0, 60));
      m.set('summary', '');
      m.set('status', 'pending');
      m.set('addedBy', u.id);
      m.set('addedByName', u.name);
      m.set('createdAt', Date.now());
      parts(d).context.set(id, m);
    });
    return id;
  },

  updateChip(id: string, patch: { title?: string; summary?: string; status?: 'ready' | 'error'; message?: string; sourceId?: string; sourceName?: string; fullText?: string }) {
    doc?.transact(() => {
      const m = parts(doc!).context.get(id);
      if (m) Object.entries(patch).forEach(([k, v]) => m.set(k, v));
    });
  },

  removeChip(id: string) {
    tx((d) => parts(d).context.delete(id));
  },

  /** Take back a chip whose add failed. Not an undoable edit. */
  dropChip(id: string) {
    doc?.transact(() => parts(doc!).context.delete(id));
  },

  // ---- private canvas and reports ----
  /** MP-5: a dot in the person's colour on notes they took into a private canvas. */
  reserve(ids: string[], on: boolean) {
    const u = me();
    doc?.transact(() => {
      const p = parts(doc!);
      ids.forEach((id) => {
        const n = p.notes.get(id);
        if (!n) return;
        if (on) {
          n.set('reservedBy', u.id);
          n.set('reservedByName', u.name);
          n.set('reservedByColor', u.color);
        } else if (n.get('reservedBy') === u.id) {
          n.set('reservedBy', null);
          n.set('reservedByName', null);
          n.set('reservedByColor', null);
        }
      });
    });
  },

  /** PC-6: only an approved report is written to the shared document. */
  addReport(r: BoardReport) {
    doc?.transact(() => parts(doc!).reports.set(r.id, r));
  },

  // ---- meeting addendum 9 ----
  /**
   * Put an approved meeting session on the board in one transaction, tagged LOCAL, with the undo
   * capture closed on both sides, so one Undo removes the notes, the sections, the title and the
   * problem text together. Returns the new ids and the group's bounds, for framing.
   */
  placeSession(s: ApprovedSession, chipId: string, viewCentre: { x: number; y: number }) {
    if (!doc || !undo) return null;
    const st = useStore.getState();
    const existing: Rect[] = [...st.cards, ...st.sections].map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
    const laid = layoutSessionDraft({ sections: s.sections, existing, viewCentre });
    const u = me();
    const ids: string[] = [];
    const sids: string[] = [];
    const t = Date.now();
    let titleUsed = false;
    let decisionCount = 0;
    let problemUsed = false;
    undo.stopCapturing();
    tx((d) => {
      const p = parts(d);
      laid.sections.forEach((sec, i) => {
        const sid = uid();
        ids.push(sid);
        sids.push(sid);
        writeSection(d, { id: sid, title: sec.title, titleSource: 'ai', x: sec.x, y: sec.y, w: sec.w, h: sec.h, createdBy: u.id });
        sec.notes.forEach((n, j) => {
          const nid = uid();
          ids.push(nid);
          writeNote(d, {
            id: nid,
            text: n.text,
            x: n.x,
            y: n.y,
            color: n.color,
            authorId: u.id,
            authorName: u.name,
            authorColor: u.color,
            origin: 'ai',
            sectionId: sid,
            createdAt: t + i * 100 + j, // reading order
            meeting: { chipId, kind: n.kind, sourceIds: n.sourceIds },
          });
        });
      });
      // Only an untitled board takes the draft's title; a person's title is never replaced.
      if (!p.meta.get('title') && s.title.trim()) {
        p.meta.set('title', s.title.trim());
        p.meta.set('titleSource', 'ai');
        titleUsed = true;
      }
      if (s.problem && !p.problem.toString().trim()) {
        applyTextDiff(p.problem, s.problem);
        problemUsed = true;
      }
      // Locked decisions 9A: ticked meeting decisions start locked, in this person's name, in the
      // same transaction, so one Undo removes them with the notes.
      for (const dec of s.decisions ?? []) {
        const sid = dec.sectionIndex !== null ? sids[dec.sectionIndex] : undefined;
        writeDecision(
          d,
          { text: dec.text, reasons: dec.reasons, scope: sid ? 'section' : 'board', sectionId: sid ?? null, sourceNoteIds: [], reportIds: [] },
          u,
          { via: 'meeting', meetingChipId: chipId },
        );
        decisionCount++;
      }
    });
    undo.stopCapturing();
    return { ids, bounds: laid.bounds, titleUsed, problemUsed, decisionCount, noteCount: laid.sections.reduce((a, x) => a + x.notes.length, 0), sectionCount: laid.sections.length };
  },

  // ---- Locked decisions (Locked_Decisions_PRD_v2.md 5) ----
  /**
   * Lock a new decision in this person's name, as one undo step. If the section is already
   * covered by a decision in force, it is locked for the whole problem instead (downgraded).
   */
  lockDecision(input: DecisionInput, opts: { via?: DecisionVia; meetingChipId?: string | null } = {}) {
    if (!doc || !undo) return null;
    let out: { id: string; downgraded: boolean } | null = null;
    undo.stopCapturing();
    tx((d) => {
      out = writeDecision(d, input, me(), opts);
    });
    undo.stopCapturing();
    return out as { id: string; downgraded: boolean } | null;
  },

  /**
   * One-click lock from the selection bar (user request, 25 Nov): each note becomes its own decision,
   * worded as the note, with no reason needed. Notes already behind a decision in force are skipped.
   * One undo step for the lot. Returns the new decision ids.
   */
  lockNotes(noteIds: string[]) {
    if (!doc || !undo) return [] as string[];
    const ids: string[] = [];
    undo.stopCapturing();
    tx((d) => {
      const decisions = readDecisions(d);
      const locked = new Set(inForce(decisions).flatMap((x) => x.sourceNoteIds));
      for (const id of new Set(noteIds)) {
        const text = parts(d).notes.get(id)?.get('text')?.toString().trim();
        if (!text || locked.has(id)) continue;
        const statement = text.slice(0, 300);
        const previous = decisions.find((decision) =>
          decision.status === 'reopened' && decision.scope === 'board' && decision.text === statement
          && decision.sourceNoteIds.length === 1 && decision.sourceNoteIds[0] === id
          && !decision.reasons && !decision.reportIds.length && decision.via === 'person',
        );
        if (previous) {
          relockDecisionIn(d, previous.id, me());
          ids.push(previous.id);
        } else {
          ids.push(writeDecision(d, { text: statement, scope: 'board', sourceNoteIds: [id] }, me()).id);
        }
      }
    });
    undo.stopCapturing();
    return ids;
  },

  unlockNotes(noteIds: string[]) {
    if (!undo) return;
    const selected = new Set(noteIds);
    undo.stopCapturing();
    tx((d) => {
      for (const decision of inForce(readDecisions(d))) {
        if (decision.sourceNoteIds.some((id) => selected.has(id))) reopenDecisionIn(d, decision.id, me());
      }
    });
    undo.stopCapturing();
  },

  /** Unlock: the decision stays on the board as Reopened, with who and when. */
  reopenDecision(id: string) {
    if (!undo) return;
    undo.stopCapturing();
    tx((d) => reopenDecisionIn(d, id, me()));
    undo.stopCapturing();
  },

  /** Lock again with a new name and time. A section taken meanwhile by another decision moves it to the whole problem. */
  relockDecision(id: string) {
    if (!undo || !doc) return { downgraded: false };
    let downgraded = false;
    undo.stopCapturing();
    tx((d) => {
      const m = parts(d).decisions.get(id);
      const sid = m?.get('sectionId');
      if (m && m.get('scope') === 'section' && typeof sid === 'string') {
        const taken = coverOf(readDecisions(d).filter((x) => x.id !== id), sid);
        const exists = parts(d).sections.has(sid);
        if (taken || !exists) {
          m.set('scope', 'board');
          downgraded = Boolean(taken);
        }
      }
      relockDecisionIn(d, id, me());
    });
    undo.stopCapturing();
    return { downgraded };
  },

  undo() {
    undo?.undo();
    useStore.setState({ deletedLabel: undefined });
  },
  redo() {
    undo?.redo();
  },
};

/**
 * Whiteboard agent: apply a reviewed plan as one undo step, the same way placeSession does
 * (capture closed on both sides, one LOCAL transaction). Returns false when no board is open.
 */
export function applyAsOneStep(fn: (doc: Y.Doc) => void): boolean {
  if (!doc || !undo) return false;
  undo.stopCapturing();
  doc.transact(() => fn(doc!), LOCAL);
  undo.stopCapturing();
  return true;
}
