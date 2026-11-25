import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { Lock } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { coverOf } from '../../shared/decision-schema.ts';
import type { Card, Section } from '../../shared/types.ts';
import { board } from '../lib/board.ts';
import { checkLargeIdea, acceptLargeIdea } from '../lib/features.ts';
import { openPrivateCanvas, useCanvasLaunchBusy } from '../lib/private-canvas.ts';
import { useProfile } from '../lib/profile.ts';
import { go } from '../lib/router.ts';
import { api } from '../lib/api.ts';
import { refreshSessions } from '../lib/sessions.ts';
import { DecisionCard } from '../screens/DecisionCard.tsx';
import { useStore } from '../store.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { cx } from '../ui/cx.ts';
import { LockDecision, LockGlyph, LockedPill } from './LockPanel.tsx';
import { ProblemField } from './ProblemField.tsx';
import { StarterContext } from './StarterContext.tsx';

/** Private-exploration lock (Lucide). Size comes from the class, as before. */
export function LockIcon({ className = 'size-3.5' }: { className?: string }) {
  return <Lock aria-hidden strokeWidth={1.75} className={cx('shrink-0', className)} />;
}

// ---------- Sticky ----------

const reservedLabel = (card: Card, me: string | undefined) =>
  card.reservedBy === me ? 'You are exploring this in a private canvas' : `${card.reservedByName ?? 'Someone'} is exploring this in a private canvas`;

export type StickyNodeData = { card: Card };
export type StickyNodeType = Node<StickyNodeData, 'sticky'>;

/** A small, stable tilt per note (-1.6 to 1.6 degrees), so the board looks hand-placed. */
function tiltFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 33) - 16) / 10;
}

