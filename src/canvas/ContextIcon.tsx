import { FileText, Link2, Users } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip.tsx';

/*
  One icon for a context item's kind, the same everywhere it appears (user request, 25 Nov): it
  replaces the LINK / TEXT / MEETING tags. Hovering it (or focusing it) says where the item came
  from. The full text sits behind "View more" on the item itself.
*/

export type ContextKind = 'link' | 'text' | 'meeting';
const ICON = { link: Link2, text: FileText, meeting: Users } as const;
const KIND = { link: 'Link', text: 'Pasted text', meeting: 'Meeting' } as const;

/** "Meeting, added by Meera" / "Link: splitbuddy.example/..., added by Asha". */
export function sourceLine(type: ContextKind, by?: string, url?: string) {
  const where = type === 'link' && url ? `Link: ${url.replace(/^https?:\/\/(www\.)?/, '')}` : KIND[type];
  return by ? `${where}, added by ${by}` : where;
}

export function ContextIcon({ type, source }: { type: ContextKind; source: string }) {
  const Icon = ICON[type];
  return (
    <Tooltip label={source}>
      <span
        tabIndex={0}
        role="img"
        aria-label={source}
        className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-ink-2 outline-none hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2"
      >
        <Icon aria-hidden size={15} strokeWidth={1.75} />
      </span>
    </Tooltip>
  );
}
