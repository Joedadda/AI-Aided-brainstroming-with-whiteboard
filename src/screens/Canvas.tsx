import { ArrowUp, ChevronLeft, Minimize2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Exploration, SnapshotChip } from '../../shared/types.ts';
import { AgentChat, ChatTurn, useAgentTranscript } from '../canvas/AgentChat.tsx';
import { RunArea } from '../canvas/AgentPanel.tsx';
import { ContextIcon, sourceLine } from '../canvas/ContextIcon.tsx';
import { SidebarRail } from '../canvas/Dock.tsx';
import { closeAgent, discardRun, openAgent, setCanvasDraft, useAgent } from '../lib/agent.ts';
import { ApiError, api } from '../lib/api.ts';
import { useConversation } from '../lib/conversation.ts';
import { go } from '../lib/router.ts';
import { refreshSessions } from '../lib/sessions.ts';
import { animateSidebar } from '../lib/sidebar-motion.ts';
import { useStore } from '../store.ts';
import { Button } from '../ui/Button.tsx';
import { ScrollArea } from '../ui/ScrollArea.tsx';
import { Tooltip } from '../ui/Tooltip.tsx';
import { cx } from '../ui/cx.ts';
import { isEmptyReport } from '../../shared/report-schema.ts';
import { DraftSheet } from './DraftSheet.tsx';
import { LockedBlock } from './LockedBlock.tsx';

const HEADER_ICON_BUTTON = 'pressable key-quiet flex size-11 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50';

function minimiseToSidebar(boardId: string) {
  animateSidebar(() => {
    openAgent();
    go({ name: 'board', boardId });
  });
}
/** The private canvas (Build PRD 11). Everything here is served only to its owner (PC-8). */
export function Canvas({ boardId, explorationId, initialExploration, reviewReport = false }: { boardId: string; explorationId: string; initialExploration?: Exploration; reviewReport?: boolean }) {
  const [ex, setEx] = useState<Exploration | null>(() => initialExploration ?? null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  const load = useCallback(() => {
    api
      .exploration(explorationId)
      .then((result) => {
        if (result.boardId !== boardId) throw new ApiError('This private canvas belongs to a different board.', 404);
        setEx(result);
      })
      .catch((e) => setError({ status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : 'Could not load.' }));
  }, [boardId, explorationId]);
  useEffect(() => {
    if (!initialExploration) load();
  }, [initialExploration, load]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-surface px-8 text-center">
        <p className="max-w-[420px] text-ink-2">
          {error.status === 404 ? 'This private canvas belongs to someone else, or no longer exists. You will see its report on the board once they approve it.' : error.message}
        </p>
        <Button onClick={() => go({ name: 'board', boardId })}>Back to the board</Button>
      </div>
    );
  }
  if (!ex) {
    return (
      <p role="status" className="flex flex-1 items-center justify-center bg-surface text-ink-3">
        Opening your canvas…
      </p>
    );
  }
  return (
    <div className={cx('flex min-h-0 flex-1 bg-surface', initialExploration ? 'sidebar-handoff' : 'screen-enter')}>
      <SidebarRail
        tab="agent"
        onSelect={(tab) => {
          if (tab === 'agent') {
            minimiseToSidebar(boardId);
            return;
          }
          useAgent.setState({ open: false });
          useStore.setState({ dock: tab, dockOpen: true });
          go({ name: 'board', boardId });
        }}
      />
      <CanvasView boardId={boardId} ex={ex} setEx={setEx} reviewReport={reviewReport} />
    </div>
  );
}

