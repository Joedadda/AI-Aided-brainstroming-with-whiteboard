import type { Snapshot, SnapshotNote } from '../shared/types.ts';
import { q } from './db.ts';

/** Remember explicit selections across turns without reserving those cards on the board. */
export function rememberFocusedNotes(explorationId: string, notes: SnapshotNote[]) {
  if (!notes.length) return;
  const row = q.get<{ snapshot_json: string }>("SELECT snapshot_json FROM explorations WHERE id = ? AND status = 'open'", explorationId);
  if (!row) return;
  const snapshot = JSON.parse(row.snapshot_json) as Snapshot;
  const byId = new Map(snapshot.focusedNotes?.map((note) => [note.id, note]));
  for (const { id, text, author } of notes) byId.set(id, { id, text, author });
  snapshot.focusedNotes = [...byId.values()];
  q.run('UPDATE explorations SET snapshot_json = ? WHERE id = ?', JSON.stringify(snapshot), explorationId);
}
