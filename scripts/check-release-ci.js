"use strict";

const { spawnSync } = require("node:child_process");
const REQUIRED = Object.freeze(["test.yml", "security.yml"]);
const SHA = /^[0-9a-f]{40}$/;

function requireSuccessfulRun(workflow, runs, sha) {
  if (!SHA.test(sha)) throw new Error("Expected a complete lowercase Git commit SHA");
  if (!Array.isArray(runs)) throw new Error(workflow + ": invalid Actions response");
  // PR runs use a synthesized merge checkout and do not attest this tag SHA.
  // Only push / explicit manual runs attest an exact checked-out revision.
  const candidates = runs.filter(run => run.head_sha === sha &&
    ["push", "workflow_dispatch"].includes(run.event))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const latest = candidates[0];
  if (!latest || latest.status !== "completed" || latest.conclusion !== "success") {
    throw new Error(workflow + ": no successful latest eligible run for " + sha +
      " (" + (latest?.conclusion || latest?.status || "missing") + ")");
  }
  return { workflow, id: latest.id, sha };
}

function queryRuns(repo, workflow, sha) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Invalid repository");
  if (!REQUIRED.includes(workflow) || !SHA.test(sha)) throw new Error("Invalid workflow or SHA");
  const route = "repos/" + repo + "/actions/workflows/" + workflow + "/runs?head_sha=" + sha + "&per_page=100";
  const result = spawnSync("gh", ["api", route], { encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(workflow + ": GitHub Actions evidence unavailable");
  return JSON.parse(result.stdout).workflow_runs;
}

function main(sha, repo = process.env.GITHUB_REPOSITORY) {
  if (!SHA.test(sha || "")) throw new Error("Expected a complete lowercase Git commit SHA");
  for (const workflow of REQUIRED) {
    const result = requireSuccessfulRun(workflow, queryRuns(repo || "", workflow, sha), sha);
    console.log(result.workflow + ": success, run " + result.id + ", SHA " + result.sha);
  }
}
if (require.main === module) {
  try { main(process.argv[2]); }
  catch (error) { console.error("Release gate: " + error.message); process.exitCode = 1; }
}
module.exports = { requireSuccessfulRun };
