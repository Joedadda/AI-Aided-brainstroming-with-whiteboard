import { Popover } from '@base-ui/react/popover';
import { Sparkles } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { AGENT_LIMITS } from '../../shared/agent-schema.ts';
import { askInAgentSidebar, openAgent, useAgent } from '../lib/agent.ts';
import { ASKS, runOpinion } from '../lib/features.ts';
import { Button } from '../ui/Button.tsx';
import { Tooltip } from '../ui/Tooltip.tsx';

const MAX = 5; // SN-7

/**
 * Preset asks give a quick private answer. Typed questions start or continue the sidebar chat.
 */
export function AskAI({ boardId, noteIds }: { boardId: string; noteIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const movingFocus = useRef(false);
  const queued = useAgent((s) => Boolean(s.sidebarPrompt));
  const tooMany = noteIds.length > MAX;
  const n = `${noteIds.length} ${noteIds.length === 1 ? 'note' : 'notes'}`;

  const ask = (id: (typeof ASKS)[number]['id']) => {
    setOpen(false);
    setQ('');
    void runOpinion(noteIds, id);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (!text || queued) return;
    movingFocus.current = true;
    setOpen(false);
    setQ('');
    askInAgentSidebar(boardId, text, noteIds.slice(0, AGENT_LIMITS.scopeNotes));
  };

  return (
    <Popover.Root open={open} onOpenChange={(next) => {
      if (next) movingFocus.current = false;
      setOpen(next);
    }}>
      <Tooltip label="Ask the agent">
        <Popover.Trigger
          render={<Button variant="ghost" size="sm" className="group w-8 px-0 !text-ai data-[popup-open]:bg-surface-2" />}
          aria-label="Ask the agent"
          disabled={noteIds.length === 0}
        >
          <Sparkles aria-hidden className="size-5 shrink-0 fill-transparent group-hover:fill-current group-data-[popup-open]:fill-current" strokeWidth={1.75} />
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner sideOffset={10} side="bottom" align="end">
          <Popover.Popup finalFocus={() => movingFocus.current ? false : true} className="popup z-50 flex w-[300px] flex-col gap-3 rounded-[14px] border border-line bg-surface p-3 shadow-raised outline-none">
            <Popover.Title className="px-1 text-[13px] font-semibold">Ask the agent about {n}</Popover.Title>
            {tooMany ? (
              <p className="px-1 text-[13px] leading-relaxed text-ink-2">Quick suggestions are available for up to {MAX} notes. You can type a question below.</p>
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
                <p className="px-1 text-[12px] text-ink-3">Only you see the answer, unless you save it as a note.</p>
              </>
            )}
            <form onSubmit={onSubmit} className="flex gap-2 border-t border-line pt-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Your own question"
                placeholder="Ask in the Agent sidebar"
                maxLength={300}
                className="h-8 min-w-0 flex-1 rounded-sm border border-line-strong px-2 text-[13px] focus-visible:border-ink-3"
              />
              <Button type="submit" size="sm" disabled={!q.trim() || queued}>
                Ask
              </Button>
            </form>
            <button
              type="button"
              onClick={() => {
                movingFocus.current = true;
                setOpen(false);
                openAgent();
              }}
              className="pressable key-quiet flex items-center gap-2 rounded-md border-t border-line px-2.5 pt-3 pb-2 text-left text-[14px] text-ink hover:bg-ai-bg hover:text-ai"
            >
              <Sparkles aria-hidden className="size-4 shrink-0 text-ai" strokeWidth={1.75} />
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
