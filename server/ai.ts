import OpenAI from 'openai';
import { z } from 'zod';
import { q } from './db.ts';
import { REASONING_EFFORT, TASKS, type ModelId, type Reasoning, type Task, type TaskConfig } from './models.config.ts';

// Every model call goes through this module (Build PRD 13). OpenAI-compatible SDK pointed at
// Sarvam Token Factory. The key stays on the server.
//
// Auth: the OpenAI SDK sends `Authorization: Bearer <key>`, which Sarvam accepts for
// OpenAI-compatible tooling. (Sarvam's own header, `api-subscription-key`, is used by
// check-models.ts for GET /v2/models.)
const KEY = process.env.SARVAM_API_KEY;
export const BASE_URL = process.env.SARVAM_BASE_URL || 'https://api.sarvam.ai/v2';
export const MOCK = process.env.MOCK_AI === '1' || !KEY;

/**
 * No SDK-level retries: fallback is handled here, once, on the other model (13.2).
 * Sarvam does not fall back between models by itself.
 */
export const client = MOCK ? null : new OpenAI({ baseURL: BASE_URL, apiKey: KEY, maxRetries: 0, timeout: 90_000 });

export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

/** The model spent its whole budget (often on reasoning) and returned no answer. */
class EmptyReply extends Error {}

export interface CallCtx {
  userId: string;
  boardId: string | null;
}

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
type Usage = { prompt_tokens?: number; completion_tokens?: number } | null | undefined;

// ---------- Limits (13.2) ----------

const PER_HOUR = Number(process.env.AI_CALLS_PER_BOARD_PER_HOUR ?? 60);

export function checkLimit(ctx: CallCtx, task?: Task, max?: number) {
  const since = Date.now() - 3_600_000;
  const total = q.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM ai_calls WHERE user_id = ? AND board_id IS ? AND created_at > ?',
    ctx.userId,
    ctx.boardId,
    since,
  )!.n;
  if (total >= PER_HOUR) throw new AiError('You have reached the hourly AI limit for this board. Try again later.', 429);
  if (task && max) {
    const n = q.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM ai_calls WHERE user_id = ? AND board_id IS ? AND task = ? AND created_at > ?',
      ctx.userId,
      ctx.boardId,
      task,
      since,
    )!.n;
    if (n >= max) throw new AiError(`You can ask for this ${max} times an hour on one board. Try again later.`, 429);
  }
}

function log(ctx: CallCtx, task: Task, model: string, ms: number, ok: boolean, usage?: Usage) {
  q.run(
    'INSERT INTO ai_calls (user_id, board_id, task, model, tokens_in, tokens_out, ms, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ctx.userId,
    ctx.boardId,
    task,
    model,
    usage?.prompt_tokens ?? null,
    usage?.completion_tokens ?? null,
    ms,
    ok ? 1 : 0,
    Date.now(),
  );
}

// ---------- Reasoning ----------

/** Sarvam's top-level `reasoning_effort` for this model and wish, or nothing for the model default. */
export function effortParams(model: ModelId, reasoning: Reasoning): Record<string, string> {
  const effort = REASONING_EFFORT[model]?.[reasoning];
  return effort ? { reasoning_effort: effort } : {};
}

// ---------- Fallback wrapper (one place for every task) ----------

const statusOf = (e: unknown) => (e as { status?: number })?.status;

/**
 * Worth trying the other model: 429, 5xx, timeouts and dropped connections, a 404 (model not
 * enabled for this key), an empty or unreadable answer. Not worth it: a bad key or no credit,
 * which fail the same way on every model, or a stream that already sent text to the person.
 */
