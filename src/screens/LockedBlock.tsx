import { ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import type { Decision } from '../../shared/decision-schema.ts';
import { LockGlyph, lockedLine, scopeOf } from '../canvas/LockPanel.tsx';
import { useProfile } from '../lib/profile.ts';
import { go } from '../lib/router.ts';
import { useStore } from '../store.ts';
import { Badge } from '../ui/Badge.tsx';

/**
 * Show the board's live locked decisions in a disclosure above the conversation.
 */
export function LockedBlock({ boardId, seen }: { boardId: string; seen: Map<string, string> | null }) {
  const all = useStore((s) => s.decisions);
  const sections = useStore((s) => s.sections);
  const me = useProfile((s) => s.profile?.userId);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  const live = all.filter((d) => d.status === 'locked');
  if (!live.length) return null;
  const isNew = (d: Decision) => Boolean(seen && seen.get(d.id) !== 'locked');
  const changedBy = seen
    ? [
        ...live.filter(isNew).map((d) => (d.lockedBy === me ? 'you' : d.lockedByName)),
        ...all.filter((d) => d.status === 'reopened' && seen.get(d.id) === 'locked').map((d) => (d.reopenedBy === me ? 'you' : (d.reopenedByName ?? 'someone'))),
      ]
    : [];
  const names = [...new Set(changedBy)];

  const viewOnBoard = (d: Decision) => {
    const scope = scopeOf(d, sections, all);
    const ids = scope.sectionId ? [scope.sectionId] : d.sourceNoteIds;
    useStore.setState({ reveal: ids.length ? ids : undefined });
    go({ name: 'board', boardId });
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={listId}
        className="flex min-h-6 items-center gap-1.5 rounded-sm text-[14px] font-semibold text-ink hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Locked decisions <span className="font-normal text-ink-3 tabular-nums">{live.length}</span>
        <ChevronRight aria-hidden size={16} strokeWidth={1.75} className={`shrink-0 transition-transform duration-150 motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} />
      </button>

      <div id={listId} hidden={!expanded} className="mt-2">
        {names.length > 0 && (
          <p className="mb-2 text-[12px] text-ink-2" aria-live="polite">
            Changed since you started, by {names.join(', ')}.
          </p>
        )}
        {expanded && (
          <ul className="flex flex-col gap-3">
            {live.map((d) => {
              const scope = scopeOf(d, sections, all);
              return (
                <li key={d.id} className="flex items-start gap-2">
                  <span className="mt-0.5 text-ink">
                    <LockGlyph className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-ink [overflow-wrap:anywhere]">{d.text}</p>
                    {d.reasons && <p className="mt-0.5 text-[12px] leading-snug text-ink-2 [overflow-wrap:anywhere]">{d.reasons}</p>}
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
                      <p className="text-ink-3">
                        {lockedLine(d, me)} {'·'} {scope.sectionId ? `Section: ${scope.label}` : 'Whole problem'}
                      </p>
                      <button type="button" onClick={() => viewOnBoard(d)} className="font-medium text-accent underline-offset-2 hover:underline">
                        View on board
                      </button>
                    </div>
                  </div>
                  {isNew(d) && <Badge>New</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
