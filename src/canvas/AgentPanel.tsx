import { ChevronRight, LoaderCircle, LockKeyhole, LockKeyholeOpen, TriangleAlert, WandSparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AGENT_LIMITS, type AgentIdea, type AgentPlan, type PlanStep } from '../../shared/agent-schema.ts';
import type { Card, Exploration } from '../../shared/types.ts';
import { countsLine, isOn, tickKey } from '../lib/agent-apply.ts';
import { applyRun, cancelRun, discardRun, openAgent, setEdit, setTick, startRun, undoApplied, useAgent, type AgentRun } from '../lib/agent.ts';
import { api } from '../lib/api.ts';
import { refreshSessions, usePrivateSessions } from '../lib/sessions.ts';
import { useConversation } from '../lib/conversation.ts';
import { useProfile } from '../lib/profile.ts';
import { go } from '../lib/router.ts';
import { useStore } from '../store.ts';
import { Button } from '../ui/Button.tsx';
import { AgentChat, useAgentTranscript } from './AgentChat.tsx';
import { cx } from '../ui/cx.ts';

const STAGES = { reading: 'Reading the board…', planning: 'Planning…', checking: 'Checking the plan…' } as const;

const first = (t: string, n = 48) => (t.length > n ? `${t.slice(0, n - 1).trim()}…` : t);
const ofType = <T extends PlanStep['type']>(steps: PlanStep[], t: T) => steps.filter((s) => s.type === t) as Extract<PlanStep, { type: T }>[];

function SelectedNotePreview({ notes }: { notes: Card[] }) {
  const preview = notes.slice(0, 3);
  return (
    <div aria-hidden className="agent-note-preview" data-testid="selected-note-preview">
      {preview.map((note, index) => (
        <span key={note.id} className="swatch" data-color={note.color}>#idea{index + 1}</span>
      ))}
    </div>
  );
}

