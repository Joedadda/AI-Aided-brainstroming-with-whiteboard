import { ArrowUp } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AGENT_LIMITS } from '../../shared/agent-schema.ts';
import type { ChatMessage, Exploration, Suggestion } from '../../shared/types.ts';
import { setCanvasDraft, startRun, useAgent, type AgentRun } from '../lib/agent.ts';
import { isBoardInstruction, isIdeasAsk, isReportAsk, placeChatIdea, sendConversationTurn, useConversation } from '../lib/conversation.ts';
import { saveCanvasAgentMessages } from '../lib/private-canvas.ts';
import { useStore } from '../store.ts';
import { Button } from '../ui/Button.tsx';
import { ScrollArea } from '../ui/ScrollArea.tsx';
import { Tooltip } from '../ui/Tooltip.tsx';
import { cx } from '../ui/cx.ts';
import { TypingHint } from './TypingHint.tsx';

export type UpdateConversation = (fn: (e: Exploration | null) => Exploration | null) => void;
type PlaceIdea = (idea: Pick<Suggestion, 'id' | 'text'>) => void;
const SUGGESTIONS = ['Give me some ideas', 'What are the strongest objections?', 'What are we not seeing?'];

export function useAgentTranscript(ex: Exploration | null, setEx: UpdateConversation, replying: boolean) {
  const log = useAgent((s) => s.log);
  const id = ex?.id;
  const writable = ex?.status === 'open' && !ex.readOnly;
  const unsaved = Boolean(id && log.some((m) => m.explorationId === id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || !writable || replying || !unsaved || saving || error) return;
    setSaving(true);
    void saveCanvasAgentMessages(id, log.filter((m) => m.explorationId === id))
      .then((r) => {
        if (r) setEx((current) => current?.id === id ? { ...current, messages: r.messages } : current);
      })
      .catch(() => setError('Could not save the Agent’s messages.'))
      .finally(() => setSaving(false));
  }, [id, writable, replying, unsaved, saving, error, log, setEx]);

  return { busy: saving || unsaved, error, retry: () => setError('') };
}

