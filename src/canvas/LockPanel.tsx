import { Popover } from '@base-ui/react/popover';
import { LockKeyhole } from 'lucide-react';
import { useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { DECISION_REASONS_MAX, DECISION_TEXT_MAX, coverOf, inForce, type Decision } from '../../shared/decision-schema.ts';
import { board } from '../lib/board.ts';
import { useProfile } from '../lib/profile.ts';
import { go } from '../lib/router.ts';
import { useStore } from '../store.ts';
import { Button } from '../ui/Button.tsx';
import { cx } from '../ui/cx.ts';

/*
  Locked decisions (Locked_Decisions_PRD_v2.md 5 and 6). The lock panel every entry point opens,
  the Locked pill on section headers, and small helpers shared with the Decisions area and the
  private canvas block. A lock is a person's act: nothing here is ever called by the AI.
*/

export function LockGlyph({ className = 'size-3.5' }: { className?: string }) {
  return <LockKeyhole aria-hidden strokeWidth={1.75} className={cx('shrink-0', className)} />;
}

export const shorten = (t: string, n = 60) => {
  const s = t.trim().replace(/\s+/g, ' ');
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};

export function when(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "Locked by Asha, 25 Nov, 14:02, via the agent" */
export function lockedLine(d: Decision, me?: string) {
  const who = d.lockedBy === me ? 'you' : d.lockedByName || 'someone';
  return `Locked by ${who}, ${when(d.lockedAt)}${d.via === 'agent' ? ', via the agent' : ''}`;
}
export function reopenedLine(d: Decision, me?: string) {
  const who = d.reopenedBy === me ? 'you' : d.reopenedByName || 'someone';
  return `Reopened by ${who}, ${when(d.reopenedAt)}`;
}

/** What a decision covers, as people read it. */
export function scopeOf(d: Decision, sections: { id: string; title: string }[], all: Decision[]) {
  if (!d.sectionId) return { label: 'Whole problem', sectionId: null as string | null, note: '' };
  const s = sections.find((x) => x.id === d.sectionId);
  if (!s) return { label: 'Whole problem', sectionId: null, note: 'Section deleted' };
  if (d.scope !== 'section') return { label: 'Whole problem', sectionId: null, note: '' };
  // Two people locked the same section at once: the earlier lock keeps it (PRD 11).
  const cover = d.status === 'locked' ? coverOf(all, d.sectionId) : null;
  if (cover && cover.id !== d.id) return { label: 'Whole problem', sectionId: null, note: `Section already covered by "${shorten(cover.text, 50)}"` };
  return { label: s.title, sectionId: s.id, note: '' };
}

/** "From <meeting>" for decisions added from an imported meeting (PRD 9A). */
export function MeetingLine({ d }: { d: Decision }) {
  const chip = useStore((s) => s.chips.find((c) => c.id === d.meetingChipId));
  if (d.via !== 'meeting') return null;
  return <span className="text-[12px] text-ink-3">{chip ? `From ${chip.title}` : 'Source no longer available'}</span>;
}

export interface LockPrefill {
  text?: string;
  /** A section the decision could cover. Offered as "This section: <title>". */
  sectionId?: string | null;
  /** Start on the section option (opened from a section). */
  sectionFirst?: boolean;
  /** Only this section makes sense (opened from a section header): no whole-problem option. */
  sectionOnly?: boolean;
  sourceNoteIds?: string[];
  reportIds?: string[];
}

/** After a lock, the toast on the board. */
export function lockAndToast(input: Parameters<typeof board.lockDecision>[0]) {
  const r = board.lockDecision(input);
  if (!r) return null;
  useStore.setState({
    lockToast: {
      id: r.id,
      text: input.text.trim(),
      notice: r.downgraded ? 'Someone locked that section first, so this covers the whole problem.' : undefined,
    },
  });
  return r;
}

/**
 * The lock panel (PRD 5.2): a 360 px pop-up anchored to the button that opened it. Nothing else
 * on the board is dimmed. Escape cancels and focus goes back to the button.
 */
export function LockDecision({
  trigger,
  children,
  prefill,
  onLocked,
  side = 'bottom',
  align = 'end',
}: {
  trigger: ReactElement;
  children?: ReactNode;
  prefill: () => LockPrefill;
  onLocked?: (id: string) => void;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<LockPrefill>({});
  const [text, setText] = useState('');
  const [reasons, setReasons] = useState('');
  const [scope, setScope] = useState<'board' | 'section'>('board');
  const [reportIds, setReportIds] = useState<string[]>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const reasonsRef = useRef<HTMLTextAreaElement>(null);
  const name = useProfile((s) => s.profile?.name ?? 'you');
  const decisions = useStore((s) => s.decisions);
  const sections = useStore((s) => s.sections);
  const reports = useStore((s) => s.reports);
  const uid = useId();

  const onOpenChange = (next: boolean) => {
    if (next) {
      const f = prefill();
      setP(f);
      setText((f.text ?? '').slice(0, DECISION_TEXT_MAX));
      setReasons('');
      setReportIds(f.reportIds ?? []);
      const sec = f.sectionId ? sections.find((s) => s.id === f.sectionId) : null;
      const covered = sec ? coverOf(decisions, sec.id) : null;
      setScope(sec && (f.sectionFirst || f.sectionOnly) && !covered ? 'section' : 'board');
    }
    setOpen(next);
  };

  const section = p.sectionId ? sections.find((s) => s.id === p.sectionId) : undefined;
  const cover = section ? coverOf(decisions, section.id) : null;
  const sectionOff = !section || Boolean(cover);
  const dup = text.trim() && inForce(decisions).some((d) => norm(d.text) === norm(text));
  const canLock = text.trim().length > 0 && !(p.sectionOnly && sectionOff);
  const sources = p.sourceNoteIds ?? [];

  const lock = () => {
    if (!canLock) return;
    const r = lockAndToast({
      text: text.trim(),
      reasons: reasons.trim(),
      scope: scope === 'section' && !sectionOff ? 'section' : 'board',
      sectionId: scope === 'section' && !sectionOff ? section!.id : null,
      sourceNoteIds: sources.slice(0, 20),
      reportIds,
    });
    setOpen(false);
    if (r) onLocked?.(r.id);
  };

  const counter = text.length >= 250;
  const field = 'w-full resize-none rounded-sm border border-line-strong bg-surface px-2.5 py-2 text-[13px] leading-snug placeholder:text-ink-3 focus-visible:border-ink-3';

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger render={trigger}>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={10} side={side} align={align} collisionPadding={12}>
          <Popover.Popup
            initialFocus={textRef}
            className="popup z-50 flex w-[360px] flex-col gap-3 rounded-[14px] border border-line bg-surface p-4 shadow-raised outline-none"
            onKeyDown={(e) => {
              e.stopPropagation(); // keep Backspace, V, H and S away from the board
            }}
          >
            <Popover.Title className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <LockGlyph className="size-4" />
              Lock a decision
            </Popover.Title>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-text`} className="text-[13px] font-semibold text-ink">
                What did the group decide?
              </label>
              <textarea
                id={`${uid}-text`}
                ref={textRef}
                value={text}
                maxLength={DECISION_TEXT_MAX}
                rows={3}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (e.metaKey || e.ctrlKey) lock();
                  else if (!e.shiftKey) reasonsRef.current?.focus();
                }}
                placeholder="For example: fix the invite step first"
                className={field}
              />
              {counter && (
                <span className="self-end text-[12px] text-ink-3 tabular-nums" aria-live="polite">
                  {text.length} of {DECISION_TEXT_MAX}
                </span>
              )}
              {dup && <p className="text-[12px] text-draft">Something very similar is already locked.</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-why`} className="text-[13px] font-semibold text-ink">
                Why <span className="font-normal text-ink-3">(optional)</span>
              </label>
              <textarea
                id={`${uid}-why`}
                ref={reasonsRef}
                value={reasons}
                maxLength={DECISION_REASONS_MAX}
                rows={2}
                onChange={(e) => setReasons(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    lock();
                  }
                }}
                className={field}
              />
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-[13px] font-semibold text-ink">Applies to</legend>
              {!p.sectionOnly && (
                <label className="flex items-center gap-2 text-[13px] text-ink">
                  <input type="radio" name={`${uid}-scope`} checked={scope === 'board'} onChange={() => setScope('board')} className="accent-accent" />
                  The whole problem
                </label>
              )}
              {section && (
                <label className={cx('flex items-start gap-2 text-[13px]', sectionOff ? 'text-ink-3' : 'text-ink')}>
                  <input
                    type="radio"
                    name={`${uid}-scope`}
                    checked={scope === 'section' && !sectionOff}
                    disabled={sectionOff}
                    onChange={() => setScope('section')}
                    className="mt-0.5 accent-accent"
                  />
                  <span className="min-w-0">
                    This section: {section.title}
                    {cover && <span className="block text-[12px]">Already covered by "{shorten(cover.text, 70)}"</span>}
                  </span>
                </label>
              )}
              {!section && <p className="text-[12px] text-ink-3">To lock one section, use the lock button on its header.</p>}
            </fieldset>

            {sources.length > 0 && (
              <p className="text-[13px] text-ink-2">
                <span className="font-semibold text-ink">Notes behind it: </span>
                {sources.length} {sources.length === 1 ? 'note' : 'notes'}, from your selection
              </p>
            )}

            {reports.length > 0 && (
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-[13px] font-semibold text-ink">
                  Reports behind it <span className="font-normal text-ink-3">(optional)</span>
                </legend>
                <div className="flex max-h-28 flex-col gap-1.5 overflow-y-auto">
                  {[...reports].reverse().map((r) => (
                    <label key={r.id} className="flex items-start gap-2 text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={reportIds.includes(r.id)}
                        onChange={(e) => setReportIds((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id)))}
                        className="mt-0.5 accent-accent"
                      />
                      <span className="min-w-0">
                        {shorten(r.body.title, 70)} <span className="text-ink-3">· {r.approvedByName}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
              <span className="min-w-0 truncate text-[12px] text-ink-3">Locked as {name}.</span>
              <span className="flex shrink-0 gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" disabled={!canLock} onClick={lock}>
                  Lock decision
                </Button>
              </span>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The Locked pill on a section header (PRD 6.1), and since 25 Nov (user request) on a note that a
 * decision in force came from. It always carries the word, so it does not read as the private-canvas
 * note lock (icon only). Click or Enter opens the decision with Unlock.
 */
export function LockedPill({ d }: { d: Decision }) {
  const me = useProfile((s) => s.profile?.userId);
  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            title={`Locked decision: ${d.text}`}
            aria-label={`Locked decision: ${d.text.trim().replace(/[.!?]+$/, '')}. Locked by ${d.lockedByName}.`}
            onDoubleClick={(e) => e.stopPropagation()}
            className="nodrag pressable key-tint inline-flex h-6 shrink-0 items-center gap-1 rounded-sm bg-ink/[0.08] px-1.5 text-[11px] font-semibold tracking-wide text-ink uppercase hover:bg-ink/[0.13]"
          />
        }
      >
        <LockGlyph className="size-3.5" />
        Locked
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} side="bottom" align="start" collisionPadding={12}>
          <Popover.Popup className="popup z-50 flex w-[320px] flex-col gap-2 rounded-[14px] border border-line bg-surface p-4 shadow-raised outline-none">
            <Popover.Title className="flex items-start gap-2 text-[14px] leading-snug font-semibold text-ink">
              <LockGlyph className="mt-0.5 size-4" />
              <span className="[overflow-wrap:anywhere]">{d.text}</span>
            </Popover.Title>
            {d.reasons && <p className="text-[13px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{d.reasons}</p>}
            <p className="text-[12px] text-ink-3">{lockedLine(d, me)}</p>
            <MeetingLine d={d} />
            <ReportLinkList ids={d.reportIds} />
            <div className="flex justify-end border-t border-line pt-3">
              <Popover.Close render={<Button size="sm" />} onClick={() => board.reopenDecision(d.id)}>
                Unlock
              </Popover.Close>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Report links behind a decision (RPT-10). Reports no longer on the board are skipped. */
export function ReportLinkList({ ids, heading }: { ids: string[]; heading?: string }) {
  const reports = useStore((s) => s.reports);
  const boardId = useStore((s) => s.boardId);
  const list = ids.map((id) => reports.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  if (!list.length || !boardId) return null;
  return (
    <div>
      {heading && <h3 className="mb-1.5 text-[14px] font-semibold text-ink">{heading}</h3>}
      <ul className="flex flex-col gap-1">
        {list.map((r) => (
          <li key={r.id} className="text-[13px] leading-snug">
            <button
              type="button"
              onClick={() => go({ name: 'report', boardId, reportId: r.id })}
              className="text-left text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
            >
              {r.body.title}
            </button>
            <span className="text-[12px] text-ink-3"> · {r.approvedByName}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
