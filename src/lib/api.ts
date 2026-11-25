import type { BoardKind, DraftReport, Exploration, OpinionAsk, ReportBody, Snapshot, SnapshotChip, Suggestion } from '../../shared/types.ts';
import type { Coverage, MeetingDraftView, Passage } from '../../shared/meeting-schema.ts';
import { getProfile } from './profile.ts';

// Every request carries the profile token (Build PRD 12). A hung request must end in an
// error the UI can recover from, not a spinner that never stops.
const TIMEOUT = { short: 30_000, ai: 60_000, report: 120_000, session: 180_000 };

export type MeetingStage = 'reading' | 'drafting' | 'checking';

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code?: string,
  ) {
    super(message);
  }
}

function headers(): HeadersInit {
  const p = getProfile();
  return { 'Content-Type': 'application/json', ...(p ? { Authorization: `Bearer ${p.token}` } : {}) };
}

async function call<T>(method: string, path: string, body?: unknown, timeout = TIMEOUT.short): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') throw new ApiError('The AI took too long to answer. Check your connection and try again.');
    throw new ApiError('Could not reach the server. Check that it is running and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  return data as T;
}

/**
 * POST that answers with Server-Sent Events: `delta` events carry text, then `done` or `error`.
 * EventSource only does GET, so this reads the stream by hand.
 */
async function stream<D>(path: string, body: unknown, onDelta: (t: string) => void, onEvent?: (event: string, payload: unknown) => void, timeout = TIMEOUT.ai): Promise<D> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') throw new ApiError('The AI took too long to answer. Check your connection and try again.');
    throw new ApiError('Could not reach the server. Check that it is running and try again.');
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let done: D | undefined;
  for (;;) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch {
      throw new ApiError('The connection dropped while the AI was answering. Try again.');
    }
    if (chunk.done) break;
    buf += chunk.value;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.+)$/m.exec(raw)?.[1];
      const data = /^data: (.+)$/m.exec(raw)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      if (event === 'delta') onDelta(payload.text);
      else if (event === 'done') done = payload;
      else if (event === 'error') throw new ApiError(payload.error, 0, payload.code);
      else onEvent?.(event, payload);
    }
  }
  if (!done) throw new ApiError('The answer stopped before it finished. Try again.');
  return done;
}