function Idea({ idea, onPlace, canDrag }: { idea: Suggestion; onPlace?: PlaceIdea; canDrag: boolean }) {
  const justPlaced = useConversation((s) => s.placed[idea.id]);
  const synced = useStore((s) => s.synced);
  const decision = useStore((s) => s.decisions.find((d) => d.id === idea.conflictsWith && d.status === 'locked'));
  const used = idea.used || justPlaced;
  return (
    <li className="ps-1">
      <p>{idea.text}</p>
      {decision && <p className="mt-1 text-[12px] text-draft" title={idea.conflictLine}>Goes against: {decision.text}</p>}
      {onPlace && (
        <div className="mt-2">
          {used ? <span className="text-[12px] text-ink-3">Placed on board</span> : (
            <Button
              size="sm"
              onClick={() => onPlace(idea)}
              disabled={!synced}
              draggable={canDrag && synced}
              onDragStart={(event) => {
                if (!canDrag || !synced) return;
                event.dataTransfer.setData('application/x-suggestion', JSON.stringify({ id: idea.id, text: idea.text }));
                event.dataTransfer.effectAllowed = 'copy';
              }}
            >
              Place on board
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function ChatTurn({ message, onPlace, author = 'You', canDragIdeas = false }: {
  message: ChatMessage;
  onPlace?: PlaceIdea;
  author?: string;
  canDragIdeas?: boolean;
}) {
  if (message.role === 'user') {
    return (
      <article className="flex justify-end" aria-label={author}>
        <p className="max-w-[85%] rounded-[18px] bg-neutral-100 px-4 py-2.5 whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
      </article>
    );
  }
  const ideas = message.ideas;
  const list = ideas?.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n');
  const intro = list && message.text.endsWith(list) ? message.text.slice(0, -list.length).trimEnd() : message.text;
  return (
    <article aria-label="Agent" className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
      {intro && <p>{intro}</p>}
      {ideas?.length ? (
        <ol className={cx('list-decimal space-y-4 ps-5', intro && 'mt-3')}>
          {ideas.map((idea) => <Idea key={idea.id} idea={idea} onPlace={onPlace} canDrag={canDragIdeas} />)}
        </ol>
      ) : null}
    </article>
  );
}

export function AgentChat({
  boardId, ex, setEx, resolve, scopeNoteIds, intro, footer, run, busy, loading, compact, onPlace, focusTick, onRequestReport,
}: {
  boardId: string;
  ex: Exploration | null;
  setEx: UpdateConversation;
  resolve?: () => Promise<Exploration>;
  scopeNoteIds?: string[];
  intro?: ReactNode;
  footer?: ReactNode;
  run: AgentRun | null;
  busy: boolean;
  loading?: boolean;
  compact?: boolean;
  onPlace?: PlaceIdea;
  focusTick?: number;
  onRequestReport?: () => void;
}) {
  const workspace = useAgent((s) => s.workspace);
  const sidebarPrompt = useAgent((s) => s.sidebarPrompt);
  const request = useConversation((s) => s.pending);
  const outcome = useConversation((s) => s.outcome);
  const log = useAgent((s) => s.log);
  const storedDraft = useAgent((s) => ex ? s.canvasDrafts[ex.id] : undefined);
  const [initialDraft, setInitialDraft] = useState('');
  const [localError, setLocalError] = useState('');
  const [planning, setPlanning] = useState(false);
  const fieldId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const shownPhrase = useRef('');
  const onPhrase = useCallback((phrase: string) => { shownPhrase.current = phrase; }, []);
  const draft = ex ? storedDraft ?? '' : initialDraft;
  const setDraft = (value: string) => {
    if (ex) setCanvasDraft(ex.id, value);
    else setInitialDraft(value);
  };
  const belongs = (item: { workspace: string | null; boardId: string; explorationId?: string } | null) =>
    item !== null && item.workspace === workspace && item.boardId === boardId && (!item.explorationId || item.explorationId === ex?.id);
  const pending = belongs(request) ? request : null;
  const result = belongs(outcome) ? outcome : null;
  const clarified = Boolean(run?.plan?.clarify);
  const disabled = busy || loading || planning || Boolean(pending);
  const hinting = !draft && !clarified && !disabled;
  const place = onPlace ?? ((idea) => placeChatIdea(boardId, idea));

  const messages = useMemo(() => {
    const saved = ex?.messages ?? [];
    const justSent = result?.status === 'sent' ? result.messages.filter((m) => !saved.some((s) => s.id === m.id)) : [];
    const staged = log.filter((m) => ex && m.explorationId === ex.id && !saved.some((s) => s.id === `${ex.id}-agent-${m.id}`));
    return [...saved, ...justSent, ...staged];
  }, [ex, result, log]);

  useEffect(() => {
    if (!ex || result?.status !== 'sent' || result.explorationId !== ex.id) return;
    setEx((current) => {
      if (!current || current.id !== result.explorationId) return current;
      const unseen = result.messages.filter((m) => !current.messages.some((s) => s.id === m.id));
      return unseen.length ? { ...current, messages: [...current.messages, ...unseen] } : current;
    });
  }, [ex?.id, result, setEx]);

  useEffect(() => {
    if (!compact || focusTick) input.current?.focus({ preventScroll: true });
  }, [compact, focusTick]);

  useEffect(() => {
    const el = viewport.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending?.partial, pending?.text, run?.status, run?.ideas.length]);

  const submit = async (asPlan: boolean, value = draft, handedOffNoteIds?: string[]) => {
    const text = value.trim();
    if (!text || disabled) return;
    const selectedNoteIds = handedOffNoteIds ?? scopeNoteIds;
    if (!asPlan && onRequestReport && isReportAsk(text)) {
      if (!ex?.draft && (!messages.some((m) => m.role === 'user') || !messages.some((m) => m.role === 'assistant'))) {
        setLocalError('Chat with the Agent first, then ask it to draft a report.');
        return;
      }
      if (!handedOffNoteIds) setDraft('');
      setLocalError('');
      onRequestReport();
      return;
    }
    const ideas = ex?.kind !== 'decide' && isIdeasAsk(text);
    const plan = ex?.kind !== 'decide' && (asPlan || clarified || (!ideas && isBoardInstruction(text)));
    if (plan && text.length > AGENT_LIMITS.instruction) {
      setLocalError(`Keep board instructions under ${AGENT_LIMITS.instruction} characters.`);
      return;
    }
    const target = async () => {
      if (ex) return ex;
      if (!resolve) throw new Error('Could not open this conversation.');
      return resolve();
    };
    setLocalError('');
    if (!handedOffNoteIds && value === draft) setDraft('');
    stickToBottom.current = true;
    if (plan) {
      setPlanning(true);
      try {
        const current = await target();
        await startRun(boardId, text, {
          explorationId: current.id,
          scopeNoteIds: selectedNoteIds ?? current.snapshot.reservedNoteIds ?? current.snapshot.notes.map((n) => n.id),
        });
      } catch (err) {
        setDraft(text);
        setLocalError(err instanceof Error ? err.message : 'Could not start the plan.');
      } finally {
        setPlanning(false);
      }
    } else {
      await sendConversationTurn(boardId, ex, target, text, { ideas, noteIds: selectedNoteIds });
    }
    input.current?.focus({ preventScroll: true });
  };

  const submitSidebarPrompt = useEffectEvent((prompt: NonNullable<typeof sidebarPrompt>) => {
    void submit(false, prompt.text, prompt.noteIds);
  });
  useEffect(() => {
    if (!compact || disabled || sidebarPrompt?.boardId !== boardId || useAgent.getState().sidebarPrompt !== sidebarPrompt) return;
    useAgent.setState({ sidebarPrompt: undefined });
    submitSidebarPrompt(sidebarPrompt);
  }, [boardId, compact, disabled, sidebarPrompt]);

  const planPrompt = run?.status === 'running' ? run.prompt : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea
        ref={viewport}
        className="flex-1"
        label="Conversation"
        onScroll={() => {
          const el = viewport.current;
          if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
        }}
      >
        <div className={cx('mx-auto flex max-w-[720px] flex-col gap-5 px-4 py-4', compact ? 'text-[13px] leading-relaxed' : 'text-[15px] leading-relaxed')}>
          {intro}
          <div role="log" aria-label="Chat messages" className="flex flex-col gap-5">
            {messages.map((m) => <ChatTurn key={m.id} message={m} onPlace={place} canDragIdeas={Boolean(compact)} />)}
            {planPrompt && <ChatTurn message={{ id: 'plan-user', role: 'user', text: planPrompt, at: 0 }} />}
            {pending && (
              <>
                <ChatTurn message={{ id: 'pending-user', role: 'user', text: pending.text, at: 0 }} />
                {pending.partial ? (
                  <div className="whitespace-pre-wrap [overflow-wrap:anywhere]" aria-live="off">{pending.partial}</div>
                ) : <p role="status" className="text-[13px] text-ink-3">Thinking…</p>}
              </>
            )}
          </div>
          {footer}
          {result?.status === 'error' && (
            <>
              <ChatTurn message={{ id: 'failed-user', role: 'user', text: result.text, at: 0 }} />
              <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
                {result.error}
                <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void submit(false, result.text)}>Retry</Button>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(false); }}
        className="shrink-0 px-4 pt-2 pb-4"
      >
        <div className="mx-auto max-w-[720px]">
          {localError && <p role="alert" className="mb-2 text-[13px] text-danger">{localError}</p>}
          <div className="relative rounded-md border border-line-strong bg-surface keys:focus-within:outline-2 keys:focus-within:outline-offset-2 keys:focus-within:outline-accent">
            <label htmlFor={fieldId} className="sr-only">Message the Agent</label>
            <textarea
              id={fieldId}
              ref={input}
              value={draft}
              rows={2}
              maxLength={4000}
              placeholder={clarified ? 'Answer the Agent’s question' : 'Message the Agent'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !e.shiftKey && hinting && shownPhrase.current) {
                  e.preventDefault();
                  setDraft(shownPhrase.current);
                } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit(false);
                }
              }}
              className={cx('block w-full resize-none bg-transparent px-2.5 pt-2 pb-9 text-[13px] leading-snug outline-none focus-visible:outline-none', hinting ? 'placeholder:text-transparent' : 'placeholder:text-ink-3')}
            />
            {hinting && <TypingHint phrases={SUGGESTIONS} onPhrase={onPhrase} />}
            <div className="absolute end-1.5 bottom-1.5 flex items-center gap-1">
              {!clarified && draft.trim() && ex?.kind !== 'decide' && (
                <Button type="button" variant="ghost" size="sm" disabled={disabled || draft.trim().length > AGENT_LIMITS.instruction} onClick={() => void submit(true)}>
                  Plan board changes
                </Button>
              )}
              <Tooltip label="Send (Enter)">
                <button type="submit" aria-label="Send" disabled={!draft.trim() || disabled} className="pressable flex size-8 items-center justify-center rounded-[8px] bg-ink text-white disabled:bg-surface-2 disabled:text-ink-3">
                  <ArrowUp aria-hidden size={16} strokeWidth={2} />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
