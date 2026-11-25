import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import * as Y from 'yjs';
import { z } from 'zod';
import { emptyReport, ReportSchema, type ReportBody } from '../shared/report-schema.ts';
import type { Snapshot } from '../shared/types.ts';
import { readBoard } from '../shared/ydoc.ts';
import { AiError, MOCK, checkLimit, json, stream, type Msg } from './ai.ts';
import { boardId as newBoardId, createUser, newId, requireUser, updateUser } from './auth.ts';
import { boardDoc, collab, COLLAB_PORT } from './collab.ts';
import { q } from './db.ts';
import { PEOPLE } from './cases/split-buddy.ts';
import { seedBlank, seedCase } from './demo-seed.ts';
import { FetchError, fetchPage } from './fetch-page.ts';
import { meetingMock, mock } from './mock.ts';
import { InvalidDraft, checkDraft, filterConflict, withPassages } from './meeting/draft.ts';
import { MEETING_MAX_CHARS, MeetingInputError, segment, type Segment } from './meeting/segment.ts';
import { MeetingDraftLoose, type MeetingDraft } from '../shared/meeting-schema.ts';
import { TASKS } from './models.config.ts';
import { OPINION_ASKS, meetingPrompts, prompts, type BoardContext, type DecisionCtx } from './prompts.ts';
import { inForce } from '../shared/decision-schema.ts';
import { agentRouter } from './agent/router.ts';

const app = express();
app.use(express.json({ limit: '256kb' }));
const PORT = Number(process.env.API_PORT ?? 8787);

// ---------- helpers ----------

const now = () => Date.now();
type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
/** Wraps a handler so a thrown error becomes a JSON error the UI can show. */
const h = (fn: Handler) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (e) {
    const status = e instanceof AiError ? e.status : e instanceof z.ZodError ? 400 : 500;
    if (!(e instanceof AiError)) console.error(e);
    if (!res.headersSent) res.status(status).json({ error: e instanceof AiError ? e.message : status === 400 ? 'That request was not valid.' : 'Something went wrong on the server.' });
  }
};
const notFound = (res: Response) => res.status(404).json({ error: 'Not found.' });

function sse(res: Response) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  return {
    send: (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
    end: () => res.end(),
  };
}

function boardExists(id: string) {
  return Boolean(q.get('SELECT id FROM boards WHERE id = ?', id));
}

/**
 * Locked decisions PRD 8.1: decisions in force, newest first, at most 20, read from the shared doc at
 * call time. Ids are per call (D1, D2); `realId` maps them back and never goes into a prompt.
 */
function decisionsCtx(b: ReturnType<typeof readBoard>): DecisionCtx[] {
  return inForce(b.decisions)
    .slice(0, 20)
    .map((d, i) => {
      const sec = d.scope === 'section' && d.sectionId ? b.sections.find((s) => s.id === d.sectionId) : undefined;
      return { id: `D${i + 1}`, realId: d.id, text: d.text.slice(0, 300), reasons: d.reasons.slice(0, 500), scope: sec ? 'section' : 'board', section: sec?.title ?? null };
    });
}
function decisionsOfBoard(boardId: string): DecisionCtx[] {
  const doc = boardDoc(boardId);
  return doc ? decisionsCtx(readBoard(doc)) : [];
}

/** AI context built on the server from the shared document, so a client cannot inject private text. */
function contextFor(boardId: string): BoardContext | null {
  const doc = boardDoc(boardId);
  if (!doc) return null;
  const b = readBoard(doc);
  const notes = b.notes.filter((n) => n.text.trim()).slice(-40);
  return {
    title: b.meta.title,
    problem: b.problem,
    sections: b.sections.map((s) => s.title),
    notes: notes.map((n) => ({ id: n.id, text: n.text, author: n.author })),
    chips: b.chips.filter((c) => c.status === 'ready').map((c) => ({ id: c.id, title: c.title, summary: c.summary, source: c.source })),
    decisions: decisionsCtx(b),
  };
}

const ctxOf = (req: Request, boardId: string | null) => ({ userId: req.user!.id, boardId });

// ---------- health ----------

app.get('/api/health', (_req, res) => res.json({ ok: true, mock: MOCK, tasks: TASKS }));

// ---------- 12.1 profile and boards ----------

app.post(
  '/api/profile',
  h((req, res) => {
    const { name, color } = z.object({ name: z.string().max(60).optional(), color: z.string().optional() }).parse(req.body ?? {});
    const u = createUser(name ?? '', color);
    res.json({ userId: u.id, token: u.token, name: u.name, color: u.color });
  }),
);

app.patch(
  '/api/profile',
  requireUser,
  h((req, res) => {
    const patch = z.object({ name: z.string().max(60).optional(), color: z.string().optional() }).parse(req.body ?? {});
    const u = updateUser(req.user!.id, patch);
    res.json({ userId: u.id, name: u.name, color: u.color });
  }),
);

