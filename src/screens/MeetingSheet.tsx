import { Dialog } from '@base-ui/react/dialog';
import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ApprovedSession, DraftDecision, MeetingDraftView, NoteKind, Passage } from '../../shared/meeting-schema.ts';
import { LockGlyph, shorten } from '../canvas/LockPanel.tsx';
import { KIND_COLOR } from '../../shared/session-layout.ts';
import { approveSession, discardDraft } from '../lib/meeting.ts';
import { useStore } from '../store.ts';
import { Button } from '../ui/Button.tsx';
import { ScrollArea } from '../ui/ScrollArea.tsx';
import { cx } from '../ui/cx.ts';

/*
  Meeting addendum 3.4: review the session the AI drafted from a meeting. Modelled on DraftSheet:
  same dialog, Escape closes and focus goes back. Nothing reaches the board until "Add to board".
*/

type EditNote = { text: string; kind: NoteKind; sourceIds: string[]; passages: Passage[]; on: boolean; conflictsWith?: string | null };
/** Locked decisions 9A: a decision the meeting reached. `locked` is "Start locked"; off, it lands as a decision note. */
type EditDecision = DraftDecision & { passages: Passage[]; on: boolean; locked: boolean; lockSection: boolean };
type EditSection = { title: string; notes: EditNote[] };

const KIND_LABEL: Record<NoteKind, string> = { idea: 'Idea', question: 'Question', decision: 'Decision' };

function fromDraft(d: MeetingDraftView): EditSection[] {
  return d.sections.map((s) => ({ title: s.title, notes: s.notes.map((n) => ({ ...n, on: true })) }));
}

