"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildRunReport}=require("../run-report");
test("report separates completed provider from acceptance and isolates project",async()=>{
  const store={
    getRun:async()=>({id:"run-1",taskId:"task-1",status:"completed",metadata:{resolution:{outcome:{state:"needs-review"}},evidencePolicyVersion:1,semanticTask:{acceptanceCriteria:["works"]}}}),
    getTask:async()=>({id:"task-1",projectId:"project-1"}),
    listVerifications:async()=>[{id:"v1",runId:"run-1",status:"passed",checks:[{name:"test",exitCode:0,stdout:"secret-output",command:"private-command"}]}],
    listEvidence:async()=>[{taskId:"task-1",runId:"run-1",verificationId:"v1",producer:"AGENT_REPORTED",content:"secret-evidence"}],
    listRunSubmissions:async()=>[{id:"s1",runId:"run-1",status:"RECONCILIATION_REQUIRED"}]
  };
  const report=await buildRunReport({store,runId:"run-1",projectId:"project-1"});
  assert.equal(report.assessment,"REVIEW_REQUIRED");
  assert.equal(report.evidence.reported,1);
  assert.ok(report.blockers.some(row=>row.code==="CRITERION_PROOF_MISSING"));
  assert.ok(report.blockers.some(row=>row.code==="LEASE_RECONCILIATION_REQUIRED"));
  assert.doesNotMatch(JSON.stringify(report),/secret-output|private-command|secret-evidence/);
  assert.equal(await buildRunReport({store,runId:"run-1",projectId:"project-2"}),null);
});