app.post(
  '/api/boards',
  requireUser,
  h((req, res) => {
    const { kind } = z.object({ kind: z.enum(['blank', 'case', 'mid', 'example']).default('blank') }).parse(req.body ?? {});
    const id = newBoardId();
    const doc = new Y.Doc();
    const examples = kind === 'blank' ? (seedBlank(doc), []) : seedCase(doc, kind, newId);
    q.run('INSERT INTO boards (id, created_by, created_at, yjs_state) VALUES (?, ?, ?, ?)', id, req.user!.id, now(), Y.encodeStateAsUpdate(doc));
    // The finished example's saved chats. Scripted, fictional, owned by seed people, so anyone on the board may read them.
    for (const e of examples) {
      q.run('INSERT INTO explorations (id, board_id, user_id, status, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', e.id, id, e.userId, 'closed', JSON.stringify(e.snapshot), e.createdAt);
      for (const m of e.messages) q.run('INSERT INTO messages (id, exploration_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)', m.id, e.id, m.role, m.text, null, m.at);
    }
    res.json({ boardId: id });
  }),
);

app.get(
  '/api/boards/:id',
  requireUser,
  h((req, res) => {
    const row = q.get<{ id: string; created_at: number }>('SELECT id, created_at FROM boards WHERE id = ?', req.params.id);
    if (!row) return notFound(res);
    res.json({ boardId: row.id, createdAt: row.created_at });
  }),
);

// ---------- 12.2 board-level AI ----------