function shouldFallback(e: unknown) {
  if ((e as { partial?: boolean })?.partial) return false;
  const s = statusOf(e);
  if (s === 401 || s === 402 || s === 403) return false;
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Testing only: AI_FORCE_FALLBACK=meetingSession,meetingCondense (or "all") makes the primary model
 * fail with a fake 503 before it is called, so the fallback answers. Unset in normal use.
 */
const FORCE_FALLBACK = new Set((process.env.AI_FORCE_FALLBACK ?? '').split(',').map((s) => s.trim()).filter(Boolean));
if (FORCE_FALLBACK.size) console.warn(`[ai] AI_FORCE_FALLBACK is on for: ${[...FORCE_FALLBACK].join(', ')}. The primary model will be skipped.`);
const forced = (task: Task) => FORCE_FALLBACK.has('all') || FORCE_FALLBACK.has(task);

async function withFallback<T>(
  task: Task,
  ctx: CallCtx,
  attempt: (model: ModelId) => Promise<{ value: T; usage: Usage; model?: string }>,
): Promise<{ value: T; model: string }> {
  const cfg = TASKS[task];
  const models = [cfg.primary, cfg.fallback];
  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const t0 = Date.now();
    try {
      if (i === 0 && forced(task)) throw Object.assign(new Error('Forced failure (AI_FORCE_FALLBACK)'), { status: 503 });
      const r = await attempt(model);
      const ms = Date.now() - t0;
      const answered = r.model ?? model;
      log(ctx, task, answered, ms, true, r.usage);
      console.log(`[ai] ${task} answered by ${answered} in ${ms}ms (in ${r.usage?.prompt_tokens ?? '?'}, out ${r.usage?.completion_tokens ?? '?'})${i ? ' [fallback]' : ''}`);
      return { value: r.value, model: answered };
    } catch (e) {
      lastErr = e;
      log(ctx, task, model, Date.now() - t0, false);
      console.warn(`[ai] ${task} failed on ${model}: ${statusOf(e) ?? ''} ${(e as Error).message}`);
      if (!shouldFallback(e)) break;
      if (i === 0 && statusOf(e) === 429) await sleep(600); // back off once before the fallback
    }
  }
  throw new AiError(friendly(lastErr), statusOf(lastErr) === 429 ? 429 : 502);
}

// ---------- Structured output ----------

type Mode = 'json_schema' | 'tool' | 'json_object';
const MODES: Mode[] = ['json_schema', 'tool', 'json_object'];
/** Modes a model has rejected (400), learned at runtime and kept for the life of the server. */
const rejected = new Map<string, Set<Mode>>();

/** True when a 400 says the model does not take this way of asking for JSON. */
function rejectsMode(e: unknown) {
  if (statusOf(e) !== 400) return false;
  return /response_format|json_schema|json_object|tool|unsupported|not supported/i.test((e as Error).message ?? '');
}

/**
 * Ask one model for JSON matching a zod schema. Tries json_schema, then tool calling, then JSON
 * mode, skipping modes the model has already rejected. The answer is always checked with zod;
 * an unreadable answer is retried once on the same model before giving up.
 */
export async function structured<T>(
  model: ModelId,
  messages: Msg[],
  schema: z.ZodType<T>,
  opts: { name: string; maxTokens: number; reasoning: Reasoning; temperature?: number },
): Promise<{ data: T; usage: Usage; mode: Mode; model: string }> {
  if (!client) throw new AiError('No AI key on the server.');
  const jsonSchema = strictify(z.toJSONSchema(schema, { target: 'draft-7' }));
  const bad = rejected.get(model) ?? new Set<Mode>();
  rejected.set(model, bad);
  const base = {
    model,
    max_tokens: opts.maxTokens,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...effortParams(model, opts.reasoning),
  };

  for (const mode of MODES) {
    if (bad.has(mode)) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let raw = '';
        let usage: Usage;
        let answered: string = model;
        if (mode === 'tool') {
          const res = await client.chat.completions.create({
            ...base,
            messages,
            tools: [{ type: 'function', function: { name: opts.name, description: 'Return the answer in this shape.', parameters: jsonSchema } }],
            tool_choice: { type: 'function', function: { name: opts.name } },
          } as OpenAI.ChatCompletionCreateParamsNonStreaming);
          const call = res.choices[0]?.message?.tool_calls?.[0];
          raw = call && 'function' in call ? call.function.arguments : '';
          if (!raw && res.choices[0]?.finish_reason === 'length') throw new EmptyReply('The answer ran out of room.');
          usage = res.usage;
          answered = res.model ?? model;
        } else {
          const res = await client.chat.completions.create({
            ...base,
            // JSON mode does not carry the schema, so spell it out in a last message. The prefix stays unchanged.
            messages:
              mode === 'json_object'
                ? [...messages, { role: 'user', content: `Return only a JSON object that matches this JSON Schema:\n${JSON.stringify(jsonSchema)}` }]
                : messages,
            response_format:
              mode === 'json_schema' ? { type: 'json_schema', json_schema: { name: opts.name, strict: true, schema: jsonSchema } } : { type: 'json_object' },
          } as OpenAI.ChatCompletionCreateParamsNonStreaming);
          raw = res.choices[0]?.message?.content ?? '';
          if (!raw.trim() && res.choices[0]?.finish_reason === 'length') throw new EmptyReply('The answer ran out of room.');
          usage = res.usage;
          answered = res.model ?? model;
        }
        const data = schema.parse(JSON.parse(stripFences(raw)));
        return { data, usage, mode, model: answered };
      } catch (e) {
        if (rejectsMode(e)) {
          bad.add(mode);
          console.warn(`[ai] ${model} does not take ${mode}; trying the next way`);
          break; // next mode
        }
        const unreadable = e instanceof SyntaxError || e instanceof z.ZodError;
        if (unreadable && attempt === 0) continue; // retry once on the same model
        throw e; // to withFallback: other model
      }
    }
  }
  throw new AiError(`${model} took none of the ways to return JSON.`);
}

