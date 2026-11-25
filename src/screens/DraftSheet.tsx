import { Dialog } from '@base-ui/react/dialog';
import { useEffect, useRef, useState } from 'react';
import { isEmptyReport, type ReportBody } from '../../shared/report-schema.ts';
import type { Exploration } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { board } from '../lib/board.ts';
import { useProfile } from '../lib/profile.ts';
import { go } from '../lib/router.ts';
import { useStore } from '../store.ts';
import { Button } from '../ui/Button.tsx';
import { fromEditable, ReportEditor, TitleField, toEditable, validate, type EditableReport } from '../ui/ReportEditor.tsx';
import { ReportHeader } from '../ui/ReportHeader.tsx';
import { ScrollArea } from '../ui/ScrollArea.tsx';

/**
 * The author reviews the AI's draft here (PC-5): edit it (Micro PRD RPT-5), regenerate it, or approve it.
 * The draft and its edits are private; only approval writes the report to the shared board (PC-6).
 */
export function DraftSheet({
  boardId,
  ex,
  open,
  onOpenChange,
  drafting,
  error,
  onRegenerate,
  onSaved,
  onApproved,
}: {
  boardId: string;
  ex: Exploration;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafting: boolean;
  error?: string;
  onRegenerate: () => void;
  /** The author saved edits to the draft. */
  onSaved: (body: ReportBody, editedAt: number) => void;
  onApproved?: () => void;
}) {
  const profile = useProfile((s) => s.profile)!;
  const draft = ex.draft;
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState('');
  // The draft is always editable in place (Micro PRD RPT-5). Edits save themselves shortly after typing stops.
  const [editing, setEditing] = useState<EditableReport | null>(() => (draft ? toEditable(draft.body) : null));
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const latest = useRef(editing);
  latest.current = editing;

  // A new draft (Regenerate) replaces whatever was being edited.
  useEffect(() => {
    setEditing(draft ? toEditable(draft.body) : null);
    setTouched(new Set());
    setShowAll(false);
    setSaveState('idle');
  }, [draft?.id]);

  const allErrors = editing ? validate(editing) : {};
  // Errors show for boxes the person has left, or for all of them after an approve attempt.
  const errors = showAll ? allErrors : Object.fromEntries(Object.entries(allErrors).filter(([k]) => touched.has(k)));
  // Nothing explored, or everything removed: there is nothing to put on the board.
  const nothingToShare = Boolean(editing && isEmptyReport(fromEditable(editing)));
  const dirty = Boolean(draft && editing && JSON.stringify(fromEditable(editing)) !== JSON.stringify(draft.body));

  const save = async (): Promise<boolean> => {
    const cur = latest.current;
    if (!draft || !cur) return true;
    if (Object.keys(validate(cur)).length) return false;
    const body = fromEditable(cur);
    if (JSON.stringify(body) === JSON.stringify(draft.body)) return true;
    setSaveState('saving');
    setSaveError('');
    try {
      const r = await api.saveReport(draft.id, body);
      onSaved(r.body, r.editedAt);
      setSaveState('saved');
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save your changes. Try again.');
      setSaveState('error');
      return false;
    }
  };

  // Save 800 ms after the last change, when the report is valid.
  useEffect(() => {
    if (!dirty || Object.keys(allErrors).length) return;
    const t = setTimeout(() => void save(), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const onFieldBlur = (e: React.FocusEvent) => {
    const id = (e.target as HTMLElement).id;
    if (id) setTouched((t) => (t.has(id) ? t : new Set(t).add(id)));
  };

  const approve = async () => {
    if (!draft || !editing) return;
    const first = Object.keys(allErrors)[0];
    if (first) {
      setShowAll(true);
      setTimeout(() => document.getElementById(first)?.focus());
      return;
    }
    setApproving(true);
    setApproveError('');
    // Approve exactly what is on screen: save any change still waiting first.
    if (!(await save())) {
      setApproving(false);
      return;
    }
    try {
      const r = await api.approve(draft.id);
      board.addReport({
        id: r.reportId,
        explorationId: r.explorationId,
        body: r.body,
        approvedBy: profile.userId,
        approvedByName: r.contributorName,
        approvedByColor: r.contributorColor,
        approvedAt: r.approvedAt,
        createdAt: r.createdAt,
        editedAt: r.editedAt,
        cardNoteIds: r.noteIds,
      });
      board.reserve(r.noteIds, false);
      useProfile.getState().markRead(r.reportId);
      useStore.setState({ justLanded: r.reportId });
      go({ name: 'board', boardId });
      onApproved?.();
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : 'Could not approve. Try again.');
      setApproving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/25 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="sheet fixed inset-y-0 right-0 z-50 flex w-[min(760px,92vw)] flex-col border-l border-line bg-bg shadow-raised outline-none">
          <div className="flex items-center justify-between border-b border-line px-8 py-4">
            <Dialog.Title className="text-[15px] font-semibold">Draft report</Dialog.Title>
            <Dialog.Close render={<Button variant="ghost" size="sm" />}>Keep exploring</Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Review the draft. Click any part of it to change it. Regenerate it, or approve it to put it on the board.</Dialog.Description>

          <ScrollArea className="flex-1" label="Draft report">
            <div className="mx-auto max-w-[680px] px-8 py-8">
              {drafting ? (
                <Drafting regenerating={Boolean(draft)} />
              ) : error ? (
                <div role="alert" className="flex flex-col items-start gap-4 py-12">
                  <p className="text-[15px] text-ink">The report could not be drafted.</p>
                  <p className="text-[14px] text-ink-2">{error}</p>
                  <Button onClick={onRegenerate}>Try again</Button>
                </div>
              ) : draft && editing ? (
                <div className="flex flex-col gap-8" onBlur={onFieldBlur}>
                  <ReportHeader
                    title={editing.title}
                    status="draft"
                    who={profile.name}
                    at={draft.createdAt}
                    edited={Boolean(draft.editedAt)}
                    notes={ex.snapshot.notes}
                    titleField={<TitleField value={editing.title} error={errors['report-title']} onChange={(v) => setEditing((e) => (e ? { ...e, title: v } : e))} />}
                  />
                  <ReportEditor value={editing} onChange={(fn) => setEditing((e) => (e ? fn(e) : e))} errors={errors} />
                </div>
              ) : null}
            </div>
          </ScrollArea>

          <footer className="flex items-center justify-between gap-4 border-t border-line bg-surface px-8 py-4">
            <p className="text-[13px] text-ink-3" aria-live="polite">
              {approveError || saveState === 'error' ? (
                <span role="alert" className="text-danger">
                  {approveError || saveError}
                </span>
              ) : showAll && Object.keys(allErrors).length ? (
                <span className="text-danger">Fix the marked items before you approve.</span>
              ) : Object.keys(errors).length ? (
                <span className="text-danger">Fix the marked items so your changes can be saved.</span>
              ) : drafting || !draft ? (
                'Drafting from your conversation with the AI.'
              ) : nothingToShare ? (
                'There is nothing to share yet. Chat with the AI about your notes, then make the report again.'
              ) : saveState === 'saving' ? (
                'Saving your changes…'
              ) : saveState === 'saved' ? (
                'Changes saved. Only you can see them until you approve.'
              ) : (
                'Click any part of the report to change it. Approving puts it on the board with your name.'
              )}
            </p>
            <div className="flex gap-2">
              <Button
                disabled={drafting || approving}
                onClick={() => {
                  if ((draft?.editedAt || dirty) && !confirm('Regenerate the draft? Your edits will be lost.')) return;
                  onRegenerate();
                }}
              >
                Regenerate
              </Button>
              <Button variant="primary" disabled={!draft || drafting || approving || nothingToShare} onClick={() => void approve()}>
                {approving ? 'Sharing…' : 'Approve and share'}
              </Button>
            </div>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Drafting({ regenerating }: { regenerating: boolean }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <p className="text-[15px] text-ink-2">{regenerating ? 'Writing a new draft.' : 'Writing the draft.'} This takes around 10 to 30 seconds.</p>
      <div aria-hidden className="flex animate-pulse flex-col gap-4">
        <div className="h-5 w-24 rounded-sm bg-surface-2" />
        <div className="h-8 w-3/4 rounded-sm bg-surface-2" />
        <div className="mt-4 h-4 w-full rounded-sm bg-surface-2" />
        <div className="h-4 w-full rounded-sm bg-surface-2" />
        <div className="h-4 w-2/3 rounded-sm bg-surface-2" />
        <div className="mt-6 h-12 w-full rounded-sm bg-surface-2" />
        <div className="h-12 w-full rounded-sm bg-surface-2" />
      </div>
    </div>
  );
}
