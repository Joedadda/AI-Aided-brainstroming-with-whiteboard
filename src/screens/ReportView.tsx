import { ChevronLeft } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip.tsx';
import { useEffect, useRef, useState } from 'react';
import { LockDecision, LockGlyph, shorten } from '../canvas/LockPanel.tsx';
import { useProfile } from '../lib/profile.ts';
import { go } from '../lib/router.ts';
import { useStore } from '../store.ts';
import { Button } from '../ui/Button.tsx';
import { ReportBodyView } from '../ui/ReportBody.tsx';
import { ReportHeader } from '../ui/ReportHeader.tsx';

/** How a teammate reads an approved report (PC-7): summary first, sections on demand. */
export function ReportView({ boardId, reportId }: { boardId: string; reportId: string }) {
  const report = useStore((s) => s.reports.find((r) => r.id === reportId));
  const synced = useStore((s) => s.synced);
  const cards = useStore((s) => s.cards);
  const markRead = useProfile((s) => s.markRead);
  const headingRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState<string | null>(null);

  useEffect(() => {
    if (report) {
      markRead(report.id);
      headingRef.current?.focus();
    }
  }, [report, markRead]);

  if (!report) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-ink-2">{synced ? 'This report is not on the board.' : 'Loading the report…'}</p>
        {synced && <Button onClick={() => go({ name: 'board', boardId })}>Back to the board</Button>}
      </div>
    );
  }

  // Notes as they are on the board now; a deleted note still shows from the report itself.
  const notes = report.cardNoteIds.map((id) => {
    const c = cards.find((x) => x.id === id);
    return { id, text: c?.text ?? 'A note that was later removed from the board', author: c?.author ?? 'Unknown' };
  });

  return (
    <div className="screen-enter flex-1">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/95 px-8 py-3 backdrop-blur">
        <Tooltip label="Back to board">
            <Button variant="ghost" size="sm" className="w-8 px-0" aria-label="Back to board" onClick={() => go({ name: 'board', boardId })}>
              <ChevronLeft aria-hidden size={18} strokeWidth={1.75} className="size-[18px] shrink-0" />
            </Button>
          </Tooltip>
        {/* Locked decisions 5.1: lock what the team took from this report, with the report linked. */}
        <LockDecision
          trigger={<Button size="sm" />}
          prefill={() => ({ text: report.body.title, reportIds: [report.id] })}
          onLocked={(id) => setLocked(useStore.getState().decisions.find((d) => d.id === id)?.text ?? report.body.title)}
          side="bottom"
          align="start"
        >
          <LockGlyph className="size-4" />
          Lock as decision
        </LockDecision>
        {locked && (
          <p role="status" className="text-[13px] text-ink-2">
            Locked: "{shorten(locked, 60)}". It is in the Decisions area on the board.
          </p>
        )}
      </div>
      <article ref={headingRef} tabIndex={-1} aria-labelledby="report-title" className="mx-auto flex max-w-[680px] flex-col gap-8 px-8 py-10 outline-none">
        <ReportHeader
          title={report.body.title}
          status="approved"
          who={report.approvedByName}
          whoColor={report.approvedByColor}
          at={report.approvedAt}
          edited={Boolean(report.editedAt)}
          notes={notes}
          titleId="report-title"
          level="h1"
          onShowNotes={(ids) => {
            useStore.setState({ reveal: ids.filter((id) => cards.some((c) => c.id === id)), justLanded: undefined });
            go({ name: 'board', boardId });
          }}
        />
        {/* The finished example keeps its scripted chats readable, so the session behind a report can be seen. */}
        {report.approvedBy.startsWith('seed-') && (
          <div className="flex flex-col items-start gap-2 rounded-md border border-line bg-surface-2/60 px-4 py-4">
            <p className="text-[13px] leading-relaxed text-ink-2">
              On the finished example you can read the private chat {report.approvedByName} had with the AI before writing this report.
            </p>
            <Button size="sm" onClick={() => go({ name: 'canvas', boardId, explorationId: report.explorationId })}>
              Open {report.approvedByName}'s chat
            </Button>
          </div>
        )}
        <ReportBodyView body={report.body} />
        <p className="text-[13px] leading-relaxed text-ink-3">Questions for the author are not built in this prototype. Raise them with them directly.</p>
      </article>
    </div>
  );
}
