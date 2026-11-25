import type { ReactNode } from 'react';

const fmt = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Title, contributor, notes used, date and status (RPT-1, RPT-7). Status is a word and a colour. */
export function ReportHeader({
  title,
  status,
  who,
  whoColor,
  at,
  edited = false,
  notes,
  titleId,
  level = 'h2',
  onShowNotes,
  titleField,
}: {
  title: string;
  status: 'draft' | 'approved';
  who: string;
  whoColor?: string;
  at: number;
  /** The author changed the AI's draft by hand before approving. */
  edited?: boolean;
  notes: { id: string; text: string; author: string }[];
  titleId?: string;
  /** h1 when the report is the page (reader view), h2 inside the draft sheet. */
  level?: 'h1' | 'h2';
  /** Reader view: open the board with these notes selected (RPT-9). */
  onShowNotes?: (ids: string[]) => void;
  /** Draft sheet: an editable title in place of the heading. */
  titleField?: ReactNode;
}) {
  const Title = level;
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
          {whoColor && <span aria-hidden className="size-2.5 rounded-full" style={{ background: whoColor }} />}
          {status === 'approved'
            ? `${who}'s private canvas · drafted with AI, ${edited ? 'edited and approved' : 'approved'} by ${who} on ${fmt(at)}`
            : `${who}'s private canvas · drafted by AI on ${fmt(at)}${edited ? ', edited by you' : ''}. Only you can see it until you approve it.`}
        </span>
      </div>
      {titleField ?? (
        <Title id={titleId} className="text-[28px] leading-tight font-semibold tracking-[-0.02em] text-balance text-ink">
          {title}
        </Title>
      )}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <h3 className="text-[15px] font-semibold text-ink">
            Notes used <span className="font-normal text-ink-3 tabular-nums">{notes.length}</span>
          </h3>
          {onShowNotes && notes.length > 1 && (
            <button type="button" onClick={() => onShowNotes(notes.map((n) => n.id))} className="text-[13px] font-medium text-accent hover:underline">
              Show all on the board
            </button>
          )}
        </div>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-ink-3">
          {notes.map((n) => (
            <li key={n.id} className="text-[14px] leading-snug text-ink-2">
              {onShowNotes ? (
                <button
                  type="button"
                  onClick={() => onShowNotes([n.id])}
                  className="text-left hover:text-ink hover:underline"
                  aria-label={`Show on the board: ${n.text} (${n.author})`}
                >
                  {n.text} <span className="text-ink-3">({n.author})</span>
                </button>
              ) : (
                <span>
                  {n.text} <span className="text-ink-3">({n.author})</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
