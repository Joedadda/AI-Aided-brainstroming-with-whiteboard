import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AGENT_LIMITS, IdeasSchema, ModelPlanSchema, type AgentIdea, type AgentPlan, type ModelPlan } from '../../shared/agent-schema.ts';
import { AiError, checkLimit, json, type Msg } from '../ai.ts';
import { newId, requireUser } from '../auth.ts';
import { boardDoc } from '../collab.ts';
import { q } from '../db.ts';
import { InvalidPlan, checkPlan, mergeIdeas } from './checks.ts';
import { buildAgentContext, type AgentContext } from './context.ts';
import { agentMock, ideasMock } from './mock.ts';
import { AGENT_SYSTEM, IDEAS_SYSTEM, agentUser, ideasUser } from './prompts.ts';

/*
  Whiteboard agent routes (Whiteboard_Agent_PRD 6). The server only plans: it never writes to the
  shared document. The person's browser applies the plan with board.* in one transaction.
  Runs are owner-only; anyone else gets 404.
*/

export const agentRouter = Router();

const RUNS_PER_HOUR = Number(process.env.AGENT_RUNS_PER_HOUR ?? 10);
const IDEA_TIMEOUT = 30_000;

/** One run at a time per person per board (PRD 6.5). */
const busy = new Set<string>();

type RunRow = { id: string; board_id: string; user_id: string; instruction: string; plan_json: string | null; status: string; refinements: number; created_at: number };

const Body = z.object({
  instruction: z.string().max(2000),
  selectedNoteIds: z.array(z.string()).max(400).default([]),
  selectedSectionIds: z.array(z.string()).max(50).default([]),
  /** Full-screen agent: the exploration holding this person's own context. */
  sessionId: z.string().optional(),
  /** "Change it": the run to refine, and the new line. */
  runId: z.string().optional(),
  refinement: z.string().max(2000).optional(),
  /** The reply to a clarify question: the earlier instruction and the question. */
  clarified: z.object({ instruction: z.string().max(2000), question: z.string().max(400) }).optional(),
});

const err = (res: Response, status: number, code: string, error: string) => res.status(status).json({ error, code });

