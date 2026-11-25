import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useState } from 'react';

/*
  Typing suggestions in an empty composer (user request, 25 Nov): instead of a row of tags under the
  box, the box itself types one suggestion, holds it, deletes it and moves to the next. Tab puts the
  shown suggestion in the box (the keyboard path that replaces clicking a tag). The overlay is
  decoration: screen readers get the textarea's own label and placeholder, and the current
  suggestion through onChange for the Tab key.

  Typing speed: linear, about 45 ms a character, which reads as typing rather than motion. Each
  finished suggestion stays for 4 s so it can be read (slowed on user request, 25 Nov). Reduced
  motion: no typing, the whole suggestion swaps every few seconds.
*/

const TYPE_MS = 45;
const DELETE_MS = 24;
const HOLD_MS = 4000;
const GAP_MS = 600;

export function TypingHint({ phrases, onPhrase }: { phrases: string[]; onPhrase: (p: string) => void }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const count = useMotionValue(0);
  const phrase = phrases[i % Math.max(1, phrases.length)] ?? '';
  const shown = useTransform(count, (v) => phrase.slice(0, Math.round(v)));
  const key = phrases.join('|');

  // The list changed (a selection was made or cleared): start again from the first suggestion.
  useEffect(() => setI(0), [key]);
  useEffect(() => onPhrase(phrase), [phrase, onPhrase]);
  useMotionValueEvent(count, 'change', (v) => setDone(Math.round(v) >= phrase.length));

  useEffect(() => {
    let alive = true;
    if (!phrase) return;
    if (reduce) {
      count.set(phrase.length);
      const t = window.setTimeout(() => setI((n) => n + 1), HOLD_MS + 1200);
      return () => window.clearTimeout(t);
    }
    count.set(0);
    let ctl = animate(count, phrase.length, { duration: (phrase.length * TYPE_MS) / 1000, ease: 'linear' });
    let t = 0;
    ctl.then(() => {
      if (!alive) return;
      t = window.setTimeout(() => {
        if (!alive) return;
        ctl = animate(count, 0, { duration: (phrase.length * DELETE_MS) / 1000, ease: 'linear' });
        ctl.then(() => {
          if (alive) t = window.setTimeout(() => setI((n) => n + 1), GAP_MS);
        });
      }, HOLD_MS);
    });
    return () => {
      alive = false;
      ctl.stop();
      window.clearTimeout(t);
    };
  }, [phrase, reduce, count]);

  return (
    <span aria-hidden className="pointer-events-none absolute top-2 right-11 left-2.5 flex items-start gap-1.5 text-[13px] leading-snug text-ink-3">
      <span className="min-w-0">
        <motion.span>{shown}</motion.span>
        {!reduce && <span className="typing-caret ml-px inline-block h-[1.05em] w-px translate-y-[2px] bg-ink-3" />}
      </span>
      {done && (
        <kbd className="mt-px shrink-0 rounded-[4px] border border-line bg-surface-2 px-1 font-sans text-[10px] leading-4 text-ink-3">Tab</kbd>
      )}
    </span>
  );
}
