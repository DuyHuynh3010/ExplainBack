/** Conservative one-request scope. Reject larger inputs; no batching or truncation. */
export const ANALYSIS_LIMITS = {
  requestBytes: 1_000_000,
  sourceCharacters: 20_000,
  blocks: 120,
  topics: 12,
  concepts: 100,
  statements: 120,
  evidencePerStatement: 4,
  keyPointsPerTopic: 20,
  outputCharacters: 100_000,
  outputTokens: 8_192,
  maxCalls: 2,
  callTimeoutMs: 25_000,
  totalTimeoutMs: 52_000,
  retryDelayMs: 250,
} as const;
