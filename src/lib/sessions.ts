import { useStore } from '../store.ts';
import { api } from './api.ts';
import { getProfile, useProfile } from './profile.ts';
import type { PrivateSession } from '../../shared/types.ts';
import { useRoute } from './router.ts';

let request = 0;
const empty: PrivateSession[] = [];

export function usePrivateSessions(boardId: string | null) {
  const viewer = useProfile((s) => s.profile?.userId);
  return useStore((s) => s.sessionScope === `${viewer}:${boardId}` ? s.sessions : empty);
}

export async function refreshSessions(boardId: string) {
  const viewer = getProfile()?.userId;
  const version = ++request;
  try {
    const { sessions } = await api.sessions(boardId);
    const route = useRoute.getState().route;
    if (version === request && getProfile()?.userId === viewer && route.name !== 'home' && route.boardId === boardId) {
      useStore.setState({ sessions, sessionScope: `${viewer}:${boardId}` });
    }
  } catch {
    // Keep the last successfully loaded list available.
  }
}
