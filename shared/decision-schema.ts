import * as Y from 'yjs';
import { z } from 'zod';

/*
  Locked decisions (Locked_Decisions_PRD_v2.md, section 4). SHARED CONTRACT.
  Written before the three parallel builds (locked decisions, whiteboard agent,
  demo boards) so all of them read and write decisions the same way.
  Change the shape only in the locked-decisions build, and keep these exports.

  Lives in the shared Yjs document: doc.getMap('decisions'), one Y.Map per decision,
  plain values inside (history is a plain array, rewritten on each action).
  A decision is shared board content: never put private text in it.
*/

export type DecisionScope = 'board' | 'section';
export type DecisionStatus = 'locked' | 'reopened';
export type DecisionVia = 'person' | 'agent' | 'meeting';

export interface DecisionHistoryEntry {
  action: 'lock' | 'reopen' | 'relock';
  by: string;
  byName: string;
  at: string; // ISO
}

/** Only the seeded Decision card (option C) uses this. */
export interface DecisionRich {
  because: string[];
  setAside: string[];
  followUps: string[];
  effort: string;
  writtenBy?: string;
  unknowns?: string;
}

export interface Decision {
  id: string; // 'd_' + short random id
  text: string; // 1 to 300 chars
  reasons: string; // 0 to 500 chars
  scope: DecisionScope;
  sectionId: string | null;
  sourceNoteIds: string[]; // up to 20, provenance only
  reportIds: string[];
  status: DecisionStatus;
  lockedBy: string;
  lockedByName: string;
  lockedByColor: string;
  lockedAt: string; // ISO
  via: DecisionVia;
  meetingChipId: string | null;
  reopenedBy: string | null;
  reopenedByName: string | null;
  reopenedAt: string | null;
  history: DecisionHistoryEntry[]; // capped at 50
  rich?: DecisionRich;
}

export const DECISION_TEXT_MAX = 300;
export const DECISION_REASONS_MAX = 500;
export const DECISION_SOURCES_MAX = 20;
export const DECISION_HISTORY_MAX = 50;

export const DecisionInputSchema = z.object({
  text: z.string().trim().min(1).max(DECISION_TEXT_MAX),
  reasons: z.string().trim().max(DECISION_REASONS_MAX).default(''),
  scope: z.enum(['board', 'section']),
  sectionId: z.string().nullable().default(null),
  sourceNoteIds: z.array(z.string()).max(DECISION_SOURCES_MAX).default([]),
  reportIds: z.array(z.string()).default([]),
});
export type DecisionInput = z.input<typeof DecisionInputSchema>;

export interface DecisionActor {
  id: string;
  name: string;
  color: string;
}

export const decisionsMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('decisions');

export const newDecisionId = () => 'd_' + Math.random().toString(36).slice(2, 10);

const s = (m: Y.Map<unknown>, k: string, d = '') => (typeof m.get(k) === 'string' ? (m.get(k) as string) : d);
const sn = (m: Y.Map<unknown>, k: string) => (typeof m.get(k) === 'string' ? (m.get(k) as string) : null);
const arr = <T>(m: Y.Map<unknown>, k: string): T[] => (Array.isArray(m.get(k)) ? (m.get(k) as T[]) : []);

export function readDecision(id: string, m: Y.Map<unknown>): Decision {
  const rich = m.get('rich');
  return {
    id,
    text: s(m, 'text'),
    reasons: s(m, 'reasons'),
    scope: m.get('scope') === 'section' ? 'section' : 'board',
    sectionId: sn(m, 'sectionId'),
    sourceNoteIds: arr<string>(m, 'sourceNoteIds'),
    reportIds: arr<string>(m, 'reportIds'),
    status: m.get('status') === 'reopened' ? 'reopened' : 'locked',
    lockedBy: s(m, 'lockedBy'),
    lockedByName: s(m, 'lockedByName'),
    lockedByColor: s(m, 'lockedByColor'),
    lockedAt: s(m, 'lockedAt'),
    via: (['person', 'agent', 'meeting'] as const).includes(m.get('via') as DecisionVia) ? (m.get('via') as DecisionVia) : 'person',
    meetingChipId: sn(m, 'meetingChipId'),
    reopenedBy: sn(m, 'reopenedBy'),
    reopenedByName: sn(m, 'reopenedByName'),
    reopenedAt: sn(m, 'reopenedAt'),
    history: arr<DecisionHistoryEntry>(m, 'history'),
    rich: rich && typeof rich === 'object' ? (rich as DecisionRich) : undefined,
  };
}