agentRouter.post('/api/boards/:boardId/agent', requireUser, async (req: Request, res: Response) => {
  const boardId = String(req.params.boardId);
  const parsed = Body.safeParse(req.body ?? {});
  if (!parsed.success) return err(res, 400, 'vague', 'That request was not valid.');
  const body = parsed.data;
  const user = req.user!;
  const doc = boardDoc(boardId);
  if (!doc) return err(res, 404, 'not_found', 'Not found.');

  // 6.3 rule 10: an empty or over-long instruction never reaches a model.
  const refining = Boolean(body.runId);
  const line = (refining ? body.refinement : body.instruction)?.trim() ?? '';
  if (!line) return err(res, 400, 'vague', 'Type what you want the agent to do.');
  if (line.length > AGENT_LIMITS.instruction) return err(res, 400, 'too_large', `Keep it under ${AGENT_LIMITS.instruction} characters.`);

  let prev: RunRow | undefined;
  if (refining) {
    prev = q.get<RunRow>('SELECT * FROM agent_runs WHERE id = ? AND user_id = ? AND board_id = ?', body.runId, user.id, boardId);
    if (!prev || !prev.plan_json) return err(res, 404, 'not_found', 'Not found.');
    if (prev.refinements >= AGENT_LIMITS.refinements) return err(res, 429, 'rate_limited', `You can change a plan ${AGENT_LIMITS.refinements} times. Start a new instruction instead.`);
  }

  const key = `${user.id}:${boardId}`;
  if (busy.has(key)) return err(res, 429, 'rate_limited', 'The agent is already working.');
  const ctx = { userId: user.id, boardId };
  if (!refining) {
    const n = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM agent_runs WHERE user_id = ? AND board_id = ? AND created_at > ?', user.id, boardId, Date.now() - 3_600_000)!.n;
    if (n >= RUNS_PER_HOUR) return err(res, 429, 'rate_limited', `You can run the agent ${RUNS_PER_HOUR} times an hour on one board. Try again later.`);
  }
  try {
    checkLimit(ctx);
  } catch (e) {
    if (e instanceof AiError) return err(res, 429, 'rate_limited', e.message);
    throw e;
  }

  busy.add(key);
  let closed = false;
  res.on('close', () => {
    closed = true;
  });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (event: string, data: unknown) => {
    if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const runId = prev?.id ?? newId();
  const instruction = prev ? prev.instruction : body.instruction.trim();
  if (!prev) q.run('INSERT INTO agent_runs (id, board_id, user_id, instruction, plan_json, status, refinements, created_at) VALUES (?, ?, ?, ?, NULL, ?, 0, ?)', runId, boardId, user.id, instruction, 'running', Date.now());

  try {
    send('stage', { stage: 'reading' });
    // Lock intent is read from the person's own words: the first instruction, the refinement, or the clarify answer.
    const intentText = [instruction, body.refinement ?? '', body.clarified?.instruction ?? ''].join('\n');
    const c = buildAgentContext(doc, { userId: user.id, instruction: intentText, selectedNoteIds: body.selectedNoteIds, selectedSectionIds: body.selectedSectionIds });
    // The person's own context (owner only). Text is read in full, links by their summary.
    const session = body.sessionId ? q.get<{ snapshot_json: string }>('SELECT snapshot_json FROM explorations WHERE id = ? AND user_id = ? AND board_id = ?', body.sessionId, user.id, boardId) : undefined;
    if (session) {
      for (const ch of (JSON.parse(session.snapshot_json) as { chips: { title: string; summary: string; source: string; type: string; private?: boolean }[] }).chips.filter((x) => x.private)) {
        c.chips.push({ title: ch.title, summary: ch.type === 'text' ? ch.source : ch.summary });
      }
    }
    const prevPlan = prev ? (JSON.parse(prev.plan_json!) as { plan: AgentPlan }).plan : undefined;
    const messages: Msg[] = [
      { role: 'system', content: AGENT_SYSTEM },
      {
        role: 'user',
        content: agentUser(
          { ...c, instruction: refining ? instruction : line },
          { previous: prevPlan ? { instruction, plan: prevPlan } : undefined, refinement: body.refinement?.trim(), clarified: body.clarified },
        ),
      },
    ];
    const mockText = refining ? `${body.refinement}` : body.clarified ? `${body.clarified.instruction} ${line}` : line;

    let plan: AgentPlan | null = null;
    let lastReason = '';
    for (let attempt = 0; attempt < 2 && !plan && !closed; attempt++) {
      send('stage', { stage: 'planning' });
      const { data } = await json('agentPlan', messages, ModelPlanSchema, ctx, () => ModelPlanSchema.parse(agentMock(c, mockText)));
      send('stage', { stage: 'checking' });
      try {
        plan = checkPlan(data as ModelPlan, c);
      } catch (e) {
        if (!(e instanceof InvalidPlan)) throw e;
        lastReason = e.message;
        console.warn(`[agent] plan failed the checks (attempt ${attempt + 1}): ${e.message}`);
        messages.push({ role: 'assistant', content: JSON.stringify(data) }, { role: 'user', content: `That plan could not be used: ${e.message} Return a corrected plan.` });
      }
    }
    if (closed) {
      q.run("UPDATE agent_runs SET status = 'cancelled' WHERE id = ?", runId);
      return;
    }
    if (!plan) {
      q.run("UPDATE agent_runs SET status = 'failed' WHERE id = ?", runId);
      console.warn(`[agent] invalid plan: ${lastReason}`);
      send('error', { code: 'invalid_plan', error: 'I could not make a safe plan. Try fewer notes or say what you want more exactly.' });
      return res.end();
    }

    q.run('UPDATE agent_runs SET plan_json = ?, status = ?, refinements = refinements + ? WHERE id = ?', JSON.stringify({ plan }), 'planned', refining ? 1 : 0, runId);
    send('plan', { runId, plan });

    // 6.4: ideas from up to three angles in parallel, each streamed as it lands.
    const ideaStep = plan.steps.find((s) => s.type === 'proposeIdeas');
    const ideas: AgentIdea[] = [];
    if (ideaStep && ideaStep.type === 'proposeIdeas') {
      const target = targetInfo(plan, ideaStep.toRef, c);
      const perAngle = Math.ceil(ideaStep.count / ideaStep.angles.length);
      const existing = c.allNotes.map((n) => n.text);
      await Promise.all(
        ideaStep.angles.map(async (angle) => {
          try {
            const got = await withTimeout(
              json(
                'agentIdeas',
                [
                  { role: 'system', content: IDEAS_SYSTEM },
                  { role: 'user', content: ideasUser(c, { sectionTitle: target.title, notes: target.notes, angle }) },
                ],
                IdeasSchema,
                ctx,
                () => ideasMock(angle, target.title),
              ),
              IDEA_TIMEOUT,
            );
            if (closed) return;
            const fresh = mergeIdeas(got.data, angle, { existing, shown: ideas, perAngle, total: ideaStep.count, decisions: c.decisions, newId });
            ideas.push(...fresh);
            for (const i of fresh) send('idea', { idea: i });
          } catch (e) {
            console.warn(`[agent] ideas for "${angle}" failed: ${(e as Error).message}`);
            send('ideaError', { angle });
          }
        }),
      );
      q.run('UPDATE agent_runs SET plan_json = ? WHERE id = ?', JSON.stringify({ plan, ideas }), runId);
    }
    send('done', { runId, ideas: ideas.length });
  } catch (e) {
    q.run("UPDATE agent_runs SET status = 'failed' WHERE id = ?", runId);
    const status = e instanceof AiError ? e.status : 500;
    if (!(e instanceof AiError)) console.error(e);
    send('error', { code: status === 429 ? 'rate_limited' : 'model_failed', error: e instanceof AiError && status === 429 ? e.message : 'The agent could not make a plan. Nothing changed.' });
  } finally {
    busy.delete(key);
    if (!closed) res.end();
  }
});

/** Where ideas go: a new section in the plan, an existing one, or the notes in scope. */
function targetInfo(plan: AgentPlan, toRef: string | undefined, c: AgentContext) {
  if (toRef?.startsWith('#')) {
    const s = plan.steps.find((x) => x.type === 'createSection' && x.ref === toRef);
    const moved = plan.steps.filter((x) => x.type === 'moveNotes' && x.toRef === toRef).flatMap((x) => (x.type === 'moveNotes' ? x.noteIds : []));
    return { title: s && s.type === 'createSection' ? s.title : 'New ideas', notes: c.allNotes.filter((n) => moved.includes(n.id)).map((n) => n.text) };
  }
  const sec = toRef ? c.sections.find((s) => s.id === toRef) : undefined;
  if (sec) return { title: sec.title, notes: c.allNotes.filter((n) => sec.memberIds.includes(n.id)).map((n) => n.text) };
  return { title: 'These notes', notes: c.notes.map((n) => n.text) };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ---------- run log (owner only) ----------

const ownRun = (req: Request) => q.get<RunRow>('SELECT * FROM agent_runs WHERE id = ? AND user_id = ?', req.params.runId, req.user!.id);

agentRouter.get('/api/agent-runs/:runId', requireUser, (req, res) => {
  const r = ownRun(req);
  if (!r) return err(res, 404, 'not_found', 'Not found.');
  res.json({ id: r.id, boardId: r.board_id, instruction: r.instruction, status: r.status, refinements: r.refinements, createdAt: r.created_at, ...(r.plan_json ? JSON.parse(r.plan_json) : {}) });
});

agentRouter.post('/api/agent-runs/:runId/:action', requireUser, (req, res) => {
  const r = ownRun(req);
  if (!r) return err(res, 404, 'not_found', 'Not found.');
  const action = String(req.params.action);
  if (action !== 'applied' && action !== 'discarded') return err(res, 404, 'not_found', 'Not found.');
  const counts = z.record(z.string(), z.number()).safeParse(req.body?.counts ?? {});
  q.run('UPDATE agent_runs SET status = ?, result_json = ? WHERE id = ?', action, counts.success ? JSON.stringify(counts.data) : null, r.id);
  console.log(`[agent] run ${r.id} ${action}${counts.success ? ` ${JSON.stringify(counts.data)}` : ''}`);
  res.json({ ok: true });
});