app.post(
  '/api/boards/:id/ai/title',
  requireUser,
  h(async (req, res) => {
    const b = contextFor(String(req.params.id));
    if (!b) return notFound(res);
    const schema = z.object({ title: z.string().min(1) });
    const { data } = await json('title', [{ role: 'user', content: prompts.title(b) }], schema, ctxOf(req, String(req.params.id)), () => mock.title(b));
    res.json({ title: data.title.replace(/^["'“]|["'”.]$/g, '').split(/\s+/).slice(0, 8).join(' ') });
  }),
);

app.post(
  '/api/boards/:id/ai/large-idea',
  requireUser,
  h(async (req, res) => {
    const { text } = z.object({ noteId: z.string(), text: z.string().min(1).max(4000) }).parse(req.body);
    const b = contextFor(String(req.params.id));
    if (!b) return notFound(res);
    const schema = z.object({ large: z.boolean(), reason: z.string(), sectionTitle: z.string() });
    const { data } = await json('largeIdea', [{ role: 'user', content: prompts.largeIdea(text, b) }], schema, ctxOf(req, String(req.params.id)), () => mock.largeIdea(text));
    res.json({ ...data, sectionTitle: data.sectionTitle.split(/\s+/).slice(0, 5).join(' ') });
  }),
);

app.post(
  '/api/boards/:id/ai/context',
  requireUser,
  h(async (req, res) => {
    const id = String(req.params.id);
    if (!boardExists(id)) return notFound(res);
    const { type, value } = z.object({ type: z.enum(['link', 'text']), value: z.string().min(1).max(20000) }).parse(req.body);
    res.json(await summarise(req, id, type, value));
  }),
);

/** Context intake (CX): read a link or condense text into a title and a short summary. */
async function summarise(req: Request, boardId: string, type: 'link' | 'text', value: string) {
  const schema = z.object({ title: z.string().min(1), summary: z.string().min(1) });
  if (type === 'link') {
    let page;
    try {
      page = await fetchPage(value);
    } catch (e) {
      const why = e instanceof FetchError ? e.message : 'The page could not be read.';
      return { status: 'error' as const, title: value, summary: '', message: `Could not read this page. Paste the text instead. (${why})` };
    }
    const { data } = await json('linkSummary', [{ role: 'user', content: prompts.linkSummary(page.title, page.text) }], schema, ctxOf(req, boardId), () => mock.linkSummary(page.title, page.text));
    return { status: 'ready' as const, ...data };
  }
  const text = value.slice(0, 6000);
  const { data } = await json('textCondense', [{ role: 'user', content: prompts.textCondense(text) }], schema, ctxOf(req, boardId), () => mock.textCondense(text));
  return { status: 'ready' as const, ...data };
}

app.get(
  '/api/boards/:id/suggestions',
  requireUser,
  h((req, res) => {
    const rows = q.all<{ id: string; text: string; prompt: string | null; used: number; created_at: number }>(
      'SELECT id, text, prompt, used, created_at FROM suggestions WHERE board_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 30',
      req.params.id,
      req.user!.id,
    );
    res.json({ suggestions: rows.map((r) => ({ id: r.id, text: r.text, prompt: r.prompt, used: Boolean(r.used), createdAt: r.created_at })) });
  }),
);

app.post(
  '/api/boards/:id/ai/suggestions',
  requireUser,
  h(async (req, res) => {
    const id = String(req.params.id);
    const { prompt } = z.object({ prompt: z.string().max(300).optional() }).parse(req.body ?? {});
    const b = contextFor(id);
    if (!b) return notFound(res);
    checkLimit(ctxOf(req, id), 'suggestions', 10); // BP-6
    const schema = z.object({
      suggestions: z.array(z.object({ text: z.string().min(1), conflictsWith: z.string().nullable().optional(), conflictLine: z.string().optional() })).min(1),
    });
    const { data } = await json('suggestions', [{ role: 'user', content: prompts.suggestions(b, prompt?.trim() || null) }], schema, ctxOf(req, id), () => mock.suggestions(b, prompt?.trim() || null));
    const t = now();
    // Locked decisions 8.3: a flag per idea. Ids the model made up are dropped (filterConflict).
    // Not stored: the flag shows on fresh ideas only.
    const known = (b.decisions ?? []).map((d) => ({ id: d.id, realId: d.realId, text: d.text }));
    const out = data.suggestions.slice(0, 3).map((s, i) => {
      const sid = newId();
      q.run('INSERT INTO suggestions (id, board_id, user_id, text, prompt, used, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)', sid, id, req.user!.id, s.text, prompt?.trim() || null, t + i);
      return { id: sid, text: s.text, prompt: prompt?.trim() || null, used: false, createdAt: t + i, ...filterConflict(s, known) };
    });
    res.json({ suggestions: out });
  }),
);

app.post(
  '/api/boards/:id/suggestions/:sid/used',
  requireUser,
  h((req, res) => {
    const r = q.run('UPDATE suggestions SET used = 1 WHERE id = ? AND user_id = ?', req.params.sid, req.user!.id);
    if (!r.changes) return notFound(res);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/boards/:id/ai/suggestions/:sid/explain',
  requireUser,
  h(async (req, res) => {
    const id = String(req.params.id);
    const s = q.get<{ text: string }>('SELECT text FROM suggestions WHERE id = ? AND user_id = ? AND board_id = ?', req.params.sid, req.user!.id, id);
    if (!s) return notFound(res);
    const b = contextFor(id);
    if (!b) return notFound(res);
    const schema = z.object({ why: z.string().min(1), basedOn: z.array(z.string()) });
    const { data } = await json('explain', [{ role: 'user', content: prompts.explain(s.text, b) }], schema, ctxOf(req, id), () => mock.explain(s.text, b));
    const known = new Set([...b.notes.map((n) => n.id), ...b.chips.map((c) => c.id)]);
    res.json({ why: data.why, basedOn: data.basedOn.filter((x) => known.has(x)) });
  }),
);

app.post(
  '/api/boards/:id/ai/opinion',
  requireUser,
  h(async (req, res) => {
    const id = String(req.params.id);
    const body = z
      .object({ noteIds: z.array(z.string()).min(1), ask: z.enum(['strong', 'missing', 'risks', 'connect', 'custom']), question: z.string().max(500).optional() })
      .parse(req.body);
    if (body.noteIds.length > 5) return res.status(400).json({ error: 'Select 5 notes or fewer to ask the AI.' }); // SN-7
    const doc = boardDoc(id);
    if (!doc) return notFound(res);
    const b = readBoard(doc);
    const selected = body.noteIds.map((nid) => b.notes.find((n) => n.id === nid)).filter((n): n is NonNullable<typeof n> => Boolean(n?.text.trim()));
    if (!selected.length) return res.status(400).json({ error: 'The selected notes are empty.' });
    const askText = body.ask === 'custom' ? (body.question?.trim() || 'What do you make of these?') : OPINION_ASKS[body.ask];
    const labelled = selected.map((n, i) => ({ label: `N${i + 1}`, text: n.text, author: n.author }));
    const others = b.notes.filter((n) => !body.noteIds.includes(n.id) && n.text.trim()).slice(-30);
    const citations = Object.fromEntries(selected.map((n, i) => [`N${i + 1}`, n.id]));
    const decisions = decisionsCtx(b);
    checkLimit(ctxOf(req, id));
    const out = sse(res);
    try {
      const { text } = await stream(
        'opinion',
        [{ role: 'system', content: prompts.opinion(labelled, others, b.problem, askText, decisions) }, { role: 'user', content: askText }],
        ctxOf(req, id),
        (d) => out.send('delta', { text: d }),
        () => mock.opinion(labelled, askText, decisions),
      );
      const opinionId = newId();
      q.run(
        'INSERT INTO opinions (id, board_id, user_id, note_ids_json, ask, question, answer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        opinionId,
        id,
        req.user!.id,
        JSON.stringify(selected.map((n) => n.id)),
        body.ask,
        body.ask === 'custom' ? askText : null,
        text,
        now(),
      );
      out.send('done', { opinionId, citations, ask: askText });
    } catch (e) {
      out.send('error', { error: e instanceof AiError ? e.message : 'The AI did not answer. Try again.' });
    }
    out.end();
  }),
);

// ---------- 12.3 explorations and reports (private: owner only, 404 for anyone else) ----------

type ExRow = { id: string; board_id: string; user_id: string; status: string; snapshot_json: string; created_at: number };
const ownEx = (req: Request) => q.get<ExRow>('SELECT * FROM explorations WHERE id = ? AND user_id = ?', req.params.id, req.user!.id);
const messagesOf = (exId: string) =>
  q
    .all<{ id: string; role: 'user' | 'assistant'; content: string; created_at: number }>('SELECT id, role, content, created_at FROM messages WHERE exploration_id = ? ORDER BY created_at, rowid', exId)
    .map((m) => ({ id: m.id, role: m.role, text: m.content, at: m.created_at }));
const draftOf = (exId: string) => {
  const r = q.get<{ id: string; status: string; body_json: string; created_at: number; edited_at: number | null }>(
    "SELECT id, status, body_json, created_at, edited_at FROM reports WHERE exploration_id = ? AND status = 'draft' ORDER BY created_at DESC LIMIT 1",
    exId,
  );
  return r ? { id: r.id, explorationId: exId, status: 'draft' as const, body: JSON.parse(r.body_json), createdAt: r.created_at, editedAt: r.edited_at } : null;
};
/** Seed people own the finished example's scripted chats. They are not real users. */
const isSeed = (userId: string) => userId.startsWith('seed-');
const ownerOf = (userId: string) => {
  const seed = Object.values(PEOPLE).find((p) => p.id === userId);
  if (seed) return { name: seed.name, color: seed.color };
  return q.get<{ name: string; color: string }>('SELECT name, color FROM users WHERE id = ?', userId) ?? { name: 'Someone', color: '#57544d' };
};
const exView = (e: ExRow, viewerId: string) => {
  const owner = ownerOf(e.user_id);
  return {
    id: e.id,
    boardId: e.board_id,
    status: e.status,
    snapshot: JSON.parse(e.snapshot_json) as Snapshot,
    messages: messagesOf(e.id),
    draft: e.user_id === viewerId ? draftOf(e.id) : null,
    createdAt: e.created_at,
    ownerName: owner.name,
    ownerColor: owner.color,
    readOnly: e.user_id !== viewerId,
  };
};

app.get(
  '/api/boards/:id/explorations',
  requireUser,
  h((req, res) => {
    const rows = q.all<ExRow>("SELECT * FROM explorations WHERE board_id = ? AND user_id = ? AND status = 'open' ORDER BY created_at DESC", req.params.id, req.user!.id);
    res.json({
      explorations: rows.map((e) => ({
        id: e.id,
        status: e.status,
        noteCount: (JSON.parse(e.snapshot_json) as Snapshot).notes.length,
        messageCount: q.get<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE exploration_id = ?', e.id)!.n,
        createdAt: e.created_at,
      })),
    });
  }),
);

app.post(
  '/api/explorations',
  requireUser,
  h((req, res) => {
    const body = z.object({ boardId: z.string(), noteIds: z.array(z.string()).min(1).max(40), fromOpinionId: z.string().optional() }).parse(req.body);
    const doc = boardDoc(body.boardId);
    if (!doc) return notFound(res);
    const b = readBoard(doc);
    // Reading order on the board (top to bottom, left to right), not click order.
    const notes = b.notes
      .filter((n) => body.noteIds.includes(n.id) && n.text.trim())
      .sort((a, c) => a.y - c.y || a.x - c.x);
    if (!notes.length) return res.status(400).json({ error: 'Those notes are empty.' });
    const snapshot: Snapshot = {
      problem: b.problem,
      boardTitle: b.meta.title,
      notes: notes.map((n) => ({ id: n.id, text: n.text, author: n.author })),
      chips: b.chips.filter((c) => c.status === 'ready').map((c) => ({ id: c.id, type: c.type, title: c.title, summary: c.summary, source: c.source })),
    };
    const id = newId();
    q.run('INSERT INTO explorations (id, board_id, user_id, status, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, body.boardId, req.user!.id, 'open', JSON.stringify(snapshot), now());
    if (body.fromOpinionId) {
      // SN-5: the opinion becomes the first message of the canvas.
      const op = q.get<{ answer: string; ask: string; question: string | null }>('SELECT answer, ask, question FROM opinions WHERE id = ? AND user_id = ?', body.fromOpinionId, req.user!.id);
      if (op) q.run('INSERT INTO messages (id, exploration_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), id, 'assistant', op.answer, null, now());
    }
    res.json({ explorationId: id, snapshot, noteIds: notes.map((n) => n.id) });
  }),
);

// The full-screen board agent is a private canvas too (user, 25 Nov). It is saved only when needed:
// the notes in scope plus the exchanges so far. Exchanges are appended, never replaced.
app.post(
  '/api/explorations/agent',
  requireUser,
  h((req, res) => {
    const body = z
      .object({
        boardId: z.string(),
        noteIds: z.array(z.string()).min(1).max(120),
        messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(8000) })).max(100),
        explorationId: z.string().optional(),
        sent: z.number().int().min(0).default(0),
      })
      .parse(req.body);
    const doc = boardDoc(body.boardId);
    if (!doc) return notFound(res);
    const b = readBoard(doc);
    const notes = b.notes.filter((n) => body.noteIds.includes(n.id) && n.text.trim()).sort((a, c) => a.y - c.y || a.x - c.x);
    if (!notes.length) return res.status(400).json({ error: 'There are no notes with text yet.' });
    const existing = body.explorationId
      ? q.get<ExRow>("SELECT * FROM explorations WHERE id = ? AND user_id = ? AND board_id = ? AND status = 'open'", body.explorationId, req.user!.id, body.boardId)
      : undefined;
    const own = existing ? (JSON.parse(existing.snapshot_json) as Snapshot).chips.filter((c) => c.private) : [];
    const snapshot: Snapshot = {
      problem: b.problem,
      boardTitle: b.meta.title,
      notes: notes.map((n) => ({ id: n.id, text: n.text, author: n.author })),
      chips: [...b.chips.filter((c) => c.status === 'ready').map((c) => ({ id: c.id, type: c.type, title: c.title, summary: c.summary, source: c.source })), ...own],
    };
    const id = existing?.id ?? newId();
    if (existing) q.run('UPDATE explorations SET snapshot_json = ? WHERE id = ?', JSON.stringify(snapshot), id);
    else q.run('INSERT INTO explorations (id, board_id, user_id, status, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, body.boardId, req.user!.id, 'open', JSON.stringify(snapshot), now());
    const t = now();
    body.messages.slice(existing ? body.sent : 0).forEach((m, n) => q.run('INSERT INTO messages (id, exploration_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), id, m.role, m.text, null, t + n));
    res.json(exView(q.get<ExRow>('SELECT * FROM explorations WHERE id = ?', id)!, req.user!.id));
  }),
);

app.get(
  '/api/explorations/:id',
  requireUser,
  h((req, res) => {
    // Owner only, except the finished example's scripted chats, which anyone may read.
    const e = q.get<ExRow>('SELECT * FROM explorations WHERE id = ?', req.params.id);
    if (!e || (e.user_id !== req.user!.id && !isSeed(e.user_id))) return notFound(res);
    // Locked decisions 7.4: decisions in force on the board now, newest first, at most 20. Not for
    // saved chats of the finished example (scripted, read only). Shared board content only.
    const doc = e.user_id === req.user!.id ? boardDoc(e.board_id) : null;
    const decisions = doc ? inForce(readBoard(doc).decisions).slice(0, 20) : [];
    res.json({ ...exView(e, req.user!.id), decisions });
  }),
);

/** Context added inside the private canvas: it joins this exploration's snapshot and nothing else. */
app.post(
  '/api/explorations/:id/context',
  requireUser,
  h(async (req, res) => {
    const e = ownEx(req);
    if (!e) return notFound(res);
    if (e.status !== 'open') return res.status(409).json({ error: 'This canvas is closed.' });
    const { type, value } = z.object({ type: z.enum(['link', 'text']), value: z.string().min(1).max(20000) }).parse(req.body);
    const r = await summarise(req, e.board_id, type, value.trim());
    const chip: Snapshot['chips'][number] =
      r.status === 'ready'
        ? { id: newId(), type, title: r.title, summary: r.summary, source: type === 'text' ? value.trim().slice(0, 6000) : value.trim(), private: true }
        : // A link that cannot be read stays as a reference label, so a dead link never blocks the person.
          { id: newId(), type, title: value.trim(), summary: '', source: value.trim(), private: true, unread: true };
    // Re-read inside the write so two quick adds do not overwrite each other.
    const fresh = q.get<ExRow>('SELECT * FROM explorations WHERE id = ?', e.id)!;
    const snapshot = JSON.parse(fresh.snapshot_json) as Snapshot;
    snapshot.chips.push(chip);
    q.run('UPDATE explorations SET snapshot_json = ? WHERE id = ?', JSON.stringify(snapshot), e.id);
    res.json({ chip, snapshot });
  }),
);

app.post(
  '/api/explorations/:id/messages',
  requireUser,
  h(async (req, res) => {
    const e = ownEx(req);
    if (!e) return notFound(res);
    if (e.status !== 'open') return res.status(409).json({ error: 'This canvas is closed.' });
    const { content } = z.object({ content: z.string().min(1).max(4000) }).parse(req.body);
    checkLimit(ctxOf(req, e.board_id));
    const snapshot = JSON.parse(e.snapshot_json) as Snapshot;
    const userMsgId = newId();
    q.run('INSERT INTO messages (id, exploration_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)', userMsgId, e.id, 'user', content.trim(), null, now());
    const history = messagesOf(e.id);
    // Locked decisions 7.4: the current decisions, read from the board now, not at take time.
    const decisions = decisionsOfBoard(e.board_id);
    const out = sse(res);
    try {
      const { text, model } = await stream(
        'canvasChat',
        // PC-3: the system prompt and the chips come first and never change between turns.
        [{ role: 'system', content: prompts.canvasChat(snapshot, decisions) }, ...history.map((m) => ({ role: m.role, content: m.text }))],
        ctxOf(req, e.board_id),
        (d) => out.send('delta', { text: d }),
        () => mock.canvasChat(snapshot, content, decisions),
      );
      const messageId = newId();
      q.run('INSERT INTO messages (id, exploration_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)', messageId, e.id, 'assistant', text, model, now());
      out.send('done', { messageId, userMessageId: userMsgId });
    } catch (err) {
      // Take the person's message back out so a retry does not send it twice.
      q.run('DELETE FROM messages WHERE id = ?', userMsgId);
      out.send('error', { error: err instanceof AiError ? err.message : 'The AI did not reply. Try again.' });
    }
    out.end();
  }),
);

app.post(
  '/api/explorations/:id/report',
  requireUser,
  h(async (req, res) => {
    const e = ownEx(req);
    if (!e) return notFound(res);
    if (e.status !== 'open') return res.status(409).json({ error: 'This canvas is closed.' });
    const snapshot = JSON.parse(e.snapshot_json) as Snapshot;
    const msgs = messagesOf(e.id);
    // The report is a synthesis of the conversation (Micro PRD RPT-2, RPT-4). With no conversation
    // there is nothing to report, so there is no AI call: an honest empty report, not one built from the setup.
    let data: ReportBody;
    if (!msgs.some((m) => m.role === 'user') || !msgs.some((m) => m.role === 'assistant')) {
      data = emptyReport();
    } else {
      const transcript = msgs.map((m) => `${m.role === 'user' ? req.user!.name : 'AI'}: ${m.text}`).join('\n\n');
      ({ data } = await json(
        'makeReport',
        [
          { role: 'system', content: prompts.makeReport(snapshot, req.user!.name, decisionsOfBoard(e.board_id)) },
          {
            role: 'user',
            content: `Here is the conversation. It is the only source for the report.\n\n<conversation>\n${transcript.replace(/</g, '‹')}\n</conversation>\n\nWrite the report.`,
          },
        ],
        ReportSchema,
        ctxOf(req, e.board_id),
        () => mock.makeReport(snapshot, msgs.map((m) => ({ role: m.role, text: m.text })), req.user!.name),
      ));
    }
    // Regenerate replaces the old draft. Approved reports are never touched.
    q.run("DELETE FROM reports WHERE exploration_id = ? AND status = 'draft'", e.id);
    const reportId = newId();
    const t = now();
    q.run('INSERT INTO reports (id, exploration_id, user_id, board_id, status, body_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', reportId, e.id, req.user!.id, e.board_id, 'draft', JSON.stringify(data), t);
    res.json({ reportId, status: 'draft', body: data, createdAt: t });
  }),
);

// The author edits a draft before approving (Micro PRD RPT-5). The same schema as the AI's
// draft applies, so a finding, objection or rejected direction still cannot lose its reason.
app.put(
  '/api/reports/:id',
  requireUser,
  h((req, res) => {
    const r = q.get<{ id: string; status: string }>('SELECT id, status FROM reports WHERE id = ? AND user_id = ?', req.params.id, req.user!.id);
    if (!r) return notFound(res);
    if (r.status !== 'draft') return res.status(409).json({ error: 'This report is already approved, so it cannot be edited.' });
    const parsed = ReportSchema.safeParse(req.body?.body);
    if (!parsed.success) return res.status(400).json({ error: 'Every item needs its text, and every finding, objection and rejected direction needs a reason.' });
    const body = parsed.data;
    if (body.evidence.some((e) => e.supports > body.findings.length)) {
      return res.status(400).json({ error: 'Each piece of evidence must point to a finding in the report.' });
    }
    const t = now();
    q.run('UPDATE reports SET body_json = ?, edited_at = ? WHERE id = ?', JSON.stringify(body), t, r.id);
    res.json({ body, editedAt: t });
  }),
);

app.post(
  '/api/reports/:id/approve',
  requireUser,
  h((req, res) => {
    const r = q.get<{ id: string; exploration_id: string; status: string; body_json: string; created_at: number; edited_at: number | null }>(
      'SELECT id, exploration_id, status, body_json, created_at, edited_at FROM reports WHERE id = ? AND user_id = ?',
      req.params.id,
      req.user!.id,
    );
    if (!r) return notFound(res);
    if (r.status !== 'draft') return res.status(409).json({ error: 'This report is already approved.' });
    const t = now();
    q.run("UPDATE reports SET status = 'approved', approved_at = ? WHERE id = ?", t, r.id);
    q.run("UPDATE explorations SET status = 'closed' WHERE id = ?", r.exploration_id);
    const ex = q.get<ExRow>('SELECT * FROM explorations WHERE id = ?', r.exploration_id)!;
    res.json({
      reportId: r.id,
      status: 'approved',
      approvedAt: t,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      body: JSON.parse(r.body_json),
      contributorName: req.user!.name,
      contributorColor: req.user!.color,
      explorationId: r.exploration_id,
      noteIds: (JSON.parse(ex.snapshot_json) as Snapshot).notes.map((n) => n.id),
    });
  }),
);

app.post(
  '/api/explorations/:id/close',
  requireUser,
  h((req, res) => {
    const e = ownEx(req);
    if (!e) return notFound(res);
    q.run("UPDATE explorations SET status = 'closed' WHERE id = ?", e.id);
    res.json({ ok: true, noteIds: (JSON.parse(e.snapshot_json) as Snapshot).notes.map((n) => n.id) });
  }),
);

// ---------- Meeting addendum: build a session from a meeting ----------
// A meeting added as board context is board content (user decision, 25 Nov): anyone on the board can read
// its text and passages. Building a session, the draft, and removing the meeting stay with the person who
// added it (404 for anyone else), because a draft is private until Add to board.

type SourceRow = { id: string; board_id: string; user_id: string; name: string | null; kind: 'transcript' | 'summary'; segments_json: string; truncated: number; covered_segments: number; total_segments: number; created_at: number };
type DraftRow = { id: string; source_id: string; user_id: string; status: string; draft_json: string; note_count: number | null; created_at: number; decided_at: number | null };
const ownSource = (req: Request, id = String(req.params.sourceId)) => q.get<SourceRow>('SELECT * FROM meeting_sources WHERE id = ? AND user_id = ?', id, req.user!.id);
const boardSource = (req: Request, id = String(req.params.sourceId)) => q.get<SourceRow>('SELECT * FROM meeting_sources WHERE id = ?', id);
/** The covered meeting text as plain lines, for the chip on the board. */
const textOf = (segments: Segment[]) => segments.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join('\n');
const ownDraft = (req: Request) => q.get<DraftRow>('SELECT * FROM meeting_drafts WHERE id = ? AND user_id = ?', req.params.draftId, req.user!.id);
const coverageOf = (s: SourceRow) => ({ truncated: Boolean(s.truncated), covered: s.covered_segments, total: s.total_segments });
const segmentsOf = (s: SourceRow) => JSON.parse(s.segments_json) as Segment[];
const meetingErr = (res: Response, status: number, code: string, error: string) => res.status(status).json({ error, code });

app.post(
  '/api/boards/:boardId/meetings',
  requireUser,
  h(async (req, res) => {
    const boardId = String(req.params.boardId);
    if (!boardExists(boardId)) return notFound(res);
    const body = z.object({ text: z.string().min(1), name: z.string().max(80).optional() }).parse(req.body);
    if (body.text.length > MEETING_MAX_CHARS) return meetingErr(res, 413, 'too_large', 'That is more text than the app can take at once. Paste a shorter part of the meeting.');
    let seg;
    try {
      seg = segment(body.text);
    } catch (e) {
      if (e instanceof MeetingInputError) return meetingErr(res, 400, e.code, e.message);
      throw e;
    }
    const name = body.name?.trim() || null;
    const schema = z.object({ title: z.string().min(1), summary: z.string().min(1) });
    let data;
    try {
      ({ data } = await json('meetingCondense', [{ role: 'user', content: meetingPrompts.condense(seg.segments, seg.kind, name) }], schema, ctxOf(req, boardId), () =>
        meetingMock.condense(seg.segments, seg.kind, name),
      ));
    } catch (e) {
      if (e instanceof AiError) return meetingErr(res, e.status, e.status === 429 ? 'rate_limited' : 'model_failed', e.message);
      throw e;
    }
    const sourceId = newId();
    q.run(
      'INSERT INTO meeting_sources (id, board_id, user_id, name, kind, segments_json, truncated, covered_segments, total_segments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      sourceId,
      boardId,
      req.user!.id,
      name,
      seg.kind,
      JSON.stringify(seg.segments),
      seg.truncated ? 1 : 0,
      seg.coveredSegments,
      seg.totalSegments,
      now(),
    );
    res.json({
      sourceId,
      title: data.title.replace(/^["'“]|["'”.]$/g, '').split(/\s+/).slice(0, 6).join(' '),
      summary: data.summary,
      kind: seg.kind,
      coverage: { truncated: seg.truncated, covered: seg.coveredSegments, total: seg.totalSegments },
      text: textOf(seg.segments),
    });
  }),
);

/** One build per person per board every 30 s (section 10). The hourly cap of 10 uses ai.ts. */
const lastBuild = new Map<string, number>();

app.post(
  '/api/meetings/:sourceId/session',
  requireUser,
  h(async (req, res) => {
    const src = ownSource(req);
    if (!src) return meetingErr(res, 404, 'not_found', 'Not found.');
    const key = `${req.user!.id}:${src.board_id}`;
    const ctx = ctxOf(req, src.board_id);
    if (Date.now() - (lastBuild.get(key) ?? 0) < 30_000) return meetingErr(res, 429, 'rate_limited', 'You just built a session. Wait half a minute and try again.');
    try {
      checkLimit(ctx, 'meetingSession', 10);
    } catch (e) {
      if (e instanceof AiError) return meetingErr(res, 429, 'rate_limited', e.message);
      throw e;
    }
    lastBuild.set(key, Date.now());
    const segments = segmentsOf(src);
    const out = sse(res);
    try {
      out.send('stage', { stage: 'reading' });
      const b = contextFor(src.board_id) ?? { title: '', problem: '', sections: [], notes: [], chips: [] };
      const messages: Msg[] = [
        { role: 'system', content: meetingPrompts.session() },
        { role: 'user', content: meetingPrompts.sessionUser(b, segments, src.kind, src.name) },
      ];
      let draft: MeetingDraft | null = null;
      for (let attempt = 0; attempt < 2 && !draft; attempt++) {
        out.send('stage', { stage: 'drafting' });
        const { data } = await json('meetingSession', messages, MeetingDraftLoose, ctx, () => meetingMock.session(segments, b));
        out.send('stage', { stage: 'checking' });
        try {
          // Locked decisions 9A: conflicts name real decisions in force; duplicates of them are dropped.
          draft = checkDraft(data, segments, (b.decisions ?? []).map((d) => ({ id: d.id, realId: d.realId, text: d.text })));
        } catch (e) {
          if (!(e instanceof InvalidDraft)) throw e;
          console.warn(`[meeting] draft failed the checks (attempt ${attempt + 1}): ${e.message}`);
          // The one retry beyond withFallback(): same task, with the reason appended.
          messages.push({ role: 'assistant', content: JSON.stringify(data) }, { role: 'user', content: `That draft could not be used: ${e.message} Return a corrected draft.` });
        }
      }
      if (!draft) {
        out.send('error', { code: 'invalid_draft', error: 'The AI did not return a usable draft. Try again. Your meeting text is kept.' });
        return out.end();
      }
      const draftId = newId();
      const noteCount = draft.sections.reduce((a, s) => a + s.notes.length, 0);
      q.run('INSERT INTO meeting_drafts (id, source_id, user_id, status, draft_json, note_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', draftId, src.id, req.user!.id, 'draft', JSON.stringify(draft), noteCount, now());
      out.send('done', { draftId, draft: withPassages(draft, segments), coverage: coverageOf(src) });
    } catch (e) {
      lastBuild.delete(key); // a failed build should not block a retry
      const status = e instanceof AiError ? e.status : 500;
      if (!(e instanceof AiError)) console.error(e);
      out.send('error', { code: status === 429 ? 'rate_limited' : 'model_failed', error: e instanceof AiError ? `${e.message} Your meeting text is kept.` : 'The AI did not answer. Try again. Your meeting text is kept.' });
    }
    out.end();
  }),
);

app.get(
  '/api/meetings/:sourceId',
  requireUser,
  h((req, res) => {
    const src = ownSource(req);
    if (!src) return meetingErr(res, 404, 'not_found', 'Not found.');
    const d = q.get<DraftRow>("SELECT * FROM meeting_drafts WHERE source_id = ? AND status != 'discarded' ORDER BY created_at DESC LIMIT 1", src.id);
    const built = q.get<{ n: number | null }>("SELECT SUM(note_count) AS n FROM meeting_drafts WHERE source_id = ? AND status = 'approved'", src.id)!.n ?? 0;
    res.json({
      status: 'ready',
      kind: src.kind,
      name: src.name,
      coverage: coverageOf(src),
      builtNotes: built,
      latestDraft: d ? { id: d.id, status: d.status, noteCount: d.note_count ?? 0 } : null,
    });
  }),
);

app.get(
  '/api/meeting-drafts/:draftId',
  requireUser,
  h((req, res) => {
    const d = ownDraft(req);
    const src = d ? ownSource(req, d.source_id) : undefined;
    if (!d || !src) return meetingErr(res, 404, 'not_found', 'Not found.');
    res.json({ draftId: d.id, sourceId: d.source_id, status: d.status, draft: withPassages(JSON.parse(d.draft_json), segmentsOf(src)), coverage: coverageOf(src) });
  }),
);

app.post(
  '/api/meeting-drafts/:draftId/approve',
  requireUser,
  h((req, res) => {
    const d = ownDraft(req);
    if (!d) return meetingErr(res, 404, 'not_found', 'Not found.');
    const body = z.object({ noteCount: z.number().int().min(0), sectionCount: z.number().int().min(0), titleUsed: z.boolean(), problemUsed: z.boolean() }).parse(req.body ?? {});
    // Idempotent: a second call (the background retry) changes nothing.
    if (d.status !== 'approved') q.run("UPDATE meeting_drafts SET status = 'approved', note_count = ?, decided_at = ? WHERE id = ?", body.noteCount, now(), d.id);
    console.log(`[meeting] draft ${d.id} approved: ${body.noteCount} notes, ${body.sectionCount} sections, title ${body.titleUsed ? 'used' : 'kept'}, problem ${body.problemUsed ? 'used' : 'not used'}`);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/meeting-drafts/:draftId/discard',
  requireUser,
  h((req, res) => {
    const d = ownDraft(req);
    if (!d) return meetingErr(res, 404, 'not_found', 'Not found.');
    if (d.status === 'draft') q.run("UPDATE meeting_drafts SET status = 'discarded', decided_at = ? WHERE id = ?", now(), d.id);
    res.json({ ok: true });
  }),
);

app.get(
  '/api/meetings/:sourceId/passages',
  requireUser,
  h((req, res) => {
    const src = boardSource(req);
    if (!src) return meetingErr(res, 404, 'not_found', 'Not found.');
    const ids = new Set(String(req.query.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    res.json({ passages: segmentsOf(src).filter((s) => ids.has(s.id)) });
  }),
);

app.delete(
  '/api/meetings/:sourceId',
  requireUser,
  h((req, res) => {
    const src = ownSource(req);
    if (!src) return meetingErr(res, 404, 'not_found', 'Not found.');
    q.run('DELETE FROM meeting_drafts WHERE source_id = ?', src.id);
    q.run('DELETE FROM meeting_sources WHERE id = ?', src.id);
    res.json({ ok: true });
  }),
);

// ---------- Whiteboard agent (server/agent/router.ts) ----------

app.use(agentRouter);

// ---------- start ----------

app.listen(PORT, () => console.log(`API on http://localhost:${PORT} (${MOCK ? 'offline: canned AI' : 'live AI via Sarvam Token Factory'})`));
collab.listen().then(() => console.log(`Collab on ws://localhost:${COLLAB_PORT}`));
