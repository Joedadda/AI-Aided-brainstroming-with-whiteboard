import { useState } from 'react';
import type { Decision } from '../../shared/decision-schema.ts';
import { LockGlyph, lockedLine, scopeOf } from '../canvas/LockPanel.tsx';
import { useProfile } from '../lib/profile.ts';
import { go } from '../lib/router.ts';
import { useStore } from '../store.ts';
import { Badge } from '../ui/Badge.tsx';
import { cx } from '../ui/cx.ts';

const SHOWN = 2;
const MAX = 20;

/**
 * Locked decisions PRD 7.2: the decisions in force on the board, carried into every private canvas.
 * Read-only here. It reads the live board (the canvas route keeps the board's Yjs connection), so
 * it is always current, unlike the snapshot of notes and chips. Hidden when nothing is in force.
 * `seen` is what the person had when they last sent a message, for the New marks.
 */
export function LockedBlock({ boardId, seen }: { boardId: string; seen: Map<string, string> | null }) {
  const all = useStore((s) => s.decisions);
  const sections = useStore((s) => s.sections);
  const me = useProfile((s) => s.profile?.userId);
  const [expanded, setExpanded] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const live = all.filter((d) => d.status === 'locked');
  if (!live.length) return null;
  const list = live.slice(0, MAX);
  const rows = expanded ? list : list.slice(0, SHOWN);
  const isNew = (d: Decision) => Boolean(seen && seen.get(d.id) !== 'locked');
  // Who changed things since the last message: new locks, and decisions reopened meanwhile.
  const changedBy = seen
    ? [
        ...live.filter(isNew).map((d) => (d.lockedBy === me ? 'you' : d.lockedByName)),
        ...all.filter((d) => d.status === 'reopened' && seen.get(d.id) === 'locked').map((d) => (d.reopenedBy === me ? 'you' : (d.reopenedByName ?? 'someone'))),
      ]
    : [];
  const names = [...new Set(changedBy)];

  const viewOnBoard = (d: Decision) => {
    const sc = scopeOf(d, sections, all);
    const ids = sc.sectionId ? [sc.sectionId] : d.sourceNoteIds;
    useStore.setState({ reveal: ids.length ? ids : undefined });
    go({ name: 'board', boardId });
  };

  return (
    <div className="border-b border-line px-6 pt-4 pb-3">
      <section
        aria-labelledby="locked-heading"
        className="rounded-[11px] border border-line border-l-[3px] border-l-ink/45 bg-surface-2 px-4 py-3"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id="locked-heading" className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <LockGlyph className="size-4" />
            Locked decisions <span className="font-normal text-ink-3 tabular-nums">{live.length}</span>
          </h2>
          <p className="text-[12px] text-ink-3">The AI checks its answers against these. Only the board can change them.</p>
        </div>
        {names.length > 0 && (
          <p className="mt-1 text-[12px] text-ink-2" aria-live="polite">
            Changed since you started, by {names.join(', ')}.
          </p>
        )}
        <ul className="mt-2 flex flex-col gap-1.5">
          {rows.map((d) => {
            const sc = scopeOf(d, sections, all);
            const open = openRow === d.id;
            return (
              <li key={d.id} className="flex items-start gap-2 rounded-[6px] bg-surface px-2.5 py-2">
                <span className="mt-0.5 text-ink">
                  <LockGlyph className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setOpenRow(open ? null : d.id)}
                    aria-expanded={open}
                    className={cx('block w-full text-left text-[13px] leading-snug text-ink [overflow-wrap:anywhere]', !open && 'line-clamp-2')}
                  >
                    {d.text}
                    {open && d.reasons && <span className="mt-1 block text-ink-2">{d.reasons}</span>}
                  </button>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    {lockedLine(d, me)} · {sc.sectionId ? `Section: ${sc.label}` : 'Whole problem'}
                  </p>
                </div>
                {isNew(d) && <Badge>New</Badge>}
                <button type="button" onClick={() => viewOnBoard(d)} className="shrink-0 text-[12px] font-medium whitespace-nowrap text-accent hover:underline">
                  View on board
                </button>
              </li>
            );
          })}
        </ul>
        {list.length > SHOWN && (
          <button type="button" onClick={() => setExpanded((x) => !x)} className="mt-2 text-[13px] font-medium text-accent hover:underline">
            {expanded ? 'Show fewer' : `Show ${list.length - SHOWN} more`}
          </button>
        )}
        {live.length > MAX && <p className="mt-1 text-[12px] text-ink-3">{live.length - MAX} more locked decisions are on the board.</p>}
      </section>
    </div>
  );
}
