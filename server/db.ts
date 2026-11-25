import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// SQLite through Node's built-in driver (node:sqlite), so there is no native build step.
// Queries stay plain SQL so Postgres can replace it later (Build PRD 3).
const path = process.env.DATABASE_PATH ?? './data/app.db';
mkdirSync(dirname(path), { recursive: true });

export const db = new DatabaseSync(path);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NULL,
  claimed_at INTEGER NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  yjs_state BLOB
);
CREATE TABLE IF NOT EXISTS explorations (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  exploration_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  exploration_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  status TEXT NOT NULL,
  body_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  approved_at INTEGER NULL
);
CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  prompt TEXT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS message_ideas (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  suggestion_id TEXT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  conflicts_with TEXT,
  conflict_line TEXT,
  PRIMARY KEY (message_id, suggestion_id)
);
CREATE TABLE IF NOT EXISTS opinions (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  note_ids_json TEXT NOT NULL,
  ask TEXT NOT NULL,
  question TEXT NULL,
  answer TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  board_id TEXT NULL,
  task TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NULL,
  tokens_out INTEGER NULL,
  ms INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
-- Meeting addendum 8. Owner only, never in Yjs. The raw paste is not stored, only the covered segments.
CREATE TABLE IF NOT EXISTS meeting_sources (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT,
  kind TEXT NOT NULL,
  segments_json TEXT NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0,
  covered_segments INTEGER,
  total_segments INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meeting_drafts (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES meeting_sources(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  draft_json TEXT NOT NULL,
  note_count INTEGER,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_meeting_drafts_source ON meeting_drafts(source_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_ex ON messages(exploration_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_ex ON reports(exploration_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_board_user ON suggestions(board_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ai_calls_user_board ON ai_calls(user_id, board_id, created_at);
`);

// Added 25 Nov: when the author last edited a draft report by hand. Old databases get the column here.
try {
  db.exec('ALTER TABLE reports ADD COLUMN edited_at INTEGER NULL');
} catch {
  // The column already exists.
}

if (!db.prepare('PRAGMA table_info(reports)').all().some((col) => col.name === 'selected_notes_json')) {
  db.exec('ALTER TABLE reports ADD COLUMN selected_notes_json TEXT NULL');
}

const explorationColumns = new Set(db.prepare('PRAGMA table_info(explorations)').all().map((col) => col.name));
for (const [name, type] of [
  ['kind', "TEXT NOT NULL DEFAULT 'explore'"],
  ['report_ids_json', "TEXT NOT NULL DEFAULT '[]'"],
  ['last_used_at', 'INTEGER'],
  ['decision_draft_json', 'TEXT'],
  ['decision_id', 'TEXT'],
]) {
  if (!explorationColumns.has(name)) db.exec(`ALTER TABLE explorations ADD COLUMN ${name} ${type}`);
}

// Whiteboard agent (Whiteboard_Agent_PRD 6.5): owner-only run log. The plan stays private until applied.
db.exec(`
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  instruction TEXT NOT NULL,
  plan_json TEXT NULL,
  status TEXT NOT NULL,
  refinements INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_board ON agent_runs(user_id, board_id, created_at);
`);

export type Row = Record<string, unknown>;

export const q = {
  get: <T = Row>(sql: string, ...args: unknown[]) => db.prepare(sql).get(...(args as never[])) as T | undefined,
  all: <T = Row>(sql: string, ...args: unknown[]) => db.prepare(sql).all(...(args as never[])) as T[],
  run: (sql: string, ...args: unknown[]) => db.prepare(sql).run(...(args as never[])),
};
