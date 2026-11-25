import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { PROBLEM_NODE_ID } from '../../shared/ydoc.ts';
import { board } from '../lib/board.ts';
import { useStore } from '../store.ts';
import { cx } from '../ui/cx.ts';

/**
 * WB-7: one collaborative plain-text field, shown on the board and in the sidebar.
 * Bound to a Y.Text, so two people can edit it at once without losing words.
 */
export function ProblemField({ variant = 'board' }: { variant?: 'board' | 'sidebar' }) {
  const problem = useStore((s) => s.problem);
  const synced = useStore((s) => s.synced);
  const inSidebar = variant === 'sidebar';
  const editing = useStore((s) => s.editingId === PROBLEM_NODE_ID);
  const id = inSidebar ? 'problem-field-side' : 'problem-field';
  const [value, setValue] = useState(problem);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (inSidebar || !editing || !synced) return;
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [inSidebar, editing, synced]);

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

  // The sidebar stays mounted while hidden. Wait for a usable width and remeasure when it changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let measuredWidth = 0;
    const resize = () => {
      measuredWidth = el.offsetWidth;
      if (!measuredWidth) return;
      const scrollTop = el.scrollTop;
      el.style.height = 'auto';
      const borderHeight = el.offsetHeight - el.clientHeight;
      const limit = inSidebar ? Math.max(160, window.innerHeight / 3) : Infinity;
      el.style.height = `${Math.min(el.scrollHeight + borderHeight, limit)}px`;
      el.scrollTop = scrollTop;
    };
    resize();

    const observer = new ResizeObserver(() => {
      if (el.offsetWidth !== measuredWidth) resize();
    });
    observer.observe(el, { box: 'border-box' });
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [inSidebar, value]);

  if (inSidebar) {
    return (
      <div>
        <textarea
          id={id}
          ref={ref}
          rows={1}
          aria-label="Core question"
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
          className="block w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin] text-[14px] leading-[1.45] text-pretty text-ink placeholder:text-ink-3 hover:border-line focus-visible:border-line-strong focus-visible:bg-surface focus-visible:outline-none"
        />
      </div>
    );
  }

  return (
    <section
      aria-labelledby="problem-label"
      tabIndex={-1}
      data-route-focus
      className="problem-card rounded-[14px] border border-line bg-surface px-5 py-4 shadow-card outline-none focus-within:border-line-strong"
    >
      <h2 id="problem-label" className="mb-1.5 text-[13px] font-semibold text-ink">
        Problem
      </h2>
      <textarea
        id={id}
        ref={ref}
        rows={1}
        aria-labelledby="problem-label"
        value={value}
        disabled={!synced}
        readOnly={!editing}
        tabIndex={editing ? 0 : -1}
        placeholder="What problem is this board for? Write it as a question the team can answer."
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          // Another card may already have taken over editing.
          if (useStore.getState().editingId === PROBLEM_NODE_ID) useStore.setState({ editingId: undefined });
        }}
        onChange={(e) => {
          setValue(e.target.value);
          board.setProblem(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            ref.current?.closest<HTMLElement>('.react-flow__node')?.focus({ preventScroll: true });
          }
        }}
        className={cx(
          'block w-full resize-none overflow-hidden bg-transparent text-[13px] leading-[1.45] font-normal text-pretty text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none',
          editing ? 'nodrag nopan' : 'pointer-events-none',
        )}
      />
    </section>
  );
}
