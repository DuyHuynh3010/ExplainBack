/** Shared browser/server limits. Deployments must allow a 60-second AI call. */
export const EXPLANATION_LIMITS = {
  audioBytes: 3_000_000,
  audioRequestBytes: 3_065_536,
  audioSeconds: 120,
  learnerCharacters: 10_000,
  evaluationRequestBytes: 1_000_000,
  timeoutMs: 60_000,
  outputTokens: 8192,
} as const;
