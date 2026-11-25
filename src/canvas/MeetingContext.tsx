import { ArrowUp, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ContextChip } from '../../shared/types.ts';
import { api, ApiError } from '../lib/api.ts';
import { board } from '../lib/board.ts';
import { buildSession, openSheet, resumeDraft } from '../lib/meeting.ts';
import { useStore } from '../store.ts';
import { Button } from '../ui/Button.tsx';
import { Tooltip } from '../ui/Tooltip.tsx';

// Meeting addendum 3.1 and 3.2: the Build from Meeting view of the Context panel, and the owner's part of a meeting chip.

const MAX = 200_000;

export function MeetingForm({ boardId, onAdd }: { boardId: string; onAdd: () => void }) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX * 3) return setError('That file is too large. Paste a shorter part of the meeting.');
    setText((await f.text()).slice(0, MAX));
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, '').slice(0, 80));
    setError('');
  };

  // User, 25 Nov: this view only builds. Context on its own is added in the General context view.
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    setError('');
    const chipId = board.addChip('meeting', name.trim());
    onAdd();
    try {
      const r = await api.addMeeting(boardId, v, name.trim() || undefined);
      board.updateChip(chipId, { title: r.title, summary: r.summary, status: 'ready', sourceId: r.sourceId, sourceName: name.trim(), fullText: r.text });
      setText('');
      setName('');
      void buildSession(r.sourceId, chipId);
    } catch (err) {
      // The pasted text stays in the field, so nothing is lost.
      board.dropChip(chipId);
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'The meeting could not be added. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-busy={Boolean(busy)}>
      <label htmlFor="meeting-text" className="text-[13px] font-semibold">
        Meeting transcript or summary
      </label>
      {/* User, 25 Nov: plus (import a transcript) and arrow (build) in the box. The text grows up to four lines. */}
      <div className="rounded-md border border-line-strong bg-surface focus-within:border-ink-3 keys:focus-within:outline-2 keys:focus-within:outline-offset-2 keys:focus-within:outline-accent">
        <textarea
          id="meeting-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(e);
          }}
          rows={2}
          maxLength={MAX}
          placeholder="Paste a transcript (speaker lines, .vtt or .srt text) or a summary"
          aria-describedby="meeting-next"
          className="block max-h-[90px] min-h-[46px] w-full resize-none overflow-y-auto [field-sizing:content] bg-transparent px-2.5 pt-2 text-[13px] leading-snug outline-none placeholder:text-ink-3 focus-visible:outline-none"
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
          <Tooltip label="Import a transcript">
            <button
              type="button"
              aria-label="Import a transcript"
              onClick={() => fileRef.current?.click()}
              className="pressable key-quiet flex size-8 items-center justify-center rounded-[8px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <Plus aria-hidden size={16} strokeWidth={2} />
            </button>
          </Tooltip>
          <Tooltip label="Add and build session (Ctrl+Enter)">
            <button
              type="submit"
              aria-label="Add and build session"
              disabled={!text.trim() || busy}
              className="pressable key-accent flex size-8 items-center justify-center rounded-[8px] bg-accent text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3"
            >
              <ArrowUp aria-hidden size={16} strokeWidth={2} />
            </button>
          </Tooltip>
        </div>
      </div>
      {/* The name is asked for only once there is a meeting to name. */}
      {text.trim() && (
        <>
          <label htmlFor="meeting-name" className="sr-only">
            Meeting name (optional)
          </label>
          <input
            id="meeting-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Meeting name (optional)"
            className="h-8 min-w-0 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] placeholder:text-ink-3 focus-visible:border-ink-3"
          />
        </>
      )}
      {busy && (
        <p role="status" className="text-[12px] font-medium text-ink-2">
          Adding the meeting…
        </p>
      )}
      <div id="meeting-next" className="flex flex-col gap-1 text-[12px] leading-relaxed text-ink-2">
        <p className="font-semibold text-ink">What happens next</p>
        <ol className="flex list-decimal flex-col gap-0.5 pl-4">
          <li>The meeting is saved under Added context with a short summary. Everyone on the board can read both.</li>
          <li>The AI drafts notes in sections, with any decisions it finds.</li>
          <li>You check and edit the draft. Nothing goes on the board until you press Add to board.</li>
        </ol>
      </div>
      {error && (
        <p role="alert" className="text-[12px] leading-relaxed text-danger">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-1.5" aria-label="Meeting tools you will be able to connect">
        {['Wispr Flow Notetaker', 'Granola'].map((k) => (
          <li key={k} aria-disabled className="flex h-8 cursor-not-allowed items-center justify-between rounded-sm border border-dashed border-line-strong px-2.5 text-[12px] text-ink-3">
            {k} <span className="text-[11px]">Coming soon</span>
          </li>
        ))}
      </ul>
    </form>
  );
}