/** Every decision, in force first (newest first), then reopened (newest first). */
export function readDecisions(doc: Y.Doc): Decision[] {
  const out: Decision[] = [];
  decisionsMap(doc).forEach((m, id) => out.push(readDecision(id, m)));
  const t = (d: Decision) => Date.parse(d.status === 'locked' ? d.lockedAt : d.reopenedAt ?? d.lockedAt) || 0;
  return out.sort((a, b) => (a.status === b.status ? t(b) - t(a) : a.status === 'locked' ? -1 : 1));
}

export const inForce = (ds: Decision[]) => ds.filter((d) => d.status === 'locked');

/** The decision in force that covers a section, if any. Earlier lockedAt wins, tie: lower id. */
export function coverOf(ds: Decision[], sectionId: string): Decision | null {
  const c = ds
    .filter((d) => d.status === 'locked' && d.scope === 'section' && d.sectionId === sectionId)
    .sort((a, b) => a.lockedAt.localeCompare(b.lockedAt) || a.id.localeCompare(b.id));
  return c[0] ?? null;
}

/**
  Write a new decision in force. Call inside a doc.transact (one undo step).
  If the section is already covered, it is written with scope 'board' instead and
  { downgraded: true } is returned, so the caller can show the notice.
*/
export function writeDecision(
  doc: Y.Doc,
  input: DecisionInput,
  actor: DecisionActor,
  opts: { via?: DecisionVia; meetingChipId?: string | null; id?: string; lockedAt?: string; rich?: DecisionRich; history?: DecisionHistoryEntry[]; status?: DecisionStatus; reopened?: { by: string; byName: string; at: string } } = {},
): { id: string; downgraded: boolean } {
  const v = DecisionInputSchema.parse(input);
  const id = opts.id ?? newDecisionId();
  let scope = v.scope;
  let sectionId = scope === 'section' ? v.sectionId : null;
  let downgraded = false;
  if (scope === 'section' && (!sectionId || coverOf(readDecisions(doc), sectionId))) {
    scope = 'board';
    sectionId = null;
    downgraded = true;
  }
  const at = opts.lockedAt ?? new Date().toISOString();
  const m = new Y.Map<unknown>();
  m.set('text', v.text);
  m.set('reasons', v.reasons);
  m.set('scope', scope);
  m.set('sectionId', sectionId);
  m.set('sourceNoteIds', v.sourceNoteIds);
  m.set('reportIds', v.reportIds);
  m.set('status', opts.status ?? 'locked');
  m.set('lockedBy', actor.id);
  m.set('lockedByName', actor.name);
  m.set('lockedByColor', actor.color);
  m.set('lockedAt', at);
  m.set('via', opts.via ?? 'person');
  m.set('meetingChipId', opts.meetingChipId ?? null);
  m.set('reopenedBy', opts.reopened?.by ?? null);
  m.set('reopenedByName', opts.reopened?.byName ?? null);
  m.set('reopenedAt', opts.reopened?.at ?? null);
  m.set('history', (opts.history ?? [{ action: 'lock', by: actor.id, byName: actor.name, at }]).slice(-DECISION_HISTORY_MAX));
  if (opts.rich) m.set('rich', opts.rich);
  decisionsMap(doc).set(id, m);
  return { id, downgraded };
}

function pushHistory(m: Y.Map<unknown>, e: DecisionHistoryEntry) {
  m.set('history', [...arr<DecisionHistoryEntry>(m, 'history'), e].slice(-DECISION_HISTORY_MAX));
}

/** Call inside a doc.transact. */
export function reopenDecisionIn(doc: Y.Doc, id: string, actor: DecisionActor) {
  const m = decisionsMap(doc).get(id);
  if (!m || m.get('status') !== 'locked') return false;
  const at = new Date().toISOString();
  m.set('status', 'reopened');
  m.set('reopenedBy', actor.id);
  m.set('reopenedByName', actor.name);
  m.set('reopenedAt', at);
  pushHistory(m, { action: 'reopen', by: actor.id, byName: actor.name, at });
  return true;
}

/** Call inside a doc.transact. Text never changes on relock. */
export function relockDecisionIn(doc: Y.Doc, id: string, actor: DecisionActor) {
  const m = decisionsMap(doc).get(id);
  if (!m || m.get('status') !== 'reopened') return false;
  const at = new Date().toISOString();
  m.set('status', 'locked');
  m.set('lockedBy', actor.id);
  m.set('lockedByName', actor.name);
  m.set('lockedByColor', actor.color);
  m.set('lockedAt', at);
  m.set('reopenedBy', null);
  m.set('reopenedByName', null);
  m.set('reopenedAt', null);
  pushHistory(m, { action: 'relock', by: actor.id, byName: actor.name, at });
  return true;
}
