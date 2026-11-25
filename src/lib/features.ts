import type { OpinionAsk } from '../../shared/types.ts';
import { NOTE_GAP, SECTION_HEAD, SECTION_PAD, STICKY } from '../../shared/ydoc.ts';
import { useStore } from '../store.ts';
import { api } from './api.ts';
import { board } from './board.ts';

// ---------- 6.2 Large-idea check ----------

const timers = new Map<string, number>();

/** Cheap client-side filter first; only notes that look large are sent to the AI. */
export function looksLarge(text: string) {
  const list = /(^|\n)\s*([-*•]|\d+[.)])\s+\S/.test(text) && text.split('\n').filter((l) => l.trim()).length >= 2;
  return text.length >= 120 || list || (text.match(/\?/g)?.length ?? 0) >= 2;
}

/** Run once per edit session, 1.5 s after the note is committed. Only the author ever sees the prompt. */
export function checkLargeIdea(noteId: string, text: string) {
  clearTimeout(timers.get(noteId));
  if (!looksLarge(text)) return;
  timers.set(
    noteId,
    window.setTimeout(async () => {
      timers.delete(noteId);
      const boardId = useStore.getState().boardId;
      if (!boardId) return;
      try {
        const r = await api.largeIdea(boardId, noteId, text);
        if (r.large) useStore.setState((s) => ({ largeIdea: { ...s.largeIdea, [noteId]: { sectionTitle: r.sectionTitle, reason: r.reason } } }));
      } catch {
        /* a quiet nicety: no prompt if the check fails */
      }
    }, 1500),
  );
}

/** Make a section around the note with the AI's title (editable; stays marked AI until renamed). */
export function acceptLargeIdea(noteId: string) {
  const s = useStore.getState();
  const note = s.cards.find((c) => c.id === noteId);
  const idea = s.largeIdea[noteId];
  if (!note || !idea) return;
  const PAD = SECTION_PAD;
  const HEAD = SECTION_HEAD;
  // Room for the note plus two more beside it, so the parts have somewhere to go.
  let rect = { x: note.x - PAD, y: note.y - HEAD, w: STICKY * 3 + NOTE_GAP * 2 + PAD * 2, h: note.h + HEAD + PAD };
  const overlaps = (r: typeof rect) =>
    s.sections.some((x) => r.x < x.x + x.w && r.x + r.w > x.x && r.y < x.y + x.h && r.y + r.h > x.y);
  // Narrow it to the note alone if the wide version would sit on another section.
  if (overlaps(rect)) rect = { ...rect, w: note.w + PAD * 2 };
  board.addSection({ x: 0, y: 0 }, { title: idea.sectionTitle || 'New section', titleSource: 'ai', rect });
  const { [noteId]: _done, ...rest } = s.largeIdea;
  useStore.setState({ largeIdea: rest });
}

// ---------- 10. Ask AI about selected notes ----------

export const ASKS: { id: Exclude<OpinionAsk, 'custom'>; label: string }[] = [
  { id: 'strong', label: 'What is strong here' },
  { id: 'missing', label: 'What is missing' },
  { id: 'risks', label: 'What could go wrong' },
  { id: 'connect', label: 'How do these connect' },
];

let opinionRun = 0;

/** The answer streams into the dock and stays in this browser until saved (SN-2, SN-4). */
export async function runOpinion(noteIds: string[], ask: OpinionAsk, question?: string) {
  const boardId = useStore.getState().boardId;
  if (!boardId || !noteIds.length) return;
  const run = ++opinionRun;
  const label = ask === 'custom' ? question?.trim() || 'Your question' : ASKS.find((a) => a.id === ask)!.label;
  // Labels follow the order the notes were sent in, so [N1] can be shown while the answer streams.
  const citations = Object.fromEntries(noteIds.map((id, i) => [`N${i + 1}`, id]));
  useStore.setState({ dock: 'answer', dockOpen: true, opinion: { noteIds, ask: label, text: '', status: 'streaming', citations } });
  const patch = (p: Partial<NonNullable<ReturnType<typeof useStore.getState>['opinion']>>) => {
    if (run !== opinionRun) return; // a newer question replaced this one
    const cur = useStore.getState().opinion;
    if (cur) useStore.setState({ opinion: { ...cur, ...p } });
  };
  try {
    const done = await api.opinion(boardId, noteIds, ask, question, (d) => {
      const cur = useStore.getState().opinion;
      if (run === opinionRun && cur) useStore.setState({ opinion: { ...cur, text: cur.text + d } });
    });
    patch({ status: 'done', opinionId: done.opinionId, citations: done.citations });
  } catch (e) {
    patch({ status: 'error', error: e instanceof Error ? e.message : 'The AI did not answer.' });
  }
}
