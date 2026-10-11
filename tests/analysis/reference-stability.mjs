/** Synthetic cross-domain regression; no real model verdicts or network calls. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { topicSource, partDraft } from "./topic-processing-fixture.mjs";
const require = createRequire(import.meta.url), load = p => require(`../../test-results/analysis-build/${p}.js`);
const { resolveDraftConcepts } = load("backend/analysis/concept-catalog");
const { namespacePart, mergePartDrafts, validateSectionRequest, analyzeNextPart } = load("backend/analysis/section-pipeline");
const { importText } = load("backend/sources/ingest");
const { normalizeAnalysisDraft } = load("backend/analysis/normalize");
const { normalizeEvaluation, handleEvaluationRequest } = load("backend/explanations/evaluation");
const { planAlignmentRepair, mergeAlignmentRepair } = load("backend/explanations/alignment-repair");
const { diagnosticIssues, diagnosticDetails, createAnalysisCapture, createEvaluationCapture } = load("backend/analysis/diagnostics");
const { validateEvaluateTextResponse } = load("backend/contracts/validate");

function bare(representation) {
  return { concepts: [], topics: [], statements: [{ id: "claim", representation }], lessonSections: [], blockDispositions: [] };
}
const catalog = [{ id: "part-1:router", name: "Router", aliases: ["Gateway"] }, { id: "part-1:packet", name: "Packets", aliases: [] }];
for (const representation of [
  { kind: "binary", subjectConceptId: catalog[0].id, relation: "forwards", objectConceptId: catalog[1].id },
  { kind: "complex", participants: catalog.map(c => ({ conceptId: c.id, role: "participant" })) },
]) test(`exact catalog materialization: ${representation.kind}, namespace and merge own their records`, () => {
  const d = bare(representation), before = structuredClone({ d, catalog });
  const resolved = resolveDraftConcepts(d, catalog), part = namespacePart(d, { id: "part-2" }, catalog);
  assert.deepEqual(resolved.concepts, catalog); assert.deepEqual(part.concepts, catalog);
  assert.deepEqual(part.statements[0].representation, representation);
  const combined = mergePartDrafts([{ draft: { ...bare(representation), concepts: catalog } }, { draft: part }]);
  assert.deepEqual(combined.concepts, catalog); assert.deepEqual({ d, catalog }, before);
  resolved.concepts[0].aliases.push("Local mutation"); assert.deepEqual({ d, catalog }, before);
});
test("unknown IDs and identity conflicts retain concrete path/ID/catalog diagnostics", () => {
  for (const r of [{ kind: "binary", subjectConceptId: catalog[0].id, relation: "forwards", objectConceptId: "missing" }, { kind: "complex", participants: [{ conceptId: "missing", role: "object" }] }]) {
    assert.throws(() => resolveDraftConcepts(bare(r), catalog), e => {
      const i=e.issues[0]; assert.equal(i.ruleId,"missing_concept"); assert.equal(i.ids.conceptId,"missing"); assert.equal(i.catalogFound,false);
      assert.equal(i.path, r.kind === "binary" ? "$.statements[0].representation.objectConceptId" : "$.statements[0].representation.participants[0].conceptId");
      assert.match(diagnosticDetails(e.issues)[0].message,/missing_concept/); return true;
    });
  }
  const d=bare({kind:"binary",subjectConceptId:catalog[0].id,relation:"forwards",objectConceptId:catalog[1].id});
  d.concepts=[{...catalog[0],name:"Unrelated firewall"}];
  assert.throws(()=>resolveDraftConcepts(d,catalog),e=>e.issues[0].ruleId==="concept_identity_conflict" && e.issues[0].catalogFound);
});
test("checkpoint resume can omit used catalog records without mutating checkpoints or changing IDs", async () => {
  const source=importText(topicSource), body=(completedParts=[],callsUsed=0)=>({schemaVersion:"2.0",importedSource:source,processing:{completedParts,callsUsed}});
  const provider={async generate(r){return {text:JSON.stringify(partDraft(r)),finishReason:"stop"};}};
  const first=await analyzeNextPart(validateSectionRequest(body()),provider), checkpoints=[first.data.part], before=structuredClone(checkpoints);
  const next=await analyzeNextPart(validateSectionRequest(body(checkpoints,1)),{async generate(r){
    const d=partDraft(r), known=new Set(JSON.parse(r.prompt).section.canonicalConcepts.map(c=>c.id));
    assert.ok(known.size); d.concepts=d.concepts.filter(c=>!known.has(c.id));
    return {text:JSON.stringify(d),finishReason:"stop"};
  }});
  assert.equal(next.callsUsed,2); assert.deepEqual(checkpoints,before);
  assert.doesNotThrow(()=>validateSectionRequest(body([...checkpoints,next.data.part],2)));
  assert.deepEqual(checkpoints[0].draft.statements.map(s=>s.id),before[0].draft.statements.map(s=>s.id));
});

function networking() {
  const importedSource=importText("Router forwards packets.\n\nFirewall blocks traffic.");
  const concepts=[{id:"router",name:"Router",aliases:[]},{id:"packets",name:"Packets",aliases:[]},{id:"firewall",name:"Firewall",aliases:[]},{id:"traffic",name:"Traffic",aliases:[]}];
  const statements=importedSource.document.blocks.map((b,i)=>({id:`s${i}`,topicId:"network",assertion:b.text,negated:false,conditions:[],role:"fact",representation:{kind:"binary",subjectConceptId:i?"firewall":"router",relation:i?"blocks":"forwards",objectConceptId:i?"traffic":"packets"},evidence:[{blockId:b.id,quote:b.text}]}));
  const sourceAnalysis=normalizeAnalysisDraft(importedSource,{topics:[{id:"network",title:"Networking"}],concepts,statements,blockDispositions:importedSource.document.blocks.map(b=>({blockId:b.id,kind:"knowledge"})),lessonSections:[{topicId:"network",summary:"Synthetic networking fixture.",statementIds:statements.map(s=>s.id),keyPoints:statements.map(s=>({text:s.assertion,statementIds:[s.id]}))}]});
  const text="Router does not forward packets. Firewall might block traffic. Some routers are blue.";
  const input={schemaVersion:"2.0",importedSource,sourceAnalysis,topicIds:sourceAnalysis.graph.topics.map(t=>t.id),learner:{text}};
  const claims=[{id:"wrong",assertion:"Router does not forward packets.",quote:"Router does not forward packets.",negated:true,conditions:[],formula:"NOT forwards(router, packets)",representation:{kind:"binary",subjectConceptId:"router",relation:"forwards",objectConceptId:"packets"}},
    {id:"modal",assertion:"Firewall might block traffic.",quote:"Firewall might block traffic.",negated:false,conditions:["might"],representation:{kind:"complex",participants:[{conceptId:"firewall",role:"possible agent"},{conceptId:"traffic",role:"possible object"}]}},
    {id:"outside",assertion:"Some routers are blue.",quote:"Some routers are blue.",negated:false,conditions:["some"],representation:{kind:"complex",participants:[{conceptId:"router",role:"qualified subject"}]}}];
  const comparisons=sourceAnalysis.graph.statements.map((s,i)=>({referenceRelationshipId:s.id,status:i?"uncertain":"contradicted",learnerClaimIds:[i?"modal":"wrong"],explanation:i?"The learner expresses uncertainty.":"The learner denies forwarding.",suggestions:[]}));
  const valid={concepts,claims,comparisons,additionalIdeas:[{learnerClaimIds:["outside"],explanation:"Color is outside this lesson; ungraded."}]};
  return {input,valid};
}
function issueOf(f,d){try{normalizeEvaluation(f.input,JSON.stringify(d));assert.fail("Must reject");}catch(e){assert.ok(e.issues);return e.issues;}}
const request=input=>new Request("http://local/api/evaluations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)});
async function run(f,d,patch,maximum=2){let calls=0,requests=[];const response=await handleEvaluationRequest(request(f.input),{async generate(r){requests.push(r);calls++;return {text:JSON.stringify(calls===1?d:patch),finishReason:"stop"};}},maximum);return {response,body:await response.json(),calls,requests};}
for (const target of ["comparison","additional"]) test(`orphan repair into ${target} preserves wrong/modal claims, formula, quotes and source`,async()=>{
  const f=networking(),d=structuredClone(f.valid),before=structuredClone(f.input);
  if(target==="comparison"){d.comparisons[0]={...d.comparisons[0],status:"uncertain",learnerClaimIds:[]};}else d.additionalIdeas=[];
  const issues=issueOf(f,d),plan=planAlignmentRepair(f.input,d,issues);
  assert.deepEqual(plan.orphanClaimIds,[target==="comparison"?"wrong":"outside"]);
  assert.ok(issues.some(i=>i.ruleId==="unclassified_learner_claim" && i.ids.learnerClaimId));
  const patch={comparisons:f.valid.comparisons,additionalIdeas:f.valid.additionalIdeas,conceptAlignments:[]};
  const merged=mergeAlignmentRepair(JSON.stringify(patch),plan); assert.deepEqual(merged.claims,d.claims); assert.deepEqual(merged.concepts,d.concepts);
  const {response,body,calls,requests}=await run(f,d,patch);assert.equal(response.status,200);assert.equal(calls,2);
  assert.deepEqual(f.input,before);assert.equal(body.data.sourceAnalysisId,f.input.sourceAnalysis.id);
  assert.equal(validateEvaluateTextResponse(f.input,body).valid,true);
  assert.deepEqual(body.data.learnerGraph.statements.map(s=>[s.assertion,s.negated,s.formula,s.conditions]),d.claims.map(s=>[s.assertion,s.negated,s.formula,s.conditions]));
  assert.deepEqual(JSON.parse(requests[1].prompt).orphanClaimIds,plan.orphanClaimIds);
});
test("unsupported/unknown alignment references can be repaired without changing extraction",async()=>{
  const f=networking(),d=structuredClone(f.valid);d.conceptAlignments=[{learnerConceptId:"unknown",referenceConceptId:f.input.sourceAnalysis.graph.concepts[0].id,status:"matched",explanation:"Synthetic invalid alignment."}];
  const r=await run(f,d,{comparisons:f.valid.comparisons,additionalIdeas:f.valid.additionalIdeas,conceptAlignments:[]});
  assert.equal(r.response.status,200);assert.equal(r.calls,2);
});
test("frozen-field injection is rejected; no third generation when patch retains missing coverage",async()=>{
  const f=networking(),d=structuredClone(f.valid);d.additionalIdeas=[];
  for(const change of [p=>p.claims=f.valid.claims,p=>p.concepts=f.valid.concepts,p=>p.sourceAnalysis=f.input.sourceAnalysis,p=>p.comparisons[0].quote="invented"]){
    const patch={comparisons:structuredClone(f.valid.comparisons),additionalIdeas:f.valid.additionalIdeas};change(patch);
    const r=await run(f,d,patch);assert.equal(r.response.status,502);assert.equal(r.calls,2);
  }
  const r=await run(f,d,{comparisons:d.comparisons,additionalIdeas:[]});assert.equal(r.response.status,502);assert.equal(r.calls,2);assert.match(r.body.error.details[0].message,/unclassified_learner_claim/);
  assert.equal((await run(f,d,{},1)).calls,1);
});
test("mixed representation and coverage use one complete scoped patch within two calls",async()=>{
  const f=networking(),d=structuredClone(f.valid);d.additionalIdeas=[];
  d.claims[0].representation.objectConceptId="router";
  const patch={concepts:[],claims:[{id:"wrong",representation:f.valid.claims[0].representation}],comparisons:f.valid.comparisons,additionalIdeas:f.valid.additionalIdeas,conceptAlignments:[]};
  const r=await run(f,d,patch);
  assert.equal(r.response.status,200);assert.equal(r.calls,2);assert.deepEqual(JSON.parse(r.requests[1].prompt).repairKinds,["representation","alignment"]);
  const incomplete=await run(f,d,{...patch,additionalIdeas:[]});
  assert.equal(incomplete.response.status,502);assert.equal(incomplete.calls,2);assert.match(incomplete.body.error.details[0].message,/unclassified_learner_claim/);
});
test("evidence failures never become alignment retries; diagnostics don't copy untrusted messages",async()=>{
  const f=networking(),d=structuredClone(f.valid);d.claims[0].quote="Invented quote.";
  const r=await run(f,d,{});assert.equal(r.response.status,502);assert.equal(r.calls,1);
  assert.ok(!JSON.stringify(diagnosticIssues([{path:"$",code:"invariant",message:"Sensitive input text"}])).includes("Sensitive"));
  const env={...process.env};try{
    process.env.NODE_ENV="development";delete process.env.EXPLAINBACK_ANALYSIS_CAPTURE;delete process.env.EXPLAINBACK_EVALUATION_CAPTURE;
    assert.equal(createAnalysisCapture("probe"),undefined);assert.equal(createEvaluationCapture("probe"),undefined);
    process.env.EXPLAINBACK_ANALYSIS_CAPTURE="1";process.env.EXPLAINBACK_EVALUATION_CAPTURE="1";
    assert.equal(typeof createAnalysisCapture("probe"),"function");assert.equal(typeof createEvaluationCapture("probe"),"function");
    process.env.NODE_ENV="production";
    assert.equal(createAnalysisCapture("probe"),undefined);assert.equal(createEvaluationCapture("probe"),undefined);
  }finally{for(const k of ["NODE_ENV","EXPLAINBACK_ANALYSIS_CAPTURE","EXPLAINBACK_EVALUATION_CAPTURE"])if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}
});

const liveDir="test-results/reference-stability";
const read=file=>JSON.parse(readFileSync(`${liveDir}/${file}`,"utf8"));
const generated=call=>read(`generation-${call}.json`).candidates[0].content.parts.filter(p=>p.text&&!p.thought).map(p=>p.text).join("");
test("unchanged real biology initial+alignment patch replay with frozen learner extraction",async t=>{
  if(!existsSync(`${liveDir}/biology-live-response.json`))return t.skip("Private live artifacts unavailable.");
  const input=read("biology-input.json"),initial=JSON.parse(generated(1));let issues;
  try{normalizeEvaluation(input,generated(1));}catch(e){issues=e.issues;}
  assert.ok(issues.every(i=>i.ruleId==="unclassified_reference_statement"));
  const plan=planAlignmentRepair(input,initial,issues),merged=mergeAlignmentRepair(generated(2),plan);
  assert.deepEqual(merged.claims,initial.claims);assert.deepEqual(merged.concepts,initial.concepts);
  let calls=0;
  const response=await handleEvaluationRequest(request(input),{async generate(){return {text:generated(++calls),finishReason:"stop"};}});
  const body=await response.json();assert.equal(response.status,200);assert.equal(calls,2);assert.equal(validateEvaluateTextResponse(input,body).valid,true);
  assert.deepEqual(body.data.comparisons.map(c=>c.status),read("biology-live-response.json").body.data.comparisons.map(c=>c.status));
});
test("unchanged real esports missing-concept failure gets one scoped repair and complete validated analysis",async t=>{
  if(!existsSync(`${liveDir}/esports-live-response.json`))return t.skip("Private live artifacts unavailable.");
  const input=read("esports-input.json"),initial=JSON.parse(generated(3));
  assert.throws(()=>resolveDraftConcepts(initial),e=>e.issues.some(i=>i.ruleId==="missing_concept"&&i.path.endsWith("objectConceptId")&&i.catalogFound===false));
  let calls=0;const result=await analyzeNextPart(validateSectionRequest(input),{async generate(r){calls++;
    if(calls===2){const p=JSON.parse(r.prompt);assert.equal(p.repair.statements.length,1);assert.equal(p.repair.issues[0].ruleId,"missing_concept");}
    return {text:generated(calls+2),finishReason:"stop"};
  }});
  const saved=read("esports-live-response.json").body.data;
  assert.equal(calls,2);assert.equal(result.data.graph.topics.length,3);assert.equal(result.data.graph.statements.length,27);
  assert.deepEqual(result.data.document,input.importedSource.document);
  assert.deepEqual(result.data.graph.statements.map(s=>s.assertion),saved.graph.statements.map(s=>s.assertion));
});
