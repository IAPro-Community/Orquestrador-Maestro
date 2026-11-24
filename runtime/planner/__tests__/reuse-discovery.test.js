"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { discoverReuseCandidates } = require("../reuse-discovery");
const { gatherPreflight } = require("../context-preflight");
const { ContextEngine } = require("../../context/context-engine");

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-reuse-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, relative, content) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

test("read-only candidate discovery reports paths, roles and source SHA without invented reuse", async (t) => {
  const root = project(t);
  write(root, "package.json", JSON.stringify({ name: "school", dependencies: { react: "^19.0.0" } }));
  write(root, "src/components/GradeTable.tsx", "export function GradeTable() { return null; }\n");
  write(root, "src/components/Unexported.tsx", "function Unexported() { return null; }\n");
  write(root, "src/api/gradesClient.ts", "export const loadGrades = () => null;\n");
  write(root, "src/components/GradeTable.test.tsx", "export const fake = true;\n");
  const first = discoverReuseCandidates(root, "Criar uma tela de lançamento de notas");
  assert.equal(first.status, "CANDIDATES_NOT_VERIFIED");
  assert.deepEqual(first.candidates.map((x) => x.path), [
    "src/api/gradesClient.ts", "src/components/GradeTable.tsx"
  ]);
  assert.equal(first.candidates[0].role, "service-candidate");
  assert.match(first.candidates[1].sourceDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(discoverReuseCandidates(root, "Criar uma tela de lançamento de notas"), first);
  const facts = gatherPreflight(root, "lançamento de notas");
  assert.equal(facts.reuseDiscovery.status, "CANDIDATES_NOT_VERIFIED");
  assert.equal(facts.reuseDiscovery.candidates.length, 2);
  const items = await new ContextEngine({ workspacePath: root })._discoverFacts("lançamento de notas");
  const item = items.find((candidate) => candidate.key === "project.reuseCandidates");
  assert.equal(item.value.status, "CANDIDATES_NOT_VERIFIED");
  assert.equal(item.sources.length, 2);
});

test("discovery never follows symlinks or exposes contents of unrelated source", (t) => {
  const root = project(t);
  const external = project(t);
  write(external, "components/SecretForm.tsx", "export const SecretForm = 'secret-key';\n");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  try {
    fs.symlinkSync(path.join(external, "components"), path.join(root, "src", "components"), "dir");
  } catch (error) {
    if (["EPERM", "EACCES"].includes(error.code)) { t.skip("symlinks not permitted"); return; }
    throw error;
  }
  const result = discoverReuseCandidates(root, "secret");
  assert.deepEqual(result.candidates, []);
  assert.equal(JSON.stringify(result).includes("secret-key"), false);
});

test("missing roots and non-exported files do not invent components", (t) => {
  const root = project(t);
  assert.deepEqual(discoverReuseCandidates(root).candidates, []);
  write(root, "src/components/PrivateForm.tsx", "const PrivateForm = () => null;\n");
  assert.deepEqual(discoverReuseCandidates(root).candidates, []);
});