export const api = {
  health: () => call<{ ok: boolean; mock: boolean }>('GET', '/api/health'),
  createProfile: (name: string, color: string) => call<{ userId: string; token: string; name: string; color: string }>('POST', '/api/profile', { name, color }),
  updateProfile: (patch: { name?: string; color?: string }) => call<{ userId: string; name: string; color: string }>('PATCH', '/api/profile', patch),
  createBoard: (kind: BoardKind = 'blank') => call<{ boardId: string }>('POST', '/api/boards', { kind }),
  getBoard: (id: string) => call<{ boardId: string; createdAt: number }>('GET', `/api/boards/${id}`),

  title: (boardId: string) => call<{ title: string }>('POST', `/api/boards/${boardId}/ai/title`, {}, TIMEOUT.ai),
  largeIdea: (boardId: string, noteId: string, text: string) =>
    call<{ large: boolean; reason: string; sectionTitle: string }>('POST', `/api/boards/${boardId}/ai/large-idea`, { noteId, text }, TIMEOUT.ai),
  context: (boardId: string, type: 'link' | 'text', value: string) =>
    call<{ title: string; summary: string; status: 'ready' | 'error'; message?: string }>('POST', `/api/boards/${boardId}/ai/context`, { type, value }, TIMEOUT.ai),

  suggestions: (boardId: string) => call<{ suggestions: Suggestion[] }>('GET', `/api/boards/${boardId}/suggestions`),
  askSuggestions: (boardId: string, prompt?: string) => call<{ suggestions: Suggestion[] }>('POST', `/api/boards/${boardId}/ai/suggestions`, { prompt }, TIMEOUT.ai),
  markUsed: (boardId: string, sid: string) => call<{ ok: true }>('POST', `/api/boards/${boardId}/suggestions/${sid}/used`, {}),
  explain: (boardId: string, sid: string) => call<{ why: string; basedOn: string[] }>('POST', `/api/boards/${boardId}/ai/suggestions/${sid}/explain`, {}, TIMEOUT.ai),

  opinion: (boardId: string, noteIds: string[], ask: OpinionAsk, question: string | undefined, onDelta: (t: string) => void) =>
    stream<{ opinionId: string; citations: Record<string, string>; ask: string }>(`/api/boards/${boardId}/ai/opinion`, { noteIds, ask, question }, onDelta),

  myExplorations: (boardId: string) =>
    call<{ explorations: { id: string; status: string; noteCount: number; messageCount: number; createdAt: number }[] }>('GET', `/api/boards/${boardId}/explorations`),
  createExploration: (boardId: string, noteIds: string[], fromOpinionId?: string) =>
    call<{ explorationId: string; snapshot: Snapshot; noteIds: string[] }>('POST', '/api/explorations', { boardId, noteIds, fromOpinionId }),
  exploration: (id: string) => call<Exploration>('GET', `/api/explorations/${id}`),
  agentSession: (body: { boardId: string; noteIds: string[]; messages: { role: 'user' | 'assistant'; text: string }[]; explorationId?: string; sent: number }) =>
    call<Exploration>('POST', '/api/explorations/agent', body),
  addPrivateContext: (id: string, type: 'link' | 'text', value: string) =>
    call<{ chip: SnapshotChip; snapshot: Snapshot }>('POST', `/api/explorations/${id}/context`, { type, value }, TIMEOUT.ai),
  sendMessage: (id: string, content: string, onDelta: (t: string) => void) =>
    stream<{ messageId: string; userMessageId: string }>(`/api/explorations/${id}/messages`, { content }, onDelta),
  makeReport: (id: string) => call<{ reportId: string; status: 'draft'; body: ReportBody; createdAt: number }>('POST', `/api/explorations/${id}/report`, {}, TIMEOUT.report),
  approve: (reportId: string) =>
    call<{
      reportId: string;
      approvedAt: number;
      createdAt: number;
      editedAt: number | null;
      body: ReportBody;
      contributorName: string;
      contributorColor: string;
      explorationId: string;
      noteIds: string[];
    }>('POST', `/api/reports/${reportId}/approve`, {}),
  saveReport: (reportId: string, body: ReportBody) => call<{ body: ReportBody; editedAt: number }>('PUT', `/api/reports/${reportId}`, { body }),
  // ---- meeting addendum 10 ----
  addMeeting: (boardId: string, text: string, name?: string) =>
    call<{ sourceId: string; title: string; summary: string; kind: 'transcript' | 'summary'; coverage: Coverage; text: string }>('POST', `/api/boards/${boardId}/meetings`, { text, name }, TIMEOUT.ai),
  buildSession: (sourceId: string, onStage: (stage: MeetingStage) => void) =>
    stream<{ draftId: string; draft: MeetingDraftView; coverage: Coverage }>(
      `/api/meetings/${sourceId}/session`,
      {},
      () => {},
      (event, payload) => {
        if (event === 'stage') onStage((payload as { stage: MeetingStage }).stage);
      },
      TIMEOUT.session,
    ),
  meeting: (sourceId: string) =>
    call<{ status: 'ready'; kind: string; name: string | null; coverage: Coverage; builtNotes: number; latestDraft: { id: string; status: 'draft' | 'approved' | 'discarded'; noteCount: number } | null }>('GET', `/api/meetings/${sourceId}`),
  meetingDraft: (draftId: string) => call<{ draftId: string; sourceId: string; status: string; draft: MeetingDraftView; coverage: Coverage }>('GET', `/api/meeting-drafts/${draftId}`),
  approveMeetingDraft: (draftId: string, body: { noteCount: number; sectionCount: number; titleUsed: boolean; problemUsed: boolean }) =>
    call<{ ok: true }>('POST', `/api/meeting-drafts/${draftId}/approve`, body),
  discardMeetingDraft: (draftId: string) => call<{ ok: true }>('POST', `/api/meeting-drafts/${draftId}/discard`, {}),
  passages: (sourceId: string, ids: string[]) => call<{ passages: Passage[] }>('GET', `/api/meetings/${sourceId}/passages?ids=${encodeURIComponent(ids.join(','))}`),
  deleteMeeting: (sourceId: string) => call<{ ok: true }>('DELETE', `/api/meetings/${sourceId}`),

  closeExploration: (id: string) => call<{ ok: true; noteIds: string[] }>('POST', `/api/explorations/${id}/close`, {}),
};

export type { DraftReport };
