import { ArrowUp, ChevronLeft } from 'lucide-react';
import { Field } from '@base-ui/react/field';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ChatMessage, Exploration, Snapshot, SnapshotChip } from '../../shared/types.ts';
import { ContextIcon, sourceLine } from '../canvas/ContextIcon.tsx';
import { ApiError, api } from '../lib/api.ts';
import { board } from '../lib/board.ts';
import { useProfile } from '../lib/profile.ts';
import { go } from '../lib/router.ts';
import { useStore } from '../store.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { ScrollArea } from '../ui/ScrollArea.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { Tooltip } from '../ui/Tooltip.tsx';
import { cx } from '../ui/cx.ts';
import { isEmptyReport } from '../../shared/report-schema.ts';
import { DraftSheet } from './DraftSheet.tsx';
import { LockedBlock } from './LockedBlock.tsx';

const STARTERS = ['Give me three different directions', 'What are the strongest objections?', 'What are we not seeing?'];

/** The private canvas (Build PRD 11). Everything here is served only to its owner (PC-8). */
export function Canvas({ boardId, explorationId }: { boardId: string; explorationId: string }) {
  const [ex, setEx] = useState<Exploration | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  const load = useCallback(() => {
    api
      .exploration(explorationId)
      .then(setEx)
      .catch((e) => setError({ status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : 'Could not load.' }));
  }, [explorationId]);
  useEffect(load, [load]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="max-w-[420px] text-ink-2">
          {error.status === 404 ? 'This private canvas belongs to someone else, or no longer exists. You will see its report on the board once they approve it.' : error.message}
        </p>
        <Button onClick={() => go({ name: 'board', boardId })}>Back to the board</Button>
      </div>
    );
  }
  if (!ex) {
    return (
      <p role="status" className="flex flex-1 items-center justify-center text-ink-3">
        Opening your canvas…
      </p>
    );
  }
  return <CanvasView boardId={boardId} ex={ex} setEx={setEx} />;
}

