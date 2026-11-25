import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Decision } from '../../shared/decision-schema.ts';
import type { BoardDecision } from '../../shared/types.ts';
import { LockDecision, LockGlyph, MeetingLine, ReportLinkList, lockedLine, reopenedLine, scopeOf } from '../canvas/LockPanel.tsx';
import { board } from '../lib/board.ts';
import { useProfile } from '../lib/profile.ts';
import { go, pathOf } from '../lib/router.ts';
import { useStore } from '../store.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { Tooltip } from '../ui/Tooltip.tsx';
import { cx } from '../ui/cx.ts';

/**
 * Framework step 5, Decision: the Decisions area (Locked_Decisions_PRD_v2.md 6.2). Decisions in
 * force first, newest first, then reopened ones. A seeded decision with rich content opens to
 * the full card (Because, Set aside, Effort, Follow-ups, Reports behind this). Old boards that
 * only have the static mock in meta.decision still show it, with its Mock tag.
 */
export function DecisionCard() {
  const decisions = useStore((s) => s.decisions);
  const legacy = useStore((s) => s.meta.decision);
  const boardId = useStore((s) => s.boardId)!;

  if (!decisions.length && legacy) {
    return (
      <section aria-labelledby="decision-heading">
        <h2 id="decision-heading" className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
          Decision <Badge>Mock</Badge>
        </h2>
        <Decided d={legacy} boardId={boardId} />
      </section>
    );
  }

  const count = decisions.filter((d) => d.status === 'locked').length;
  return (
    <section aria-labelledby="decision-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="decision-heading" className="flex items-center gap-2 text-[15px] font-semibold">
          Decisions <span className="font-normal text-ink-3 tabular-nums">{count}</span>
        </h2>
        {decisions.length > 0 && <LockButton />}
      </div>
      {!decisions.length ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-line-strong px-4 py-5 text-[13px] leading-relaxed text-ink-2">
          <p>Nothing locked yet. Lock a decision to make the AI check its answers against it.</p>
          <LockButton />
        </div>
      ) : (
        // More than 8 rows scroll inside the area, so the node does not run down the board.
        <ul className={cx('nowheel flex flex-col gap-3', decisions.length > 8 && 'max-h-[1200px] overflow-y-auto pr-1')}>
          {decisions.map((d) => (
            <li key={d.id}>
              <DecisionRow d={d} boardId={boardId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LockButton() {
  return (
    <LockDecision trigger={<Button size="sm" className="nodrag" />} prefill={() => ({})} side="bottom" align="end">
      <LockGlyph className="size-4" />
      Lock a decision
    </LockDecision>
  );
}

export function DecisionView({ boardId, decisionId }: { boardId: string; decisionId: string }) {
  const decision = useStore((s) => s.decisions.find((d) => d.id === decisionId));
  const legacy = useStore((s) => decisionId === 'legacy' ? s.meta.decision : undefined);
  const synced = useStore((s) => s.synced);
  const content = useRef<HTMLDivElement>(null);
  const ready = Boolean(decision || legacy);
  useEffect(() => {
    if (ready) content.current?.querySelector('h1')?.focus();
  }, [ready]);

  return (
    <div className="screen-enter flex-1 bg-surface">
      <header className="sticky top-0 z-10 flex items-center border-b border-line bg-surface px-8 py-3">
        <Tooltip label="Back to board">
          <Button variant="ghost" size="sm" className="w-8 px-0" aria-label="Back to board" onClick={() => go({ name: 'board', boardId })}>
            <ChevronLeft aria-hidden size={18} />
          </Button>
        </Tooltip>
      </header>
      <div ref={content} className="mx-auto max-w-[680px] px-8 py-10">
        {decision ? (
          <DecisionRow d={decision} boardId={boardId} detail />
        ) : legacy ? (
          <Decided d={legacy} boardId={boardId} detail />
        ) : (
          <p role="status" className="text-ink-2">{synced ? 'This decision is not on the board.' : 'Loading the decision…'}</p>
        )}
      </div>
    </div>
  );
}

function DecisionTitleLink({ boardId, decisionId, children }: { boardId: string; decisionId: string; children: ReactNode }) {
  const route = { name: 'decision', boardId, decisionId } as const;
  return (
    <a
      href={pathOf(route)}
      className="after:absolute after:inset-0 after:rounded-md hover:underline"
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(route);
      }}
    >
      {children}
    </a>
  );
}

const clickableCard = 'relative isolate focus-within:border-accent hover:border-ink-3 [&_button]:relative [&_button]:z-10';

function DecisionRow({ d, boardId, detail = false }: { d: Decision; boardId: string; detail?: boolean }) {
  const me = useProfile((s) => s.profile?.userId);
  const sections = useStore((s) => s.sections);
  const all = useStore((s) => s.decisions);
  const open = d.status === 'locked';
  const scope = scopeOf(d, sections, all);
  const rich = d.rich;
  const reveal = (ids: string[]) => {
    useStore.setState({ reveal: ids });
    if (detail) go({ name: 'board', boardId });
  };

  return (
    <article
      aria-label={`${open ? 'Locked decision' : 'Reopened decision'}: ${d.text}`}
      className={cx('flex flex-col bg-surface', detail
        ? 'gap-5'
        : cx(clickableCard, 'gap-2 rounded-md border p-3.5', open ? 'border-ink/20 shadow-card' : 'border-line'))}
    >
      <div className="flex items-start gap-2">
        <span className={cx('mt-0.5', open ? 'text-ink' : 'text-ink-3')}>
          <LockGlyph className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {detail ? (
            <h1 tabIndex={-1} className="text-[28px] leading-tight font-semibold text-balance [overflow-wrap:anywhere] outline-none">{d.text}</h1>
          ) : (
            <p className={cx('line-clamp-3 text-[14px] leading-snug font-semibold text-balance [overflow-wrap:anywhere]', open ? 'text-ink' : 'text-ink-3')}>
              <DecisionTitleLink boardId={boardId} decisionId={d.id}>{d.text}</DecisionTitleLink>
            </p>
          )}
          {d.reasons && <p className={cx('mt-1 leading-relaxed [overflow-wrap:anywhere]', detail ? 'text-[15px]' : 'line-clamp-2 text-[13px]', open ? 'text-ink-2' : 'text-ink-3')}>{d.reasons}</p>}
        </div>
        {!open && <Badge>Reopened</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
        <span>{open ? lockedLine(d, me) : reopenedLine(d, me)}</span>
        <MeetingLine d={d} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {scope.sectionId ? (
          <button
            type="button"
            onClick={() => reveal([scope.sectionId!])}
            className="nodrag pressable key-quiet inline-flex h-6 max-w-[200px] items-center rounded-sm border border-line px-1.5 text-[12px] text-ink-2 hover:text-ink"
            title="Show this section on the board"
          >
            <span className="truncate">Section: {scope.label}</span>
          </button>
        ) : (
          <span className="inline-flex h-6 items-center rounded-sm border border-line px-1.5 text-[12px] text-ink-2">Whole problem</span>
        )}
        {scope.note && <span className="text-[12px] text-ink-3">{scope.note}</span>}
        {d.sourceNoteIds.length > 0 && (
          <button
            type="button"
            onClick={() => reveal(d.sourceNoteIds)}
            className="nodrag text-[12px] text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
          >
            {d.sourceNoteIds.length} {d.sourceNoteIds.length === 1 ? 'note' : 'notes'} behind it
          </button>
        )}
      </div>
      {detail && rich ? <RichBody d={d} /> : !rich && <ReportLinkList ids={d.reportIds} />}

      <div className="flex items-center justify-end gap-2 pt-1">
        {open ? (
          <Button size="sm" variant="ghost" className="nodrag" onClick={() => board.reopenDecision(d.id)}>
            Unlock
          </Button>
        ) : (
          <Button size="sm" className="nodrag" onClick={() => board.relockDecision(d.id)}>
            <LockGlyph className="size-4" />
            Lock again
          </Button>
        )}
      </div>
    </article>
  );
}

/** The option C card from the Review 2 design, as the expanded view of a seeded decision. */
function RichBody({ d }: { d: Decision }) {
  const r = d.rich!;
  return (
    <div className="flex flex-col gap-4 border-t border-line pt-3">
      {r.because?.length > 0 && <List title="Because" items={r.because} numbered />}
      {r.setAside?.length > 0 && <List title="Set aside" items={r.setAside} />}
      {r.effort && (
        <div>
          <h3 className="mb-1.5 text-[14px] font-semibold text-ink">Effort</h3>
          <p className="text-[13px] leading-relaxed text-ink-2">{r.effort}</p>
        </div>
      )}
      {r.followUps?.length > 0 && <List title="Follow-ups" items={r.followUps} />}
      {r.unknowns && (
        <div>
          <h3 className="mb-1.5 text-[14px] font-semibold text-ink">What we do not know</h3>
          <p className="text-[13px] leading-relaxed text-ink-2">{r.unknowns}</p>
        </div>
      )}
      <ReportLinkList ids={d.reportIds} heading="Reports behind this" />
      <p className="text-[12px] leading-relaxed text-ink-3">{`Written by the group, locked by ${d.lockedByName}. The AI did not write this.`}</p>
    </div>
  );
}

function Decided({ d, boardId, detail = false }: { d: BoardDecision; boardId: string; detail?: boolean }) {
  return (
    <article className={cx('flex flex-col gap-4 bg-surface', !detail && cx(clickableCard, 'rounded-md border border-ink/20 p-4 shadow-card'))}>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-ink-3">Recorded by {d.recordedBy}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {detail ? (
          <h1 tabIndex={-1} className="text-[28px] leading-tight font-semibold text-balance outline-none">{d.title}</h1>
        ) : (
          <p className="text-[15px] leading-snug font-semibold text-balance text-ink">
            <DecisionTitleLink boardId={boardId} decisionId="legacy">{d.title}</DecisionTitleLink>
          </p>
        )}
        <p className="text-[13px] leading-relaxed text-ink-2">{d.direction}</p>
      </div>
      <List title="Because" items={d.reasons} numbered />
      <List title="Set aside" items={d.setAside} />
      <div>
        <h3 className="mb-1.5 text-[14px] font-semibold text-ink">Effort</h3>
        <p className="text-[13px] leading-relaxed text-ink-2">{d.effort}</p>
      </div>
      <List title="Follow-ups" items={d.followUps} />
      <AllReportLinks boardId={boardId} />
      <p className="border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">Written by the group, not the AI. Static mock for this review: recording decisions is not built yet.</p>
    </article>
  );
}

function List({ title, items, numbered }: { title: string; items: string[]; numbered?: boolean }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[14px] font-semibold text-ink">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((r, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink-2">
            <span aria-hidden className="shrink-0 text-ink-3 tabular-nums">
              {numbered ? `${i + 1}.` : '·'}
            </span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AllReportLinks({ boardId }: { boardId: string }) {
  const reports = useStore((s) => s.reports);
  if (!reports.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-[14px] font-semibold text-ink">Reports behind this</h3>
      <ul className="flex flex-col gap-1">
        {[...reports].reverse().map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => go({ name: 'report', boardId, reportId: r.id })}
              className="text-left text-[13px] leading-snug text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
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
