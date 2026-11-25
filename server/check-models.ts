import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import * as Y from 'yjs';
import { z } from 'zod';
import { GeneratedReportSchema } from '../shared/report-schema.ts';
import type { Snapshot } from '../shared/types.ts';
import { readBoard } from '../shared/ydoc.ts';
import { BASE_URL, client, effortParams, structured, type Msg } from './ai.ts';
import { seedCase } from './demo-seed.ts';
import { MODELS, TASKS, type ModelId } from './models.config.ts';
import { prompts } from './prompts.ts';

// npm run check:models            (a) which configured models GET /v2/models lists, (b) one tiny call per model
// npm run check:models -- --compare  also (c): the five-prompt comparison, written to docs/model-comparison.md

const KEY = process.env.SARVAM_API_KEY;
if (!KEY || !client) {
  console.error('Add SARVAM_API_KEY to .env first (and leave MOCK_AI unset or 0).');
  process.exit(1);
}
const ai = client; // narrowed: the check above exits without a key
const configured = [...new Set(Object.values(MODELS))] as ModelId[];

// ---------- (a) model list ----------

console.log(`\n(a) GET ${BASE_URL}/models\n`);
const res = await fetch(`${BASE_URL}/models`, { headers: { 'api-subscription-key': KEY } });
if (!res.ok) {
  console.error(`  Failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const list = (await res.json()) as { data: { id: string; access?: string; context_length?: number }[] };
const ids = new Map(list.data.map((m) => [m.id, m.access ?? '']));
const ctxLen = new Map(list.data.map((m) => [m.id, m.context_length]));
for (const id of configured)
  console.log(`  ${ids.has(id) ? 'listed ' : 'MISSING'}  ${id}${ids.get(id) ? `  (${ids.get(id)})` : ''}${ctxLen.get(id) ? `  context ${ctxLen.get(id)!.toLocaleString('en')} tokens` : ''}`);
console.log(`\n  All IDs this key can see: ${[...ids.keys()].join(', ')}`);
const missing = configured.filter((id) => !ids.has(id));
if (missing.length) {
  console.log(`\n  Stop: ${missing.join(', ')} not listed for this key. Fix server/models.config.ts or ask Sarvam for access.`);
}

// ---------- (b) one tiny call per model ----------

console.log('\n(b) One tiny call per model\n');
for (const id of configured) {
  const t0 = Date.now();
  try {
    const r = await ai.chat.completions.create({
      model: id,
      max_tokens: 400, // room for the low reasoning glm5.3-flash cannot switch off
      messages: [{ role: 'user', content: 'Reply with one short sentence naming a good title for a board about week-one drop-off in a bill-splitting app.' }],
      ...effortParams(id, 'off'),
    } as Parameters<typeof ai.chat.completions.create>[0] & { stream?: false });
    const c = (r as { choices: { message?: { content?: string | null }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }).choices[0];
    const u = (r as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
    console.log(
      `  ok    ${id.padEnd(26)} ${String(Date.now() - t0).padStart(6)} ms  in ${u?.prompt_tokens ?? '?'} out ${u?.completion_tokens ?? '?'}  ${c?.finish_reason ?? ''}  -> ${(c?.message?.content ?? '').trim().slice(0, 80) || '(empty)'}`,
    );
  } catch (e) {
    const err = e as { status?: number; message?: string };
    const access = err.status === 404 || /not enabled|whitelist|beta|access/i.test(err.message ?? '');
    console.log(`  FAIL  ${id.padEnd(26)} ${String(Date.now() - t0).padStart(6)} ms  ${err.status ?? ''} ${err.message}${access ? '   <- access: ask Sarvam to enable this model for the key' : ''}`);
  }
}

// ---------- (c) five-prompt comparison (only with --compare) ----------

if (!process.argv.includes('--compare')) {
  console.log('\n(c) Skipped. Run `npm run check:models -- --compare` for the five-prompt comparison.\n');
  process.exit(0);
}

console.log('\n(c) Five-prompt comparison on every model\n');
const doc = new Y.Doc();
seedCase(doc, 'case');
const b = readBoard(doc);
const pick = (id: string) => b.notes.find((n) => n.id === id)!;
const snapshot: Snapshot = {
  problem: b.problem,
  boardTitle: '',
  notes: ['p1', 'p2', 'p6'].map((id) => ({ id, text: pick(id).text, author: pick(id).author })),
  chips: [],
};
const boardCtx = {
  title: '',
  problem: b.problem,
  sections: b.sections.map((s) => s.title),
  notes: b.notes.map((n) => ({ id: n.id, text: n.text, author: n.author })),
  chips: [],
};

type Row = { prompt: string; model: string; ms: number; tokens: string; output: string };
const rows: Row[] = [];
const run = async (prompt: string, model: ModelId, fn: () => Promise<{ text: string; usage?: { prompt_tokens?: number; completion_tokens?: number } | null }>) => {
  const t0 = Date.now();
  try {
    const r = await fn();
    rows.push({ prompt, model, ms: Date.now() - t0, tokens: `${r.usage?.prompt_tokens ?? '?'} in, ${r.usage?.completion_tokens ?? '?'} out`, output: r.text });
  } catch (e) {
    rows.push({ prompt, model, ms: Date.now() - t0, tokens: '-', output: `FAILED: ${(e as { status?: number }).status ?? ''} ${(e as Error).message}` });
  }
  console.log(`  ${prompt.padEnd(28)} ${model.padEnd(26)} ${rows.at(-1)!.ms} ms`);
};
const chat = async (model: ModelId, messages: Msg[], task: 'canvasChat' | 'opinion') => {
  const r = await ai.chat.completions.create({ model, messages, max_tokens: TASKS[task].maxTokens, ...effortParams(model, TASKS[task].reasoning) } as Parameters<typeof ai.chat.completions.create>[0] & { stream?: false });
  const c = r as { choices: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return { text: c.choices[0]?.message?.content ?? '', usage: c.usage };
};

const turn1 = 'Give me three different directions';
const turn2 = 'What are the strongest objections?';
for (const model of configured) {
  const sys: Msg = { role: 'system', content: prompts.canvasChat(snapshot) };
  let reply1 = '';
  await run('1. Canvas chat, turn 1', model, async () => {
    const r = await chat(model, [sys, { role: 'user', content: turn1 }], 'canvasChat');
    reply1 = r.text;
    return r;
  });
  await run('2. Canvas chat, turn 2', model, () =>
    chat(model, [sys, { role: 'user', content: turn1 }, { role: 'assistant', content: reply1 }, { role: 'user', content: turn2 }], 'canvasChat'),
  );
  const selected = ['p1', 'p6'].map((id, i) => ({ label: `N${i + 1}`, text: pick(id).text, author: pick(id).author }));
  const others = b.notes.filter((n) => !['p1', 'p6'].includes(n.id)).map((n) => ({ id: n.id, text: n.text }));
  await run('3. Selected-notes question', model, () =>
    chat(model, [{ role: 'system', content: prompts.opinion(selected, others, b.problem, 'How do these connect?') }, { role: 'user', content: 'How do these connect?' }], 'opinion'),
  );
  const transcript = `Asha: ${turn1}\n\nAI: ${reply1}`;
  await run('4. Report', model, async () => {
    const r = await structured(
      model,
      [
        { role: 'system', content: prompts.makeReport(snapshot, 'Asha') },
        { role: 'user', content: `Here is the exploration so far:\n\n<context>\n${transcript}\n</context>\n\nWrite the report.` },
      ],
      GeneratedReportSchema,
      { name: 'makeReport', maxTokens: TASKS.makeReport.maxTokens, reasoning: TASKS.makeReport.reasoning },
    );
    return { text: `(${r.mode})\n\n\`\`\`json\n${JSON.stringify(r.data, null, 2)}\n\`\`\``, usage: r.usage };
  });
  await run('5. Title', model, async () => {
    const r = await structured(model, [{ role: 'user', content: prompts.title(boardCtx) }], z.object({ title: z.string().min(1) }), {
      name: 'title',
      maxTokens: TASKS.title.maxTokens,
      reasoning: TASKS.title.reasoning,
    });
    return { text: `(${r.mode}) ${r.data.title}`, usage: r.usage };
  });
}

const out = ['# Model comparison', '', `Run ${new Date().toISOString()}. Each task uses its own reasoning setting and token limit from \`server/models.config.ts\`.`, ''];
for (const prompt of [...new Set(rows.map((r) => r.prompt))]) {
  out.push(`## ${prompt}`, '', '| Model | Latency | Tokens |', '|---|---|---|');
  for (const r of rows.filter((x) => x.prompt === prompt)) out.push(`| ${r.model} | ${r.ms} ms | ${r.tokens} |`);
  out.push('');
  for (const r of rows.filter((x) => x.prompt === prompt)) out.push(`### ${r.model}`, '', r.output.trim(), '');
}
writeFileSync('docs/model-comparison.md', out.join('\n'));
console.log('\n  Written to docs/model-comparison.md\n');
