import { create } from 'zustand';
import type { ChatMessage, Exploration, Suggestion } from '../../shared/types.ts';
import { PROBLEM_CARD_WIDTH } from '../../shared/ydoc.ts';
import { useStore } from '../store.ts';
import { useAgent } from './agent.ts';
import { api } from './api.ts';
import { board } from './board.ts';

type Pending = {
  workspace: string | null;
  boardId: string;
  explorationId?: string;
  text: string;
  partial: string;
};
type Outcome = Omit<Pending, 'partial'> & (
  | { status: 'sent'; messages: ChatMessage[] }
  | { status: 'error'; error: string }
);
export const useConversation = create<{
  pending: Pending | null;
  outcome: Outcome | null;
  placed: Record<string, boolean>;
}>(() => ({ pending: null, outcome: null, placed: {} }));

export function isReportAsk(text: string) {
  const request = text.trim().replace(/^(?:(?:okay|ok|sounds good|great|thanks)(?:[,.!]+\s*|\s+))+/i, '');
  const match = /^(?:please\s+)?(?:(?:can|could|would|will) you\s+)?(?:please\s+)?(?:go ahead and\s+)?(?:draft|make|write|create|generate|put together)\s+(?:me\s+)?(?:(?:a|the|my|our)\s+)?(?:(?:short|brief|quick|draft)\s+)*report\b(.*)$/i.exec(request);
  return Boolean(match && /^(?:\s+(?:now|please|for (?:me|us|the board)|(?:from|of|on|about|based on) (?:this|our|the) (?:chat|conversation|discussion)))*[\s.!?,]*$/i.test(match[1]));
}

export function isIdeasAsk(text: string) {
  if (isBoardInstruction(text)) return false;
  return /\b(?:brainstorm|any ideas?|ideas for|suggest\s+(?:some|a few|\d+)|(?:give me|suggest|generate|propose|share|want|need|think of|come up with|what are)\b[^.!?]*\b(?:ideas?|suggestions?|alternatives?|angles?|options?|directions?|solutions?))\b/i.test(text);
}

export function isBoardInstruction(text: string) {
  return /^\s*(?:please\s+)?(?:sort|group|cluster|organise|organize|move|rename|lock|unlock|reopen|place)\b/i.test(text)
    || /^\s*(?:please\s+)?(?:create|add)\b.*\b(?:sticky notes?|sections?)\b/i.test(text);
}

export function placeChatIdea(
  boardId: string,
  idea: Pick<Suggestion, 'id' | 'text'>,
  position?: { x: number; y: number },
) {
  const state = useStore.getState();
  if (state.boardId !== boardId || !state.synced || useConversation.getState().placed[idea.id]) return;
  const items = [...state.cards, ...state.sections];
  const problemRight = state.problemPosition ? state.problemPosition.x + PROBLEM_CARD_WIDTH : 0;
  const right = items.reduce((edge, item) => Math.max(edge, item.x + item.w), problemRight);
  const at = position ?? { x: right + 140, y: 100 + (state.problemPosition?.y ?? 0) };
  const noteId = board.addNote(at, { text: idea.text, origin: 'ai' });
  if (!position) useStore.setState({ reveal: [noteId] });
  useConversation.setState((s) => ({ placed: { ...s.placed, [idea.id]: true } }));
  void api.markUsed(boardId, idea.id).catch(() => {});
}

export async function sendConversationTurn(
  boardId: string,
  ex: Exploration | null,
  resolve: () => Promise<Exploration>,
  text: string,
  options: { ideas: boolean; noteIds?: string[] },
) {
  const workspace = useAgent.getState().workspace;
  if (useConversation.getState().pending?.workspace === workspace) return;
  let pending: Pending = { workspace, boardId, explorationId: ex?.id, text, partial: '' };
  useConversation.setState({ pending, outcome: null });
  const current = () => useConversation.getState().pending === pending && useAgent.getState().workspace === workspace;
  const update = (patch: Partial<Pending>) => {
    pending = { ...pending, ...patch };
    useConversation.setState({ pending });
  };
  try {
    const target = ex ?? await resolve();
    if (!current()) return;
    update({ explorationId: target.id });
    const result = await api.sendMessage(target.id, text, (delta) => {
      if (current()) update({ partial: pending.partial + delta });
    }, options);
    if (current()) useConversation.setState({ pending: null, outcome: { ...pending, status: 'sent', messages: [result.userMessage, result.reply] } });
  } catch (err) {
    if (current()) useConversation.setState({
      pending: null,
      outcome: { ...pending, status: 'error', error: err instanceof Error ? err.message : 'Could not send this message.' },
    });
  } finally {
    if (useConversation.getState().pending === pending) useConversation.setState({ pending: null });
  }
}
