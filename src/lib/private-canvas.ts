import { AGENT_LIMITS } from '../../shared/agent-schema.ts';
import { useStore } from '../store.ts';
import { useAgent } from './agent.ts';
import { api } from './api.ts';
import { board } from './board.ts';
import { useConversation } from './conversation.ts';
import { getProfile } from './profile.ts';
import { go, useRoute } from './router.ts';
import { animateSidebar } from './sidebar-motion.ts';
import { refreshSessions } from './sessions.ts';

const MESSAGE_BATCH = 6;

export function useCanvasLaunchBusy() {
  const agentBusy = useAgent((s) => s.openingCanvas || s.run?.status === 'running');
  const workspace = useAgent((s) => s.workspace);
  const replying = useConversation((s) => s.pending?.workspace === workspace);
  return agentBusy || replying;
}

export async function saveCanvasAgentMessages(explorationId: string, messages: Parameters<typeof api.saveAgentMessages>[1]) {
  let saved: Awaited<ReturnType<typeof api.saveAgentMessages>> | undefined;
  for (let i = 0; i < messages.length; i += MESSAGE_BATCH) {
    saved = await api.saveAgentMessages(explorationId, messages.slice(i, i + MESSAGE_BATCH));
  }
  discardSavedAgentMessages(messages.map((m) => m.id));
  return saved;
}

function discardSavedAgentMessages(ids: string[]) {
  const saved = new Set(ids);
  useAgent.setState((s) => ({ log: s.log.filter((m) => !saved.has(m.id)) }));
}

/** Both board launchers resume the same saved conversation. */
export async function openPrivateCanvas(
  boardId: string,
  ids: string[],
  { fromOpinionId, expandSidebar = false }: { fromOpinionId?: string; expandSidebar?: boolean } = {},
) {
  const state = useAgent.getState();
  const viewerId = getProfile()?.userId;
  if (state.openingCanvas || state.run?.status === 'running' || useConversation.getState().pending?.workspace === state.workspace) return;
  const picked = useStore.getState().cards
    .filter((c) => ids.includes(c.id) && c.text.trim())
    .slice(0, AGENT_LIMITS.scopeNotes)
    .map((c) => c.id);
  useAgent.setState({ openingCanvas: true });
  try {
    const unassigned = state.log.filter((m) => !m.explorationId);
    const first = unassigned.slice(0, MESSAGE_BATCH);
    const { explorationId, noteIds } = await api.openExploration(boardId, picked, first, fromOpinionId, state.activeCanvasId ?? undefined);
    const remaining = [...unassigned.slice(MESSAGE_BATCH), ...state.log.filter((m) => m.explorationId === explorationId)];
    await saveCanvasAgentMessages(explorationId, remaining);
    // Prepare the real chat while the sidebar is still visible so the transition skips the loading screen.
    const exploration = expandSidebar && viewerId ? await api.exploration(explorationId) : undefined;
    const handoff = viewerId && exploration ? { viewerId, exploration } : undefined;
    const route = useRoute.getState().route;
    if (useAgent.getState().workspace !== state.workspace || route.name !== 'board' || route.boardId !== boardId) return;
    discardSavedAgentMessages(first.map((m) => m.id));
    const run = useAgent.getState().run;
    if (run && !run.explorationId) useAgent.setState({ run: { ...run, explorationId }, toast: false });
    useAgent.setState({ activeCanvasId: explorationId });
    void refreshSessions(boardId);
    if (noteIds.length) board.reserve(noteIds, true);
    useStore.setState({ selected: [] });
    const navigate = () => {
      const current = useRoute.getState().route;
      if (current.name === 'board' && current.boardId === boardId && getProfile()?.userId === viewerId) {
        go({ name: 'canvas', boardId, explorationId, handoff });
      }
    };
    if (handoff) animateSidebar(navigate);
    else navigate();
  } catch (e) {
    const route = useRoute.getState().route;
    if (useAgent.getState().workspace === state.workspace && route.name === 'board' && route.boardId === boardId) {
      alert(e instanceof Error ? e.message : 'Could not open the private canvas.');
    }
  } finally {
    if (useAgent.getState().workspace === state.workspace) useAgent.setState({ openingCanvas: false });
  }
}
