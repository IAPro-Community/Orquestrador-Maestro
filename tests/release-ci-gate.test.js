"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { requireSuccessfulRun } = require("../scripts/check-release-ci");
const sha = "a".repeat(40);
const base = { id: 1, head_sha: sha, event: "push", status: "completed", conclusion: "success", created_at: "2026-01-01T00:00:00Z" };
test("release gate accepts latest completed successful push or manual run at exact SHA", () => {
  assert.equal(requireSuccessfulRun("test.yml", [base], sha).id, 1);
  assert.equal(requireSuccessfulRun("test.yml", [{...base, event:"workflow_dispatch"}], sha).id, 1);
});
test("release gate refuses absent, PR-only, stale and unsuccessful latest runs", () => {
  for (const runs of [[], [{...base, head_sha:"b".repeat(40)}], [{...base,event:"pull_request"}],
    ...["failure","cancelled","skipped","neutral"].map(conclusion => [{...base,conclusion}]),
    [base, {...base, id:2, created_at:"2026-01-02T00:00:00Z", status:"in_progress", conclusion:null}]]) {
    assert.throws(() => requireSuccessfulRun("test.yml", runs, sha), /no successful latest eligible run/);
  }
  assert.throws(() => requireSuccessfulRun("test.yml", [base], "abc"), /complete lowercase/);
});
