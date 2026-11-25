import { ArrowUp, Check, ChevronDown, ChevronRight, Eye, EyeOff, FileText, LayoutGrid, Maximize2, MessageSquareText, Minimize2, PanelLeftClose, Paperclip, Plus, Sparkles, Users, X, type LucideIcon } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { markIdeaUsed, useIdeas } from '../lib/ideas.ts';
import type { ContextChip, Suggestion } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { board } from '../lib/board.ts';
import { useProfile } from '../lib/profile.ts';
import { go } from '../lib/router.ts';
import { setProblemPinned, useStore } from '../store.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { Tooltip } from '../ui/Tooltip.tsx';
import { cx } from '../ui/cx.ts';
import { removeMeetingChip } from '../lib/meeting.ts';
import { MeetingChipOwner, MeetingForm } from './MeetingContext.tsx';
import { LockIcon, takeNotes } from './nodes.tsx';
import { ProblemField } from './ProblemField.tsx';
import type { IconLook } from './Toolbar.tsx';
import { AgentPanel } from './AgentPanel.tsx';
import { AgentFindings } from './AgentSession.tsx';
import { ContextIcon, sourceLine } from './ContextIcon.tsx';
import { useAgent } from '../lib/agent.ts';

/*
  Left sidebar, Figma style (user request, 25 Nov): an icon rail, and a panel beside it.
  Board holds the problem (with a switch to show it on the board) and the person's own
  private canvases ("Your notes"). Context (CX), AI ideas (BP) and the private Answer (SN)
  moved here from the bottom toolbar. Clicking the open tab, or the fold button, leaves the
  rail only. Panels stay mounted while hidden, so the ideas tray and a half-typed context
  entry survive.
*/

export type DockTab = 'board' | 'context' | 'ideas' | 'answer' | 'agent';

// `look`: the icon's filled state while its panel is open (styles.css).
const PANELS: { id: DockTab; label: string; icon: LucideIcon; look: IconLook }[] = [
  { id: 'board', label: 'Board', icon: LayoutGrid, look: 'icon-fill' },
  { id: 'context', label: 'Context', icon: Paperclip, look: 'icon-bold' },
  // One AI tab (user request, 25 Nov): ask for ideas, or tell it what to do with the board. It is the
  // agent panel, with the private idea cards inside. Its open state lives in src/lib/agent.ts.
  { id: 'agent', label: 'Agent', icon: Sparkles, look: 'icon-fill' },
  { id: 'answer', label: 'Answer', icon: MessageSquareText, look: 'icon-cut' },
];

// The sidebar panel can be dragged wider (user request, 25 Nov). Remembered in this browser.
const PANEL_WIDTH_KEY = 'sidebar-width';
const PANEL_MIN = 260;
const PANEL_MAX = 640;
const PANEL_DEFAULT = 300;
const clampWidth = (w: number) => Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, w)));
function readPanelWidth() {
  try {
    const v = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    return v ? clampWidth(v) : PANEL_DEFAULT;
  } catch {
    return PANEL_DEFAULT;
  }
}

/** A thin handle on the panel's right edge: drag it, or focus it and use the arrow keys. Double-click resets. */
function ResizeHandle({ width, onChange }: { width: number; onChange: (w: number) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize"
      onPointerDown={(e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = width;
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        setDragging(true);
        const move = (ev: PointerEvent) => onChange(startW + ev.clientX - startX);
        const up = () => {
          setDragging(false);
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      }}
      onDoubleClick={() => onChange(PANEL_DEFAULT)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 16;
        if (e.key === 'ArrowRight') onChange(width + step);
        else if (e.key === 'ArrowLeft') onChange(width - step);
        else return;
        e.preventDefault();
      }}
      className={cx(
        'group absolute top-0 -right-1.5 z-20 flex h-full w-3 cursor-col-resize justify-center outline-none',
        dragging && '[&>span]:bg-accent',
      )}
    >
      <span aria-hidden className="h-full w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-line-strong keys:group-focus-visible:bg-accent" />
    </div>
  );
}

