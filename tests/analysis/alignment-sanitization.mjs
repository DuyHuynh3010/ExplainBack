/** Hand-authored biology/networking fixtures. Offline mechanics, not AI grading. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const require=createRequire(import.meta.url), load=p=>require(`../../test-results/analysis-build/${p}.js`);
const {importText}=load("backend/sources/ingest");
const {normalizeAnalysisDraft}=load("backend/analysis/normalize");
const {normalizeEvaluation,handleEvaluationRequest}=load("backend/explanations/evaluation");
const {sanitizeUnsupportedConceptAlignments}=load("backend/explanations/alignment-sanitization");
const {validateEvaluateTextResponse,validateDisplayEvaluateTextResponse}=load("backend/contracts/validate");
const {toComparisonFlow,ALL_TOPICS}=load("lib/comparison-graph");
const {createEvaluationCapture}=load("backend/analysis/diagnostics");
const dir=".explainback-artifacts/alignment-sanitization";
function fixture(domain="biology") {
  const frames=domain==="biology"?[["Glucose","stores","Chemical energy"],["Chlorophyll","absorbs","Light energy"]]:[["Router","forwards","Packets"],["Firewall","blocks","Traffic"]];
  const concepts=frames.flatMap(([s,,o],i)=>[{id:`s${i}`,name:s,aliases:[]},{id:`o${i}`,name:o,aliases:[]}]);
  const sentences=frames.map(([s,r,o])=>`${s} ${r} ${o.toLowerCase()}.`);
  const importedSource=importText(sentences.join("\n\n"));
  const reps=frames.map(([,r],i)=>({kind:"binary",subjectConceptId:`s${i}`,relation:r,objectConceptId:`o${i}`}));
  const statements=sentences.map((assertion,i)=>({id:`claim${i}`,topicId:`topic${i}`,assertion,representation:reps[i],negated:false,conditions:[],role:"fact",evidence:[{blockId:importedSource.document.blocks[i].id,quote:assertion}]}));
  const sourceAnalysis=normalizeAnalysisDraft(importedSource,{concepts,statements,topics:frames.map((_,i)=>({id:`topic${i}`,title:`${domain} ${i+1}`})),
    blockDispositions:importedSource.document.blocks.map(b=>({blockId:b.id,kind:"knowledge"})),lessonSections:statements.map(s=>({topicId:s.topicId,summary:s.assertion,statementIds:[s.id],keyPoints:[{text:s.assertion,statementIds:[s.id]}]}))});
  const input={schemaVersion:"2.0",importedSource,sourceAnalysis,topicIds:sourceAnalysis.graph.topics.map(t=>t.id),learner:{text:sentences.join("\n\n")}};
  const draft={concepts,claims:sentences.map((assertion,i)=>({id:`learner${i}`,assertion,quote:assertion,representation:reps[i],negated:false,conditions:[]})),
    comparisons:sourceAnalysis.graph.statements.map((s,i)=>({referenceRelationshipId:s.id,status:"correct",learnerClaimIds:[`learner${i}`],explanation:"Synthetic equivalent claim, not a model verdict.",suggestions:[]})),additionalIdeas:[]};
  const ref=id=>sourceAnalysis.graph.concepts.find(c=>c.name===concepts.find(c=>c.id===id).name).id;
  const alignment=(learnerConceptId,sourceConceptId=learnerConceptId)=>({learnerConceptId,referenceConceptId:ref(sourceConceptId),status:"matched",explanation:"Synthetic identity suggestion."});
  return {input,draft,alignment};
}
function normalize(input,draft){const removed=[];const evaluation=normalizeEvaluation(input,JSON.stringify(draft),undefined,issues=>removed.push(...issues));return{evaluation,removed};}
async function run(input,initial,patch){let calls=0,requests=[];const response=await handleEvaluationRequest(new Request("http://local/api/evaluations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)}),{async generate(r){requests.push(r);return {text:JSON.stringify(++calls===1?initial:patch),finishReason:"stop"};}});return{response,body:await response.json(),calls,requests};}
for(const domain of ["biology","network"])test(`${domain}: one unsupported optional mapping succeeds without repair; preserves claims/evidence/verdicts`,async()=>{
  const {input,draft,alignment}=fixture(domain),baseline=normalize(input,draft).evaluation;
  draft.conceptAlignments=[alignment("s0","s1")];const before=structuredClone({input,draft});
  const {evaluation,removed}=normalize(input,draft);
  assert.deepEqual(evaluation.conceptAlignments,[]);assert.equal(removed.length,1);assert.equal(removed[0].ruleId,"unsupported_concept_alignment");
  assert.deepEqual(evaluation.learnerGraph.statements.map(s=>[s.assertion,s.negated,s.conditions,s.formula]),baseline.learnerGraph.statements.map(s=>[s.assertion,s.negated,s.conditions,s.formula]));
  assert.deepEqual(evaluation.comparisons.map(c=>[c.status,c.explanation,c.referenceRelationshipId]),baseline.comparisons.map(c=>[c.status,c.explanation,c.referenceRelationshipId]));
  assert.deepEqual(evaluation.learnerGraph.evidence.map(e=>[e.quote,e.location,e.verification]),baseline.learnerGraph.evidence.map(e=>[e.quote,e.location,e.verification]));
  assert.deepEqual({input,draft},before);
  const r=await run(input,draft,{});assert.equal(r.response.status,200);assert.equal(r.calls,1);assert.equal(validateEvaluateTextResponse(input,r.body).valid,true);
});
test("valid identity uses any linked comparison, independent of topic/statement order; retain uncertain too",()=>{
  const {input,draft,alignment}=fixture();draft.comparisons.reverse();draft.claims.reverse();
  draft.conceptAlignments=[alignment("s0"),{...alignment("s1"),status:"uncertain"}];
  const {evaluation,removed}=normalize(input,draft);assert.equal(removed.length,0);assert.equal(evaluation.conceptAlignments.length,2);
  assert.deepEqual(evaluation.conceptAlignments.map(a=>a.referenceConceptId),draft.conceptAlignments.map(a=>a.referenceConceptId));
  const learnerIds=new Set(evaluation.learnerGraph.concepts.map(c=>c.id));assert.ok(evaluation.conceptAlignments.every(a=>learnerIds.has(a.learnerConceptId)));
  assert.ok(evaluation.learnerGraph.concepts.every(c=>!input.sourceAnalysis.graph.concepts.some(s=>s.id===c.id)));
});
test("multiple mappings remove only unsupported ones; sanitizer does not mutate or reallocate any data",()=>{
  const {input,draft,alignment}=fixture();const valid=normalize(input,draft).evaluation;
  const learner=name=>valid.learnerGraph.concepts.find(c=>c.name===name).id;
  valid.conceptAlignments=[{...alignment("s0"),learnerConceptId:learner("Glucose")},{...alignment("o0","s1"),learnerConceptId:learner("Chemical energy")},{...alignment("s1"),learnerConceptId:learner("Chlorophyll")}];
  const before=structuredClone(valid),checks=validateEvaluateTextResponse(input,{ok:true,schemaVersion:"2.0",data:valid});assert.equal(checks.valid,false);
  const sanitized=sanitizeUnsupportedConceptAlignments(input.sourceAnalysis.graph,valid,checks.issues);
  assert.equal(sanitized.removed.length,1);assert.deepEqual(sanitized.evaluation.conceptAlignments,[valid.conceptAlignments[0],valid.conceptAlignments[2]]);
  assert.equal(sanitized.evaluation.learnerGraph,valid.learnerGraph);assert.equal(sanitized.evaluation.comparisons,valid.comparisons);assert.equal(sanitized.evaluation.learnerDocument,valid.learnerDocument);
  assert.deepEqual(valid,before);assert.equal(validateEvaluateTextResponse(input,{ok:true,schemaVersion:"2.0",data:sanitized.evaluation}).valid,true);
});
test("unknown alignment IDs are removed and duplicate mappings keep the supported candidate without repair",async()=>{
  const {input,draft,alignment}=fixture();
  for(const invalid of [[{...alignment("s0"),learnerConceptId:"unknown"}],[{...alignment("s0"),referenceConceptId:"unknown"}],[alignment("s0"),alignment("s0","s1")]]){
    const d={...draft,conceptAlignments:invalid};
    const r=await run(input,d,{});assert.equal(r.response.status,200);assert.equal(r.calls,1);
    assert.equal(r.body.data.conceptAlignments.length,invalid.length===2?1:0);
    assert.equal(validateDisplayEvaluateTextResponse(input,r.body).valid,true);
  }
});
test("claim endpoint/polarity/evidence quality defects keep assertions and do not trigger repair",async()=>{
  const {input,draft,alignment}=fixture();
  for(const change of [d=>d.claims[0].quote="Fabricated quote.",d=>d.claims[0].representation.objectConceptId="unknown",d=>d.claims[0].negated=true]){
    const d=structuredClone(draft);d.conceptAlignments=[alignment("s0","s1")];change(d);
    const r=await run(input,d,{});assert.equal(r.response.status,200);assert.equal(r.calls,1);
    assert.deepEqual(r.body.data.learnerGraph.statements.map(s=>s.assertion),d.claims.map(c=>c.assertion));
    assert.equal(validateDisplayEvaluateTextResponse(input,r.body).valid,true);
  }
});
test("incomplete comparison coverage returns unchanged claims without requesting a patch",async()=>{
  const {input,draft,alignment}=fixture("network"),initial=structuredClone(draft);initial.comparisons.pop();
  const patch={comparisons:draft.comparisons,additionalIdeas:[],conceptAlignments:[alignment("s0","s1")]};
  const r=await run(input,initial,patch);assert.equal(r.response.status,200);assert.equal(r.calls,1);assert.deepEqual(r.body.data.conceptAlignments,[]);
  assert.equal(validateDisplayEvaluateTextResponse(input,r.body).valid,true);
  assert.equal(r.body.data.learnerGraph.statements.length,initial.claims.length);
  assert.equal(r.body.data.comparisons.length,initial.comparisons.length);
  const flow=toComparisonFlow(input.sourceAnalysis.graph,r.body.data,ALL_TOPICS);
  assert.ok(flow.details.some(d=>d.learner.length&&!d.comparison));
});
test("complex participant identity remains supported after remap",()=>{
  const {input,draft,alignment}=fixture();
  draft.claims[0].representation={kind:"complex",participants:[{conceptId:"s0",role:"subject"},{conceptId:"o0",role:"stored form"}]};
  draft.conceptAlignments=[alignment("o0")];const {evaluation,removed}=normalize(input,draft);
  assert.equal(removed.length,0);assert.equal(evaluation.conceptAlignments.length,1);
  const complexSource=structuredClone(input),s=complexSource.sourceAnalysis.graph.statements[0],r=s.representation;
  s.representation={kind:"complex",participants:[{conceptId:r.subjectConceptId,role:"subject"},{conceptId:r.objectConceptId,role:"stored form"}]};
  assert.equal(normalize(complexSource,draft).evaluation.conceptAlignments.length,1);
});
test("safe removal diagnostic and opt-in capture stay outside test-results; production capture is off",async()=>{
  const {input,draft,alignment}=fixture();draft.conceptAlignments=[alignment("s0","s1")];
  const log=[],original=console.info;
  try { console.info=(...args)=>log.push(args.join(" "));const r=await run(input,draft,{});assert.equal(r.calls,1); }finally{console.info=original;}
  const events=log.filter(s=>s.startsWith("[source-analysis] ")).map(s=>JSON.parse(s.slice("[source-analysis] ".length)));
  const removal=events.find(e=>e.stage==="evaluation_alignments_removed");
  assert.equal(removal.call,1);assert.equal(removal.droppedAlignments,1);
  assert.equal(removal.validationIssues[0].ruleId,"unsupported_concept_alignment");
  assert.ok(removal.validationIssues[0].ids.learnerConceptId);assert.ok(removal.validationIssues[0].ids.referenceConceptId);
  assert.ok(!events.some(e=>e.stage==="evaluation_repair_plan"));assert.ok(!log.join("\n").includes(input.learner.text));
  const env={NODE_ENV:process.env.NODE_ENV,EXPLAINBACK_EVALUATION_CAPTURE:process.env.EXPLAINBACK_EVALUATION_CAPTURE};
  try {
    process.env.NODE_ENV="development";process.env.EXPLAINBACK_EVALUATION_CAPTURE="1";
    const result=normalize(input,draft),capture={call:1,stage:"synthetic_sanitization",input,candidate:result.evaluation,alignmentSanitizations:result.removed};
    createEvaluationCapture("synthetic-sanitization")?.(capture);
    assert.deepEqual(JSON.parse(readFileSync(".explainback-artifacts/evaluations/synthetic-sanitization-call-1.json","utf8")),capture);
    process.env.NODE_ENV="production";assert.equal(createEvaluationCapture("synthetic-sanitization"),undefined);
  } finally { for(const [key,value] of Object.entries(env))if(value===undefined)delete process.env[key];else process.env[key]=value; }
});
test("same-label concepts without a supporting comparison stay separate in Compare; cache browser replay outside test-results",async()=>{
  const {input,draft,alignment}=fixture();input.learner.text="Glucose changes color.";
  draft.concepts=[draft.concepts[0],{id:"color",name:"Color",aliases:[]}];
  draft.claims=[{id:"outside",assertion:input.learner.text,quote:input.learner.text,negated:false,conditions:[],representation:{kind:"binary",subjectConceptId:"s0",relation:"changes",objectConceptId:"color"}}];
  draft.comparisons=draft.comparisons.map(c=>({...c,status:"missing",learnerClaimIds:[],explanation:"Not expressed here; no conclusion about understanding."}));
  draft.additionalIdeas=[{learnerClaimIds:["outside"],explanation:"Outside supplied source; ungraded."}];draft.conceptAlignments=[alignment("s0")];
  const r=await run(input,draft,{});assert.equal(r.calls,1);assert.equal(r.response.status,200);
  const evaluation=r.body.data,flow=toComparisonFlow(input.sourceAnalysis.graph,evaluation,ALL_TOPICS);
  const glucoseNodes=flow.nodes.filter(n=>n.data.label==="Glucose");assert.equal(glucoseNodes.length,2);
  assert.ok(glucoseNodes.every(n=>n.data.identities.length===1));
  mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/browser-fixture.json`,JSON.stringify({input,evaluation,provenance:"Synthetic sanitization fixture; no live AI"}));
});
