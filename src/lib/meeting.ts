import type { ApprovedSession } from '../../shared/meeting-schema.ts';
import { useStore, type MeetingBuild } from '../store.ts';
import { api } from './api.ts';
import { board } from './board.ts';

// Meeting addendum 3: building a session from a meeting chip, resuming a saved draft,
// and landing the approved session on the board.

const setBuild = (sourceId: string, b: MeetingBuild | null) =>
  useStore.setState((s) => {
    const next = { ...s.meetingBuilds };
    if (b) next[sourceId] = b;
    else delete next[sourceId];
    return { meetingBuilds: next };
  });

/** Opens the sheet if the Context panel is open; otherwise a toast, without taking focus (3.3). */
function announceReady(sourceId: string, chipId: string) {
  const s = useStore.getState();
  if (s.dockOpen && s.dock === 'context') useStore.setState({ meetingSheet: { sourceId, chipId }, meetingToast: undefined });
  else useStore.setState({ meetingToast: { sourceId, chipId } });
}

export async function buildSession(sourceId: string, chipId: string) {
  const cur = useStore.getState().meetingBuilds[sourceId];
  if (cur?.status === 'building') return;
  setBuild(sourceId, { status: 'building', stage: 'reading' });
  try {
    const r = await api.buildSession(sourceId, (stage) => setBuild(sourceId, { status: 'building', stage }));
    setBuild(sourceId, { status: 'ready', draftId: r.draftId, draft: r.draft, coverage: r.coverage });
    announceReady(sourceId, chipId);
  } catch (e) {
    setBuild(sourceId, { status: 'error', error: e instanceof Error ? e.message : 'The draft could not be built. Try again.' });
  }
}

/** After a reload: fetch the saved draft and open the sheet. */
export async function resumeDraft(sourceId: string, chipId: string, draftId: string) {
  try {
    const r = await api.meetingDraft(draftId);
    setBuild(sourceId, { status: 'ready', draftId: r.draftId, draft: r.draft, coverage: r.coverage });
    useStore.setState({ meetingSheet: { sourceId, chipId } });
  } catch (e) {
    setBuild(sourceId, { status: 'error', error: e instanceof Error ? e.message : 'The draft could not be opened.' });
  }
}

export function openSheet(sourceId: string, chipId: string) {
  useStore.setState({ meetingSheet: { sourceId, chipId }, meetingToast: undefined });
}

export async function discardDraft(sourceId: string, draftId: string) {
  setBuild(sourceId, null);
  useStore.setState((s) => ({ meetingSheet: undefined, meetingToast: undefined, meetingTick: s.meetingTick + 1 }));
  await api.discardMeetingDraft(draftId).catch(() => {});
}

/** 3.5 and 9.10: write in one transaction, then tell the server; retry that once in the background. */
export function approveSession(sourceId: string, chipId: string, draftId: string, approved: ApprovedSession, viewCentre: { x: number; y: number }) {
  const placed = board.placeSession(approved, chipId, viewCentre);
  if (!placed) return null;
  setBuild(sourceId, null);
  useStore.setState({ meetingSheet: undefined, meetingToast: undefined });
  const body = { noteCount: placed.noteCount, sectionCount: placed.sectionCount, titleUsed: placed.titleUsed, problemUsed: placed.problemUsed };
  const tick = () => useStore.setState((s) => ({ meetingTick: s.meetingTick + 1 }));
  api
    .approveMeetingDraft(draftId, body)
    .catch(() => new Promise((r) => setTimeout(r, 2000)).then(() => api.approveMeetingDraft(draftId, body)))
    .catch(() => {})
    .finally(tick);
  return placed;
}

/** The owner removes the chip: the private source and its drafts go too. Notes on the board stay. */
export function removeMeetingChip(chipId: string, sourceId: string | undefined) {
  board.removeChip(chipId);
  if (sourceId) {
    setBuild(sourceId, null);
    void api.deleteMeeting(sourceId).catch(() => {});
  }
}
