import { create } from 'zustand';
import type { Exploration } from '../../shared/types.ts';
import type { AgentErrorCode, AgentIdea, AgentPlan, AgentStage } from '../../shared/agent-schema.ts';
import { useStore } from '../store.ts';
import { applyPlan, countsLine, resultLine, type ApplyResult } from './agent-apply.ts';
import { applyAsOneStep, board } from './board.ts';
import { getProfile } from './profile.ts';

/*
  Whiteboard agent, client (PRD 7). Its own small store for run state, so the board store stays
  as it is. A run: send the instruction (SSE), show the plan, let the person tick and edit, apply
  in one transaction, or discard. Nothing reaches the shared board before Apply.
*/

export type AgentRun = {
  boardId: string;
  instruction: string;
  scopeNoteIds: string[];
  status: 'running' | 'ready' | 'error' | 'applied';
  stage: AgentStage;
  runId?: string;
  plan?: AgentPlan;
  ideas: AgentIdea[];
  /** Idea calls still out (the picker fills in as each lands). */
  ideasPending: boolean;
  ticks: Record<string, boolean>;
  edits: Record<string, string>;
  error?: { code?: AgentErrorCode | string; text: string };
  refinements: number;
  result?: ApplyResult;
  resultText?: string;
};

interface AgentState {
  /** The Agent panel is showing in the sidebar. */
  open: boolean;
  run: AgentRun | null;
  recent: string[];
  /** What was asked and answered on this board, for the report. */
  log: { role: 'user' | 'assistant'; text: string }[];
  /** The saved private canvas behind the full-screen view, once something needed it. */
  session: { ex: Exploration; sent: number } | null;
  /** "The agent's plan is ready" toast, when the plan lands while the panel is closed. */
  toast: boolean;
  /** Bumped to ask the panel to focus the command box. */
  focusTick: number;
  /** Clarify follow-up: the next instruction goes with the earlier one. */
  clarified?: { instruction: string; question: string };
}

export const useAgent = create<AgentState>()(() => ({ open: false, run: null, recent: [], log: [], session: null, toast: false, focusTick: 0 }));

export function logExchange(...entries: { role: 'user' | 'assistant'; text: string }[]) {
  const clean = entries.map((e) => ({ role: e.role, text: e.text.trim().slice(0, 8000) })).filter((e) => e.text);
  useAgent.setState((s) => ({ log: [...s.log, ...clean].slice(-100) }));
}

let controller: AbortController | null = null;
const TIMEOUT = 150_000;

const patchRun = (p: Partial<AgentRun>) => useAgent.setState((s) => (s.run ? { run: { ...s.run, ...p } } : {}));

/** Open the Agent panel in the sidebar and focus the box. */
export function openAgent() {
  useStore.setState({ dockOpen: true });
  useAgent.setState((s) => ({ open: true, toast: false, focusTick: s.focusTick + 1 }));
}

export function closeAgent() {
  useAgent.setState({ open: false });
}

export const agentVisible = () => useAgent.getState().open && useStore.getState().dockOpen;

function headers(): HeadersInit {
  const p = getProfile();
  return { 'Content-Type': 'application/json', ...(p ? { Authorization: `Bearer ${p.token}` } : {}) };
}

async function sse(path: string, body: unknown, on: (event: string, data: Record<string, unknown>) => void, signal: AbortSignal) {
  const res = await fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({}));
    throw Object.assign(new Error(d.error ?? `Request failed (${res.status})`), { code: d.code });
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buf += chunk.value;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.+)$/m.exec(raw)?.[1];
      const data = /^data: (.+)$/m.exec(raw)?.[1];
      if (event && data) on(event, JSON.parse(data));
    }
  }
}

