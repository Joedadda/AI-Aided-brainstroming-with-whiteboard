import { Popover } from '@base-ui/react/popover';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { board, refreshPresence } from '../lib/board.ts';
import { NOTE_COLORS, USER_COLORS, noteColorOf, openAsAnotherPerson, useProfile } from '../lib/profile.ts';
import type { StickyColor } from '../../shared/types.ts';
import { UserPlus } from 'lucide-react';
import { boardLink } from '../lib/router.ts';
import { useStore } from '../store.ts';
import { Badge } from './Badge.tsx';
import { Button } from './Button.tsx';
import { Tooltip } from './Tooltip.tsx';
import { cx } from './cx.ts';

// ---------- Board title, named by the AI once the board has enough on it (WB-2, 6.1) ----------

export function BoardTitle({ boardId }: { boardId: string }) {
  const meta = useStore((s) => s.meta);
  const synced = useStore((s) => s.synced);
  const cards = useStore((s) => s.cards);
  const chips = useStore((s) => s.chips);
  const remember = useProfile((s) => s.remember);
  const [value, setValue] = useState(meta.title);
  const [focused, setFocused] = useState(false);
  const [asking, setAsking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Remote changes show up unless this person is typing in the field.
  useEffect(() => {
    if (!focused) setValue(meta.title);
  }, [meta.title, focused]);
  useEffect(() => {
    if (synced) remember(boardId, meta.title, meta.kind);
  }, [synced, boardId, meta.title, meta.kind, remember]);

  // "AI named this board" toast for everyone: when the title goes from empty to an AI title
  // while the board is open (not on first load), and away again when the title changes.
  const prevTitle = useRef<{ boardId: string; title: string } | null>(null);
  useEffect(() => {
    if (!synced) return;
    const before = prevTitle.current?.boardId === boardId ? prevTitle.current.title : null;
    prevTitle.current = { boardId, title: meta.title };
    if (before === null) return; // first sync of this board: an existing title is not news
    if (!before && meta.title && meta.titleSource === 'ai') useStore.setState({ titleToast: meta.title });
    else if (before !== meta.title) useStore.setState({ titleToast: undefined });
  }, [synced, boardId, meta.title, meta.titleSource]);

  // A failed call releases the claim and waits a minute; the next note or context item retries.
  const failedAt = useRef(0);
  const claiming = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ask = async () => {
    setAsking(true);
    const started = Date.now();
    try {
      const { title } = await api.title(boardId);
      // The model often answers in under half a second; hold the shimmer for one full sweep
      // so it reads as "the AI is naming this", not a flicker.
      await new Promise((r) => setTimeout(r, Math.max(0, 1400 - (Date.now() - started))));
      // Set directly (user decision, 24 Nov): no Accept step. A title someone typed meanwhile wins.
      // It is an ordinary edit, so Ctrl+Z or retyping replaces it; the "AI title" badge marks it.
      const el = inputRef.current;
      const typing = el && (document.activeElement === el || el.value.trim());
      if (!useStore.getState().meta.title && !typing) board.setTitle(title, 'ai');
    } catch {
      // A background nicety: no error message. Release the claim so anyone can try again later.
      failedAt.current = Date.now();
      board.resetTitleClaim();
    } finally {
      setAsking(false);
    }
  };

  // Auto-title trigger: no title yet, nobody has claimed it, and enough on the board to name it
  // (3 notes with text, or 1 note plus 1 summarised context item). There is no manual button.
  const filled = cards.filter((c) => c.text.trim()).length;
  const readyChips = chips.filter((c) => c.status === 'ready').length;
  const enough = filled >= 3 || (filled >= 1 && readyChips >= 1);
  useEffect(() => {
    if (!synced || meta.title || meta.titleSource || meta.titleProposedBy || !enough) return;
    if (Date.now() - failedAt.current < 60_000 || claiming.current) return;
    // Not cancelled when notes change mid-claim: a won claim must always lead to a call,
    // or the claim would sit there and block the title for everyone.
    claiming.current = true;
    void board.claimTitle().then((won) => {
      claiming.current = false;
      if (!won) return;
      if (mounted.current) void ask();
      else board.resetTitleClaim(); // left the board mid-claim: hand the job back
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, meta.title, meta.titleSource, meta.titleProposedBy, enough, filled, readyChips]);

  const commit = () => {
    setFocused(false);
    if (value.trim() !== meta.title) board.setTitle(value, 'user');
  };

  // While the AI names an untitled board, the field shimmers (styles.css: .ai-naming).
  const naming = asking && !value;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={cx('relative flex min-w-0 rounded-sm', naming && 'ai-naming')}>
      <input
        ref={inputRef}
        aria-label="Board title"
        value={value}
        placeholder={naming ? '' : 'Untitled board'}
        onFocus={() => setFocused(true)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') inputRef.current?.blur();
          if (e.key === 'Escape') {
            setValue(meta.title);
            setTimeout(() => inputRef.current?.blur());
          }
        }}
        maxLength={80}
        size={Math.max(14, Math.min(40, (value || 'Untitled board').length + 2))}
        className="h-8 max-w-[360px] min-w-0 shrink truncate rounded-sm bg-transparent px-2 text-[15px] font-semibold placeholder:font-normal placeholder:text-ink-3 hover:bg-surface-2 focus-visible:bg-surface-2"
      />
        {naming && (
          <span aria-hidden className="ai-naming-text pointer-events-none absolute inset-y-0 left-2 flex items-center text-[15px] font-semibold whitespace-nowrap">
            Naming this board…
          </span>
        )}
      </span>
      <span role="status" className="sr-only">
        {naming ? 'The AI is naming this board.' : ''}
      </span>
      {meta.title && meta.titleSource === 'ai' && <Badge tone="ai">AI title</Badge>}
      {meta.kind === 'example' && <Badge tone="draft">Finished example</Badge>}
      {meta.kind === 'mid' && <Badge tone="draft">Mid-session example</Badge>}
    </div>
  );
}

// ---------- People on the board (MP-2) ----------

export function People() {
  const peers = useStore((s) => s.peers);
  const profile = useProfile((s) => s.profile)!;
  // One avatar per person even if they have two tabs open.
  const seen = new Set<string>();
  const others = peers.filter((p) => (seen.has(p.userId) || p.userId === profile.userId ? false : (seen.add(p.userId), true)));
  // You are not listed: your name already sits in the profile menu beside this row.
  const all = others;
  if (!all.length) return null;
  return (
    <ul aria-label={`${all.length} other ${all.length === 1 ? 'person' : 'people'} on this board`} className="flex items-center -space-x-1.5">
      {all.slice(0, 6).map((p) => (
        <li key={p.userId}>
          <Tooltip label={p.name}>
            <span
              tabIndex={0}
              aria-label={p.name}
              className="flex size-8 items-center justify-center rounded-full border-2 border-surface text-[12px] font-semibold text-white"
              style={{ background: p.color }}
            >
              {initials(p.name)}
            </span>
          </Tooltip>
        </li>
      ))}
      {all.length > 6 && <li className="pl-3 text-[12px] text-ink-3">+{all.length - 6}</li>}
    </ul>
  );
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

// ---------- Share link (MP-8) ----------

export function ShareLink({ boardId }: { boardId: string }) {
  const [copied, setCopied] = useState(false);
  const link = boardLink(boardId);
  return (
    <div className="flex items-center gap-1 rounded-[11px] border border-line bg-surface-2 p-0.5 min-[1600px]:pl-3">
      {/* The address shows on wide screens; the button always copies it. */}
      <span className="hidden max-w-[220px] truncate text-[13px] text-ink-2 tabular-nums min-[1600px]:inline" title={link}>
        {link.replace(/^https?:\/\//, '')}
      </span>
      <Button
        size="sm"
        variant="primary"
        className="h-7"
        onClick={async () => {
          await navigator.clipboard.writeText(link).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? 'Copied' : 'Copy board link'}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Board link copied' : ''}
      </span>
    </div>
  );
}

// ---------- Connection state (MP-4) ----------

export function ConnectionState() {
  const status = useStore((s) => s.status);
  if (status === 'connected') return null;
  return (
    <span role="status" className={cx('flex items-center gap-1.5 text-[13px]', status === 'refused' ? 'text-danger' : 'text-draft')}>
      <span aria-hidden className={cx('size-2 rounded-full', status === 'refused' ? 'bg-danger' : 'animate-pulse bg-draft')} />
      {status === 'refused' ? 'Could not join this board' : status === 'reconnecting' ? 'Reconnecting' : 'Connecting'}
    </span>
  );
}

// ---------- Profile menu (Build PRD 4) ----------

export function ProfileMenu() {
  const profile = useProfile((s) => s.profile)!;
  const patch = useProfile((s) => s.patch);
  const [name, setName] = useState(profile.name);
  const [error, setError] = useState('');

  const save = async (p: { name?: string; color?: string }) => {
    setError('');
    try {
      const u = await api.updateProfile(p);
      patch({ name: u.name, color: u.color });
      refreshPresence();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            aria-label={`Your profile: ${profile.name}`}
            className="pressable key flex h-8 items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-[13px] font-medium hover:border-line-strong"
          />
        }
      >
        <span aria-hidden className="size-6 rounded-full" style={{ background: profile.color }} />
        <span className="max-w-[120px] truncate">{profile.name}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end">
          <Popover.Popup className="popup z-50 flex w-[300px] flex-col gap-4 rounded-[14px] border border-line bg-surface p-4 shadow-raised outline-none">
            <Popover.Title className="text-[14px] font-semibold">Your profile</Popover.Title>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-ink-2">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name.trim() !== profile.name && void save({ name })}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                maxLength={40}
                className="h-9 rounded-md border border-line-strong px-2.5 text-[14px] focus-visible:border-ink-3"
              />
            </label>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-[12px] font-semibold text-ink-2">Colour</legend>
              <div className="flex flex-wrap gap-2">
                {USER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    aria-pressed={profile.color === c}
                    onClick={() => void save({ color: c })}
                    className={cx('pressable key-tint size-7 rounded-full', profile.color === c && 'outline-2 outline-offset-2 outline-ink')}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </fieldset>
            <NoteColorChoice />
            {error && <p className="text-[12px] text-danger">{error}</p>}
            <div className="flex flex-col gap-1 border-t border-line pt-3">
              <Button size="sm" onClick={openAsAnotherPerson}>
                <UserPlus aria-hidden className="size-4" strokeWidth={1.75} />
                Switch profile
              </Button>
              <p className="text-[12px] leading-relaxed text-ink-3">Opens a new tab with its own profile, to try the board with two people on one computer.</p>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The colour new notes from this person get: assigned by default, changeable here (user request, 25 Nov). */
function NoteColorChoice() {
  const current = useProfile(noteColorOf);
  const picked = useProfile((s) => s.noteColor);
  const setNoteColor = useProfile((s) => s.setNoteColor);
  const NAMES: Record<StickyColor, string> = { yellow: 'Yellow', pink: 'Pink', blue: 'Blue', green: 'Green' };
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[12px] font-semibold text-ink-2">Note colour</legend>
      <div className="flex flex-wrap gap-2">
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`${NAMES[c]} notes`}
            aria-pressed={current === c}
            onClick={() => setNoteColor(c)}
            className={cx('swatch pressable key-tint size-7 rounded-full border border-ink/15', current === c && 'outline-2 outline-offset-2 outline-ink')}
            data-color={c}
          />
        ))}
      </div>
      <p className="text-[12px] leading-relaxed text-ink-3">
        {picked ? 'New notes you add use this colour.' : 'Picked for you so your notes stand out. New notes you add use it.'}
      </p>
    </fieldset>
  );
}
