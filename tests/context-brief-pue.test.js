"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildBrief, buildSection, parseArgs } = require("../orquestrador/bin/context-brief.js");
const slices = require("../orquestrador/lib/context-slices.js");

const { createPueFixture } = require("./fixtures/pue-project-fixture.js");

// A fixture é escrita em diretório temporário: `DEV/` é ignorado pelo git deste repositório.
const FIXTURE = createPueFixture();
test.after(() => fs.rmSync(FIXTURE, { recursive: true, force: true }));

function copyFixture() {
  return createPueFixture();
}

function brief(root, extra = {}) {
  return buildBrief({ projectPath: root, task: "auditar aplicabilidade normativa das ADRs", maxChars: 12000, json: true, taskId: null, since: null, ...extra });
}

test("fatias: HANDOFF entrega só o snapshot mais recente, com proveniência", () => {
  const content = fs.readFileSync(path.join(FIXTURE, "DEV", "HANDOFF.md"), "utf8");
  const slice = slices.sliceHandoff(content);
  assert.equal(slice.strategy, "handoff-first-section");
  assert.match(slice.text, /## UHGOV-078/);
  assert.doesNotMatch(slice.text, /## UHGOV-077/);
  assert.match(slice.text, /2 snapshot\(s\) anteriores omitidos/);
  assert.equal(slice.range.startLine, 3);
  assert.equal(slice.sourceDigest, slices.sha256(content));
  assert.ok(slice.chars < slice.sourceChars / 2);
});

test("fatias: ACTIVE mantém o contrato change: e o estado, descarta a fila histórica", () => {
  const content = fs.readFileSync(path.join(FIXTURE, "DEV", "SPECS", "ACTIVE.md"), "utf8");
  const slice = slices.sliceActiveSpec(content);
  assert.equal(slice.strategy, "spec-contract-and-state");
  assert.match(slice.text, /change:\n\s+id: UHGOV-065/);
  assert.match(slice.text, /## Objetivo/);
  assert.match(slice.text, /## Estado/);
  assert.doesNotMatch(slice.text, /Fila aprovada/);
  assert.doesNotMatch(slice.text, /Item histórico 12/);
  const change = slices.parsePueChange(content);
  assert.deepEqual(change, {
    id: "UHGOV-065",
    declaredClass: "architectural",
    architectureStatus: "accepted",
    authorizationStatus: "granted_by_written_maestro_instruction_pending_signed_confirmation"
  });
});

test("fatias: CONTEXT prefere seções de estado; sem seções, usa a cauda", () => {
  const content = fs.readFileSync(path.join(FIXTURE, "DEV", "CONTEXT.md"), "utf8");
  const slice = slices.sliceContext(content);
  assert.equal(slice.strategy, "context-state-sections");
  assert.match(slice.text, /## Estado \(2026-09-12\)/);
  assert.match(slice.text, /## Restrições operacionais/);
  assert.doesNotMatch(slice.text, /Texto histórico\./);
  const tail = slices.sliceContext("# T\n\n" + Array.from({ length: 100 }, (_, i) => `linha ${i + 1}`).join("\n"));
  assert.equal(tail.strategy, "context-tail");
  assert.match(tail.text, /linha 100/);
  assert.doesNotMatch(tail.text, /linha 10\n/);
  assert.match(tail.text, /linhas anteriores omitidas/);
});

test("fatias incluem subseções consecutivas e registram o intervalo completo", () => {
  const handoff = slices.sliceHandoff([
    "# HANDOFF", "", "## Atual", "snapshot atual", "### Detalhes", "evidência da subseção", "#### Nota", "nota mais funda", "## Anterior", "snapshot antigo"
  ].join("\n"));
  assert.match(handoff.text, /evidência da subseção/u);
  assert.match(handoff.text, /nota mais funda/u);
  assert.doesNotMatch(handoff.text, /snapshot antigo/u);
  assert.equal(handoff.range.endLine, 8);

  const spec = slices.sliceActiveSpec([
    "# ACTIVE", "```yaml", "change:", "  id: C-1", "```", "## Objetivo", "Meta", "### Contexto", "Contexto aninhado", "## Histórico", "Antigo"
  ].join("\n"));
  assert.match(spec.text, /Contexto aninhado/u);
  assert.equal(spec.range.endLine, 9);
  assert.doesNotMatch(spec.text, /Antigo/u);

  const context = slices.sliceContext([
    "# CONTEXT", "## Estado", "Atual", "### Evidência", "Evidência aninhada", "## Próximas ações", "Próxima ação", "### Responsável", "Responsável atual", "## Histórico", "Antigo"
  ].join("\n"));
  assert.match(context.text, /Evidência aninhada/u);
  assert.match(context.text, /Responsável atual/u);
  assert.equal(context.range.endLine, 9);
  assert.doesNotMatch(context.text, /Antigo/u);
});

test("brief em projeto PUE: estado pue, snapshot atual, contrato e manifesto determinístico", () => {
  const root = copyFixture();
  const first = brief(root);
  const second = brief(root);

  assert.equal(first.state.mode, "pue");
  assert.equal(first.state.workItem, "UHGOV-065");
  assert.match(first.state.phase, /UHGOV-065 \(architectural\)/);
  assert.match(first.state.status, /snapshot: UHGOV-078/);
  assert.match(first.state.nextAction, /ler a resposta do Conselheiro/);

  const byPath = Object.fromEntries(first.manifest.entries.map((entry) => [entry.path, entry]));
  assert.equal(byPath["DEV/HANDOFF.md"].strategy, "handoff-first-section");
  assert.equal(byPath["DEV/SPECS/ACTIVE.md"].strategy, "spec-contract-and-state");
  assert.equal(byPath["DEV/CONTEXT.md"].strategy, "context-state-sections");
  for (const entry of first.manifest.entries) {
    assert.match(entry.digest, /^[0-9a-f]{64}$/);
    if (entry.path !== "DEV state summary") {
      assert.match(entry.sourceDigest, /^[0-9a-f]{64}$/);
      assert.ok(entry.range && entry.range.startLine >= 1);
    }
  }
  assert.equal(first.manifest.contentDigest, second.manifest.contentDigest, "mesmo projeto → mesmo briefing");
  assert.deepEqual(first.manifest.entries, second.manifest.entries);
  assert.ok(first.used <= 12000);
  fs.rmSync(root, { recursive: true, force: true });
});

test("brief em projeto PUE: nenhuma informação obrigatória se perde com a redução", () => {
  const root = copyFixture();
  const result = brief(root);
  const mandatory = [
    "UHGOV-065",                                  // change.id da spec ativa
    "declared_class: architectural",
    "status: accepted",
    "## UHGOV-078",                               // snapshot mais recente do handoff
    "Próxima ação: ler a resposta do Conselheiro", // próxima ação
    "## Estado (2026-09-12)",                     // estado atual do contexto
    "Regras específicas"                          // contrato do projeto
  ];
  for (const needle of mandatory) {
    assert.ok(result.content.includes(needle), `faltou: ${needle}`);
  }
  assert.doesNotMatch(result.content, /## UHGOV-076/, "snapshot antigo não deve entrar");
  assert.doesNotMatch(result.content, /Item histórico 20/, "fila histórica da spec não deve entrar");
  assert.doesNotMatch(result.content, /WORKLOG entrada/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("brief: --since inclui o delta do Git com proveniência", () => {
  const root = copyFixture();
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git("init", "-q");
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD");
  fs.appendFileSync(path.join(root, "DEV", "CONTEXT.md"), "\n- nova restrição registrada\n");
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-am", "docs: contexto");
  const result = brief(root, { since: base });
  const delta = result.manifest.entries.find((entry) => entry.path === "git delta");
  assert.ok(delta, "entrada de delta ausente");
  assert.equal(delta.strategy, "git-diff-stat");
  assert.equal(delta.files, 1);
  assert.equal(delta.commits, 1);
  assert.equal(delta.base, base);
  assert.match(result.content, /## Delta desde/);
  assert.match(result.content, /M DEV\/CONTEXT\.md/);
  assert.equal(result.manifest.since, base);
  const unresolved = brief(root, { since: "nao-existe" });
  assert.match(unresolved.content, /Delta desde nao-existe[\s\S]*indisponível/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("brief redacts absolute paths from Git delta errors", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orquestrador private project "));
  createPueFixture(root);
  const result = brief(root, { since: "missing-commit" });
  assert.equal(result.content.includes(path.resolve(root)), false);
  assert.equal(result.content.includes("private project "), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("section: extrai uma cláusula por cabeçalho (lazy-loading de autoridade)", () => {
  const options = parseArgs(["section", "--project-path", FIXTURE, "--path", "docs/architecture/decisions/ADR-0014-execution-coordination-authority.md", "--heading", "D11", "--json"]);
  assert.equal(options.command, "section");
  const section = buildSection(options);
  assert.equal(section.heading, "D11 — Esta ADR não autoriza concorrência escritora intra-repositório");
  assert.match(section.content, /única sessão escritora/);
  assert.match(section.content, /#### Nota/, "subseções acompanham a cláusula");
  assert.doesNotMatch(section.content, /D12/);
  assert.equal(section.range.startLine, 11);
  assert.match(section.digest, /^[0-9a-f]{64}$/);
  assert.throws(() => buildSection({ ...options, heading: "D99" }), /Seção não encontrada/);
  assert.throws(() => buildSection({ ...options, sectionPath: "nao-existe.md" }), /não encontrado/);
});

test("parseArgs: --since rejeita valores com espaço", () => {
  assert.throws(() => parseArgs(["--since", "a b"]), /--since/);
  assert.equal(parseArgs(["--since", "abc123"]).since, "abc123");
});