/** Start a run, or refine the open one ("Change it"). */
export async function startRun(boardId: string, instruction: string, opts: { refinement?: string } = {}) {
  const text = instruction.trim();
  const refining = Boolean(opts.refinement);
  const cur = useAgent.getState().run;
  if (!text && !refining) return;
  if (cur?.status === 'running') return;
  cancelRun(false);
  const selected = useStore.getState().selected.filter((id) => useStore.getState().cards.some((c) => c.id === id));
  const clarified = !refining ? useAgent.getState().clarified : undefined;
  const scopeNoteIds = refining && cur ? cur.scopeNoteIds : selected;
  useAgent.setState((s) => ({
    clarified: undefined,
    toast: false,
    recent: refining ? s.recent : [text, ...s.recent.filter((r) => r !== text)].slice(0, 3),
    run: {
      boardId,
      instruction: refining && cur ? cur.instruction : text,
      scopeNoteIds,
      status: 'running',
      stage: 'reading',
      runId: refining ? cur?.runId : undefined,
      ideas: [],
      ideasPending: false,
      ticks: {},
      edits: {},
      refinements: refining && cur ? cur.refinements + 1 : 0,
    },
  }));
  const ctl = new AbortController();
  controller = ctl;
  const timer = window.setTimeout(() => ctl.abort('timeout'), TIMEOUT);
  let gotPlan = false;
  try {
    await sse(
      `/api/boards/${boardId}/agent`,
      {
        instruction: refining && cur ? cur.instruction : text,
        selectedNoteIds: scopeNoteIds,
        selectedSectionIds: [],
        sessionId: useAgent.getState().session?.ex.id,
        ...(refining && cur?.runId ? { runId: cur.runId, refinement: opts.refinement } : {}),
        ...(clarified ? { clarified } : {}),
      },
      (event, data) => {
        if (controller !== ctl) return;
        if (event === 'stage') patchRun({ stage: data.stage as AgentStage });
        else if (event === 'plan') {
          gotPlan = true;
          const plan = data.plan as AgentPlan;
          const hasIdeas = plan.steps.some((s) => s.type === 'proposeIdeas');
          patchRun({ status: 'ready', plan, runId: data.runId as string, ideasPending: hasIdeas });
          logExchange({ role: 'user', text: opts.refinement ?? text }, { role: 'assistant', text: plan.answer?.text ?? plan.clarify?.question ?? plan.summary });
          if (plan.clarify) useAgent.setState((s) => ({ clarified: { instruction: s.run!.instruction, question: plan.clarify!.question }, focusTick: s.focusTick + 1 }));
          if (!agentVisible()) useAgent.setState({ toast: true });
        } else if (event === 'idea') {
          useAgent.setState((s) => (s.run ? { run: { ...s.run, ideas: [...s.run.ideas, data.idea as AgentIdea] } } : {}));
        } else if (event === 'done') patchRun({ ideasPending: false });
        else if (event === 'error') patchRun({ status: 'error', error: { code: data.code as string, text: data.error as string } });
      },
      ctl.signal,
    );
    if (controller === ctl && !gotPlan && useAgent.getState().run?.status === 'running') {
      patchRun({ status: 'error', error: { text: 'The agent stopped before it finished. Nothing changed.' } });
    }
  } catch (e) {
    if (controller !== ctl) return;
    if (ctl.signal.aborted && ctl.signal.reason !== 'timeout') return;
    const code = (e as { code?: string }).code;
    const msg = ctl.signal.reason === 'timeout' ? 'The agent took too long. Nothing changed.' : e instanceof TypeError ? 'Could not reach the server. Check that it is running and try again.' : (e as Error).message;
    if (gotPlan) patchRun({ ideasPending: false });
    else patchRun({ status: 'error', error: { code, text: msg } });
  } finally {
    window.clearTimeout(timer);
    if (controller === ctl) controller = null;
  }
}

/** Stop a run: the stream closes and nothing is written. */
export function cancelRun(clear = true) {
  controller?.abort('cancel');
  controller = null;
  if (clear) useAgent.setState((s) => (s.run?.status === 'running' ? { run: null } : { run: s.run ? { ...s.run, ideasPending: false } : null }));
}

export function setTick(key: string, value: boolean) {
  useAgent.setState((s) => (s.run ? { run: { ...s.run, ticks: { ...s.run.ticks, [key]: value } } } : {}));
}
export function setEdit(key: string, value: string) {
  useAgent.setState((s) => (s.run ? { run: { ...s.run, edits: { ...s.run.edits, [key]: value } } } : {}));
}

const post = (path: string, body: unknown) => fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body) }).catch(() => {});

/** Apply the plan currently shown, as one undo step. */
export function applyRun() {
  const run = useAgent.getState().run;
  const p = getProfile();
  if (!run?.plan || !p) return;
  const choices = { ticks: run.ticks, edits: run.edits, ideas: run.ideas };
  if (!countsLine(run.plan, choices).total) return;
  let result: ApplyResult | null = null;
  const ok = applyAsOneStep((doc) => {
    result = applyPlan(doc, run.plan!, choices, { id: p.userId, name: p.name, color: p.color });
  });
  if (!ok || !result) return;
  const r = result as ApplyResult;
  controller?.abort('cancel'); // late ideas are dropped once applied
  controller = null;
  patchRun({ status: 'applied', result: r, resultText: resultLine(r), ideasPending: false });
  logExchange({ role: 'assistant', text: `Applied to the board: ${resultLine(r)}` });
  if (run.runId) void post(`/api/agent-runs/${run.runId}/applied`, { counts: { sections: r.sections, moved: r.moved, added: r.added, ideas: r.ideas, locks: r.locks, skipped: r.skipped } });
  // Frame the changed area once React Flow has the new nodes.
  if (r.ids.length) window.setTimeout(() => useStore.setState({ reveal: r.ids }), 450);
}

export function discardRun() {
  const run = useAgent.getState().run;
  cancelRun(false);
  if (run?.runId && run.status !== 'applied') void post(`/api/agent-runs/${run.runId}/discarded`, {});
  useAgent.setState((s) => ({ run: null, clarified: undefined, focusTick: s.focusTick + 1 }));
}

export function undoApplied() {
  board.undo();
  useAgent.setState({ run: null });
}

/** Leaving the board cancels the run; partial ideas are dropped (PRD 9). */
export function resetAgent() {
  cancelRun(false);
  useAgent.setState({ run: null, toast: false, clarified: undefined, open: false, log: [], session: null });
}
