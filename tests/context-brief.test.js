"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildBrief, parseArgs } = require("../orquestrador/bin/context-brief.js");

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orquestrador-context-"));
  fs.mkdirSync(path.join(root, "DEV", "SPECS"), { recursive: true });
  fs.mkdirSync(path.join(root, "DEV", "TASKS"), { recursive: true });

  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Contrato\n\nNão quebrar compatibilidade.\napi_key=secret-value\n", "utf8");
  fs.writeFileSync(path.join(root, "DEV", "README.md"), "# DEV\n\nEntrada curta.\n", "utf8");
  fs.writeFileSync(path.join(root, "DEV", "INDEX.md"), "# Índice\n\n- HANDOFF.md\n- WORKLOG.md\n- VERIFY.md\n- SPECS/ACTIVE.md\n", "utf8");
  fs.writeFileSync(path.join(root, "DEV", "HANDOFF.md"), [
    "# Handoff",
    "",
    "## Snapshot",
    "",
    "- Projeto temporário.",
    "",
    "## Latest Work",
    "",
    "- Ajuste do fluxo de release.",
    "",
    "## Recent Entries",
    "",
    "- 2026-08-07: refinamento do fluxo.",
    "",
    "## Next Action",
    "",
    "- Revisar o publish antes do handoff."
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(root, "DEV", "CONTEXT.md"), [
    "# Contexto",
    "",
    "## State",
    "",
    "- Estado atual.",
    "",
    "## Commands",
    "",
    "- `node --test`",
    "",
    "## Constraints And Risks",
    "",
    "- Tokens ainda podem vazar se o resumo abrir o worklog completo.",
    "",
    "## Next Context",
    "",
    "- Revisar o publish antes do handoff."
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(root, "DEV", "SPECS", "ACTIVE.md"), [
    "# Active Specification",
    "",
    "## Goal",
    "",
    "- Publicar com briefing curto.",
    "",
    "## In Scope",
    "",
    "- Fluxo de release.",
    "",
    "## Out Of Scope",
    "",
    "- Deploy real.",
    "",
    "## Acceptance",
    "",
    "- Briefing com estado DEV.",
    "",
    "## Verification Plan",
    "",
    "- Rodar gates e testes antes do handoff.",
    "",
    "## Status",
    "",
    "- Phase: execute",
    "- Status: active",
    "- Next gate: rodar gates e testes antes do handoff",
    "- Started at: 2026-08-07"
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(root, "DEV", "VERIFY.md"), [
    "# Verification",
    "",
    "## Latest Verification",
    "",
    "- Smoke check local.",
    "",
    "## Outcome",
    "",
    "- Passed: resumo gerado.",
    "",
    "## Commands",
    "",
    "- `node --test`",
    "",
    "## Remaining Risk",
    "",
    "- Nenhum risco adicional."
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(root, "DEV", "TASKS", "release-npm.md"), "# Publicação npm\n\nValidar pacote e atualização.\n", "utf8");
  fs.writeFileSync(path.join(root, "DEV", "WORKLOG.md"), "# Histórico\n\nNão incluir.\n", "utf8");
  return root;
}

test("parseArgs aceita o briefing conversacional sem comando obrigatório", () => {
  const options = parseArgs(["--task", "memória entre agentes", "--max-chars", "4000", "--json"]);
  assert.equal(options.task, "memória entre agentes");
  assert.equal(options.maxChars, 4000);
  assert.equal(options.json, true);
});

test("buildBrief inclui resumo de estado DEV sem expor segredos ou worklog", () => {
  const projectRoot = makeProject();
  const result = buildBrief({ projectPath: projectRoot, task: "publicação npm", maxChars: 5000 });

  assert.match(result.content, /## DEV State/u);
  assert.match(result.content, /- Phase: execute/u);
  assert.match(result.content, /- Next gate: rodar gates e testes antes do handoff/u);
  assert.match(result.content, /- Risks: Tokens ainda podem vazar/u);
  assert.match(result.content, /- Next action: Revisar o publish antes do handoff/u);
  assert.match(result.content, /AGENTS\.md/u);
  assert.match(result.content, /DEV\/HANDOFF\.md/u);
  assert.match(result.content, /release-npm\.md/u);
  assert.doesNotMatch(result.content, /Não incluir/u);
  assert.doesNotMatch(result.content, /secret-value/u);
  assert.doesNotMatch(result.content, /Projeto: [A-Z]:/u);
  assert.equal(result.state.phase, "execute");
  assert.equal(result.state.startedAt, "2026-08-07");
  assert.ok(result.used <= 5000);
});

test("buildBrief respeita o orçamento e omite histórico sensível", () => {
  const projectRoot = makeProject();
  const result = buildBrief({ projectPath: projectRoot, task: "", maxChars: 1000 });

  assert.ok(result.used <= 1000);
  assert.doesNotMatch(result.content, /WORKLOG\.md/u);
});

test("parseArgs trata --task ausente como intenção vazia (sem erro)", () => {
  const options = parseArgs(["brief", "--project-path", "/tmp/projeto-x", "--max-chars", "4000", "--json"]);
  assert.equal(options.task, "");
  assert.equal(options.maxChars, 4000);
  assert.equal(options.json, true);
});

test("parseArgs trata --task vazio como intenção ausente (sem erro)", () => {
  const options = parseArgs(["brief", "--project-path", "/tmp/projeto-x", "--task", ""]);
  assert.equal(options.task, "");
});

test("parseArgs mantém erro para --task sem valor seguinte (token inválido)", () => {
  assert.throws(() => parseArgs(["brief", "--task"]), /exige um valor/u);
  assert.throws(() => parseArgs(["brief", "--task", "--json"]), /exige um valor/u);
});
