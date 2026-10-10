"use client";
import { useEffect, useRef, useState } from "react";
import type { ImportedSource, SourceAnalysis } from "@/backend/contracts/domain";
import { importLearningSource, type SourceInputPayload } from "./source-ingestion";
import { analyzeLearningSource } from "./source-analysis";

export type SourcePhase = "idle" | "importing" | "analyzing";

/** In-memory session only. Revision checks also protect against transports ignoring abort. */
export function useSourceAnalysis() {
  const [importedSource, setImportedSource] = useState<ImportedSource | null>(null);
  const [analysis, setAnalysis] = useState<SourceAnalysis | null>(null);
  const [phase, setPhase] = useState<SourcePhase>("idle");
  const [error, setError] = useState("");
  const imported = useRef<ImportedSource | null>(null);
  const completed = useRef<SourceAnalysis | null>(null);
  const revision = useRef(0);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => { revision.current++; active.current?.abort(); }, []);

  function cancel() {
    revision.current++;
    active.current?.abort();
    active.current = null;
    setPhase("idle");
    setError("");
  }
  function invalidate() {
    cancel();
    imported.current = null;
    completed.current = null;
    setImportedSource(null);
    setAnalysis(null);
  }
  async function run(payload: SourceInputPayload): Promise<boolean> {
    if (active.current) return false;
    if (completed.current) return true;
    const controller = new AbortController();
    active.current = controller;
    const version = revision.current;
    const current = () => revision.current === version && !controller.signal.aborted;
    setError("");
    try {
      let source = imported.current;
      if (!source) {
        setPhase("importing");
        source = await importLearningSource(payload, controller.signal);
        if (!current()) return false;
        imported.current = source;
        setImportedSource(source);
      }
      setPhase("analyzing");
      const result = await analyzeLearningSource(source, controller.signal);
      if (!current()) return false;
      completed.current = result;
      setAnalysis(result);
      return true;
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : "Source processing failed. Please try again.");
      return false;
    } finally {
      if (current()) { active.current = null; setPhase("idle"); }
    }
  }
  return { importedSource, analysis, phase, error, run, cancel, invalidate };
}
