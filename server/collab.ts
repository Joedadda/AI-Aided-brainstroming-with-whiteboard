import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';
import { ensureProblemPosition } from '../shared/ydoc.ts';
import { userForToken } from './auth.ts';
import { q } from './db.ts';

// Realtime sync and presence (Build PRD 7). Hocuspocus runs its own websocket server
// in this same Node process; Vite proxies /collab to it in development.
export const COLLAB_PORT = Number(process.env.COLLAB_PORT ?? 8788);

export const collab = new Server({
  port: COLLAB_PORT,
  quiet: true,
  // MP-7: persist about every 2 seconds while people edit, and on last disconnect.
  debounce: 2000,
  maxDebounce: 10000,

  // MP-6: the token is checked on connect; unknown tokens and unknown boards are refused.
  async onAuthenticate({ token, documentName }) {
    const user = userForToken(token);
    if (!user) throw new Error('Unknown profile');
    const board = q.get('SELECT id FROM boards WHERE id = ?', documentName);
    if (!board) throw new Error('Unknown board');
    return { user };
  },

  async onLoadDocument({ document, documentName }) {
    const row = q.get<{ yjs_state: Uint8Array | null }>('SELECT yjs_state FROM boards WHERE id = ?', documentName);
    if (row?.yjs_state) Y.applyUpdate(document, new Uint8Array(row.yjs_state));
    if (row && ensureProblemPosition(document)) {
      q.run('UPDATE boards SET yjs_state = ? WHERE id = ?', Y.encodeStateAsUpdate(document), documentName);
    }
    return document;
  },

  async onStoreDocument({ document, documentName }) {
    q.run('UPDATE boards SET yjs_state = ? WHERE id = ?', Y.encodeStateAsUpdate(document), documentName);
  },
});

/**
 * Read a board's current document on the server: the live one if anyone is connected,
 * otherwise the stored state. The server uses this to build AI context, so the client
 * cannot slip private or made-up notes into a prompt.
 */
export function boardDoc(boardId: string): Y.Doc | null {
  const live = collab.hocuspocus.documents.get(boardId);
  if (live) return live;
  const row = q.get<{ yjs_state: Uint8Array | null }>('SELECT yjs_state FROM boards WHERE id = ?', boardId);
  if (!row) return null;
  const doc = new Y.Doc();
  if (row.yjs_state) Y.applyUpdate(doc, new Uint8Array(row.yjs_state));
  return doc;
}
