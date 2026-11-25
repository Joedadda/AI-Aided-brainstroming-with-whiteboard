import { Popover } from '@base-ui/react/popover';
import { WandSparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ASKS, runOpinion } from '../lib/features.ts';
import { Button } from '../ui/Button.tsx';
import { Tooltip } from '../ui/Tooltip.tsx';

const MAX = 5; // SN-7

/**
 * The one AI button on the selection bar (user request, 25 Nov: one purple sparkle, icon only).
 * SN-1: four preset asks and a text box for the selected notes, with a private answer. The last row
 * hands the same notes to the whiteboard agent (sort, group, add ideas, lock), which used to be a
 * separate "Ask agent" button.
 */
export function AskAI({ noteIds, onAgent }: { noteIds: string[]; onAgent: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const tooMany = noteIds.length > MAX;
  const n = `${noteIds.length} ${noteIds.length === 1 ? 'note' : 'notes'}`;

  const ask = (id: Parameters<typeof runOpinion>[1], question?: string) => {
    setOpen(false);
    setQ('');
    void runOpinion(noteIds, id, question);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) ask('custom', q.trim());
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip label="Ask the agent">
        <Popover.Trigger
          render={<Button variant="ghost" size="sm" aria-label="Ask the agent" className="group w-8 px-0 !text-ai data-[popup-open]:bg-surface-2" disabled={noteIds.length === 0} />}
        >
          {/* User, 25 Nov: the wand marks the AI and agent actions here (Explore privately has the sparkles). No purple fill on the button: a 20 px purple outline at rest, filled on hover or while open. */}
          <WandSparkles aria-hidden className="size-5 shrink-0 fill-transparent group-hover:fill-current group-data-[popup-open]:fill-current" strokeWidth={1.75} />
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner sideOffset={10} side="bottom" align="end">
          <Popover.Popup className="popup z-50 flex w-[300px] flex-col gap-3 rounded-[14px] border border-line bg-surface p-3 shadow-raised outline-none">
            <Popover.Title className="px-1 text-[13px] font-semibold">Ask the agent about {n}</Popover.Title>
            {tooMany ? (
              <p className="px-1 text-[13px] leading-relaxed text-ink-2">Select {MAX} notes or fewer to ask about them. The agent below works with any number.</p>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  {ASKS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => ask(a.id)}
                      className="pressable key-quiet rounded-md px-2.5 py-2 text-left text-[14px] text-ink hover:bg-ai-bg hover:text-ai"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                <form onSubmit={onSubmit} className="flex gap-2 border-t border-line pt-3">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label="Your own question"
                    placeholder="Or ask your own question"
                    maxLength={300}
                    className="h-8 min-w-0 flex-1 rounded-sm border border-line-strong px-2 text-[13px] focus-visible:border-ink-3"
                  />
                  <Button type="submit" size="sm" disabled={!q.trim()}>
                    Ask
                  </Button>
                </form>
                <p className="px-1 text-[12px] text-ink-3">Only you see the answer, unless you save it as a note.</p>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAgent();
              }}
              className="pressable key-quiet flex items-center gap-2 rounded-md border-t border-line px-2.5 pt-3 pb-2 text-left text-[14px] text-ink hover:bg-ai-bg hover:text-ai"
            >
              <WandSparkles aria-hidden className="size-4 shrink-0 text-ai" strokeWidth={1.75} />
              <span>
                Hand these to the agent
                <span className="block text-[12px] text-ink-3">Sort, group, add ideas or lock</span>
              </span>
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
