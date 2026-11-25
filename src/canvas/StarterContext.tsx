import { ArrowRight, Paperclip, Users } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useAgent } from '../lib/agent.ts';
import { animateSidebar } from '../lib/sidebar-motion.ts';
import { useStore } from '../store.ts';
import { Button } from '../ui/Button.tsx';

const sources = [
  { mode: 'meeting', title: 'Add meeting context', description: 'Bring in a meeting transcript or summary.', Icon: Users, field: 'meeting-text' },
  { mode: 'plain', title: 'Add other context', description: 'Bring in research notes, links or files.', Icon: Paperclip, field: 'add-context' },
] as const;

export function StarterContext({ storageKey }: { storageKey: string }) {
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return (localStorage.getItem(storageKey) ?? '').split(',').filter(Boolean);
    } catch {
      return [];
    }
  });
  const hasWrittenNote = useStore((s) => s.cards.some((card) => card.text.trim()));
  const chips = useStore((s) => s.chips);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (hasWrittenNote) setDismissed((value) => value.includes('done') ? value : [...value, 'done']);
  }, [hasWrittenNote]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, dismissed.join(','));
    } catch {
      // The prompts can still be dismissed for this visit.
    }
  }, [dismissed, storageKey]);

  const open = (source: (typeof sources)[number]) => {
    animateSidebar(() => {
      useAgent.setState({ open: false });
      useStore.setState({ dock: 'context', dockOpen: true, contextView: source.mode });
      requestAnimationFrame(() => document.getElementById(source.field)?.focus({ preventScroll: true }));
    });
  };

  const visible = hasWrittenNote || dismissed.includes('done') ? [] : sources.filter(({ mode }) =>
    !dismissed.includes(mode) && !chips.some((chip) => chip.status === 'ready' && (chip.type === 'meeting') === (mode === 'meeting')),
  );

  return (
    <div className="nodrag nopan grid grid-cols-2 gap-x-3">
      <AnimatePresence initial={false}>
        {visible.map((source) => (
          <motion.section
            key={source.mode}
            aria-label={source.title}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
            transition={{ duration: reducedMotion ? 0 : 0.14 }}
            className="mt-3 flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-4 py-3.5 shadow-card"
          >
            <h2 className="flex items-center gap-2 text-[13px] font-semibold">
              <source.Icon aria-hidden size={16} className="text-ink-2" />
              {source.title}
            </h2>
            <p className="text-[13px] leading-snug text-ink-2">{source.description}</p>
            <div className="mt-auto flex flex-wrap items-center gap-1">
              <Button size="sm" aria-label={source.title} onClick={() => open(source)}>
                Add <ArrowRight aria-hidden size={14} />
              </Button>
              <Button size="sm" variant="ghost" aria-label={`Skip ${source.mode === 'meeting' ? 'meeting' : 'other'} context`} onClick={() => setDismissed((value) => [...value, source.mode])}>
                Skip
              </Button>
            </div>
          </motion.section>
        ))}
        {visible.length > 0 && (
          <motion.p
            key="sidebar-hint"
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.14 }}
            className="col-span-2 mt-2 px-1 text-[13px] text-ink-2"
          >
            You can also add context later from the Context tab in the sidebar.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
