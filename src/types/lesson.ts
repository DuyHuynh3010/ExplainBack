export type Status = "correct" | "partial" | "missing" | "contradicted";
export type Step = 1 | 2 | 3 | 4;
export interface Relationship {
  id: string;
  source: string;
  target: string;
  label: string;
  expected: string;
  status: Status;
  statement: string | null;
  quote: string;
  explanation: string;
}