const STAGE: Record<string, string> = { reading: 'Reading the meeting…', drafting: 'Drafting the session…', checking: 'Checking the draft…' };

type Info = Awaited<ReturnType<typeof api.meeting>> | 'missing' | null;

/** The owner's view of a meeting chip: build, progress, review, "Session built, N notes". */
export function MeetingChipOwner({ chip }: { chip: ContextChip }) {
  const sourceId = chip.sourceId;
  const build = useStore((s) => (sourceId ? s.meetingBuilds[sourceId] : undefined));
  const tick = useStore((s) => s.meetingTick);
  const [info, setInfo] = useState<Info>(null);

  useEffect(() => {
    if (!sourceId || chip.status !== 'ready') return;
    let live = true;
    api
      .meeting(sourceId)
      .then((r) => live && setInfo(r))
      .catch((e) => live && setInfo(e instanceof ApiError && e.status === 404 ? 'missing' : null));
    return () => {
      live = false;
    };
  }, [sourceId, chip.status, tick, build?.status]);

  if (!sourceId || chip.status !== 'ready') return null;
  if (info === 'missing') return <p className="text-[12px] text-ink-3">The meeting text was removed, so a session cannot be built from it.</p>;

  if (build?.status === 'building')
    return (
      <p role="status" className="flex items-center gap-2 text-[12px] font-medium text-ai">
        <span aria-hidden className="size-2 animate-pulse rounded-full bg-ai" />
        {STAGE[build.stage]}
      </p>
    );
  if (build?.status === 'error')
    return (
      <div className="flex flex-col items-start gap-1.5">
        <p role="alert" className="text-[12px] leading-relaxed text-danger">
          {build.error}
        </p>
        <Button size="sm" className="h-7" onClick={() => void buildSession(sourceId, chip.id)}>
          Try again
        </Button>
      </div>
    );
  if (build?.status === 'ready')
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-ai">Draft ready</span>
        <Button size="sm" variant="primary" className="h-7" onClick={() => openSheet(sourceId, chip.id)}>
          Review
        </Button>
      </div>
    );

  const waiting = info && info.latestDraft?.status === 'draft' ? info.latestDraft : null;
  const built = info ? info.builtNotes : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {waiting ? (
        <>
          <span className="text-[12px] text-ink-2">A draft is waiting for you</span>
          <Button size="sm" variant="primary" className="h-7" onClick={() => void resumeDraft(sourceId, chip.id, waiting.id)}>
            Review
          </Button>
        </>
      ) : (
        <>
          <span className="text-[12px] text-ink-2">{built > 0 ? `Session built, ${built} ${built === 1 ? 'note' : 'notes'}` : 'Turn it into notes and sections'}</span>
          <Button size="sm" variant="ai" className="h-7" onClick={() => void buildSession(sourceId, chip.id)}>
            {built > 0 ? 'Build again' : 'Build a session'}
          </Button>
        </>
      )}
    </div>
  );
}