export function StickyNode({ data, id }: NodeProps<StickyNodeType>) {
  const { card } = data;
  const me = useProfile((s) => s.profile?.userId);
  const editing = useStore((s) => s.editingId === id);
  const highlighted = useStore((s) => s.highlight.includes(id));
  const peers = useStore((s) => s.peers);
  const large = useStore((s) => s.largeIdea[id]);
  // A decision in force that came from this note (user request, 25 Nov): the note shows the Locked pill.
  const lockedBy = useStore((s) => s.decisions.find((d) => d.status === 'locked' && d.sourceNoteIds.includes(id)));
  const selectedBy = peers.filter((p) => p.selection?.includes(id));
  const [draft, setDraft] = useState(card.text);
  const ref = useRef<HTMLTextAreaElement>(null);

  // While editing, the textarea is bound to the note's Y.Text both ways: each keystroke is a
  // small edit, and other people's edits flow in without moving this person's caret (MP-3).
  // Focus before paint, so typing straight after a double-click lands in the note.
  useLayoutEffect(() => {
    if (!editing) return;
    const el = ref.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);
  useEffect(() => {
    if (!editing) return;
    const t = board.noteText(id);
    setDraft(t?.toString() ?? card.text);
    if (!t) return;
    const onChange = (e: Y.YTextEvent) => {
      if (e.transaction.local) return;
      const el = ref.current;
      let caret = el?.selectionStart ?? 0;
      let index = 0;
      for (const d of e.changes.delta) {
        if (d.retain) index += d.retain;
        else if (typeof d.insert === 'string') {
          if (index <= caret) caret += d.insert.length;
          index += d.insert.length;
        } else if (d.delete) {
          if (index < caret) caret -= Math.min(d.delete, caret - index);
        }
      }
      setDraft(t.toString());
      requestAnimationFrame(() => el?.setSelectionRange(caret, caret));
    };
    t.observe(onChange);
    return () => t.unobserve(onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, id]);

  const commit = () => {
    useStore.setState({ editingId: undefined });
    const t = draft.trim();
    if (!t) {
      board.deleteItems([id]);
      return;
    }
    // Meeting notes are short on purpose (at most 200 characters): no "Turn into a section?" for them.
    if (card.authorId === me && card.source !== 'meeting') checkLargeIdea(id, t);
  };

  const ring = highlighted ? 'var(--color-ai)' : selectedBy[0]?.color;

  return (
    <div
      className="sticky-note"
      data-color={card.color}
      style={{ ['--tilt' as string]: `${tiltFor(id)}deg`, width: card.w, minHeight: card.h }}
      onDoubleClick={() => useStore.setState({ editingId: id })}
    >
      {selectedBy.length > 0 && !highlighted && (
        <span
          className="absolute -top-6 left-0 z-10 max-w-full truncate rounded-sm px-1.5 py-0.5 text-[11px] font-semibold text-white"
          style={{ background: selectedBy[0].color }}
        >
          {selectedBy.map((p) => p.name).join(', ')}
        </span>
      )}
      <div className="paper" style={{ ...(ring ? { outline: `2px solid ${ring}`, outlineOffset: 3 } : {}), paddingTop: card.reservedBy || card.source === 'meeting' || lockedBy ? 6 : undefined }}>
        {(card.reservedBy || card.source === 'meeting' || lockedBy) && (
          <div className="relative z-10 flex flex-wrap items-center gap-1.5">
            {lockedBy && <span className="nodrag"><LockedPill d={lockedBy} /></span>}
            {card.reservedBy && (
              <span role="img" aria-label={reservedLabel(card, me)} title={reservedLabel(card, me)} className="note-ink flex size-5 items-center justify-center">
                <LockIcon className="size-3.5" />
              </span>
            )}
            {card.source === 'meeting' && <MeetingMark card={card} />}
          </div>
        )}
        {editing ? (
          <div className="sticky-copy relative">
            {/* Match the editor's wrapping and keep a final blank line measurable. */}
            <div aria-hidden className="invisible">{draft ? `${draft}\u200b` : 'Type an idea, a fact or a question'}</div>
            <textarea
              ref={ref}
              aria-label="Sticky note text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                board.setText(id, e.target.value);
              }}
              onBlur={commit}
              onKeyDown={(e) => {
                e.stopPropagation(); // keep Backspace and arrows away from the canvas
                if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault();
                  ref.current?.blur();
                  // Keyboard exits return focus to the note. Pointer exits keep their new target.
                  requestAnimationFrame(() => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)?.focus());
                }
              }}
              placeholder="Type an idea, a fact or a question"
              className="sticky-copy nodrag absolute inset-0 size-full resize-none overflow-hidden bg-transparent text-ink outline-none placeholder:text-ink-2 focus-visible:outline-none"
            />
          </div>
        ) : (
          <p
            className={cx('sticky-copy', card.text ? 'text-ink' : 'text-ink-2')}
          >
            {card.text || 'Empty note'}
          </p>
        )}
        {/* WB-4: author name in a darker shade of the note colour, so it reads as part of the note. */}
        <span className="note-ink truncate text-[12px] font-medium">{card.origin === 'ai' ? 'AI' : card.author}</span>
      </div>
      {large && card.authorId === me && (
        <div className="nodrag absolute -bottom-12 left-0 z-10 flex items-center gap-1 rounded-[11px] border border-ai-line bg-ai-bg p-1 pl-2.5 shadow-card">
          <span className="text-[12px] font-medium whitespace-nowrap text-ai" title={large.reason}>
            Turn into a section?
          </span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-ai" onClick={() => acceptLargeIdea(id)}>
            Yes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-ai"
            onClick={() => {
              const { [id]: _drop, ...rest } = useStore.getState().largeIdea;
              useStore.setState({ largeIdea: rest });
            }}
          >
            No
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Meeting addendum 9: "From meeting" on notes drawn from a meeting. The person who added the meeting
 * sees the source passages; everyone else sees only the meeting's title and summary.
 */
function MeetingMark({ card }: { card: Card }) {
  const [open, setOpen] = useState(false);
  const [passages, setPassages] = useState<{ id: string; speaker?: string; text: string }[] | 'missing' | null>(null);
  const chip = useStore((s) => s.chips.find((c) => c.id === card.meetingChipId));
  // Board context is readable by everyone on the board (user decision, 25 Nov): anyone sees the lines.
  const hasSource = Boolean(chip?.sourceId);
  const wrap = useRef<HTMLDivElement>(null);
  // The popover runs past the note's edge: lift this note above its neighbours while it is open.
  useEffect(() => {
    const node = wrap.current?.closest<HTMLElement>('.react-flow__node');
    if (!node || !open) return;
    const prev = node.style.zIndex;
    node.style.zIndex = '1000';
    return () => {
      node.style.zIndex = prev;
    };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || !hasSource || passages) return;
    try {
      const { api } = await import('../lib/api.ts');
      const r = await api.passages(chip!.sourceId!, card.sourceIds ?? []);
      setPassages(r.passages.length ? r.passages : 'missing');
    } catch {
      setPassages('missing');
    }
  };

  return (
    <div ref={wrap} className="nodrag nowheel relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void toggle();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        aria-expanded={open}
        className="pressable key-tint inline-flex h-5 items-center rounded-sm bg-ink/[0.07] px-1.5 text-[11px] font-semibold text-ink hover:bg-ink/[0.12]"
      >
        From meeting{card.kind && card.kind !== 'idea' ? ` · ${card.kind === 'question' ? 'Question' : 'Decision'}` : ''}
      </button>
      {open && (
        <div role="note" className="absolute top-full left-0 z-30 mt-1 w-[280px] rounded-md border border-line bg-surface p-3 text-left text-[12px] leading-relaxed text-ink-2 shadow-raised">
          {!chip ? (
            <p>Source no longer available.</p>
          ) : hasSource ? (
            passages === null ? (
              <p>Loading the passages…</p>
            ) : passages === 'missing' ? (
              <p>Source no longer available.</p>
            ) : (
              <>
                <p className="mb-1.5 font-semibold text-ink">From {chip.title}</p>
                <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                  {passages.map((p) => (
                    <li key={p.id}>
                      <span className="font-semibold text-ink">{p.speaker ?? `Part ${p.id.slice(1)}`}: </span>
                      {p.text}
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : (
            <>
              <p className="font-semibold text-ink">{chip.title}</p>
              <span className="mt-1 block text-[11px] font-semibold text-ink-3">AI summary</span>
              <p>{chip.summary}</p>
              <p className="mt-1.5 text-ink-3">Added by {chip.addedByName}.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Section ----------

export type SectionNodeData = { section: Section; memberIds: string[] };
export type SectionNodeType = Node<SectionNodeData, 'section'>;

export function SectionNode({ data, id, selected }: NodeProps<SectionNodeType>) {
  const canvasLaunchBusy = useCanvasLaunchBusy();
  const { section, memberIds } = data;
  const cover = useStore((s) => coverOf(s.decisions, id));
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(section.title);
  useEffect(() => {
    if (!renaming) setTitle(section.title);
  }, [section.title, renaming]);

  const commit = () => {
    setRenaming(false);
    const t = title.trim();
    if (t && t !== section.title) board.updateSection(id, { title: t, titleSource: 'user' });
    else setTitle(section.title);
  };

  return (
    <>
      {/* Selected: a square blue box with white corner handles, as in Figma (styles.css). */}
      <NodeResizer
        isVisible={selected}
        minWidth={280}
        minHeight={200}
        onResizeEnd={(_, p) => board.updateSection(id, { x: p.x, y: p.y, w: p.width, h: p.height })}
      />
      <div className="h-full w-full rounded-[4px] border border-line bg-surface/70 shadow-card">
        <div className="section-handle group/sec pointer-events-auto flex cursor-grab items-center justify-between gap-3 rounded-t-[4px] px-2 pt-2 pb-2 active:cursor-grabbing">
          <span className="flex min-w-0 items-center gap-2">
            {renaming ? (
              <input
                autoFocus
                aria-label="Section name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                }}
                className="nodrag h-8 min-w-0 rounded-sm border border-line-strong bg-surface px-2 text-[14px] font-semibold outline-none focus-visible:outline-none"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => setRenaming(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'F2') {
                    e.stopPropagation();
                    setRenaming(true);
                  }
                }}
                aria-label={`${section.title}. Press Enter to rename.`}
                className="h-8 max-w-full truncate rounded-[4px] border border-line-strong bg-surface-2 px-2.5 text-[14px] font-medium text-ink"
              >
                {section.title}
              </button>
            )}
            {/* Locked decisions 6.1: a section covered by a decision in force carries the Locked pill. */}
            {cover && !renaming && <LockedPill d={cover} />}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {!cover && (
              // Shown on hover, when the section is selected, on keyboard focus, and while its panel is open.
              <LockDecision
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Lock a decision for ${section.title}`}
                    title="Lock a decision for this section"
                    className={cx(
                      'nodrag w-8 px-0 opacity-0 group-hover/sec:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100',
                      selected && 'opacity-100',
                    )}
                  />
                }
                prefill={() => ({ text: section.title, sectionId: id, sectionOnly: true })}
                side="bottom"
                align="end"
              >
                <LockGlyph className="size-4" />
              </LockDecision>
            )}
            <Button variant="ai" size="sm" className="nodrag" disabled={memberIds.length === 0 || canvasLaunchBusy} onClick={() => void takeNotes(memberIds)}>
              Take section with you
              <span className="tabular-nums opacity-80">{memberIds.length}</span>
            </Button>
          </span>
        </div>
      </div>
    </>
  );
}

/** "Take cards with you" (PC-1): the server snapshots the notes, then they get this person's reservation dot. */
export async function takeNotes(ids: string[], fromOpinionId?: string) {
  const s = useStore.getState();
  const boardId = s.boardId;
  const pick = s.cards.filter((c) => ids.includes(c.id) && c.text.trim()).map((c) => c.id);
  if (!boardId || !pick.length) return;
  await openPrivateCanvas(boardId, pick, { fromOpinionId });
}

// ---------- Reports ----------

export type ReportsNodeType = Node<Record<string, never>, 'reports'>;

export function ReportsNode() {
  const reports = useStore((s) => s.reports);
  const boardId = useStore((s) => s.boardId)!;
  const justLanded = useStore((s) => s.justLanded);
  const read = useProfile((s) => s.read);
  const me = useProfile((s) => s.profile?.userId);
  const approved = [...reports].reverse();
  const [ticked, setTicked] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const reportIds = ticked.filter((id) => reports.some((report) => report.id === id));
  const startDecision = async (reviewReport: boolean) => {
    setStarting(true);
    setError('');
    try {
      const { explorationId } = await api.startDecision(boardId, reportIds);
      void refreshSessions(boardId);
      go({ name: 'canvas', boardId, explorationId, reviewReport });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the session.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <section key={boardId} aria-labelledby="reports-heading" className="w-[360px] rounded-[14px] border border-line bg-surface/70 p-3 shadow-card">
      <h2 id="reports-heading" className="mb-3 flex h-8 items-center gap-2 px-1 text-[14px] font-semibold">
        Reports <span className="font-normal text-ink-3 tabular-nums">{approved.length}</span>
      </h2>
      {reportIds.length > 0 && (
        <div className="nodrag mb-3 flex gap-2">
          <Button size="sm" variant="primary" disabled={starting} onClick={() => void startDecision(false)}>Talk it through</Button>
          <Button size="sm" disabled={starting} onClick={() => void startDecision(true)}>Draft now</Button>
        </div>
      )}
      {error && <p role="alert" className="mb-2 text-[13px] text-danger">{error}</p>}
      {approved.length === 0 && (
        <p className="rounded-md border border-dashed border-line-strong px-4 py-5 text-[13px] leading-relaxed text-ink-2">
          No reports yet. Take notes into a private canvas, explore them with the AI, and approve a report. It lands here with your name on it.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {approved.map((r) => (
          <li key={r.id} className="relative">
            <input
              type="checkbox"
              aria-label={`Select report ${r.body.title}`}
              checked={reportIds.includes(r.id)}
              disabled={starting || (reportIds.length >= 20 && !reportIds.includes(r.id))}
              onChange={(e) => {
                const checked = e.target.checked;
                setTicked((ids) => checked ? [...ids, r.id] : ids.filter((id) => id !== r.id));
              }}
              className="nodrag absolute start-4 top-4 z-10 size-4 accent-accent"
            />
            <button
              type="button"
              onClick={() => {
                useStore.setState({ justLanded: undefined });
                go({ name: 'report', boardId, reportId: r.id });
              }}
              className={cx(
                'pressable key nodrag flex w-full flex-col gap-2 rounded-md border border-line bg-surface p-4 text-left hover:border-line-strong',
                justLanded === r.id && 'just-landed',
              )}
            >
              <span className="flex items-center gap-2 ps-6">
                {!read.includes(r.id) && r.approvedBy !== me && <Badge>New</Badge>}
                <span className="ml-auto text-[12px] text-ink-3">
                  {r.cardNoteIds.length} {r.cardNoteIds.length === 1 ? 'note' : 'notes'}
                </span>
              </span>
              <span className="text-[15px] leading-snug font-semibold text-balance text-ink">{r.body.title}</span>
              <span className="line-clamp-3 text-[13px] leading-relaxed text-ink-2">{r.body.summary}</span>
              <span className="flex items-center justify-between pt-1">
                <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: r.approvedByColor }} />
                  From {r.approvedBy === me ? 'you' : r.approvedByName}
                </span>
                <span className="text-[13px] font-medium text-accent">Read</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Decision ----------

export type DecisionNodeType = Node<Record<string, never>, 'decision'>;

export function DecisionNode() {
  return (
    <div className="nodrag w-[340px] rounded-[14px] border border-line bg-surface/70 p-3 shadow-card [&_h2]:flex [&_h2]:h-8 [&_h2]:items-center [&_h2]:px-1 [&_h2]:text-[14px]">
      <DecisionCard />
    </div>
  );
}

function ProblemNode({ selected }: NodeProps) {
  const boardId = useStore((s) => s.boardId);
  const kind = useStore((s) => s.meta.kind);
  const viewer = useProfile((s) => s.profile?.userId);
  return (
    <>
      <div className="relative">
        <ProblemField />
        {selected && (
          <div aria-hidden className="problem-card-selection">
            <span className="top-0 left-0" />
            <span className="top-0 left-full" />
            <span className="top-full left-0" />
            <span className="top-full left-full" />
          </div>
        )}
      </div>
      {kind === 'blank' && boardId && viewer && <StarterContext key={`${viewer}:${boardId}`} storageKey={`starter-context:${viewer}:${boardId}`} />}
    </>
  );
}

export const nodeTypes = {
  problem: ProblemNode,
  sticky: StickyNode,
  section: SectionNode,
  reports: ReportsNode,
  decision: DecisionNode,
};
