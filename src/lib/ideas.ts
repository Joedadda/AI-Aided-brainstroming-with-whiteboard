import { logExchange } from './agent.ts';
import { create } from 'zustand';
import type { Suggestion } from '../../shared/types.ts';
import { api } from './api.ts';

/*
  The private idea cards (Build PRD 9, the brainstorm partner). Since 25 Nov they live inside the one
  AI panel with the agent (user request): asking for ideas with nothing selected gives these cards,
  anything else goes to the agent. Private to the person who asked; they survive a reload (server).
*/

interface IdeasState {
  boardId: string | null;
  items: Suggestion[];
  busy: boolean;
  error: string;
}

export const useIdeas = create<IdeasState>(() => ({ boardId: null, items: [], busy: false, error: '' }));

/** Load this person's saved ideas for the board, once per board. */
export function loadIdeas(boardId: string) {
  if (useIdeas.getState().boardId === boardId) return;
  useIdeas.setState({ boardId, items: [], busy: false, error: '' });
  api
    .suggestions(boardId)
    .then((r) => {
      if (useIdeas.getState().boardId === boardId) useIdeas.setState({ items: r.suggestions });
    })
    .catch(() => {});
}

export async function askIdeas(boardId: string, prompt?: string) {
  useIdeas.setState({ busy: true, error: '' });
  try {
    const r = await api.askSuggestions(boardId, prompt?.trim() || undefined);
    useIdeas.setState((s) => ({ items: [...r.suggestions, ...s.items] }));
    logExchange({ role: 'user', text: prompt?.trim() || 'Give me some ideas' }, { role: 'assistant', text: r.suggestions.map((x) => `- ${x.text}`).join('\n') });
  } catch (err) {
    useIdeas.setState({ error: err instanceof Error ? err.message : 'The AI did not answer. Try again.' });
  } finally {
    useIdeas.setState({ busy: false });
  }
}

export const markIdeaUsed = (id: string) => useIdeas.setState((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, used: true } : x)) }));

/**
 * Is this an ask for new ideas for the board, rather than a command for the agent? Only when nothing
 * is selected: with notes selected, "more ideas like these" stays with the agent, which puts them in
 * that section. Commands that sort, group, lock, check or place go to the agent too.
 */
export function isIdeasAsk(text: string, hasSelection: boolean) {
  if (hasSelection) return false;
  const t = text.toLowerCase();
  if (!/\b(ideas?|suggest(ions?)?|brainstorm|angles?|inspire|inspiration)\b/.test(t)) return false;
  return !/\b(sort|group|classify|bucket|lock|unlock|duplicate|against|section|move|rename|split)\b/.test(t);
}