function CanvasView({ boardId, ex, setEx, reviewReport }: { boardId: string; ex: Exploration; setEx: (fn: (e: Exploration | null) => Exploration | null) => void; reviewReport: boolean }) {
  const deciding = ex.kind === 'decide';
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | undefined>();
  const draftInFlight = useRef(false);
  const autoReview = useRef(reviewReport);
  const chatPending = useConversation((s) => s.pending?.explorationId === ex.id);
  const currentRun = useAgent((s) => s.run);
  const run = currentRun?.explorationId === ex.id ? currentRun : null;
  const transcript = useAgentTranscript(ex, setEx, chatPending);
  const agentBusy = run?.status === 'running' || transcript.busy;
  const selectedCount = (ex.snapshot.reservedNoteIds ?? ex.snapshot.notes).length;

  useEffect(() => {
    if (!deciding && ex.status === 'open' && !ex.readOnly) useAgent.setState({ activeCanvasId: ex.id });
  }, [deciding, ex.id, ex.status, ex.readOnly]);

  // Locked decisions 7.4: what the person has seen. Reset when the board first syncs and after each
  // reply, so the New and Reopened marks clear after their next message.
  const synced = useStore((s) => s.synced);
  const [seen, setSeen] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!synced || chatPending) return;
    setSeen(new Map(useStore.getState().decisions.map((d) => [d.id, d.status])));
  }, [synced, chatPending]);

  const makeReport = useCallback(async () => {
    if (draftInFlight.current) return;
    draftInFlight.current = true;
    setDrafting(true);
    setDraftError(undefined);
    try {
      const r = await api.makeReport(ex.id);
      setEx((e) => e?.id === ex.id ? {
        ...e,
        draft: { id: r.reportId, explorationId: ex.id, status: 'draft', body: r.body, selectedNotes: r.selectedNotes, createdAt: r.createdAt },
      } : e);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      draftInFlight.current = false;
      setDrafting(false);
    }
  }, [ex.id, setEx]);

  // An empty draft ("Nothing explored yet") is replaced as soon as there is a conversation to report on.
  const staleEmpty = Boolean(ex.draft && isEmptyReport(ex.draft.body) && ex.messages.some((m) => m.role === 'assistant'));
  const hasConversation = ex.messages.some((m) => m.role === 'user') && ex.messages.some((m) => m.role === 'assistant');
  const onMakeReport = useCallback((refreshUnedited = false) => {
    setDraftError(undefined);
    setSheetOpen(true);
    if (!ex.draft || staleEmpty || (refreshUnedited && !ex.draft.editedAt)) void makeReport();
  }, [ex.draft, staleEmpty, makeReport]);

  useEffect(() => {
    if (deciding || !autoReview.current || agentBusy || chatPending || ex.readOnly || ex.status !== 'open') return;
    autoReview.current = false;
    if (hasConversation || ex.draft) onMakeReport(true);
  }, [deciding, agentBusy, chatPending, ex.readOnly, ex.status, hasConversation, ex.draft, onMakeReport]);

  const clearActiveCanvas = () => {
    if (run) discardRun();
    setCanvasDraft(ex.id, '');
    if (useAgent.getState().activeCanvasId === ex.id) useAgent.setState({ activeCanvasId: null });
  };

  const closeCanvas = () => {
    closeAgent();
    useStore.setState({ dock: 'board' });
    go({ name: 'board', boardId });
  };

  if (ex.readOnly) return <SavedCanvas boardId={boardId} ex={ex} />;

  if (ex.status === 'closed') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-ink-2">{ex.decisionId ? 'Decision locked' : 'This canvas is closed. If you approved a report, it is on the board.'}</p>
        {ex.decisionId && (
          <>
            <p className="max-w-lg">{ex.decisionDraft?.text}</p>
            <Button onClick={() => go({ name: 'decision', boardId, decisionId: ex.decisionId! })}>View decision</Button>
          </>
        )}
        <Button onClick={() => go({ name: 'board', boardId })}>Back to the board</Button>
      </div>
    );
  }

  return (
    <div className="agent-expanded-panel flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 ps-4 pe-2">
        <h1 className="text-[14px] font-semibold">Agent</h1>
        <div className="flex items-center gap-1">
          <p className="me-2 text-[13px] text-ink-3">{deciding ? 'Your chat and draft are private. Locking shares your decision with the board.' : 'Only you see this until you apply a plan or approve a report.'}</p>
          <Tooltip label="Minimise Agent chat">
            <button type="button" className={HEADER_ICON_BUTTON} aria-label="Minimise Agent chat" onClick={() => minimiseToSidebar(boardId)}>
              <Minimize2 aria-hidden size={24} strokeWidth={2} className="shrink-0" />
            </button>
          </Tooltip>
          <Tooltip label="Close canvas">
            <button type="button" className={HEADER_ICON_BUTTON} aria-label="Close canvas" onClick={closeCanvas}>
              <X aria-hidden size={24} strokeWidth={2} className="shrink-0" />
            </button>
          </Tooltip>
        </div>
      </header>
      <DraftSheet
        boardId={boardId}
        ex={ex}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        drafting={drafting}
        error={draftError}
        onRegenerate={() => void makeReport()}
        onApproved={clearActiveCanvas}
        onSaved={(id, body, editedAt) => setEx((e) => (e?.draft?.id === id ? { ...e, draft: { ...e.draft, body, editedAt } } : e))}
      />

      <div className="flex min-h-0 flex-1">
        <section aria-label="Chat with the AI" className="flex min-w-0 flex-1 flex-col">
          <AgentChat
            boardId={boardId}
            ex={ex}
            setEx={setEx}
            run={run}
            busy={agentBusy || drafting}
            onRequestReport={deciding ? undefined : () => onMakeReport(true)}
            intro={(
              <>
                <LockedBlock boardId={boardId} seen={seen} />
                {deciding && (
                  <section aria-label="What the AI was given" className="flex flex-col gap-2">
                    <h2 className="text-[13px] font-semibold">What the AI was given</h2>
                    <ul className="flex flex-wrap gap-2">
                      {ex.snapshot.reports?.map(({ id, body }) => (
                        <li key={id} className="rounded-full border border-line px-3 py-1 text-[13px]">{body.title}</li>
                      ))}
                    </ul>
                  </section>
                )}
                <div className="flex flex-col items-start gap-2">
                  <PrivateContextChips chips={ex.snapshot.chips.filter((c) => c.private)} />
                  <AddOwnContext ex={ex} setEx={setEx} />
                </div>
                {!deciding && <p className="text-[13px] text-ink-3">
                  Working on: {selectedCount ? `${selectedCount} selected ${selectedCount === 1 ? 'note' : 'notes'}` : 'the whole board'}
                </p>}
              </>
            )}
            footer={(
              <>
                {run && <RunArea boardId={boardId} run={run} />}
                {transcript.error && <p role="alert" className="text-[13px] text-danger">{transcript.error} <Button size="sm" onClick={transcript.retry}>Retry</Button></p>}
              </>
            )}
          />
        </section>
        {deciding ? <DecisionDraftPanel boardId={boardId} ex={ex} setEx={setEx} autoDraft={reviewReport} chatBusy={chatPending || agentBusy} /> : <aside className="w-80 shrink-0 overflow-y-auto px-5 py-4" aria-labelledby="findings-heading">
          <div className="flex flex-col gap-3">
            <h2 id="findings-heading" className="text-[13px] font-semibold">Findings</h2>
            <Button variant="primary" className="w-full" onClick={() => onMakeReport()} disabled={drafting || chatPending || agentBusy || (!ex.draft && !hasConversation)}>
              {drafting ? 'Drafting…' : ex.draft && !staleEmpty ? 'Review draft' : 'Make report'}
            </Button>
            {drafting && !ex.draft ? (
              <p role="status" className="text-[13px] text-ink-2">
                The AI is drafting the report…
              </p>
            ) : ex.draft ? (
              <div className="flex flex-col gap-3">
                <ul className="flex flex-col gap-2">
                  {ex.draft.body.findings.map((f, i) => (
                    <li key={i} className="text-[13px] leading-relaxed">
                      <p className="text-ink">{f.text}</p>
                      <p className="mt-1 text-ink-2">
                        <span className="font-medium text-ink-3">Reason: </span>
                        {f.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-ink-2">
                {hasConversation ? 'Make a report to turn this conversation into findings you can review.' : 'Ask the agent something first. The report is written from that conversation.'}
              </p>
            )}
          </div>
        </aside>}
      </div>
    </div>
  );
}

function DecisionDraftPanel({ boardId, ex, setEx, autoDraft, chatBusy }: {
  boardId: string;
  ex: Exploration;
  setEx: (fn: (e: Exploration | null) => Exploration | null) => void;
  autoDraft: boolean;
  chatBusy: boolean;
}) {
  const [draft, setDraft] = useState(ex.decisionDraft);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const autoStarted = useRef(false);
  const generate = useCallback(async () => {
    setWorking(true);
    setError('');
    try {
      const result = await api.draftDecision(ex.id);
      setDraft(result);
      setEx((current) => current?.id === ex.id ? { ...current, decisionDraft: result } : current);
      void refreshSessions(boardId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft a decision.');
    } finally {
      setWorking(false);
    }
  }, [boardId, ex.id, setEx]);

  useEffect(() => {
    if (!autoDraft || autoStarted.current || ex.decisionDraft) return;
    autoStarted.current = true;
    void generate();
  }, [autoDraft, ex.decisionDraft, generate]);

  const lock = async () => {
    if (!draft?.text.trim()) return;
    setWorking(true);
    setError('');
    try {
      const { decisionId } = await api.lockSessionDecision(ex.id, draft);
      void refreshSessions(boardId);
      go({ name: 'decision', boardId, decisionId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not lock the decision.');
      setWorking(false);
    }
  };

  return (
    <aside aria-label="Decision draft" className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto px-5 py-4">
      <h2 className="text-[13px] font-semibold">Decision draft</h2>
      {!draft && <Button variant="primary" disabled={working || chatBusy} onClick={() => void generate()}>{working ? 'Drafting decision…' : 'Draft decision'}</Button>}
      {draft && (
        <>
          <label className="flex flex-col gap-1 text-[13px]">
            Decision
            <textarea className="rounded-md border border-line p-2" rows={4} maxLength={300} value={draft.text} disabled={working} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            Reasons
            <textarea className="rounded-md border border-line p-2" rows={5} maxLength={500} value={draft.reasons} disabled={working} onChange={(e) => setDraft({ ...draft, reasons: e.target.value })} />
          </label>
          <Button variant="primary" disabled={working || chatBusy || !draft.text.trim()} onClick={() => void lock()}>
            {working ? 'Locking decision…' : 'Lock decision'}
          </Button>
        </>
      )}
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
    </aside>
  );
}

/** The finished example's scripted chats, opened by anyone on the board. Nothing here can be changed. */
function SavedCanvas({ boardId, ex }: { boardId: string; ex: Exploration }) {
  const report = useStore((s) => s.reports.find((r) => r.explorationId === ex.id));
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 ps-4 pe-2">
        <div className="flex items-center gap-4">
          <Tooltip label="Back to board">
            <Button variant="ghost" size="sm" className="w-8 px-0" aria-label="Back to board" onClick={() => go({ name: 'board', boardId })}>
              <ChevronLeft aria-hidden size={18} strokeWidth={1.75} className="size-[18px] shrink-0" />
            </Button>
          </Tooltip>
          <div className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: ex.ownerColor }} />
            <h1 className="text-[15px] font-semibold">{ex.ownerName}'s private canvas</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[13px] text-ink-3">Part of the finished example. Read only.</p>
          {report && (
            <Button variant="primary" onClick={() => go({ name: 'report', boardId, reportId: report.id })}>
              Read the report
            </Button>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <section aria-label={`${ex.ownerName}'s chat with the AI`} className="flex min-w-0 flex-1 flex-col">
          <ScrollArea className="flex-1" label="Conversation">
            <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 py-4 text-[15px] leading-relaxed">
              {ex.messages.map((m) => (
                <ChatTurn key={m.id} message={m} author={ex.ownerName} />
              ))}
              {report && <p className="text-[13px] text-ink-3">{ex.ownerName} made the report and approved it for the board.</p>}
            </div>
          </ScrollArea>
        </section>
        <aside className="w-80 shrink-0 overflow-y-auto px-5 py-4" aria-label="Findings">
          <section aria-labelledby="findings-heading">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="findings-heading" className="text-[13px] font-semibold">
                Findings
              </h2>
            </div>
            <ul className="flex flex-col gap-2">
              {report?.body.findings.map((f, i) => (
                <li key={i} className="text-[13px] leading-relaxed">
                  <p className="text-ink">{f.text}</p>
                  <p className="mt-1 text-ink-2">
                    <span className="font-medium text-ink-3">Reason: </span>
                    {f.reason}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function PrivateContextChips({ chips }: { chips: SnapshotChip[] }) {
  if (!chips.length) return null;
  return (
    <ul aria-label="Your private context" className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <li key={c.id} className="inline-flex h-7 max-w-[260px] items-center gap-1 rounded-sm border border-dashed border-ink/30 bg-surface pr-2 pl-0.5 text-[13px]">
          <ContextIcon type={c.type} source={sourceLine(c.type, undefined, c.source)} />
          <Tooltip label={c.unread ? 'The page could not be read, so the AI only knows the link.' : c.type === 'text' ? 'The AI reads this in full.' : `AI summary: ${c.summary}`}>
            <span tabIndex={0} className="truncate text-ink">
              <span className="font-semibold text-ink-2">{c.type === 'link' ? 'Your link' : 'Your context'} </span>
              {c.title}
            </span>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

/** Personal context (spec 7.3): text or a link that only this exploration sees. */
function AddOwnContext({
  ex,
  setEx,
}: {
  ex: Exploration;
  setEx: (fn: (e: Exploration | null) => Exploration | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isLink = /^https?:\/\/\S+$/i.test(value.trim());

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.addPrivateContext(ex.id, isLink ? 'link' : 'text', v);
      setEx((x) => (x ? { ...x, snapshot: r.snapshot } : x));
      setValue('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-medium text-accent hover:underline">
        Add your own context
      </button>
    );
  }
  return (
    <form onSubmit={add} className="flex w-full max-w-[680px] flex-col gap-2">
      <label htmlFor="own-context" className="text-[13px] font-semibold">
        Add your own context
      </label>
      {/* User, 25 Nov: the arrow sits in the box, as on the board's Add context. */}
      <div className="relative">
        <textarea
          id="own-context"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add(e);
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
            }
          }}
          rows={value.length > 80 ? 5 : 2}
          maxLength={20000}
          placeholder="Paste a link, or some text such as your research notes"
          className="block w-full resize-none rounded-md border border-line-strong bg-surface py-2 pr-11 pl-2.5 text-[13px] leading-snug placeholder:text-ink-3 focus-visible:border-ink-3"
        />
        <Tooltip label="Add (Ctrl+Enter)">
          <button
            type="submit"
            aria-label="Add"
            disabled={!value.trim() || busy}
            className="pressable key-accent absolute right-1.5 bottom-1.5 flex size-8 items-center justify-center rounded-[8px] bg-accent text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3"
          >
            <ArrowUp aria-hidden size={16} strokeWidth={2} />
          </button>
        </Tooltip>
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span role="status" className="text-[12px] text-ink-3">
          {busy ? (isLink ? 'Reading the page…' : 'Adding…') : 'Only you and the AI in this canvas see it.'}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
