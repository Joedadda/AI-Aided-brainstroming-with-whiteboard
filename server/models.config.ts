// Models served by Sarvam Token Factory (Build PRD 13.1). Model IDs live here and nowhere else.
// GET /v2/models is the source of truth: `npm run check:models` compares it with this file.
export const MODELS = {
  gemma: 'gemma4',
  glm: 'glm5.3-flash',
  deepseek: 'deepseekv4.1-flash-1017', // DeepSeek V4.1 Flash 1017, Standard endpoint (not -interactive)
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/** What a task wants. Each model maps it to the setting it actually supports (below). */
export type Reasoning = 'off' | 'low' | 'on';

/**
 * Sarvam's top-level `reasoning_effort` per model and wish (docs, models page).
 * `undefined` means "send nothing" (the model's default).
 * Reasoning tokens are billed as output and count against max_tokens.
 */
export const REASONING_EFFORT: Record<ModelId, Record<Reasoning, string | undefined>> = {
  // Off by default; turned on with an effort level.
  gemma4: { off: undefined, low: 'low', on: 'high' },
  // Cannot be turned off: the lowest setting is 'low'. Tasks that ask for 'off' get 'low'
  // and a tight max_tokens (see TASKS) so reasoning cannot run away.
  'glm5.3-flash': { off: 'low', low: 'low', on: 'high' },
  // Turned off with 'none'.
  'deepseekv4.1-flash-1017': { off: 'none', low: 'low', on: 'high' },
};

export interface TaskConfig {
  primary: ModelId;
  fallback: ModelId;
  reasoning: Reasoning;
  /** Includes any reasoning tokens. If reasoning uses it all, the reply is empty and the fallback runs. */
  maxTokens: number;
  /** Sampling temperature, when the task wants one. */
  temperature?: number;
}

// The glm5.3-flash tasks below still reason at 'low', so their limits leave room for that
// on top of the short answer; they stay low enough that reasoning cannot run away.
export const TASKS = {
  title: { primary: MODELS.glm, fallback: MODELS.gemma, reasoning: 'off', maxTokens: 500 },
  largeIdea: { primary: MODELS.glm, fallback: MODELS.gemma, reasoning: 'off', maxTokens: 600 },
  linkSummary: { primary: MODELS.glm, fallback: MODELS.gemma, reasoning: 'off', maxTokens: 700 },
  textCondense: { primary: MODELS.glm, fallback: MODELS.gemma, reasoning: 'off', maxTokens: 700 },
  suggestions: { primary: MODELS.glm, fallback: MODELS.gemma, reasoning: 'off', maxTokens: 900 },
  explain: { primary: MODELS.glm, fallback: MODELS.gemma, reasoning: 'off', maxTokens: 700 },
  // 24 Nov, after the five-prompt comparison (docs/model-comparison.md): DeepSeek kept citations
  // accurate on selected notes; glm5.3-flash was much sharper than gemma4 in chat. gemma4 is the fast fallback.
  opinion: { primary: MODELS.deepseek, fallback: MODELS.gemma, reasoning: 'off', maxTokens: 800 },
  canvasChat: { primary: MODELS.glm, fallback: MODELS.gemma, reasoning: 'off', maxTokens: 1200 },
  makeReport: { primary: MODELS.deepseek, fallback: MODELS.glm, reasoning: 'on', maxTokens: 6000 },
  // Meeting addendum 4. Condense makes the chip title and summary; session builds the draft.
  meetingCondense: { primary: MODELS.glm, fallback: MODELS.gemma, reasoning: 'off', maxTokens: 700 },
  // DeepSeek with reasoning off (reasoning bills as output). glm5.3-flash cannot go below 'low'.
  meetingSession: { primary: MODELS.deepseek, fallback: MODELS.glm, reasoning: 'off', maxTokens: 3500, temperature: 0.3 },
  // Whiteboard agent (Whiteboard_Agent_PRD 6.2). The plan is one structured call; ideas are 3 parallel calls.
  agentPlan: { primary: MODELS.deepseek, fallback: MODELS.glm, reasoning: 'off', maxTokens: 3500, temperature: 0.2 },
  agentIdeas: { primary: MODELS.glm, fallback: MODELS.gemma, reasoning: 'low', maxTokens: 600 },
  imageParse: { primary: MODELS.gemma, fallback: MODELS.glm, reasoning: 'off', maxTokens: 400 }, // later
} satisfies Record<string, TaskConfig>;

export type Task = keyof typeof TASKS;
