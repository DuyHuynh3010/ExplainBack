/** Synthetic, cross-domain repair regressions. No model verdict quality claims. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require=createRequire(import.meta.url),load=p=>require(`../../test-results/analysis-build/${p}.js`);
const {importText}=load("backend/sources/ingest");
const {normalizeAnalysisDraft}=load("backend/analysis/normalize");
const {normalizeEvaluation,handleEvaluationRequest}=load("backend/explanations/evaluation");
const {planScopedRepair,mergeScopedRepair}=load("backend/explanations/scoped-repair");
const {validateEvaluateTextResponse}=load("backend/contracts/validate");
const {diagnosticIssues}=load("backend/analysis/diagnostics");
const {toComparisonFlow}=load("lib/comparison-graph");

export function repairFixture(domain="network") {
  const subject=domain==="network"?"Connection":"Control ward",object=domain==="network"?"Failure":"Enemy turret";
  const sentence=`${subject} can cause ${object.toLowerCase()}.`;
  const importedSource=importText(sentence);
  const concepts=[{id:"agent",name:subject,aliases:[]},{id:"object",name:object,aliases:[]}];
  const representation={kind:"binary",subjectConceptId:"agent",relation:"can cause",objectConceptId:"object"};
  const sourceAnalysis=normalizeAnalysisDraft(importedSource,{topics:[{id:"t",title:domain}],concepts,statements:[{id:"s",topicId:"t",assertion:sentence,representation,negated:false,conditions:[],role:"fact",evidence:[{blockId:importedSource.document.blocks[0].id,quote:sentence}]}],
    blockDispositions:[{blockId:importedSource.document.blocks[0].id,kind:"knowledge"}],lessonSections:[{topicId:"t",summary:"Synthetic fixture only.",statementIds:["s"],keyPoints:[{text:sentence,statementIds:["s"]}]}]});
  const input={schemaVersion:"2.0",importedSource,sourceAnalysis,topicIds:sourceAnalysis.graph.topics.map(t=>t.id),learner:{text:sentence}};
  const draft={concepts,claims:[{id:"claim",assertion:sentence,quote:sentence,representation,negated:false,conditions:[],formula:"cause(agent, object)"}],
    comparisons:[{referenceRelationshipId:sourceAnalysis.graph.statements[0].id,status:"correct",learnerClaimIds:["claim"],explanation:"Synthetic linked claim.",suggestions:[]}],additionalIdeas:[]};
  return {input,draft};
}
const issuesOf=(input,draft)=>{try{normalizeEvaluation(input,JSON.stringify(draft));assert.fail("Must reject");}catch(e){assert.ok(e.issues);return e.issues;}};
async function run(input,initial,patch){let calls=0,requests=[];const response=await handleEvaluationRequest(new Request("http://local/api/evaluations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)}),{async generate(r){requests.push(r);return {text:JSON.stringify(++calls===1?initial:patch),finishReason:"stop"};}});return {response,body:await response.json(),calls,requests};}
for(const domain of ["network","game"])for(const kind of ["binary","complex"])test(`missing ${kind} learner reference is repaired from learner records/text only: ${domain}`,async()=>{
  const {input,draft}=repairFixture(domain),initial=structuredClone(draft),before=structuredClone(input);
  if(kind==="complex") initial.claims[0].representation={kind,participants:[{conceptId:"agent",role:"cause"},{conceptId:"object",role:"effect"}]};
  initial.concepts=initial.concepts.filter(c=>c.id!=="object");
  const issues=issuesOf(input,initial);
  assert.equal(issues[0].ruleId,"missing_learner_concept");assert.deepEqual(issues[0].ids,{conceptId:"object",learnerClaimId:"claim"});
  assert.match(issues[0].path,kind==="binary"?/objectConceptId$/:/participants\[1\]\.conceptId$/);
  const plan=planScopedRepair(input,initial,issues),patch={concepts:[draft.concepts[1]],claims:[{id:"claim",representation:initial.claims[0].representation}]};
  const merged=mergeScopedRepair(JSON.stringify(patch),plan);assert.deepEqual(merged.claims,initial.claims);
  const r=await run(input,initial,patch);assert.equal(r.response.status,200);assert.equal(r.calls,2);
  assert.equal(validateEvaluateTextResponse(input,r.body).valid,true);assert.deepEqual(input,before);
  assert.ok(r.body.data.learnerGraph.concepts.every(c=>!input.sourceAnalysis.graph.concepts.some(s=>s.id===c.id)));
  assert.equal(JSON.parse(r.requests[1].prompt).source,undefined); // extraction-only repair never receives source entities
});
test("missing concept can instead be resolved to an existing verified learner ID, never by label fallback",async()=>{
  const {input,draft}=repairFixture();const initial=structuredClone(draft);
  initial.claims[0].representation.objectConceptId=input.sourceAnalysis.graph.concepts[1].id;
  const r=await run(input,initial,{concepts:[],claims:[{id:"claim",representation:draft.claims[0].representation}]});
  assert.equal(r.calls,2);assert.equal(r.response.status,200);
});
test("missing reference and orphan coverage share ONE repair, with no automatic outside-source verdict",async()=>{
  const {input,draft}=repairFixture(),initial=structuredClone(draft);
  initial.concepts.pop();initial.comparisons[0]={...initial.comparisons[0],status:"uncertain",learnerClaimIds:[]};
  const r=await run(input,initial,{concepts:[draft.concepts[1]],claims:[{id:"claim",representation:draft.claims[0].representation}],comparisons:draft.comparisons,additionalIdeas:[],conceptAlignments:[]});
  assert.equal(r.response.status,200);assert.equal(r.calls,2);assert.deepEqual(JSON.parse(r.requests[1].prompt).repairKinds,["reference","alignment"]);
  assert.deepEqual(r.body.data.additionalIdeas,[]);assert.equal(r.body.data.comparisons[0].status,"correct");
});
test("representation repair remains bounded after optional unsupported alignment is sanitized",async()=>{
  const {input,draft}=repairFixture(),initial=structuredClone(draft),source=input.sourceAnalysis.graph;
  initial.claims[0].representation.objectConceptId="agent";
  // Existing but isolated concept is not present in the linked learner statement.
  initial.concepts.push({id:"other",name:"Unrelated observation",aliases:[]});
  initial.conceptAlignments=[{learnerConceptId:"other",referenceConceptId:source.concepts[1].id,status:"matched",explanation:"Unsupported synthetic suggestion."}];
  const issues=issuesOf(input,initial);
  assert.ok(issues.some(i=>i.ruleId==="literal_object_mismatch" && i.ids.learnerClaimId==="claim"));
  assert.ok(!issues.some(i=>i.ruleId==="unsupported_concept_alignment"));
  assert.match(JSON.stringify(diagnosticIssues(issues)),/literal subject\/predicate frame/);
  const patch={concepts:[],claims:[{id:"claim",representation:draft.claims[0].representation}]};
  const r=await run(input,initial,patch);assert.equal(r.response.status,200);assert.equal(r.calls,2);
  assert.deepEqual(r.body.data.conceptAlignments,[]);assert.equal(r.body.data.learnerGraph.concepts.length,3);
  assert.deepEqual(JSON.parse(r.requests[1].prompt).repairKinds,["representation"]);
  mkdirSync("test-results/learner-reference-repair",{recursive:true});
  writeFileSync("test-results/learner-reference-repair/browser-fixture.json",JSON.stringify({input,evaluation:r.body.data,provenance:"Synthetic mixed repair, not live AI"}));
  const flow=toComparisonFlow(input.sourceAnalysis.graph,r.body.data,input.topicIds[0]);
  assert.ok(flow.nodes.length>=4); // no identity coalescence from removed suggestion
});
test("wrong/modal claims, good records, formula and quotes remain frozen in a mixed patch",async()=>{
  const {input,draft}=repairFixture();input.learner.text+=" I am not sure whether the connection works.";
  const initial=structuredClone(draft);
  initial.claims.push({id:"modal",assertion:"I am not sure whether the connection works.",quote:"I am not sure whether the connection works.",negated:false,conditions:["not sure whether"],representation:{kind:"complex",participants:[{conceptId:"agent",role:"uncertain subject"}]}});
  initial.additionalIdeas=[{learnerClaimIds:["modal"],explanation:"Outside supplied claim, ungraded."}];
  initial.claims[0].representation.objectConceptId="missing";
  const issues=issuesOf(input,initial),plan=planScopedRepair(input,initial,issues);
  const patch={concepts:[],claims:[{id:"claim",representation:draft.claims[0].representation}]};
  const merged=mergeScopedRepair(JSON.stringify(patch),plan);
  assert.deepEqual(merged.claims[1],initial.claims[1]);assert.deepEqual(merged.concepts,initial.concepts);
  for(const field of ["quote","assertion","negated","formula","conditions"])assert.deepEqual(merged.claims[0][field],initial.claims[0][field]);
});
test("no-op, locked-field mutation, unresolved added concept and fabricated quote still fail within two calls",async()=>{
  const {input,draft}=repairFixture(),initial=structuredClone(draft);initial.claims[0].representation.objectConceptId="unknown";
  for(const patch of [{concepts:[],claims:[{id:"claim",representation:initial.claims[0].representation}]},{concepts:[],claims:[{id:"claim",representation:draft.claims[0].representation,assertion:"Corrected knowledge"}]},{concepts:[],claims:[{id:"unrequested",representation:draft.claims[0].representation}]}]){
    const r=await run(input,initial,patch);assert.equal(r.calls,2);assert.equal(r.response.status,502);assert.ok(r.body.error.details.length);
  }
  const invalid=structuredClone(initial);invalid.claims[0].quote="Not in input.";
  const r=await run(input,invalid,{});assert.equal(r.calls,1);assert.equal(r.response.status,502);
});
