"use strict";

const { spawnSync } = require("node:child_process");
const REQUIRED = Object.freeze(["test.yml", "security.yml"]);
const SHA = /^[0-9a-f]{40}$/;
const MATRIX = Object.freeze({
  "test.yml": Object.freeze(Object.fromEntries([
    ["Contracts — catalogs, router, install policy (Node 22 on Ubuntu)", ["Contract gate (no PowerShell required)", "Installer E2E (--full, isolated temp home)"]],
    ...["20.19.0", "22", "24"].map(n => ["Full tests — Node "+n+" on ubuntu-latest", [n==="24"?"Run release hygiene and full tests":"Run tests", "Validate native Maestro Skill Contract V2", "npm pack dry-run", "Create tarball", "Install from tarball", "CLI smoke tests"]]),
    ...["20.19.0", "24"].map(n => ["Benchmark smoke — Node "+n+" on Ubuntu", ["Benchmark list", "Benchmark validate", "Benchmark typecheck", "Benchmark unit tests"]]),
    ...["Windows", "macOS"].flatMap(os => ["20.19.0", "24"].map(n => ["Full + smoke tests — Node "+n+" on "+os, ["Run full tests", "Run smoke tests", "Create tarball", "Install from tarball", "CLI smoke tests", "Smart target lifecycle", ...(os==="Windows"?["Verify fenced admission and trusted supervisor before full suite", "Public validation (secrets, forbidden files, mojibake)", "PowerShell installer E2E (--Full)", "doctor --strict (loss detection)"]:[])]]))
  ])),
  "security.yml": Object.freeze({
    "CodeQL — JavaScript and TypeScript": ["Initialize CodeQL", "Analyze with CodeQL"],
    "npm dependency audit": ["Audit CLI and bundled examples", "Audit documentation site", "Audit benchmark harness"]
  })
});
function requireSuccessfulJobs(workflow, jobs, sha, attempt) {
  if (!MATRIX[workflow] || !Array.isArray(jobs)) throw new Error("Invalid release jobs response");
  for (const [name, steps] of Object.entries(MATRIX[workflow])) {
    const matches = jobs.filter(job => job.name === name);
    const job = matches[0];
    if (matches.length !== 1 || job.head_sha !== sha ||
        job.run_attempt !== attempt || job.status !== "completed" || job.conclusion !== "success") {
      throw new Error(workflow + ": required job missing or unsuccessful: " + name);
    }
    for (const step of steps) {
      const matching = (job.steps || []).filter(s => s.name === step);
      if (matching.length !== 1 || matching[0].status !== "completed" || matching[0].conclusion !== "success") {
        throw new Error(workflow + ": required step missing or unsuccessful: " + name + " / " + step);
      }
    }
  }
  return Object.keys(MATRIX[workflow]).length;
}

function requireSuccessfulRun(workflow, runs, sha, branch) {
  if (!['main', 'release/1.2.0'].includes(branch)) throw new Error('Expected official release branch');
  if (!SHA.test(sha)) throw new Error("Expected a complete lowercase Git commit SHA");
  if (!Array.isArray(runs)) throw new Error(workflow + ": invalid Actions response");
  // PR runs use a synthesized merge checkout and do not attest this tag SHA.
  // Only push / explicit manual runs attest an exact checked-out revision.
  const candidates = runs.filter(run => run.head_sha === sha && run.head_branch === branch &&
    ["push", "workflow_dispatch"].includes(run.event))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const latest = candidates[0];
  if (!latest || latest.status !== "completed" || latest.conclusion !== "success") {
    throw new Error(workflow + ": no successful latest eligible run for " + sha +
      " (" + (latest?.conclusion || latest?.status || "missing") + ")");
  }
  if (!Number.isSafeInteger(latest.id) || latest.id < 1 || !Number.isSafeInteger(latest.run_attempt) || latest.run_attempt < 1) throw new Error('Invalid workflow run identity');
  return { workflow, id: latest.id, attempt: latest.run_attempt, sha };
}

function queryRuns(repo, workflow, sha) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Invalid repository");
  if (!REQUIRED.includes(workflow) || !SHA.test(sha)) throw new Error("Invalid workflow or SHA");
  const route = "repos/" + repo + "/actions/workflows/" + workflow + "/runs?head_sha=" + sha + "&per_page=100";
  const result = spawnSync("gh", ["api", route], { encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(workflow + ": GitHub Actions evidence unavailable");
  return JSON.parse(result.stdout).workflow_runs;
}

function queryJobs(repo, id, attempt) {
  const route = `repos/${repo}/actions/runs/${id}/attempts/${attempt}/jobs?per_page=100`;
  const result = spawnSync('gh', ['api', route], { encoding:'utf8', timeout:30000, maxBuffer:8*1024*1024 });
  if (result.error || result.status !== 0) throw new Error('GitHub Actions jobs evidence unavailable');
  const data = JSON.parse(result.stdout);
  if (!Array.isArray(data.jobs) || data.total_count !== data.jobs.length) throw new Error('Incomplete jobs evidence');
  return data.jobs;
}

function main(sha, branch = process.env.GITHUB_REF_NAME, repo = process.env.GITHUB_REPOSITORY) {
  if (!SHA.test(sha || "")) throw new Error("Expected a complete lowercase Git commit SHA");
  for (const workflow of REQUIRED) {
    const result = requireSuccessfulRun(workflow, queryRuns(repo || "", workflow, sha), sha, branch);
    const count = requireSuccessfulJobs(workflow, queryJobs(repo, result.id, result.attempt), sha, result.attempt);
    const latest = requireSuccessfulRun(workflow, queryRuns(repo || "", workflow, sha), sha, branch);
    if (latest.id !== result.id || latest.attempt !== result.attempt) throw new Error('CI evidence changed during validation');
    console.log(result.workflow + ": success, " + count + " required jobs, run " + result.id + ", SHA " + result.sha);
  }
}
if (require.main === module) {
  try { main(process.argv[2], process.argv[3]); }
  catch (error) { console.error("Release gate: " + error.message); process.exitCode = 1; }
}
module.exports = { requireSuccessfulRun, requireSuccessfulJobs, MATRIX };