export function AgentPanel({ boardId, onPlace }: { boardId: string; onPlace: (s: { id: string; text: string }) => void }) {
  const workspace = useAgent((s) => s.workspace);
  const run = useAgent((s) => s.run);
  const focusTick = useAgent((s) => s.focusTick);
  const openingCanvas = useAgent((s) => s.openingCanvas);
  const activeCanvasId = useAgent((s) => s.activeCanvasId);
  const latestCanvasId = usePrivateSessions(boardId).find((session) => session.kind === 'explore')?.id;
  const conversationId = activeCanvasId ?? latestCanvasId;
  const replying = useConversation((s) => s.pending?.workspace === workspace);
  const selected = useStore((s) => s.selected);
  const cards = useStore((s) => s.cards);
  const synced = useStore((s) => s.synced);
  const [ex, setEx] = useState<Exploration | null>(null);
  const [loadError, setLoadError] = useState('');
  const current = ex?.boardId === boardId && ex.id === activeCanvasId ? ex : null;
  const currentRun = run?.boardId === boardId && run.explorationId === current?.id ? run : null;
  const selectedNotes = useMemo(() => cards.filter((c) => selected.includes(c.id) && c.text.trim()).slice(0, AGENT_LIMITS.scopeNotes), [cards, selected]);
  const selectedIds = useMemo(() => selectedNotes.map((note) => note.id), [selectedNotes]);
  const transcript = useAgentTranscript(current, setEx, replying);

  useEffect(() => {
    if (!conversationId || current) return;
    let live = true;
    setLoadError('');
    void api.exploration(conversationId)
      .then((result) => {
        const active = useAgent.getState();
        if (!live || active.workspace !== workspace || (active.activeCanvasId && active.activeCanvasId !== conversationId)) return;
        if (result.boardId === boardId && result.status === 'open' && !result.readOnly) {
          setEx(result);
          useAgent.setState({ activeCanvasId: result.id });
        } else setLoadError('This conversation is no longer open.');
      })
      .catch(() => { if (live) setLoadError('Could not load the conversation.'); });
    return () => { live = false; };
  }, [conversationId, boardId, current, workspace]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openAgent();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const resolve = async () => {
    const { explorationId } = await api.openExploration(boardId, [], [], undefined, activeCanvasId ?? undefined);
    const result = await api.exploration(explorationId);
    if (useAgent.getState().workspace !== workspace) throw new Error('The board changed.');
    useAgent.setState({ activeCanvasId: result.id });
    setEx(result);
    setLoadError('');
    void refreshSessions(boardId);
    return result;
  };

  return (
    <>
      <AgentChat
        compact
        boardId={boardId}
        ex={current}
        setEx={setEx}
        resolve={resolve}
        scopeNoteIds={selectedIds}
        onPlace={onPlace}
        onRequestReport={() => {
          if (current) go({ name: 'canvas', boardId, explorationId: current.id, reviewReport: true });
        }}
        focusTick={focusTick}
        loading={!synced || Boolean(conversationId && !current && !loadError)}
        busy={openingCanvas || transcript.busy || currentRun?.status === 'running'}
        run={currentRun}
        intro={(
          <div>
            {selectedNotes.length > 0 && <SelectedNotePreview notes={selectedNotes} />}
            <p className="text-[12px] text-ink-3">
              Working on: {selectedIds.length ? `${selectedIds.length} selected ${selectedIds.length === 1 ? 'note' : 'notes'}` : 'the whole board'}
            </p>
          </div>
        )}
        footer={(
          <>
            {currentRun && <RunArea boardId={boardId} run={currentRun} />}
            {transcript.error && <p role="alert" className="text-[13px] text-danger">{transcript.error} <Button size="sm" onClick={transcript.retry}>Retry</Button></p>}
            {loadError && <p role="status" className="text-[13px] text-ink-3">{loadError} Send a message to try again.</p>}
          </>
        )}
      />
      <AgentToast />
    </>
  );
}

export function RunArea({ boardId, run }: { boardId: string; run: AgentRun }) {
  if (run.status === 'running') {
    return (
      <div role="status" className="flex items-center justify-between gap-2 text-[13px] text-ink-2">
        <span className="flex items-center gap-2">
          <LoaderCircle aria-hidden size={16} strokeWidth={1.75} className="animate-spin motion-reduce:animate-none" />
          {STAGES[run.stage]}
        </span>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => cancelRun()}>
          Cancel
        </Button>
      </div>
    );
  }
  if (run.status === 'error') {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-md border border-line bg-surface px-3 py-2.5">
        <p className="text-[13px] leading-relaxed text-danger">{run.error?.text ?? 'The agent could not make a plan. Nothing changed.'}</p>
        <div className="flex gap-2">
          {run.error?.code !== 'vague' && run.error?.code !== 'too_large' && (
            <Button size="sm" onClick={() => void startRun(boardId, run.instruction, { explorationId: run.explorationId, scopeNoteIds: run.scopeNoteIds })}>
              Try again
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={discardRun}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }
  if (run.status === 'applied') {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-md border border-line bg-surface px-3 py-2.5">
        <p className="text-[13px] leading-relaxed text-ink">{run.resultText}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={undoApplied}>
            Undo
          </Button>
          <Button size="sm" variant="ghost" onClick={discardRun}>
            Done
          </Button>
        </div>
      </div>
    );
  }
  const plan = run.plan!;
  if (plan.clarify || plan.answer) return null; // Both are plain replies in the transcript.
  return <PlanPreview boardId={boardId} run={run} plan={plan} />;
}


// ---------- plan preview (PRD 3.3) ----------

function Tick({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      checked={checked && !disabled}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)] disabled:opacity-50"
    />
  );
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-snug text-draft">
      <TriangleAlert aria-hidden size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function PlanPreview({ boardId, run, plan }: { boardId: string; run: AgentRun; plan: AgentPlan }) {
  const cards = useStore((s) => s.cards);
  const sections = useStore((s) => s.sections);
  const decisions = useStore((s) => s.decisions);
  const myName = useProfile((s) => s.profile?.name ?? 'you');
  const [refine, setRefine] = useState('');
  const t = run.ticks;
  const on = (k: string) => isOn(t, k);
  const card = (id: string) => cards.find((c) => c.id === id);
  const sectionTitle = (id: string) => sections.find((s) => s.id === id)?.title ?? 'a section';
  const choices = { ticks: run.ticks, edits: run.edits, ideas: run.ideas };
  const counts = countsLine(plan, choices);
  const warnFor = (i: number) => plan.warnings.filter((w) => w.stepIndex === i);

  const created = ofType(plan.steps, 'createSection');
  const createdTitle = (ref: string) => run.edits[tickKey.section(ref)] ?? created.find((s) => s.ref === ref)?.title ?? 'New section';
  // Group moves and new notes by target.
  const targets: { ref: string; isNew: boolean }[] = [];
  const seen = new Set<string>();
  plan.steps.forEach((s) => {
    const ref = s.type === 'createSection' ? s.ref : s.type === 'moveNotes' ? s.toRef : s.type === 'addNotes' ? (s.toRef ?? '') : null;
    if (ref === null || seen.has(ref)) return;
    seen.add(ref);
    targets.push({ ref, isNew: ref.startsWith('#') });
  });
  const ideaStep = ofType(plan.steps, 'proposeIdeas')[0];
  const locks = ofType(plan.steps, 'lockDecision');
  const renames = ofType(plan.steps, 'renameSection');
  const removes = ofType(plan.steps, 'removeEmptySection');
  const reopens = ofType(plan.steps, 'reopenDecision');
  const loose = plan.warnings.filter((w) => w.stepIndex === undefined);
  const nothing = plan.steps.length === 0;

  return (
    <div className="plan-ready flex flex-col gap-3">
      <div className="border-t border-line pt-3">
        <span className="mb-1 block">
          <span className="text-[12px] font-semibold text-ink-2">Agent plan</span>
        </span>
        <p className="text-[13px] leading-relaxed text-ink">{plan.summary}</p>
        {nothing && <p className="mt-1 text-[12px] text-ink-2">There is nothing to apply.</p>}
      </div>
      {loose.map((w, i) => (
        <Warn key={i}>{w.text}</Warn>
      ))}

      {targets.map(({ ref, isNew }) => {
        const moveIdx = plan.steps.findIndex((s) => s.type === 'moveNotes' && s.toRef === ref);
        const move = moveIdx >= 0 ? (plan.steps[moveIdx] as Extract<PlanStep, { type: 'moveNotes' }>) : undefined;
        const addIdx = plan.steps.findIndex((s) => s.type === 'addNotes' && (s.toRef ?? '') === ref);
        const add = addIdx >= 0 ? (plan.steps[addIdx] as Extract<PlanStep, { type: 'addNotes' }>) : undefined;
        const sectionOn = !isNew || on(tickKey.section(ref));
        const title = isNew ? createdTitle(ref) : ref ? sectionTitle(ref) : 'Loose notes';
        return (
          <PlanGroup
            key={ref || 'loose'}
            isNew={isNew}
            title={title}
            sectionOn={sectionOn}
            onSection={(v) => setTick(tickKey.section(ref), v)}
            onTitle={(v) => setEdit(tickKey.section(ref), v)}
            count={(move?.noteIds.filter((id) => on(tickKey.move(id))).length ?? 0) + (add?.notes.filter((n) => on(tickKey.newNote(n.ref))).length ?? 0)}
            warnings={[...(moveIdx >= 0 ? warnFor(moveIdx) : []), ...(addIdx >= 0 ? warnFor(addIdx) : [])].map((w) => w.text)}
            ideasHere={Boolean(ideaStep && (ideaStep.toRef ?? '') === ref)}
          >
            {move?.noteIds.map((id) => {
              const c = card(id);
              return (
                <li key={id} className="flex items-start gap-2">
                  <Tick checked={on(tickKey.move(id))} disabled={!sectionOn} onChange={(v) => setTick(tickKey.move(id), v)} label={`Move "${first(c?.text ?? 'a note', 40)}"`} />
                  <span className="min-w-0 text-[12px] leading-snug text-ink">
                    {c ? first(c.text, 90) : 'A note that was removed'}
                    {c && <span className="text-ink-3"> · {c.author}</span>}
                  </span>
                </li>
              );
            })}
            {add?.notes.map((n) => (
              <li key={n.ref} className="flex items-start gap-2">
                <Tick checked={on(tickKey.newNote(n.ref))} disabled={!sectionOn} onChange={(v) => setTick(tickKey.newNote(n.ref), v)} label={`Add the note "${first(n.text, 40)}"`} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <textarea
                    aria-label="Text of the new note"
                    value={run.edits[tickKey.newNote(n.ref)] ?? n.text}
                    onChange={(e) => setEdit(tickKey.newNote(n.ref), e.target.value)}
                    maxLength={AGENT_LIMITS.noteText}
                    rows={2}
                    className="w-full resize-none rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[12px] leading-snug text-ink hover:border-line focus-visible:border-line-strong"
                  />
                  <span className="flex items-center gap-1.5 pl-1">
                    <span className="text-[12px] text-ink-3">AI</span>
                    <span className="text-[11px] text-ink-3">New note{n.kind ? `, ${n.kind}` : ''}</span>
                  </span>
                </span>
              </li>
            ))}
          </PlanGroup>
        );
      })}

      {renames.length > 0 && (
        <Group heading="Renames">
          {renames.map((r) => (
            <li key={r.sectionId} className="flex items-start gap-2">
              <Tick checked={on(tickKey.rename(r.sectionId))} onChange={(v) => setTick(tickKey.rename(r.sectionId), v)} label={`Rename ${r.from}`} />
              <span className="text-[12px] text-ink">
                {r.from} <span className="text-ink-3">becomes</span> {r.title}
              </span>
            </li>
          ))}
        </Group>
      )}

      {removes.length > 0 && (
        <Group heading="Clean up">
          {removes.map((r) => (
            <li key={r.sectionId} className="flex items-start gap-2">
              <Tick checked={on(tickKey.remove(r.sectionId))} onChange={(v) => setTick(tickKey.remove(r.sectionId), v)} label={`Remove the empty section ${r.title}`} />
              <span className="text-[12px] text-ink">Remove the empty section "{r.title}"</span>
            </li>
          ))}
        </Group>
      )}

      {(locks.length > 0 || reopens.length > 0) && (
        <Group heading="Decisions">
          {locks.length > 0 && <p className="text-[12px] text-ink-2">Ticked steps lock as decisions in your name.</p>}
          {locks.map((l) => {
            const scope =
              l.scope === 'section' && l.sectionRef ? `Section: ${l.sectionRef.startsWith('#') ? createdTitle(l.sectionRef) : sectionTitle(l.sectionRef)}` : 'Whole problem';
            const deadSection = Boolean(l.sectionRef?.startsWith('#') && !on(tickKey.section(l.sectionRef)));
            return (
              <li key={l.ref} className="flex items-start gap-2">
                <Tick checked={on(tickKey.lock(l.ref))} disabled={Boolean(l.blocked) || deadSection} onChange={(v) => setTick(tickKey.lock(l.ref), v)} label={`Lock "${first(l.text, 40)}"`} />
                <span className={cx('flex min-w-0 flex-col gap-0.5', (l.blocked || deadSection) && 'opacity-60')}>
                  <span className="flex items-start gap-1.5 text-[12px] leading-snug text-ink">
                    <LockKeyhole aria-hidden size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                    {l.text}
                  </span>
                  <span className="text-[11px] text-ink-3">
                    {scope} · Locked as {myName}, via the agent
                  </span>
                  {l.blocked && <Warn>{l.blocked}</Warn>}
                  {deadSection && <Warn>Its section is unticked, so this cannot lock.</Warn>}
                </span>
              </li>
            );
          })}
          {reopens.map((r) => (
            <li key={r.decisionId} className="flex items-start gap-2">
              <Tick checked={on(tickKey.reopen(r.decisionId))} onChange={(v) => setTick(tickKey.reopen(r.decisionId), v)} label={`Reopen "${first(r.text, 40)}"`} />
              <span className="flex min-w-0 items-start gap-1.5 text-[12px] leading-snug text-ink">
                <LockKeyholeOpen aria-hidden size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                <span>
                  Reopen: {decisions.find((d) => d.id === r.decisionId)?.text ?? r.text}
                </span>
              </span>
            </li>
          ))}
        </Group>
      )}

      {ideaStep && <IdeaPicker run={run} target={ideaStep.toRef ? (ideaStep.toRef.startsWith('#') ? createdTitle(ideaStep.toRef) : sectionTitle(ideaStep.toRef)) : 'a row below the board'} />}

      <div className="sticky -bottom-4 z-10 -mx-3 -mb-4 flex flex-col gap-2 border-t border-line bg-surface px-3 pt-2.5 pb-4">
        <p className="text-[12px] text-ink-2" aria-live="polite">
          {counts.total ? counts.text : 'Nothing is ticked.'}
        </p>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" disabled={!counts.total} onClick={applyRun} className="flex-1">
            Apply plan
          </Button>
          <Button size="sm" onClick={discardRun}>
            Discard
          </Button>
        </div>
        {run.refinements < AGENT_LIMITS.refinements && run.runId && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!refine.trim()) return;
              void startRun(boardId, run.instruction, { refinement: refine.trim() });
              setRefine('');
            }}
            className="flex gap-1.5"
          >
            <label htmlFor="agent-refine" className="sr-only">
              Change the plan
            </label>
            <input
              id="agent-refine"
              value={refine}
              onChange={(e) => setRefine(e.target.value)}
              maxLength={AGENT_LIMITS.instruction}
              placeholder="Change it, for example: make it four groups"
              className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 text-[12px] placeholder:text-ink-3 focus-visible:border-ink-3"
            />
            <Button type="submit" size="sm" disabled={!refine.trim()}>
              Change it
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-md border border-line bg-surface px-3 py-2.5">
      <h3 className="text-[13px] font-semibold text-ink">{heading}</h3>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function PlanGroup({
  isNew,
  title,
  sectionOn,
  onSection,
  onTitle,
  count,
  warnings,
  ideasHere,
  children,
}: {
  isNew: boolean;
  title: string;
  sectionOn: boolean;
  onSection: (v: boolean) => void;
  onTitle: (v: string) => void;
  count: number;
  warnings: string[];
  ideasHere: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={cx('flex flex-col gap-1.5 rounded-md border border-line bg-surface px-3 py-2.5', !sectionOn && 'opacity-60')}>
      <div className="flex items-center gap-2">
        {isNew && <Tick checked={sectionOn} onChange={onSection} label={`Make the section ${title}`} />}
        {isNew ? (
          <input
            aria-label="Section title"
            value={title}
            maxLength={AGENT_LIMITS.sectionTitle}
            onChange={(e) => onTitle(e.target.value)}
            className="h-7 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 text-[13px] font-semibold text-ink hover:border-line focus-visible:border-line-strong"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{title === 'Loose notes' ? title : `Into ${title}`}</span>
        )}
        <span className="text-[12px] text-ink-3 tabular-nums">{count}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? `Hide the notes for ${title}` : `Show the notes for ${title}`}
          onClick={() => setOpen((o) => !o)}
          className="pressable key-quiet flex size-7 items-center justify-center rounded-[7px] text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <ChevronRight aria-hidden size={15} strokeWidth={1.75} className={cx('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
        </button>
      </div>
      {isNew && <span className="-mt-1 pl-6 text-[11px] text-ink-3">New section, AI title</span>}
      {ideasHere && <span className="pl-6 text-[11px] text-ink-3">Ticked ideas below also go here.</span>}
      {warnings.map((w, i) => (
        <Warn key={i}>{w}</Warn>
      ))}
      {open && <ul className="flex flex-col gap-2 pt-1">{children}</ul>}
    </section>
  );
}

