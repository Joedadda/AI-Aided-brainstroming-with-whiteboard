import { flushSync } from 'react-dom';

let active: ViewTransition | undefined;
let commitPending: (() => void) | undefined;

export function animateSidebar(update: () => void) {
  const root = document.documentElement;
  const keyboard = root.hasAttribute('data-keys');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Finish any queued state update before capturing a new one during a quick reversal.
  active?.skipTransition();
  commitPending?.();
  if (!document.startViewTransition || keyboard || reduced) {
    update();
    return;
  }

  const commit = () => {
    if (commitPending !== commit) return;
    commitPending = undefined;
    flushSync(update);
  };
  commitPending = commit;
  root.setAttribute('data-sidebar-transition', '');
  const transition = document.startViewTransition(commit);
  active = transition;
  // A fast toggle can skip the captured animation while still applying the state update.
  void transition.ready.catch(() => {});
  const cleanUp = () => {
    if (active !== transition) return;
    active = undefined;
    root.removeAttribute('data-sidebar-transition');
  };
  void transition.finished.then(cleanUp, cleanUp);
}