const toggle = (v: DockTab) => {
  const s = useStore.getState();
  const agentOn = useAgent.getState().open;
  if (v === 'agent') {
    if (agentOn && s.dockOpen) useStore.setState({ dockOpen: false });
    else {
      useAgent.setState((a) => ({ open: true, toast: false, focusTick: a.focusTick + 1 }));
      useStore.setState({ dockOpen: true });
    }
    return;
  }
  useAgent.setState({ open: false });
  useStore.setState(!agentOn && s.dockOpen && s.dock === v ? { dockOpen: false } : { dock: v, dockOpen: true });
};

export function Sidebar({ boardId, onPlace }: { boardId: string; onPlace: (s: { id: string; text: string }) => void }) {
  const dock = useStore((s) => s.dock);
  const open = useStore((s) => s.dockOpen);
  const opinion = useStore((s) => s.opinion);
  const chips = useStore((s) => s.chips);
  // The Answer tab exists only while there is an answer.
  const agentOn = useAgent((s) => s.open);
  // Anything that switches the panel (an Ask AI answer, a meeting draft) takes over from the agent.
  useEffect(() => useAgent.setState({ open: false }), [dock]);
  const tab: DockTab = agentOn || dock === 'ideas' || (dock === 'answer' && !opinion) ? 'agent' : dock;
  const title = PANELS.find((p) => p.id === tab)?.label ?? '';
  // User, 25 Nov: the agent can take the whole screen. It is the same panel, only wider, so the
  // typed text, the run, the ideas and the recent list are all still there.
  const [wanted, setWanted] = useState(false);
  const full = wanted && open && tab === 'agent';
  const applied = useAgent((s) => s.run?.status === 'applied');
  useEffect(() => {
    if (!open || tab !== 'agent') setWanted(false);
  }, [open, tab]);
  // An applied plan, or "view on board" on a locked decision: go back to where it can be seen.
  const reveal = useStore((s) => s.reveal);
  useEffect(() => {
    if (applied || reveal) setWanted(false);
  }, [applied, reveal]);
  const [contextView, setContextView] = useState<ContextView>('plain');
  const body = cx('nowheel min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4');
  const [panelWidth, setPanelWidthState] = useState(readPanelWidth);
  const setPanelWidth = (w: number) => {
    const v = clampWidth(w);
    setPanelWidthState(v);
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(v));
    } catch {
      // private mode: the width just is not remembered
    }
  };

  return (
    <aside aria-label="Sidebar" className="relative flex shrink-0 border-r border-line bg-surface">
      <nav aria-label="Sidebar panels" className="flex w-14 flex-col items-center gap-1 border-r border-line py-3">
        {PANELS.filter((p) => p.id !== 'answer' || opinion).map(({ id, label, icon: Icon, look }) => {
          const on = open && tab === id;
          const count = id === 'context' && chips.length > 0 ? chips.length : null;
          return (
            <Tooltip key={id} label={count ? `${label} (${count})` : label} side="right">
              <button
                type="button"
                data-panel-button
                onClick={() => toggle(id)}
                aria-expanded={on}
                aria-controls="board-panel"
                aria-label={count ? `${label}, ${count} ${count === 1 ? 'item' : 'items'}` : label}
                className={cx(
                  'pressable key-quiet key-latch relative flex size-10 items-center justify-center rounded-[10px]',
                  on ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                <Icon aria-hidden size={20} strokeWidth={1.5} className={look} />
                {count && (
                  <span
                    aria-hidden
                    className={cx(
                      'absolute top-0.5 right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold tabular-nums',
                      on ? 'bg-accent text-white' : 'bg-ink text-white',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            </Tooltip>
          );
        })}
      </nav>
      <section
        id="board-panel"
        aria-label={title}
        hidden={!open}
        className={cx('flex flex-col', full ? 'screen-enter absolute inset-y-0 left-14 z-40 w-[calc(100vw-3.5rem)] bg-surface' : 'relative')}
        style={full ? undefined : { width: panelWidth }}
        onKeyDown={(e) => {
          // Not from a sheet or pop-up: those are outside this element in the page.
          if (full && e.key === 'Escape' && !e.defaultPrevented && e.currentTarget.contains(e.target as Node)) setWanted(false);
        }}
      >
        {/* The placeholder keeps the board from shifting while the panel lies over it. */}
        {!full && <ResizeHandle width={panelWidth} onChange={setPanelWidth} />}
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 pr-2 pl-4">
          {tab === 'context' ? <ContextHeading value={contextView} onChange={setContextView} /> : <h2 className="text-[14px] font-semibold">{title}</h2>}
          {full && <p className="ml-auto text-[13px] text-ink-3">Only you see this. Nothing reaches the board until you apply it.</p>}
          <span className="flex items-center gap-1">
          {tab === 'agent' && (
            <Tooltip label={full ? 'Back to the board (Esc)' : 'Expand to full screen'}>
              <button
                type="button"
                onClick={() => setWanted(!full)}
                aria-label={full ? 'Back to the board' : 'Expand to full screen'}
                className="pressable key-quiet flex size-8 items-center justify-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                {full ? <Minimize2 aria-hidden size={18} strokeWidth={1.5} /> : <Maximize2 aria-hidden size={18} strokeWidth={1.5} />}
              </button>
            </Tooltip>
          )}
          <Tooltip label="Fold the sidebar">
            <button
              type="button"
              onClick={() => useStore.setState({ dockOpen: false })}
              aria-label="Fold the sidebar"
              className="pressable key-quiet flex size-8 items-center justify-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <PanelLeftClose aria-hidden size={18} strokeWidth={1.5} />
            </button>
          </Tooltip>
          </span>
        </header>
        <div className={cx(body, tab !== 'board' && 'hidden')}>
          <BoardPanel boardId={boardId} />
        </div>
        <div className={cx(body, tab !== 'context' && 'hidden')}>
          <ContextPanel boardId={boardId} mode={contextView} />
        </div>
        <div className={cx('flex min-h-0 flex-1', tab !== 'agent' && 'hidden')}>
          <div className={cx(body, 'min-w-0')}>
          <AgentPanel
            boardId={boardId}
            full={full}
            ideas={
              <IdeaList
                boardId={boardId}
                onPlace={(s) => {
                  setWanted(false);
                  onPlace(s);
                }}
              />
            }
          />
          </div>
          {full && <AgentFindings boardId={boardId} onApproved={() => setWanted(false)} />}
        </div>
        {opinion && tab === 'answer' && (
          <div className={body}>
            <AnswerPanel />
          </div>
        )}
      </section>
      {full && <div aria-hidden style={{ width: panelWidth }} />}
    </aside>
  );
}

// ---------- Board: problem and your own canvases ----------

function BoardPanel({ boardId }: { boardId: string }) {
  const pinned = useStore((s) => s.problemPinned);
  const myCanvases = useStore((s) => s.myCanvases);
  const cards = useStore((s) => s.cards);
  const me = useProfile((s) => s.profile!.userId);

  // Other people's private canvases, from the reservation dots on the shared board.
  const others = useMemo(() => {
    const by = new Map<string, { name: string; color: string; count: number }>();
    for (const c of cards) {
      if (!c.reservedBy || c.reservedBy === me) continue;
      const e = by.get(c.reservedBy) ?? { name: c.reservedByName ?? 'Someone', color: c.reservedByColor ?? '#57544d', count: 0 };
      e.count++;
      by.set(c.reservedBy, e);
    }
    return [...by.values()];
  }, [cards, me]);

  const heading = 'px-1 text-[13px] font-semibold text-ink';
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="side-problem" className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h3 id="side-problem" className={heading}>
            Problem
          </h3>
          <Tooltip label={pinned ? 'Hide from the board' : 'Show on the board'}>
            <button
              type="button"
              onClick={() => setProblemPinned(!pinned)}
              aria-pressed={pinned}
              aria-label="Show the problem on the board"
              className="pressable key-quiet flex size-7 items-center justify-center rounded-[7px] text-ink-3 hover:bg-surface-2 hover:text-ink aria-pressed:text-ink-2"
            >
              {pinned ? <Eye aria-hidden size={16} strokeWidth={1.5} /> : <EyeOff aria-hidden size={16} strokeWidth={1.5} />}
            </button>
          </Tooltip>
        </div>
        <ProblemField variant="sidebar" />
      </section>

      <section aria-labelledby="side-notes" className="flex flex-col gap-1.5">
        <h3 id="side-notes" className={heading}>
          Your notes
        </h3>
        {myCanvases.length === 0 ? (
          <p className="px-1 text-[13px] leading-relaxed text-ink-2">
            Select notes on the board and take them with you. Your private canvases show up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {myCanvases.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => go({ name: 'canvas', boardId, explorationId: c.id })}
                  className="pressable key-quiet flex w-full items-center gap-2.5 rounded-[8px] px-2 py-2 text-left hover:bg-surface-2"
                >
                  <LockIcon className="size-4 text-ink-2" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-medium text-ink">Canvas {myCanvases.length - i}</span>
                    <span className="text-[12px] text-ink-3">
                      {c.noteCount} {c.noteCount === 1 ? 'note' : 'notes'}
                      {' · '}
                      {c.messageCount ? `${c.messageCount} ${c.messageCount === 1 ? 'message' : 'messages'}` : 'no chat yet'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 && (
        <section aria-labelledby="side-others" className="flex flex-col gap-1.5">
          <h3 id="side-others" className={heading}>
            Exploring privately
          </h3>
          <ul className="flex flex-col gap-1 px-1">
            {others.map((o) => (
              <li key={o.name} className="flex items-center gap-2 text-[13px] text-ink-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} />
                <span>
                  <span className="font-medium text-ink">{o.name}</span>, {o.count} {o.count === 1 ? 'note' : 'notes'}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-1 text-[12px] leading-relaxed text-ink-3">You can see that they are exploring, not what. Their chat stays with them until they share a report.</p>
        </section>
      )}
    </div>
  );
}

// ---------- 8. Context intake ----------

const CONTEXT_VIEWS = [
  { value: 'plain', label: 'General Context', icon: FileText },
  { value: 'meeting', label: 'Build from Meeting', icon: Users },
] as const;
type ContextView = (typeof CONTEXT_VIEWS)[number]['value'];
const CONTEXT_MAX = 20_000;

/*
  The panel heading is the view picker (user, 25 Nov): the heading names the view, with a chevron
  beside it, and the choices open over the content. It reads as a heading, so it only underlines.
*/
function ContextHeading({ value, onChange }: { value: ContextView; onChange: (v: ContextView) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLButtonElement>(null);
  const current = CONTEXT_VIEWS.find((v) => v.value === value)!;
  const close = () => {
    setOpen(false);
    top.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);

  return (
    <div ref={box} className="relative min-w-0" onKeyDown={(e) => e.key === 'Escape' && open && close()}>
      <h2 className="text-[14px] font-semibold">
        <button ref={top} type="button" aria-expanded={open} aria-controls="context-views" onClick={() => setOpen((o) => !o)} className="flex cursor-pointer items-center gap-1 underline-offset-2 hover:underline">
          {current.label}
          <ChevronDown aria-hidden size={14} strokeWidth={1.75} className={cx('shrink-0 text-ink-2 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
        </button>
      </h2>
      <ul
        id="context-views"
        className={cx(
          'absolute top-full -left-2 z-30 mt-1.5 w-max rounded-md border border-line bg-surface p-1 shadow-raised transition-[translate,visibility,opacity] duration-200 ease-out motion-reduce:transition-none',
          open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1.5 opacity-0',
        )}
      >
        {CONTEXT_VIEWS.map(({ value: v, label, icon: Icon }) => (
          <li key={v}>
            <button
              type="button"
              aria-current={v === value || undefined}
              onClick={() => {
                onChange(v);
                close();
              }}
              className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-[7px] px-2 text-left text-[13px] whitespace-nowrap text-ink hover:bg-surface-2"
            >
              <Icon aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-ink-2" />
              <span className="flex-1">{label}</span>
              <Check aria-hidden size={14} strokeWidth={2} className={cx('ml-3 shrink-0 text-accent', v !== value && 'invisible')} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContextPanel({ boardId, mode }: { boardId: string; mode: ContextView }) {
  const chips = useStore((s) => s.chips);
  const me = useProfile((s) => s.profile!.userId);
  const [value, setValue] = useState('');
  const [fileNote, setFileNote] = useState('');
  // User, 25 Nov: the list is folded away until asked for. Adding something opens it, to show progress.
  const [listOpen, setListOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return setFileNote('That file is too large. Paste a shorter part of it.');
    const t = await f.text();
    setValue(t.slice(0, CONTEXT_MAX));
    setFileNote(t.length > CONTEXT_MAX ? 'The file is long. Only the first 20,000 characters are in the box.' : '');
  };

  const isLink = /^https?:\/\/\S+$/i.test(value.trim());

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    const type = isLink ? 'link' : 'text';
    const id = board.addChip(type, v);
    setValue('');
    setFileNote('');
    setListOpen(true);
    try {
      const r = await api.context(boardId, type, v);
      board.updateChip(id, r.status === 'ready' ? { title: r.title, summary: r.summary, status: 'ready' } : { status: 'error', message: r.message ?? 'Could not read this page. Paste the text instead.' });
    } catch (err) {
      board.updateChip(id, { status: 'error', message: err instanceof Error ? err.message : 'The AI could not summarise this. Try again.' });
    }
  };

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* Meeting addendum 3.1: a way in beside text and links. */}
      {mode === 'meeting' && <MeetingForm boardId={boardId} onAdd={() => setListOpen(true)} />}
      <form onSubmit={add} className={cx('flex flex-col gap-2', mode !== 'plain' && 'hidden')}>
        <label htmlFor="add-context" className="text-[13px] font-semibold">
          Add context
        </label>
        {/* User, 25 Nov: the arrow and the plus (open a file) sit in the box. */}
        <div className="rounded-md border border-line-strong bg-surface focus-within:border-ink-3 keys:focus-within:outline-2 keys:focus-within:outline-offset-2 keys:focus-within:outline-accent">
          <textarea
            id="add-context"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setFileNote('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add(e);
            }}
            rows={value.length > 80 ? 4 : 2}
            maxLength={CONTEXT_MAX}
            placeholder="Paste a link, or some text such as interview notes"
            className="block w-full resize-none bg-transparent px-2.5 pt-2 text-[13px] leading-snug outline-none placeholder:text-ink-3 focus-visible:outline-none"
          />
          <div className="flex items-center justify-between p-1.5">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.vtt,.srt,text/plain,text/markdown,text/vtt"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Tooltip label="Upload a text file or transcript">
              <button
                type="button"
                aria-label="Upload a file"
                onClick={() => fileRef.current?.click()}
                className="pressable key-quiet flex size-8 items-center justify-center rounded-[8px] text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <Plus aria-hidden size={16} strokeWidth={2} />
              </button>
            </Tooltip>
            <Tooltip label="Add (Ctrl+Enter)">
              <button
                type="submit"
                aria-label="Add"
                disabled={!value.trim()}
                className="pressable key-accent flex size-8 items-center justify-center rounded-[8px] bg-accent text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3"
              >
                <ArrowUp aria-hidden size={16} strokeWidth={2} />
              </button>
            </Tooltip>
          </div>
        </div>
        <span role="status" className="text-[12px] text-ink-3">{fileNote || (value.trim() ? (isLink ? 'Adds a link. The AI reads the page.' : 'Adds text. The AI writes a short summary.') : 'Everyone on the board sees it.')}</span>
        {/* CX-6: other inputs, so the intent is visible. */}
        <div className="flex gap-2" aria-label="More ways to add context">
          {['Image', 'Voice'].map((k) => (
            <button key={k} type="button" disabled className="flex h-7 cursor-not-allowed items-center gap-1.5 rounded-sm border border-dashed border-line-strong px-2 text-[12px] text-ink-3">
              {k} <span className="text-[11px]">Coming later</span>
            </button>
          ))}
        </div>
      </form>

      {chips.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong px-3 py-4 text-[13px] leading-relaxed text-ink-2">
          No context yet. Links and text added here feed the AI for everyone on this board.
        </p>
      ) : (
        <section className="mt-3 flex flex-col border-t border-line pt-6">
          {/* A heading that folds the list, not a button to look at: it underlines on hover and has no key. */}
          <h3 className="text-[13px] font-semibold text-ink">
            <button type="button" aria-expanded={listOpen} aria-controls="context-list" onClick={() => setListOpen((o) => !o)} className="flex cursor-pointer items-center gap-1 underline-offset-2 hover:underline">
              Added context ({chips.length})
              <ChevronRight aria-hidden size={14} strokeWidth={1.75} className={cx('text-ink-2 transition-transform duration-150 motion-reduce:transition-none', listOpen && 'rotate-90')} />
            </button>
          </h3>
          <ul id="context-list" hidden={!listOpen} className="mt-1 divide-y divide-line">
            {[...chips].reverse().map((c) => (
              <ChipItem key={c.id} chip={c} mine={c.addedBy === me} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ChipItem({ chip, mine }: { chip: ContextChip; mine: boolean }) {
  const [open, setOpen] = useState(false);
  // The full text: the meeting text, or the pasted text. A link opens its page instead.
  const full = chip.type === 'meeting' ? chip.fullText : chip.type === 'text' ? chip.source : undefined;
  // User, 25 Nov: no grey box on hover; the text and chevron underline instead (border under both).
  const more = 'flex items-center gap-0.5 border-b border-transparent text-[12px] font-medium text-ink-2 hover:border-ink-2 hover:text-ink focus-visible:border-ink-2';
  return (
    <li className="flex flex-col gap-1.5 py-3 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {/* The kind as an icon (user request, 25 Nov); hovering it says where the item came from. */}
          <ContextIcon type={chip.type} source={sourceLine(chip.type, mine ? 'you' : chip.addedByName, chip.source)} />
          <span className="truncate text-[13px] font-semibold" title={chip.title}>
            {chip.status === 'pending' ? (chip.type === 'link' ? 'Reading the page…' : chip.type === 'meeting' ? 'Reading the meeting…' : 'Summarising…') : chip.title}
          </span>
        </span>
        {mine && (
          <button
            type="button"
            onClick={() => (chip.type === 'meeting' ? removeMeetingChip(chip.id, chip.sourceId) : board.removeChip(chip.id))}
            aria-label={`Remove ${chip.title}`}
            className="pressable key-quiet -mt-1 -mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-[6px] text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>
      {chip.status === 'pending' && <span aria-hidden className="h-3 w-3/4 animate-pulse rounded-sm bg-surface-2" />}
      {chip.status === 'error' && (
        <p role="alert" className="text-[12px] leading-relaxed text-danger">
          {chip.message}
        </p>
      )}
      {chip.status === 'ready' && (
        // User, 25 Nov: no purple box. A plain "AI summary" label, the summary on white under it.
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold text-ink-3">AI summary</span>
          <p className="text-[12px] leading-relaxed text-ink">{chip.summary}</p>
        </div>
      )}
      {chip.type === 'meeting' && mine && <MeetingChipOwner chip={chip} />}
      <div className="flex items-center justify-between gap-2 text-[12px] text-ink-3">
        <span>Added by {mine ? 'you' : chip.addedByName}</span>
        {/* "View more" (user request, 25 Nov): grey, with a chevron, for the full text. */}
        {chip.type === 'link' ? (
          <a href={chip.source} target="_blank" rel="noopener noreferrer" className={more}>
            Open link
            <ChevronRight aria-hidden size={14} strokeWidth={1.75} />
          </a>
        ) : full ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={more}>
            {open ? 'View less' : 'View more'}
            <ChevronRight aria-hidden size={14} strokeWidth={1.75} className={cx('transition-transform duration-150', open && 'rotate-90')} />
          </button>
        ) : null}
      </div>
      {open && full && (
        <p className="max-h-56 overflow-y-auto rounded-sm border border-line bg-surface-2 px-2 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">{full}</p>
      )}
    </li>
  );
}

// ---------- 9. Brainstorm partner ----------

/**
 * The private idea cards, shown in the AI panel when someone asks for ideas with nothing selected.
 * The ask itself goes through the panel's one box (src/lib/ideas.ts decides which asks these are).
 */
export function IdeaList({ boardId, onPlace }: { boardId: string; onPlace: (s: { id: string; text: string }) => void }) {
  const items = useIdeas((s) => s.items);
  const busy = useIdeas((s) => s.busy);
  const error = useIdeas((s) => s.error);

  useEffect(() => {
    const onUsed = (e: Event) => markIdeaUsed((e as CustomEvent).detail);
    window.addEventListener('suggestion-used', onUsed);
    return () => window.removeEventListener('suggestion-used', onUsed);
  }, []);

  if (!items.length && !busy && !error) return null;
  return (
    <section aria-labelledby="ideas-heading" className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <h3 id="ideas-heading" className="text-[13px] font-semibold text-ink">
          Ideas
        </h3>
        <p className="text-[12px] leading-relaxed text-ink-3">Only you see these. Drag one onto the board, or place it, and it becomes a note marked AI.</p>
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {busy && <li aria-hidden className="h-20 animate-pulse rounded-md bg-ai-bg" />}
        {items.map((s) => (
          <IdeaCard key={s.id} boardId={boardId} s={s} onPlace={onPlace} />
        ))}
      </ul>
    </section>
  );
}

/** Locked decisions 8.3: "Goes against: <decision>" under an idea. A flag only; the idea can still be placed. */
function ConflictFlag({ id, line }: { id?: string | null; line?: string }) {
  const d = useStore((st) => (id ? st.decisions.find((x) => x.id === id && x.status === 'locked') : undefined));
  if (!d) return null;
  return (
    <p className="text-[12px] leading-snug font-medium text-draft" title={line || undefined}>
      Goes against: {d.text.length > 90 ? `${d.text.slice(0, 89).trimEnd()}…` : d.text}
    </p>
  );
}

function IdeaCard({ boardId, s, onPlace }: { boardId: string; s: Suggestion; onPlace: (s: { id: string; text: string }) => void }) {
  const [why, setWhy] = useState<{ why: string; basedOn: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const cards = useStore((st) => st.cards);
  const chips = useStore((st) => st.chips);

  const explain = async () => {
    if (why) return setWhy(null);
    setLoading(true);
    try {
      setWhy(await api.explain(boardId, s.id));
    } catch (e) {
      setWhy({ why: e instanceof Error ? e.message : 'Could not explain this one.', basedOn: [] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <li
      draggable={!s.used}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-suggestion', JSON.stringify({ id: s.id, text: s.text }));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className={cx('flex flex-col gap-2 rounded-md border border-ai-line bg-ai-bg p-3', !s.used && 'cursor-grab active:cursor-grabbing', s.used && 'opacity-60')}
    >
      <p className="text-[13px] leading-relaxed text-ink">{s.text}</p>
      <ConflictFlag id={s.conflictsWith} line={s.conflictLine} />
      {why && (
        <div className="rounded-sm bg-surface px-2 py-1.5 text-[12px] leading-relaxed text-ink-2">
          <p>{why.why}</p>
          {why.basedOn.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {why.basedOn.map((id) => {
                const n = cards.find((c) => c.id === id);
                const c = chips.find((x) => x.id === id);
                return (
                  <li
                    key={id}
                    onMouseEnter={() => n && useStore.setState({ highlight: [id] })}
                    onMouseLeave={() => useStore.setState({ highlight: [] })}
                    className="truncate"
                  >
                    · {n ? `Note: ${n.text}` : c ? `Context: ${c.title}` : id}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => void explain()} aria-expanded={Boolean(why)} className="text-[12px] font-medium text-ai hover:underline">
          {loading ? 'Thinking…' : why ? 'Hide why' : 'Why this?'}
        </button>
        {s.used ? (
          <span className="text-[12px] text-ink-3">Placed</span>
        ) : (
          <Button size="sm" className="h-7" onClick={() => onPlace({ id: s.id, text: s.text })}>
            Place on board
          </Button>
        )}
      </div>
    </li>
  );
}

// ---------- 10. Answer about selected notes ----------

function AnswerPanel() {
  const o = useStore((s) => s.opinion)!;
  const cards = useStore((s) => s.cards);

  const labelled = Object.entries(o.citations).map(([label, id]) => ({ label, id, card: cards.find((c) => c.id === id) }));

  const saveAsNote = () => {
    const picked = cards.filter((c) => o.noteIds.includes(c.id));
    const x = picked.length ? Math.max(...picked.map((c) => c.x + c.w)) + 160 : 0;
    const y = picked.length ? Math.min(...picked.map((c) => c.y)) + 100 : 0;
    const text = o.text.replace(/\[N(\d+)\]/g, (_, n) => {
      const c = cards.find((x) => x.id === o.citations[`N${n}`]);
      return c ? `(${c.author}'s note)` : '';
    });
    board.addNote({ x, y }, { text: `${o.ask}: ${text}`.slice(0, 600), origin: 'ai' });
  };

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div>
        <p className="text-[14px] font-semibold text-ink">You asked</p>
        <p className="text-[14px] text-ink-2">{o.ask}</p>
      </div>
      <ul className="flex flex-col gap-1">
        {labelled.map(({ label, id, card }) => (
          <li
            key={label}
            onMouseEnter={() => useStore.setState({ highlight: [id] })}
            onMouseLeave={() => useStore.setState({ highlight: [] })}
            className="flex gap-2 text-[12px] leading-snug text-ink-2"
          >
            <span className="font-semibold text-ai">[{label}]</span>
            <span className="truncate">{card?.text ?? 'A note that was removed'}</span>
          </li>
        ))}
      </ul>
      <div className="rounded-md border border-ai-line bg-ai-bg px-3 py-2.5" aria-live="polite" aria-busy={o.status === 'streaming'}>
        <span className="mb-1 block">
          <Badge tone="ai">Agent</Badge>
        </span>
        {o.status === 'error' ? (
          <p role="alert" className="text-[13px] text-danger">
            {o.error}
          </p>
        ) : (
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
            {withCitations(o.text, o.citations)}
            {o.status === 'streaming' && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-ai align-middle" />}
          </p>
        )}
      </div>
      {o.status === 'done' && (
        <div className="flex flex-col gap-2">
          <Button size="sm" onClick={saveAsNote}>
            Save as note
          </Button>
          <Button size="sm" variant="primary" onClick={() => void takeNotes(o.noteIds, o.opinionId)}>
            Take these into a canvas
          </Button>
          <Button size="sm" variant="ghost" onClick={() => useStore.setState({ opinion: null, dock: 'ideas', highlight: [] })}>
            Discard answer
          </Button>
          <p className="text-[12px] leading-relaxed text-ink-3">Only you see this answer. Saving it puts a note marked AI on the board with your name.</p>
        </div>
      )}
      {o.status === 'error' && (
        <Button size="sm" variant="ghost" onClick={() => useStore.setState({ opinion: null, dock: 'ideas', highlight: [] })}>
          Discard answer
        </Button>
      )}
    </div>
  );
}

/** SN-2: [N1] labels become chips that outline their note on hover or focus. */
function withCitations(text: string, citations: Record<string, string>): ReactNode {
  const parts = text.split(/(\[N\d+\])/g);
  return parts.map((p, i) => {
    const m = /^\[(N\d+)\]$/.exec(p);
    const id = m ? citations[m[1]] : undefined;
    if (!m || !id) return <Fragment key={i}>{p}</Fragment>;
    return (
      <button
        key={i}
        type="button"
        onMouseEnter={() => useStore.setState({ highlight: [id] })}
        onMouseLeave={() => useStore.setState({ highlight: [] })}
        onFocus={() => useStore.setState({ highlight: [id] })}
        onBlur={() => useStore.setState({ highlight: [] })}
        className="pressable key-ai mx-0.5 rounded-sm border border-ai-line bg-surface px-1 text-[12px] font-semibold text-ai hover:border-ai"
      >
        {m[1]}
      </button>
    );
  });
}