// ---------- idea picker (PRD 3.4) ----------

function IdeaPicker({ run, target }: { run: AgentRun; target: string }) {
  const decisions = useStore((s) => s.decisions);
  return (
    <section aria-labelledby="agent-ideas" className="flex flex-col gap-2">
      <h3 id="agent-ideas" className="text-[13px] font-semibold text-ink">
        Ideas to pick from
      </h3>
      <p className="text-[12px] text-ink-2">Ticked ideas become notes in {target}.</p>
      <ul className="flex flex-col gap-2" aria-live="polite">
        {run.ideas.map((i: AgentIdea) => {
          const d = i.conflictsWith ? decisions.find((x) => x.id === i.conflictsWith) : undefined;
          return (
            <li key={i.id} className="flex items-start gap-2 border-t border-line pt-2">
              <Tick checked={isOn(run.ticks, tickKey.idea(i.id))} onChange={(v) => setTick(tickKey.idea(i.id), v)} label={`Use the idea "${first(i.text, 40)}"`} />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[12px] leading-snug text-ink">{i.text}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[12px] text-ink-3">AI</span>
                  <span className="text-[11px] text-ink-3">{i.angle}</span>
                </span>
                {d && <Warn>Goes against: {first(d.text, 80)}</Warn>}
              </span>
            </li>
          );
        })}
        {run.ideasPending && (
          <li role="status" className="flex items-center gap-2 text-[12px] text-ink-3">
            <LoaderCircle aria-hidden size={14} strokeWidth={1.75} className="animate-spin motion-reduce:animate-none" />
            More ideas on the way…
          </li>
        )}
        {!run.ideasPending && run.ideas.length === 0 && <li className="text-[12px] text-ink-3">No new ideas came back. The rest of the plan still works.</li>}
      </ul>
    </section>
  );
}

// ---------- "The agent's plan is ready" toast (PRD 9, panel closed mid-run) ----------

function AgentToast() {
  const toast = useAgent((s) => s.toast);
  // Sits on the canvas, clear of the sidebar (56 px rail, plus the 300 px panel when open).
  const sidebarOpen = useStore((s) => s.dockOpen);
  if (!toast) return null;
  return createPortal(
    <div role="status" style={{ left: sidebarOpen ? 377 : 77 }} className="fixed bottom-[88px] z-30 flex items-center gap-3 rounded-[13px] border border-line bg-ink py-1.5 pr-1.5 pl-3 text-[13px] text-white shadow-raised">
      <WandSparkles aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-white/80" />
      The agent's plan is ready
      <button type="button" onClick={openAgent} className="pressable key-dark h-7 rounded-[7px] bg-white/15 px-2.5 font-medium hover:bg-white/25">
        Review
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => useAgent.setState({ toast: false })}
        className="pressable key-quiet key-dark-quiet flex size-7 items-center justify-center rounded-[7px] text-white/70 hover:text-white"
      >
        <X aria-hidden size={14} strokeWidth={1.75} />
      </button>
    </div>,
    document.body,
  );
}