/**
 * Strict json_schema wants every object closed and every key required, and some servers reject
 * length and range keywords. zod still checks those after the answer arrives.
 */
function strictify(node: unknown): Record<string, unknown> {
  if (Array.isArray(node)) return node.map(strictify) as unknown as Record<string, unknown>;
  if (!node || typeof node !== 'object') return node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (['$schema', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems', 'pattern', 'format'].includes(k)) continue;
    out[k] = typeof v === 'object' ? strictify(v) : v;
  }
  if (out.type === 'object' && out.properties) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as object);
  }
  return out;
}

const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();

// ---------- Public: whole JSON answers ----------

/** JSON task with fallback (title, large idea, context, suggestions, explain, report). */
export async function json<T>(task: Task, messages: Msg[], schema: z.ZodType<T>, ctx: CallCtx, mock: () => T): Promise<{ data: T; model: string }> {
  checkLimit(ctx);
  if (!client) {
    await sleep(500 + Math.random() * 500);
    log(ctx, task, 'mock', 0, true);
    return { data: schema.parse(mock()), model: 'mock' };
  }
  const cfg: TaskConfig = TASKS[task];
  const { value, model } = await withFallback(task, ctx, async (m) => {
    const r = await structured(m, messages, schema, { name: task, maxTokens: cfg.maxTokens, reasoning: cfg.reasoning, temperature: cfg.temperature });
    return { value: r.data, usage: r.usage, model: r.model };
  });
  return { data: value, model };
}

// ---------- Public: streamed text ----------

/**
 * Streamed task (chat, opinion). Falls back to the other model only if the first fails before
 * any text arrived; a stream that breaks halfway reports an error instead of mixing two answers.
 * Usage arrives in the final chunk (no stream_options needed on Sarvam).
 */
export async function stream(task: Task, messages: Msg[], ctx: CallCtx, onDelta: (t: string) => void, mock: () => string): Promise<{ text: string; model: string }> {
  checkLimit(ctx);
  if (!client) {
    const text = mock();
    await sleep(350);
    // Feed the canned text out in small pieces so the UI streams the same way as live.
    for (const piece of text.match(/.{1,12}/gs) ?? []) {
      onDelta(piece);
      await sleep(18);
    }
    log(ctx, task, 'mock', 0, true);
    return { text, model: 'mock' };
  }
  const cfg = TASKS[task];
  const { value, model } = await withFallback(task, ctx, async (m) => {
    let text = '';
    let usage: Usage;
    let answered: string = m;
    try {
      const s = await client.chat.completions.create({
        model: m,
        messages,
        max_tokens: cfg.maxTokens,
        stream: true,
        ...effortParams(m, cfg.reasoning),
      } as OpenAI.ChatCompletionCreateParamsStreaming);
      for await (const chunk of s) {
        const d = chunk.choices[0]?.delta?.content;
        if (d) {
          text += d;
          onDelta(d);
        }
        if (chunk.usage) usage = chunk.usage;
        if (chunk.model) answered = chunk.model;
      }
    } catch (e) {
      if (text) Object.assign(e as object, { partial: true });
      throw e;
    }
    if (!text.trim()) throw new EmptyReply('The model returned an empty answer.');
    return { value: text, usage, model: answered };
  });
  return { text: value, model };
}

function friendly(e: unknown) {
  const s = statusOf(e);
  if (s === 401 || s === 403) return 'The AI key was rejected. Check SARVAM_API_KEY in .env.';
  if (s === 402) return 'The AI account is out of credit.';
  if (s === 429) return 'The AI is busy right now. Try again in a minute.';
  if (e instanceof z.ZodError || e instanceof SyntaxError) return 'The AI returned something we could not read. Try again.';
  if (e instanceof EmptyReply) return 'The AI ran out of room before answering. Try again.';
  return 'The AI did not answer. Try again.';
}
