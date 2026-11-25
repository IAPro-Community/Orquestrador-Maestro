"use strict";
const { sanitizeDiagnostic } = require("../telemetry/diagnostic-sanitizer");
const safe = (value, maxChars = 128) => typeof value === "string" ? sanitizeDiagnostic(value, {maxChars}) : null;
const active = new Set(["pending", "running", "queued"]);
async function buildRunReport({ store, runId, projectId }) {
  const run = await store.getRun(runId);
  if (!run) return null;
  const task = await store.getTask(run.taskId);
  if (!task || task.projectId !== projectId) return null;
  const [checks, evidence, submissions] = await Promise.all([
    store.listVerifications({runId}), store.listEvidence({runId}), store.listRunSubmissions({projectId})
  ]);
  const linked = submissions.filter(row => row.runId === runId || Object.values(row.taskRuns || {}).includes(runId));
  const verification = checks.length === 1 && checks[0].runId === runId ? checks[0] : null;
  const outcome = run.metadata?.resolution?.outcome || null;
  const integrity = verification?.metadata?.inputIntegrity;
  const reasons = [];
  if (linked.some(row => row.status === "RECONCILIATION_REQUIRED" ||
      (["CLAIMED","DISPATCHED","CANCEL_REQUESTED"].includes(row.status) &&
      Date.parse(row.leaseExpiresAt || "") <= Date.now()))) {
    reasons.push({code:"LEASE_RECONCILIATION_REQUIRED", action:"Inspect admissions and reconcile expired leases; never redispatch uncertain work."});
  }
  if (linked.length > 1) reasons.push({code:"AMBIGUOUS_SUBMISSION",action:"Inspect canonical Run bindings before accepting results."});
  if (active.has(run.status)) reasons.push({code:"RUN_NOT_TERMINAL",action:"Inspect active worker/provider; do not assume completion."});
  else if (run.status !== "completed") reasons.push({code:"RUN_NOT_COMPLETED",action:"Review failure or cancellation and request approval for a new submission if needed."});
  if (checks.length > 1) reasons.push({code:"AMBIGUOUS_VERIFICATION",action:"Resolve conflicting verification records."});
  else if (!verification) reasons.push({code:"VERIFICATION_MISSING",action:"Obtain canonical verification evidence."});
  else if (integrity?.status === "DRIFT_DETECTED") reasons.push({code:"VERIFICATION_INPUT_DRIFT",action:"Review changed verifier inputs and obtain fresh approval."});
  else if (verification.status !== "passed" && verification.metadata?.applicability !== "not_applicable") reasons.push({code:"VERIFICATION_NOT_PASSED",action:"Inspect failing or skipped checks."});
  if (outcome?.state !== "validated") reasons.push({code:"ACCEPTANCE_NOT_VALIDATED",action:"Review criteria and independent evidence; a completed provider is not proof."});
  const counts = {reported:0, deterministic:0, unclassified:0};
  for (const item of evidence) {
    if (item.runId !== runId || item.taskId !== task.id || !verification || item.verificationId !== verification.id) continue;
    if (["REQUEST_REPORTED","AGENT_REPORTED"].includes(item.producer)) counts.reported++;
    else if (item.producer === "DETERMINISTIC_VERIFIED" && item.metadata?.provenance === "DETERMINISTIC_VERIFIED" && run.metadata?.evidencePolicyVersion === 1) counts.deterministic++;
    else counts.unclassified++;
  }
  if (run.metadata?.evidencePolicyVersion === 1 && counts.deterministic === 0 && (run.metadata?.semanticTask?.acceptanceCriteria || []).length) reasons.push({code:"CRITERION_PROOF_MISSING", action:"Independent per-criterion proof is not available; do not treat this run as certified."});
  return Object.freeze({
    schemaVersion:1, authority:"MAESTRO", readOnly:true, executionEnabled:false,
    runId:safe(run.id), taskId:safe(task.id), status:safe(run.status), provider:safe(run.providerId),
    resolution:{state:safe(outcome?.state), reason:safe(outcome?.reason,512)},
    verification:verification?{id:safe(verification.id),status:safe(verification.status),integrity:safe(integrity?.status),headCommit:safe(integrity?.headCommit),workspaceId:safe(integrity?.workspaceId),
      checks:(verification.checks||[]).slice(0,100).map(check=>({name:safe(check.name),exitCode:Number.isInteger(check.exitCode)?check.exitCode:null}))}:null,
    evidence:counts, submissions:linked.slice(0,32).map(row=>({id:safe(row.id),status:safe(row.status),leaseExpiresAt:safe(row.leaseExpiresAt)})),
    assessment:reasons.length?"REVIEW_REQUIRED":"RECORDED_VALIDATION", blockers:reasons,
    certification:"NOT_A_PROVIDER_HOMOLOGATION", safeToRedispatch:false
  });
}
module.exports = {buildRunReport};
