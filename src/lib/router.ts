import { create } from 'zustand';

// Path-based routes, so a board link (/b/<boardId>) can be shared (MP-8).
export type Route =
  | { name: 'home' }
  | { name: 'board'; boardId: string }
  | { name: 'canvas'; boardId: string; explorationId: string }
  | { name: 'report'; boardId: string; reportId: string };

export function parse(path: string): Route {
  const m = /^\/b\/([A-Za-z0-9_-]+)(?:\/(canvas|report)\/([A-Za-z0-9_-]+))?\/?$/.exec(path);
  if (!m) return { name: 'home' };
  const [, boardId, kind, id] = m;
  if (kind === 'canvas') return { name: 'canvas', boardId, explorationId: id };
  if (kind === 'report') return { name: 'report', boardId, reportId: id };
  return { name: 'board', boardId };
}

export function pathOf(r: Route): string {
  switch (r.name) {
    case 'home':
      return '/';
    case 'board':
      return `/b/${r.boardId}`;
    case 'canvas':
      return `/b/${r.boardId}/canvas/${r.explorationId}`;
    case 'report':
      return `/b/${r.boardId}/report/${r.reportId}`;
  }
}

export const useRoute = create<{ route: Route }>(() => ({ route: parse(location.pathname) }));

export function go(r: Route, replace = false) {
  const path = pathOf(r);
  if (path !== location.pathname) history[replace ? 'replaceState' : 'pushState'](null, '', path);
  useRoute.setState({ route: r });
}

window.addEventListener('popstate', () => useRoute.setState({ route: parse(location.pathname) }));

export const boardLink = (boardId: string) => `${location.origin}/b/${boardId}`;
