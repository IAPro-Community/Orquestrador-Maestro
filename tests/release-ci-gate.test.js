"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { requireSuccessfulRun, requireSuccessfulJobs, MATRIX } = require("../scripts/check-release-ci");
const sha = "a".repeat(40);
const base = { id: 1, head_sha: sha, head_branch:"v1", run_attempt:1, event: "push", status: "completed", conclusion: "success", created_at: "2026-01-01T00:00:00Z" };
test("release gate accepts latest completed successful push or manual run at exact SHA", () => {
  assert.equal(requireSuccessfulRun("test.yml", [base], sha, "v1").id, 1);
  assert.equal(requireSuccessfulRun("test.yml", [{...base, event:"workflow_dispatch"}], sha, "v1").id, 1);
});
test("release gate refuses absent, PR-only, stale and unsuccessful latest runs", () => {
  for (const runs of [[], [{...base, head_sha:"b".repeat(40)}], [{...base,event:"pull_request"}],
    ...["failure","cancelled","skipped","neutral"].map(conclusion => [{...base,conclusion}]),
    [base, {...base, id:2, created_at:"2026-01-02T00:00:00Z", status:"in_progress", conclusion:null}]]) {
    assert.throws(() => requireSuccessfulRun("test.yml", runs, sha, "v1"), /no successful latest eligible run/);
  }
  assert.throws(() => requireSuccessfulRun("test.yml", [base], "abc", "v1"), /complete lowercase/);
});

test("release gate rejects CI from other branches", () => {
  assert.throws(() => requireSuccessfulRun("test.yml", [{...base, head_branch:"feature/test"}], sha, "v1"), /no successful/);
  assert.throws(() => requireSuccessfulRun("test.yml", [base], sha, "main"), /no successful/);
});
test("all required jobs and essential steps must pass in the exact attempt", () => {
  for (const [workflow, matrix] of Object.entries(MATRIX)) {
    const jobs = Object.entries(matrix).map(([name, steps]) => ({
      name, head_sha:sha, run_attempt:1, status:"completed", conclusion:"success",
      steps:steps.map(name => ({name, status:"completed", conclusion:"success"}))
    }));
    assert.equal(requireSuccessfulJobs(workflow,jobs,sha,1),jobs.length);
    assert.throws(() => requireSuccessfulJobs(workflow,jobs.slice(1),sha,1), /required job/);
    assert.throws(() => requireSuccessfulJobs(workflow,[{...jobs[0], conclusion:"skipped"},...jobs.slice(1)],sha,1), /required job/);
    assert.throws(() => requireSuccessfulJobs(workflow,[{...jobs[0], head_sha:"b".repeat(40)},...jobs.slice(1)],sha,1), /required job/);
    assert.throws(() => requireSuccessfulJobs(workflow,[{...jobs[0], run_attempt:2},...jobs.slice(1)],sha,1), /required job/);
    const skipped = {...jobs[0], steps:[{...jobs[0].steps[0], conclusion:"skipped"},...jobs[0].steps.slice(1)]};
    assert.throws(() => requireSuccessfulJobs(workflow,[skipped,...jobs.slice(1)],sha,1), /required step/);
  }
});


test("release gate requires installation homologation on all three supported operating systems", () => {
  for (const os of ["ubuntu-latest", "windows-latest", "macos-latest"]) {
    assert.deepEqual(MATRIX["test.yml"]["Issue #44 homologation — " + os], ["Run #44 homologation", "Record architecture"]);
  }
});
