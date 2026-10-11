/** Opt-in local diagnostic transport guard, loaded with NODE_OPTIONS --require.
 * State persists across Next worker restarts. Never reset it during a live session.
 * No changes to model, key, provider request, retry or response content. */
const fs = require("node:fs");
const path = require("node:path");
const statePath = process.env.EXPLAINBACK_LIVE_BUDGET_FILE;
if (statePath) {
  const transport = globalThis.fetch;
  globalThis.fetch = async function guardedFetch(url, options) {
    if (!String(url instanceof Request ? url.url : url).includes(":generateContent")) return transport(url, options);
    const lockPath = `${statePath}.lock`;
    let lock;
    try { lock = fs.openSync(lockPath, "wx"); } catch { throw new Error("Live diagnostic forbids parallel generations."); }
    let state;
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      if (state.stopped || state.calls >= 4) throw new Error("Live diagnostic generation budget exhausted or stopped by quota.");
      state.calls++; fs.writeFileSync(statePath, JSON.stringify(state));
      const started = Date.now(), response = await transport(url, options);
      const body = await response.clone().json().catch(() => null);
      if (response.status === 429) { state.stopped = true; fs.writeFileSync(statePath, JSON.stringify(state)); }
      // Only successful candidate content and whitelisted quota fields are captured.
      const artifact = { call: state.calls, status: response.status, elapsedMs: Date.now() - started,
        retryAfter: response.headers.get("retry-after"),
        ...(response.ok ? { candidates: body?.candidates, usageMetadata: body?.usageMetadata } : {
          upstreamCode: body?.error?.status,
          quota: body?.error?.details?.map(d => ({ violations: d.violations?.map(v => ({ metric: v.quotaMetric, limit: v.quotaId })), retryDelay: d.retryDelay })),
        }),
      };
      fs.writeFileSync(path.join(path.dirname(statePath), `generation-${state.calls}.json`), JSON.stringify(artifact, null, 2));
      return response;
    } finally { if (lock !== undefined) { fs.closeSync(lock); fs.unlinkSync(lockPath); } }
  };
}
