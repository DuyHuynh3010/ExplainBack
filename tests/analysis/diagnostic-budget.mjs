/** Offline transport guard regression. No SDK or external network is used. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
for (const [name, status, expected, maximum] of [["two-generation cap", 200, 2, 2], ["eight-generation cap", 200, 8, 8], ["stop on overload", 503, 1, 2], ["stop on quota", 429, 1, 2]]) test(`offline live guard: ${name}`, () => {
  const directory = path.resolve("test-results/extraction-quality-v2/guard", `${status}-${maximum}`);
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "budget.json");
  writeFileSync(file, JSON.stringify({ calls: 0, maxCalls: maximum, stopped: false, stopOnProviderError: true }));
  const result = spawnSync(process.execPath, ["-e", `
    let network = 0;
    global.fetch = async () => { network++; return Response.json({}, {status:${status}}); };
    require('./tests/analysis/live-budget.cjs');
    (async () => { for(let i=0;i<${maximum + 1};i++) try { await fetch('https://synthetic.invalid/:generateContent'); } catch {};
    console.log(network); })();
  `], { env: { ...process.env, EXPLAINBACK_LIVE_BUDGET_FILE: file }, encoding: "utf8" });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr); assert.equal(Number(result.stdout.trim()), expected);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).calls, expected);
});
