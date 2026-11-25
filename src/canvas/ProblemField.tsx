import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { board } from '../lib/board.ts';
import { useStore } from '../store.ts';

/**
 * WB-7: the frame. One collaborative plain-text field fixed at the top of the board.
 * Bound to a Y.Text, so two people can edit it at once without losing words.
 */
export function ProblemField({ variant = 'board' }: { variant?: 'board' | 'sidebar' }) {
  const problem = useStore((s) => s.problem);
  const synced = useStore((s) => s.synced);
  const pinned = useStore((s) => s.problemPinned);
  const inSidebar = variant === 'sidebar';
  // Opening a board focuses the Problem: the card on the board, or the sidebar's copy when the card is hidden.
  const routeFocus = inSidebar ? !pinned : pinned;
  const id = inSidebar ? 'problem-field-side' : 'problem-field';
  const [value, setValue] = useState(problem);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Not focused: show the shared text as it is.
  useEffect(() => {
    if (!focused) setValue(problem);
  }, [problem, focused]);

  // Focused: take other people's edits in without moving this person's caret.
  useEffect(() => {
    if (!focused) return;
    const t = board.problemText();
    if (!t) return;
    const onChange = (e: Y.YTextEvent) => {
      if (e.transaction.local) return;
      const el = ref.current;
      let caret = el?.selectionStart ?? 0;
      let index = 0;
      for (const d of e.changes.delta) {
        if (d.retain) index += d.retain;
        else if (typeof d.insert === 'string') {
          if (index <= caret) caret += d.insert.length;
          index += d.insert.length;
        } else if (d.delete && index < caret) caret -= Math.min(d.delete, caret - index);
      }
      setValue(t.toString());
      requestAnimationFrame(() => el?.setSelectionRange(caret, caret));
    };
    t.observe(onChange);
    return () => t.unobserve(onChange);
  }, [focused]);

  // Grow with the text, up to a third of the window; past that it scrolls with a thin scrollbar.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, Math.max(160, window.innerHeight / 3))}px`;
  }, [value]);

  if (inSidebar) {
    return (
      <div tabIndex={-1} data-route-focus={routeFocus || undefined} className="outline-none">
        <textarea
          id={id}
          ref={ref}
          rows={1}
          aria-label="Problem"
          value={value}
          disabled={!synced}
          placeholder="What problem is this board for? Write it as a question."
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setValue(e.target.value);
            board.setProblem(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') ref.current?.blur();
          }}
          maxLength={600}
          className="block w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin] text-[14px] leading-[1.45] text-pretty text-ink placeholder:text-ink-3 hover:border-line focus-visible:border-line-strong focus-visible:bg-surface focus-visible:outline-none"
        />
      </div>
    );
  }

  return (
    <section
      aria-labelledby="problem-label"
      tabIndex={-1}
      data-route-focus={routeFocus || undefined}
      className="rounded-[14px] border border-line bg-surface/95 px-5 py-4 shadow-card backdrop-blur outline-none focus-within:border-line-strong"
    >
      <label id="problem-label" htmlFor={id} className="mb-1.5 block text-[14px] font-semibold text-ink">
        Problem
      </label>
      <textarea
        id={id}
        ref={ref}
        rows={1}
        value={value}
        disabled={!synced}
        placeholder="What problem is this board for? Write it as a question the team can answer."
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setValue(e.target.value);
          board.setProblem(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') ref.current?.blur();
        }}
        maxLength={600}
        className="block w-full resize-none bg-transparent [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin] text-[17px] leading-[1.45] font-normal text-pretty text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
      />
    </section>
  );
}