function CanvasView({ boardId, ex, setEx }: { boardId: string; ex: Exploration; setEx: (fn: (e: Exploration | null) => Exploration | null) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | undefined>();
  const [chatPending, setChatPending] = useState(false);
  // Locked decisions 7.4: what the person has seen. Reset when the board first syncs and after each
  // reply, so the New and Reopened marks clear after their next message.
  const synced = useStore((s) => s.synced);
  const [seen, setSeen] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!synced || chatPending) return;
    setSeen(new Map(useStore.getState().decisions.map((d) => [d.id, d.status])));
  }, [synced, chatPending]);

  const makeReport = async () => {
    setDrafting(true);
    setDraftError(undefined);
    try {
      const r = await api.makeReport(ex.id);
      setEx((e) => (e ? { ...e, draft: { id: r.reportId, explorationId: ex.id, status: 'draft', body: r.body, createdAt: r.createdAt } } : e));
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setDrafting(false);
    }
  };

  // An empty draft ("Nothing explored yet") is replaced as soon as there is a conversation to report on.
  const staleEmpty = Boolean(ex.draft && isEmptyReport(ex.draft.body) && ex.messages.some((m) => m.role === 'assistant'));
  const onMakeReport = () => {
    setSheetOpen(true);
    if ((!ex.draft || staleEmpty) && !drafting) void makeReport();
  };

  const closeCanvas = async () => {
    if (!confirm('Close this canvas without a report? Your chat is kept private and the notes are released.')) return;
    const r = await api.closeExploration(ex.id).catch(() => null);
    if (r) board.reserve(r.noteIds, false);
    go({ name: 'board', boardId });
  };

  if (ex.readOnly) return <SavedCanvas boardId={boardId} ex={ex} />;

  if (ex.status === 'closed') {
    return (
      <div className="screen-enter flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-ink-2">This canvas is closed. If you approved a report, it is on the board.</p>
        <Button onClick={() => go({ name: 'board', boardId })}>Back to the board</Button>
      </div>
    );
  }

  return (
    <div className="screen-enter flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-8 py-4">
        <div className="flex items-center gap-4">
          <Tooltip label="Back to board">
            <Button variant="ghost" size="sm" className="w-8 px-0" aria-label="Back to board" onClick={() => go({ name: 'board', boardId })}>
              <ChevronLeft aria-hidden size={18} strokeWidth={1.75} className="size-[18px] shrink-0" />
            </Button>
          </Tooltip>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold">Private canvas</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[13px] text-ink-3">Nothing here reaches the board until you approve a report.</p>
          {/* Same size as Make report beside it, so the hover and pressed shapes match. */}
          <Button variant="ghost" onClick={() => void closeCanvas()}>
            Close canvas
          </Button>
          <Button variant="primary" onClick={onMakeReport} disabled={chatPending}>
            {drafting ? 'Drafting…' : ex.draft && !staleEmpty ? 'Review draft' : 'Make report'}
          </Button>
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
        onSaved={(body, editedAt) => setEx((e) => (e?.draft ? { ...e, draft: { ...e.draft, body, editedAt } } : e))}
      />

      <div className="flex min-h-0 flex-1">
        <section aria-label="Chat with the AI" className="flex min-w-0 flex-1 flex-col border-r border-line">
          {/* Locked decisions 7.2: their own block, above the chips row and never in it. */}
          <LockedBlock boardId={boardId} seen={seen} />
          <ContextChips ex={ex} setEx={setEx} />
          <Chat ex={ex} setEx={setEx} pending={chatPending} setPending={setChatPending} />
        </section>
        <aside className="flex w-[360px] shrink-0 flex-col gap-6 overflow-y-auto px-6 py-6" aria-label="Findings">
          <section aria-labelledby="findings-heading">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="findings-heading" className="text-[13px] font-semibold">
                Findings
              </h2>
            </div>
            {drafting && !ex.draft ? (
              <p role="status" className="rounded-md border border-ai-line bg-ai-bg px-4 py-5 text-[13px] text-ai">
                The AI is drafting the report…
              </p>
            ) : ex.draft ? (
              <div className="flex flex-col gap-3">
                <ul className="flex flex-col gap-2">
                  {ex.draft.body.findings.map((f, i) => (
                    <li key={i} className="rounded-md border border-ai-line bg-ai-bg px-3 py-2.5 text-[13px] leading-snug">
                      <p className="text-ink">{f.text}</p>
                      <p className="mt-1 text-ink-2">
                        <span className="font-medium text-ink-3">Reason: </span>
                        {f.reason}
                      </p>
                    </li>
                  ))}
                </ul>
                <Button variant="secondary" size="sm" onClick={() => setSheetOpen(true)}>
                  Review the full draft
                </Button>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-line-strong px-4 py-5 text-[13px] leading-relaxed text-ink-2">
                When you make a report, the AI drafts the findings here for you to approve or regenerate.
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/** The finished example's scripted chats, opened by anyone on the board. Nothing here can be changed. */
function SavedCanvas({ boardId, ex }: { boardId: string; ex: Exploration }) {
  const report = useStore((s) => s.reports.find((r) => r.explorationId === ex.id));
  return (
    <div className="screen-enter flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-8 py-4">
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
        <section aria-label={`${ex.ownerName}'s chat with the AI`} className="flex min-w-0 flex-1 flex-col border-r border-line">
          <ContextChips ex={ex} />
          <ScrollArea className="flex-1" label="Conversation">
            <div className="mx-auto flex max-w-[680px] flex-col gap-4 px-6 py-6">
              {ex.messages.map((m) => (
                <Message key={m.id} message={m} author={ex.ownerName} />
              ))}
              {report && <p className="py-2 text-center text-[13px] text-ink-3">{ex.ownerName} made the report and approved it for the board.</p>}
            </div>
          </ScrollArea>
        </section>
        <aside className="flex w-[360px] shrink-0 flex-col gap-6 overflow-y-auto px-6 py-6" aria-label="Findings">
          <section aria-labelledby="findings-heading">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="findings-heading" className="text-[13px] font-semibold">
                Findings
              </h2>
            </div>
            <ul className="flex flex-col gap-2">
              {report?.body.findings.map((f, i) => (
                <li key={i} className="rounded-md border border-ai-line bg-ai-bg px-3 py-2.5 text-[13px] leading-snug">
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

/**
 * PC-2: chips showing exactly what the AI was given. The board part is fixed when the notes
 * were taken. The person can add their own context here: it reaches only this canvas.
 */
function ContextChips({ ex, setEx }: { ex: Exploration; setEx?: (fn: (e: Exploration | null) => Exploration | null) => void }) {
  return (
    <GivenChips snapshot={ex.snapshot} readOnly={ex.readOnly} ownerName={ex.ownerName}>
      {setEx && !ex.readOnly && <AddOwnContext ex={ex} setEx={setEx} />}
    </GivenChips>
  );
}

/** The chips themselves, also used by the full-screen Agent view. */
export function GivenChips({ snapshot: s, readOnly, ownerName, children }: { snapshot: Snapshot; readOnly?: boolean; ownerName?: string; children?: ReactNode }) {
  const shared = s.chips.filter((c) => !c.private);
  const mine = s.chips.filter((c) => c.private);
  const who = readOnly ? `Added privately by ${ownerName}` : 'Added by you. Only this canvas has it.';
  return (
    <div className="border-b border-line bg-surface-2/60 px-6 py-4">
      <p id="chips-label" className="mb-2 text-[14px] font-semibold text-ink">
        What the AI was given
      </p>
      <ul aria-labelledby="chips-label" className="flex flex-wrap gap-2">
        {s.problem && <Chip kind="Problem" text={s.problem} />}
        {s.notes.map((n) => (
          <Chip key={n.id} kind="Note" text={n.text} by={`From ${n.author}`} />
        ))}
        {shared.map((c) => (
          <Chip key={c.id} kind={c.type === 'link' ? 'Link' : 'Context'} text={c.title} by={`AI summary: ${c.summary}`} context={{ type: c.type, full: c.source }} />
        ))}
        {mine.map((c) => (
          <Chip
            key={c.id}
            kind={`${readOnly ? `${ownerName}'s` : 'Your'} ${c.type === 'link' ? 'link' : 'context'}`}
            text={c.title}
            by={`${c.unread ? 'The page could not be read, so the AI only knows the link. ' : c.type === 'text' ? 'The AI reads this in full. ' : `AI summary: ${c.summary} `}${who}`}
            own
            context={{ type: c.type, full: c.source }}
          />
        ))}
      </ul>
      {children}
    </div>
  );
}

/** Personal context (spec 7.3): text or a link that only this exploration sees. */
export function AddOwnContext({
  ex,
  setEx,
  startOpen = false,
  note = 'Only you and the AI in this canvas see it. It never reaches the board.',
}: {
  ex: Exploration;
  setEx: (fn: (e: Exploration | null) => Exploration | null) => void;
  startOpen?: boolean;
  note?: string;
}) {
  const [open, setOpen] = useState(startOpen);
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
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-[13px] font-medium text-accent hover:underline">
        Add your own context
      </button>
    );
  }
  return (
    <form onSubmit={add} className="mt-3 flex max-w-[680px] flex-col gap-2">
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
          {busy ? (isLink ? 'Reading the page…' : 'Adding…') : note}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Chip({ kind, text, by, own, context }: { kind: string; text: string; by?: string; own?: boolean; context?: { type: SnapshotChip['type']; full: string } }) {
  // Context items show their kind as an icon with the full text on hover (user request, 25 Nov),
  // the same as in the sidebar. Problem and notes keep their word and tooltip.
  if (context) {
    return (
      <li
        className={cx(
          'inline-flex h-7 max-w-[260px] items-center gap-1 rounded-sm border bg-surface pr-2 pl-0.5 text-[13px]',
          own ? 'border-dashed border-ink/30' : 'border-line',
        )}
      >
        <ContextIcon type={context.type} source={sourceLine(context.type, undefined, context.full)} />
        <Tooltip label={by ?? text}>
          <span tabIndex={0} className="truncate text-ink">
            {own && <span className="font-semibold text-ink-2">{kind} </span>}
            {text}
          </span>
        </Tooltip>
      </li>
    );
  }
  return (
    <li>
      <Tooltip
        label={
          <>
            {text}
            {by && <span className="mt-1 block text-white/70">{by}</span>}
          </>
        }
      >
        <span
          tabIndex={0}
          className={cx(
            'inline-flex h-7 max-w-[240px] cursor-default items-center gap-1.5 rounded-sm border bg-surface px-2 text-[13px]',
            kind === 'Problem' ? 'border-ink/20' : own ? 'border-dashed border-ink/30' : 'border-line',
          )}
        >
          <span className="shrink-0 font-semibold text-ink-2">{kind}</span>
          <span className="truncate text-ink">{text}</span>
        </span>
      </Tooltip>
    </li>
  );
}

function Chat({
  ex,
  setEx,
  pending,
  setPending,
}: {
  ex: Exploration;
  setEx: (fn: (e: Exploration | null) => Exploration | null) => void;
  pending: boolean;
  setPending: (b: boolean) => void;
}) {
  const me = useProfile((s) => s.profile!.name);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [streaming, setStreaming] = useState('');
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const count = ex.messages.length;
  useEffect(() => {
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, pending, streaming]);
  useEffect(() => inputRef.current?.focus(), []);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || pending) return;
    setDraft('');
    setError('');
    setPending(true);
    const tempId = `tmp-${Date.now()}`;
    setEx((e) => (e ? { ...e, messages: [...e.messages, { id: tempId, role: 'user', text: t, at: Date.now() }] } : e));
    let acc = '';
    try {
      // PC-3: the reply streams in over SSE.
      const done = await api.sendMessage(ex.id, t, (d) => {
        acc += d;
        setStreaming(acc);
      });
      setEx((e) =>
        e
          ? {
              ...e,
              messages: [
                ...e.messages.map((m) => (m.id === tempId ? { ...m, id: done.userMessageId } : m)),
                { id: done.messageId, role: 'assistant', text: acc, at: Date.now() },
              ],
            }
          : e,
      );
    } catch (err) {
      // The server took the message back out, so a retry does not send it twice.
      setEx((e) => (e ? { ...e, messages: e.messages.filter((m) => m.id !== tempId) } : e));
      setDraft(t);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setStreaming('');
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  return (
    <>
      <ScrollArea ref={viewportRef} className="flex-1" label="Conversation">
        <div className="mx-auto flex max-w-[680px] flex-col gap-4 px-6 py-6">
          {count === 0 && !pending && (
            <div className="flex flex-col items-start gap-3 py-6">
              <p className="text-[15px] text-ink-2">
                The AI has the problem{ex.snapshot.chips.length ? ', ' : ' and '}your {ex.snapshot.notes.length === 1 ? 'note' : 'notes'}
                {ex.snapshot.chips.length ? ' and the context' : ''}. If you have notes of your own, add them above first. Then start anywhere.
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <Button key={s} variant="ai" size="sm" onClick={() => void send(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {ex.messages.map((m) => (
            <Message key={m.id} message={m} author={me} />
          ))}
          {pending &&
            (streaming ? (
              <Message message={{ id: 'stream', role: 'assistant', text: streaming, at: 0 }} author={me} live />
            ) : (
              <Thinking />
            ))}
        </div>
      </ScrollArea>

      <form onSubmit={onSubmit} className="border-t border-line px-6 py-4">
        <div className="mx-auto max-w-[680px]">
          {error && (
            <p role="alert" className="mb-2 text-[13px] text-danger">
              {error} Your message is back in the box.
            </p>
          )}
          {/* Outer radius = button radius (6) + inset (8) + border (1). */}
          <Field.Root className="relative flex items-end gap-2 rounded-[15px] border border-line bg-surface p-2 shadow-card focus-within:border-ink-3 keys:focus-within:outline-2 keys:focus-within:outline-offset-2 keys:focus-within:outline-accent">
            <Field.Label className="sr-only">Message the AI</Field.Label>
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) onSubmit(e);
              }}
              rows={2}
              placeholder="Ask for directions, objections, or what is missing"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] leading-snug outline-none placeholder:text-ink-3 focus-visible:outline-none"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={!draft.trim() || pending}>
              Send
            </Button>
          </Field.Root>
          <p className="mt-1.5 text-[12px] text-ink-3">Enter to send. Shift and Enter for a new line.</p>
        </div>
      </form>
    </>
  );
}

function Message({ message, author, live }: { message: ChatMessage; author: string; live?: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="msg-enter flex flex-col items-end">
        <span className="mb-1 text-[12px] text-ink-3">{author}</span>
        <p className="max-w-[85%] rounded-lg rounded-tr-sm bg-surface px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap shadow-card [overflow-wrap:anywhere]">
          {message.text}
        </p>
      </div>
    );
  }
  return (
    <div className={cx('flex flex-col items-start', !live && 'msg-enter')} aria-live={live ? 'off' : undefined}>
      <span className="mb-1">
        <Badge tone="ai">AI</Badge>
      </span>
      <p className="max-w-[92%] rounded-lg rounded-tl-sm border border-ai-line bg-ai-bg px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
        {message.text}
        {live && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-ai align-middle" />}
      </p>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex flex-col items-start" role="status">
      <span className="mb-1">
        <Badge tone="ai">AI</Badge>
      </span>
      <span className="dots flex gap-1 rounded-lg border border-ai-line bg-ai-bg px-4 py-3.5" aria-label="The AI is thinking">
        <span className="size-1.5 rounded-full bg-ai" />
        <span className="size-1.5 rounded-full bg-ai" />
        <span className="size-1.5 rounded-full bg-ai" />
      </span>
    </div>
  );
}
