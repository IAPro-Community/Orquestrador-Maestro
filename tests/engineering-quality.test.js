"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { IntentRouter } = require("../runtime/planner/intent-router");
const { isTaskCompletionEligible } = require("../runtime/governance/change-governance");
const {
  QUALITY_SEVERITIES,
  BAD_CODE_CATEGORIES,
  classifyQualityFinding,
  buildEngineeringContract,
  detectQualityFindings
} = require("../runtime/governance/engineering-quality");

const repoRoot = path.resolve(__dirname, "..");
const profiles = JSON.parse(fs.readFileSync(path.join(repoRoot, "orquestrador/SKILL_EXECUTION_PROFILES.json"), "utf8")).profiles;

test("guided engineering profile composes disciplines without changing legacy profiles", () => {
  assert.ok(profiles.fast && profiles.standard && profiles.deep);
  assert.equal(profiles["guided-engineering"].maxSkills, 5);
  assert.equal(profiles["guided-engineering"].startSkill, "skill-repo-health");
  assert.equal(profiles["guided-engineering"].routingSource, "SKILLS_ROUTER.json");
});

test("intent routing selects proportional engineering disciplines", () => {
  const router = new IntentRouter({ maestroRoot: path.join(repoRoot, "orquestrador") });
  const simple = router.resolve("troque o label Salvar para Confirmar");
  assert.notEqual(simple.profile, "guided-engineering");

  const auth = router.resolve("criar módulo de usuários com roles e permissions");
  assert.equal(auth.profile, "guided-engineering");
  assert.ok(auth.engineeringCapabilities.includes("backend-engineering"));
  assert.ok(auth.engineeringCapabilities.includes("data-modeling"));
  assert.ok(auth.engineeringCapabilities.includes("security"));
  assert.ok(auth.guidedSkills.length > 0);
  assert.ok(auth.allSkills.length <= profiles["guided-engineering"].maxSkills);

  const table = router.resolve("criar tabela de usuários");
  assert.ok(table.engineeringCapabilities.includes("data-modeling"));
  assert.ok(!table.engineeringCapabilities.includes("database-migrations"));

  const migration = router.resolve("criar migration para usuários");
  assert.ok(migration.engineeringCapabilities.includes("database-migrations"));

  const pureRule = router.resolve("adicionar testes para uma função matemática");
  assert.ok(pureRule.engineeringCapabilities.includes("testing-strategy"));
  assert.ok(!pureRule.engineeringCapabilities.includes("e2e-testing"));

  const journey = router.resolve("adicionar teste e2e para jornada crítica");
  assert.ok(journey.engineeringCapabilities.includes("e2e-testing"));
  assert.ok(journey.allSkills.some((skill) => skill.id === "skill-webapp-testing"));

  const semantics = router.resolve("melhorar nomes e semântica do código");
  assert.deepEqual(semantics.engineeringCapabilities, ["code-semantics"]);
});

test("quality findings use compact categories and severity blocks DONE proportionally", () => {
  assert.deepEqual(QUALITY_SEVERITIES, ["BLOCKER", "HIGH", "MEDIUM", "LOW"]);
  assert.ok(BAD_CODE_CATEGORIES.includes("ARCHITECTURE"));
  assert.equal(classifyQualityFinding({ category: "ARCHITECTURE", severity: "BLOCKER", code: "god-service" }).blocking, true);
  assert.equal(classifyQualityFinding({ category: "SEMANTICS", severity: "LOW", code: "generic-name" }).blocking, false);
  const blocked = isTaskCompletionEligible({ id: "t1", acceptanceCriteria: [], changeClass: "structural" }, { qualityFindings: [{ severity: "BLOCKER", category: "ARCHITECTURE" }] });
  assert.equal(blocked.eligible, false);
  const findings = detectQualityFindings({ filePath: "src/users.js", source: "function processData(data) {\n  try { return data; } catch {}\n}\n" });
  assert.ok(findings.some((finding) => finding.category === "SEMANTICS"));
  assert.ok(findings.some((finding) => finding.category === "ERROR_HANDLING" && finding.severity === "HIGH"));
});

test("engineering contract preserves goal, constraints, boundaries and verification strategy", () => {
  const contract = buildEngineeringContract({
    task: { id: "t1", title: "Create user API", objective: "Expose user creation", acceptanceCriteria: ["API rejects invalid email"], changeClass: "security-compliance", requiredCapabilities: ["backend", "security"] },
    missionBrief: { constraints: ["REST only", "Do not expose secrets"] }
  });
  assert.equal(contract.goal, "Expose user creation");
  assert.deepEqual(contract.constraints, ["REST only", "Do not expose secrets"]);
  assert.deepEqual(contract.affectedCapabilities, ["backend", "security"]);
  assert.deepEqual(contract.affectedBoundaries, []);
  assert.ok(contract.qualityExpectations.includes("coherent-responsibilities"));
  assert.deepEqual(contract.mandatoryPreCode, ["deep-interview", "skill-preflight", "skill-adr"]);
  assert.ok(contract.verificationStrategy.includes("acceptance-evidence"));
  assert.ok(Object.isFrozen(contract));
});
