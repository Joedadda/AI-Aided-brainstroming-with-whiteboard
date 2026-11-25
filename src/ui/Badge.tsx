import type { ReactNode } from 'react';
import { cx } from './cx.ts';

type Tone = 'neutral' | 'ai' | 'draft' | 'approved' | 'locked';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  ai: 'bg-ai-bg text-ai',
  draft: 'bg-draft-bg text-draft',
  approved: 'bg-approved-bg text-approved',
  /** Locked decisions: ink on a light ink tint, apart from the AI purple and the selection blue. */
  locked: 'bg-ink/[0.08] text-ink',
};

/** Status is always a word, never colour alone. */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex h-5 items-center rounded-sm px-1.5 text-[11px] font-semibold tracking-wide uppercase',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
