import { useEffect, useState } from 'react';
import type { BoardKind } from '../../shared/types.ts';
import { ApiError, api } from '../lib/api.ts';
import { useProfile } from '../lib/profile.ts';
import { go } from '../lib/router.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';

/** Start screen: a fresh copy of one of the three Split Buddy case boards, or a blank board. */
export function Home() {
  const recent = useProfile((s) => s.recent);
  const profile = useProfile((s) => s.profile);
  const [busy, setBusy] = useState<BoardKind | null>(null);
  const [error, setError] = useState('');

  // Drop boards that no longer exist (for example the old demo boards), so the list never leads nowhere.
  useEffect(() => {
    const { recent: list, forget } = useProfile.getState();
    for (const r of list) {
      api.getBoard(r.id).catch((e) => {
        if (e instanceof ApiError && e.status === 404) forget(r.id);
      });
    }
  }, []);

  const create = async (kind: BoardKind) => {
    setBusy(kind);
    setError('');
    try {
      const { boardId } = await api.createBoard(kind);
      go({ name: 'board', boardId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the board.');
      setBusy(null);
    }
  };

  return (
    <div className="screen-enter mx-auto flex w-full max-w-[720px] flex-col gap-10 px-8 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Hello, {profile?.name}</h1>
        <p className="max-w-[560px] text-[15px] leading-relaxed text-ink-2">
          Frame a problem on a shared board, take notes into a private canvas to think them through with the AI, and bring back a report with reasons.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => void create('case')} disabled={busy !== null}>
          {busy === 'case' ? 'Creating…' : 'Start a fresh case'}
        </Button>
        <Button onClick={() => void create('mid')} disabled={busy !== null}>
          {busy === 'mid' ? 'Creating…' : 'Start mid-session'}
        </Button>
        <Button onClick={() => void create('example')} disabled={busy !== null}>
          {busy === 'example' ? 'Creating…' : 'See a finished example'}
        </Button>
        <Button onClick={() => void create('blank')} disabled={busy !== null}>
          {busy === 'blank' ? 'Creating…' : 'New whiteboard'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="-mt-6 text-[13px] text-danger">
          {error}
        </p>
      )}
      <p className="-mt-6 max-w-[600px] text-[13px] leading-relaxed text-ink-3">
        The three case boards use Split Buddy, a fictional bill-splitting app that loses six in ten new users in week one. The fresh case starts with the problem, three options and the facts. Mid-session adds the team's pile of ideas, still unsorted. The finished example adds three explorations, their reports and the decisions the team locked. Each click makes a fresh copy.
      </p>

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
          <h2 id="recent-heading" className="text-[13px] font-semibold text-ink-2">
            Boards you opened
          </h2>
          <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
            {recent.map((r) => (
              <li key={r.id}>
                <a
                  href={`/b/${r.id}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    go({ name: 'board', boardId: r.id });
                  }}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-[14px] hover:bg-surface-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{r.title || 'Untitled board'}</span>
                    {r.kind === 'example' && <Badge tone="draft">Finished example</Badge>}
                    {r.kind === 'mid' && <Badge tone="draft">Mid-session example</Badge>}
                    {r.kind === 'case' && <Badge>Fresh case</Badge>}
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-3">{new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
