/** Document-wide limits; opt-in section processing shares these with evaluation. */
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
  // SDK sends this as X-Server-Timeout as well as using it for transport.
  // A real short extraction hit the former 25-second upstream deadline.
  callTimeoutMs: 60_000,
  totalTimeoutMs: 122_000,
  retryDelayMs: 250,
} as const;