export function MeetingSheet({ viewCentre, onPlaced }: { viewCentre: () => { x: number; y: number }; onPlaced: (ids: string[]) => void }) {
  const sheet = useStore((s) => s.meetingSheet);
  const build = useStore((s) => (s.meetingSheet ? s.meetingBuilds[s.meetingSheet.sourceId] : undefined));
  const chip = useStore((s) => s.chips.find((c) => c.id === s.meetingSheet?.chipId));
  const boardTitle = useStore((s) => s.meta.title);
  const boardProblem = useStore((s) => s.problem);
  const ready = build?.status === 'ready' ? build : null;
  const open = Boolean(sheet && ready);

  const [sections, setSections] = useState<EditSection[]>([]);
  const [useProblem, setUseProblem] = useState(true);
  const [problem, setProblem] = useState('');
  const [decisions, setDecisions] = useState<EditDecision[]>([]);
  const inForce = useStore((s) => s.decisions);
  useEffect(() => {
    if (!ready) return;
    setSections(fromDraft(ready.draft));
    setDecisions((ready.draft.decisions ?? []).map((d) => ({ ...d, on: true, locked: true, lockSection: d.sectionIndex !== null })));
    setProblem(ready.draft.problem);
    setUseProblem(true);
  }, [ready?.draftId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ticked = useMemo(() => sections.reduce((a, s) => a + s.notes.filter((n) => n.on && n.text.trim()).length, 0), [sections]);
  const tickedDecisions = decisions.filter((d) => d.on && d.text.trim()).length;
  const conflicts = sections.reduce((a, s) => a + s.notes.filter((n) => n.on && n.conflictsWith).length, 0);
  const conflictText = (id: string | null | undefined) => (id ? inForce.find((d) => d.id === id && d.status === 'locked')?.text : undefined);
  const tickedSections = sections.filter((s) => s.notes.some((n) => n.on && n.text.trim())).length;
  const showProblem = Boolean(ready?.draft.problem) && !boardProblem.trim();

  const close = () => useStore.setState({ meetingSheet: undefined });

  const patchNote = (si: number, ni: number, p: Partial<EditNote>) =>
    setSections((ss) => ss.map((s, i) => (i !== si ? s : { ...s, notes: s.notes.map((n, j) => (j === ni ? { ...n, ...p } : n)) })));

  const add = () => {
    if (!sheet || !ready || !(ticked || tickedDecisions)) return;
    const picked = decisions.filter((d) => d.on && d.text.trim());
    // "Start locked" off: the decision lands as a decision note in its section, or in a Decisions section.
    const all = sections.map((s) => ({ title: s.title.trim() || 'Untitled section', notes: s.notes.filter((n) => n.on && n.text.trim()).map((n) => ({ text: n.text.trim(), kind: n.kind, sourceIds: n.sourceIds })) }));
    for (const d of picked.filter((x) => !x.locked)) {
      const note = { text: d.text.trim().slice(0, 220), kind: 'decision' as const, sourceIds: d.sourceIds };
      const target = d.sectionIndex !== null && all[d.sectionIndex] ? all[d.sectionIndex] : null;
      if (target) target.notes.push(note);
      else {
        let sec = all.find((s) => s.title === 'Decisions');
        if (!sec) all.push((sec = { title: 'Decisions', notes: [] }));
        sec.notes.push(note);
      }
    }
    const kept = all.map((s, i) => ({ s, i })).filter((x) => x.s.notes.length);
    const approved: ApprovedSession = {
      title: ready.draft.title,
      problem: showProblem && useProblem && problem.trim() ? problem.trim().slice(0, 300) : null,
      sections: kept.map((x) => x.s),
      decisions: picked
        .filter((d) => d.locked)
        .map((d) => {
          const at = d.lockSection && d.sectionIndex !== null ? kept.findIndex((x) => x.i === d.sectionIndex) : -1;
          return { text: d.text.trim().slice(0, 300), reasons: d.reasons.trim().slice(0, 500), sectionIndex: at >= 0 ? at : null };
        }),
    };
    const placed = approveSession(sheet.sourceId, sheet.chipId, ready.draftId, approved, viewCentre());
    if (placed) onPlaced(placed.ids);
  };

  const meetingTitle = chip?.title || 'the meeting';

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/25 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="sheet fixed inset-y-0 right-0 z-50 flex w-[min(760px,92vw)] flex-col border-l border-line bg-bg shadow-raised outline-none">
          <div className="flex items-center justify-between gap-4 border-b border-line px-8 py-4">
            <Dialog.Title className="min-w-0 truncate text-[15px] font-semibold">Session from {meetingTitle}</Dialog.Title>
            <Dialog.Close render={<Button variant="ghost" size="sm" />}>Close</Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Review the notes and sections the AI drafted from your meeting. Untick or edit anything, then add it to the board.</Dialog.Description>

          <ScrollArea className="flex-1" label="Session draft">
            {ready && (
              <div className="mx-auto flex max-w-[680px] flex-col gap-6 px-8 py-6">
                <div className="flex flex-col gap-1">
                  <p className="text-[14px] text-ink" aria-live="polite">
                    {ticked} {ticked === 1 ? 'note' : 'notes'} in {tickedSections} {tickedSections === 1 ? 'section' : 'sections'}
                    {decisions.length > 0 && `, ${tickedDecisions} ${tickedDecisions === 1 ? 'decision' : 'decisions'}`}
                  </p>
                  {conflicts > 0 && (
                    <p className="text-[13px] text-draft">
                      {conflicts} {conflicts === 1 ? 'note goes' : 'notes go'} against locked decisions.
                    </p>
                  )}
                  {ready.coverage.truncated && (
                    <p className="text-[13px] text-draft">
                      Covered the first {ready.coverage.covered} of {ready.coverage.total} parts of the meeting.
                    </p>
                  )}
                  <p className="text-[13px] text-ink-2">Drafted by AI from your meeting. Only you see this until you add it.</p>
                </div>

                <div className="rounded-md border border-line bg-surface px-4 py-3">
                  <p className="text-[13px]">
                    <span className="font-semibold">Board title:</span> {ready.draft.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-2">
                    {boardTitle ? `The board already has a title ("${boardTitle}"), so it will not change.` : 'The board has no title yet, so this becomes its name when you add the session.'}
                  </p>
                </div>

                {showProblem && (
                  <div className="flex flex-col gap-2 rounded-md border border-line bg-surface px-4 py-3">
                    <label className="flex items-center gap-2 text-[13px] font-semibold">
                      <input type="checkbox" checked={useProblem} onChange={(e) => setUseProblem(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
                      Use as the problem statement
                    </label>
                    <textarea
                      aria-label="Problem statement"
                      value={problem}
                      disabled={!useProblem}
                      onChange={(e) => setProblem(e.target.value)}
                      maxLength={300}
                      rows={2}
                      className="resize-none rounded-md border border-line-strong bg-surface px-2.5 py-2 text-[13px] leading-snug disabled:text-ink-3 focus-visible:border-ink-3"
                    />
                  </div>
                )}

                {decisions.length > 0 && (
                  <section aria-labelledby="draft-decisions" className="flex flex-col gap-2">
                    <h3 id="draft-decisions" className="flex items-center gap-1.5 px-2 text-[15px] font-semibold">
                      <LockGlyph className="size-4" />
                      Decisions
                    </h3>
                    <p className="px-2 text-[12px] text-ink-2">What the meeting agreed. Ticked rows start locked in your name when you add the session. Anyone can unlock them later.</p>
                    <ul className="flex flex-col gap-2">
                      {decisions.map((d, i) => (
                        <DecisionRow
                          key={i}
                          d={d}
                          section={d.sectionIndex !== null ? sections[d.sectionIndex]?.title : undefined}
                          against={conflictText(d.conflictsWith)}
                          onChange={(p) => setDecisions((ds) => ds.map((x, j) => (j === i ? { ...x, ...p } : x)))}
                          label={`decision ${i + 1}`}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                {sections.map((s, si) => (
                  <section key={si} aria-label={`Section ${s.title}`} className="flex flex-col gap-2">
                    <label className="sr-only" htmlFor={`sec-${si}`}>
                      Section name
                    </label>
                    <input
                      id={`sec-${si}`}
                      value={s.title}
                      maxLength={40}
                      onChange={(e) => setSections((ss) => ss.map((x, i) => (i === si ? { ...x, title: e.target.value } : x)))}
                      className="h-9 rounded-md border border-transparent bg-transparent px-2 text-[15px] font-semibold hover:border-line focus-visible:border-line-strong"
                    />
                    <ul className="flex flex-col gap-2">
                      {s.notes.map((n, ni) => (
                        <NoteRow key={ni} n={n} onChange={(p) => patchNote(si, ni, p)} label={`${s.title}, note ${ni + 1}`} against={conflictText(n.conflictsWith)} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </ScrollArea>

          <footer className="flex items-center justify-between gap-4 border-t border-line bg-surface px-8 py-4">
            <p className="text-[13px] text-ink-3">{ticked || tickedDecisions ? 'Adds the ticked notes as AI notes with your name, and locks the ticked decisions. One Undo takes them all back.' : 'Tick at least one note to add.'}</p>
            <div className="flex gap-2">
              <Button disabled={!ready} onClick={() => sheet && ready && void discardDraft(sheet.sourceId, ready.draftId)}>
                Discard
              </Button>
              <Button variant="primary" disabled={!ticked && !tickedDecisions} onClick={add}>
                Add to board
              </Button>
            </div>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Passages({ passages }: { passages: Passage[] }) {
  return (
    <ul className="flex flex-col gap-1.5 rounded-sm border border-line bg-surface-2 px-2.5 py-2">
      {passages.map((p) => (
        <li key={p.id} className="text-[12px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">{p.speaker ?? `Part ${p.id.slice(1)}`}: </span>
          {p.text}
        </li>
      ))}
    </ul>
  );
}

/** Locked decisions 8.3: a flag, not a block. The item can still be added. */
function Against({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="text-[12px] font-medium text-draft">Goes against: {shorten(text, 90)}</p>;
}

function DecisionRow({ d, section, against, onChange, label }: { d: EditDecision; section?: string; against?: string; onChange: (p: Partial<EditDecision>) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cx('flex gap-3 rounded-md border border-ink/20 bg-surface p-3 shadow-card', !d.on && 'opacity-60')}>
      <input type="checkbox" checked={d.on} onChange={(e) => onChange({ on: e.target.checked })} aria-label={`Include ${label}`} className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-1.5">
          <span className="mt-1 text-ink">
            <LockGlyph className="size-4" />
          </span>
          <textarea
            aria-label={`Text of ${label}`}
            value={d.text}
            onChange={(e) => onChange({ text: e.target.value })}
            maxLength={300}
            rows={2}
            className="min-w-0 flex-1 resize-none rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[14px] leading-snug font-medium text-ink hover:border-line focus-visible:border-line-strong"
          />
        </div>
        {d.reasons && <p className="px-1 text-[12px] leading-relaxed text-ink-2">{d.reasons}</p>}
        <Against text={against} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
            <input type="checkbox" checked={d.locked} disabled={!d.on} onChange={(e) => onChange({ locked: e.target.checked })} className="size-3.5 accent-[var(--color-accent)]" />
            Start locked
          </label>
          {section && d.locked && (
            <label className="flex items-center gap-1.5 text-[12px] text-ink">
              <input type="checkbox" checked={d.lockSection} disabled={!d.on} onChange={(e) => onChange({ lockSection: e.target.checked })} className="size-3.5 accent-[var(--color-accent)]" />
              Locks section: {section}
            </label>
          )}
          {!d.locked && d.on && <span className="text-[12px] text-ink-3">Added as a decision note, not locked.</span>}
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex items-center gap-0.5 text-[12px] font-medium text-accent hover:underline">
            <ChevronRight aria-hidden size={14} strokeWidth={1.75} className={cx('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
            From the meeting
          </button>
        </div>
        {open && <Passages passages={d.passages} />}
      </div>
    </li>
  );
}

function NoteRow({ n, onChange, label, against }: { n: EditNote; onChange: (p: Partial<EditNote>) => void; label: string; against?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cx('flex gap-3 rounded-md border border-line bg-surface p-3 shadow-card', !n.on && 'opacity-60')}>
      <input type="checkbox" checked={n.on} onChange={(e) => onChange({ on: e.target.checked })} aria-label={`Include ${label}`} className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <textarea
          aria-label={`Text of ${label}`}
          value={n.text}
          onChange={(e) => onChange({ text: e.target.value })}
          maxLength={220}
          rows={2}
          className="resize-none rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[14px] leading-snug text-ink hover:border-line focus-visible:border-line-strong"
        />
        <Against text={against} />
        <div className="flex items-center gap-2">
          {/* The kind label wears the note colour it will get on the board (9.3). */}
          <span className="rounded-sm border border-ink/10 px-1.5 py-0.5 text-[11px] font-semibold text-ink" style={{ background: `var(--color-paper-${KIND_COLOR[n.kind]})` }}>
            {KIND_LABEL[n.kind]}
          </span>
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex items-center gap-0.5 text-[12px] font-medium text-accent hover:underline">
            <ChevronRight aria-hidden size={14} strokeWidth={1.75} className={cx('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
            From the meeting
          </button>
        </div>
        {open && (
          <ul className="flex flex-col gap-1.5 rounded-sm border border-line bg-surface-2 px-2.5 py-2">
            {n.passages.map((p) => (
              <li key={p.id} className="text-[12px] leading-relaxed text-ink-2">
                <span className="font-semibold text-ink">{p.speaker ?? `Part ${p.id.slice(1)}`}: </span>
                {p.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
