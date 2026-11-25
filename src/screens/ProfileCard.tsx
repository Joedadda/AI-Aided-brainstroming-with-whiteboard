import { useState, type FormEvent } from 'react';
import { api } from '../lib/api.ts';
import { USER_COLORS, friendlyName, useProfile } from '../lib/profile.ts';
import { Button } from '../ui/Button.tsx';

/** First visit (Build PRD 4): a name, a colour, one button. No account, no email. */
export function ProfileCard({ intro }: { intro: string }) {
  const setProfile = useProfile((s) => s.setProfile);
  const [name, setName] = useState(friendlyName);
  const [color] = useState(() => USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const p = await api.createProfile(name.trim(), color);
      setProfile({ userId: p.userId, token: p.token, name: p.name, color: p.color });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="screen-enter flex flex-1 items-center justify-center bg-bg px-6">
      <form onSubmit={submit} className="flex w-full max-w-[400px] flex-col gap-6 rounded-[18px] border border-line bg-surface p-8 shadow-raised">
        <div className="flex flex-col gap-2">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Join the whiteboard</h1>
          <p className="text-[14px] leading-relaxed text-ink-2">{intro}</p>
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">Your name on the board</span>
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-9 shrink-0 rounded-full" style={{ background: color }} />
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="nickname"
              className="h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-[15px] focus-visible:border-ink-3"
            />
          </span>
          <span className="text-[12px] text-ink-3">Others see this name and colour next to your notes and cursor.</span>
        </label>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
          {busy ? 'Starting…' : 'Start'}
        </Button>
        <p className="text-[12px] leading-relaxed text-ink-3">
          No sign-in. Your profile lives in this browser only. This is a prototype: use made-up content, because board text is sent to AI model providers.
        </p>
      </form>
    </div>
  );
}
