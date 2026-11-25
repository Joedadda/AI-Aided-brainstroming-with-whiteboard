// The models the prototype calls at runtime. Change them here only.
// Chat starts small. Move it to Sonnet if replies read thin.
export const MODELS = {
  chat: 'claude-haiku-5-5',
  report: 'claude-sonnet-5-5',
} as const;

export const MAX_TOKENS = {
  chat: 1024,
  report: 4096,
} as const;
