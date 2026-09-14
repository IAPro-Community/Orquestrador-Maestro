#!/usr/bin/env node
"use strict";

// Benchmark de contexto antes/depois do `context brief` em um projeto real.
//
// ANTES  = custo de ler os arquivos obrigatórios de boot inteiros (AGENTS.md + DEV/INDEX,
//          HANDOFF, CONTEXT, SPECS/ACTIVE), como uma IA faz sem briefing.
// DEPOIS = tamanho do briefing gerado com o orçamento dado.
// Além da redução, verifica que a informação obrigatória (work item da spec, snapshot mais
// recente do handoff, próxima ação, estado do contexto) continua presente — a economia
// não pode vir de truncamento cego.
//
// Uso:
//   node scripts/context-brief-benchmark.js --project-path DIR [--max-chars N] [--task TEXTO] [--json]

const fs = require("node:fs");
const path = require("node:path");
const { buildBrief } = require("../orquestrador/bin/context-brief.js");
const slices = require("../orquestrador/lib/context-slices.js");

const BYTES_PER_TOKEN = 4;
const BOOT_FILES = ["AGENTS.md", "DEV/INDEX.md", "DEV/HANDOFF.md", "DEV/CONTEXT.md", "DEV/SPECS/ACTIVE.md"];

function parse(argv) {
  const options = { projectPath: process.cwd(), maxChars: 16000, task: "", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--json") options.json = true;
    else if (arg === "--project-path") { options.projectPath = next; index += 1; }
    else if (arg === "--max-chars") { options.maxChars = Number.parseInt(next, 10); index += 1; }
    else if (arg === "--task") { options.task = next; index += 1; }
  }
  return options;
}

function read(projectRoot, relative) {
  const abs = path.join(projectRoot, relative);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
}

function main() {
  const options = parse(process.argv.slice(2));
  const projectRoot = path.resolve(options.projectPath);
  const before = BOOT_FILES.map((relative) => ({ file: relative, chars: read(projectRoot, relative).length }));
  const beforeChars = before.reduce((sum, item) => sum + item.chars, 0);
  const result = buildBrief({ projectPath: projectRoot, task: options.task, maxChars: options.maxChars, json: true, taskId: null, since: null });
  const afterChars = result.used;

  // Informação obrigatória: derivada dos próprios arquivos (não de expectativas fixas).
  const spec = read(projectRoot, "DEV/SPECS/ACTIVE.md");
  const handoff = read(projectRoot, "DEV/HANDOFF.md");
  const context = read(projectRoot, "DEV/CONTEXT.md");
  const change = slices.parsePueChange(spec);
  const snapshot = slices.splitSections(handoff).find((section) => section.level === 2);
  const contextState = slices.splitSections(context).find((section) => section.level >= 2 && /estado|state|status|restri|constraint|limita|risk/iu.test(section.title));
  const checks = [
    change && change.id ? { item: `work item da spec (${change.id})`, ok: result.content.includes(change.id) } : null,
    snapshot ? { item: `snapshot mais recente do handoff (${snapshot.title.slice(0, 40)}…)`, ok: result.content.includes(snapshot.title.slice(0, 40)) } : null,
    result.state.nextAction && result.state.nextAction !== "não declarada" ? { item: "próxima ação", ok: result.content.includes(result.state.nextAction.slice(0, 30)) } : { item: "próxima ação", ok: false },
    contextState ? { item: `estado do contexto (${contextState.title.slice(0, 40)})`, ok: result.content.includes(contextState.title.slice(0, 30)) } : null
  ].filter(Boolean);

  const report = {
    projectRoot: "[redigido]",
    maxChars: options.maxChars,
    before: { chars: beforeChars, tokens: Math.round(beforeChars / BYTES_PER_TOKEN), files: before },
    after: { chars: afterChars, tokens: Math.round(afterChars / BYTES_PER_TOKEN), entries: result.manifest.entries.map((entry) => ({ path: entry.path, strategy: entry.strategy, chars: entry.chars, sourceChars: entry.sourceChars })) },
    reduction: beforeChars ? Number((1 - afterChars / beforeChars).toFixed(3)) : null,
    mandatory: checks,
    mandatoryOk: checks.every((check) => check.ok)
  };
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`ANTES  (boot completo): ${report.before.chars.toLocaleString()} chars ≈ ${report.before.tokens.toLocaleString()} tokens`);
    for (const item of before) console.log(`  ${item.chars.toString().padStart(8)}  ${item.file}`);
    console.log(`DEPOIS (context brief, ${options.maxChars} chars): ${report.after.chars.toLocaleString()} chars ≈ ${report.after.tokens.toLocaleString()} tokens`);
    for (const entry of report.after.entries) console.log(`  ${String(entry.chars).padStart(8)}  ${entry.path}  [${entry.strategy}${entry.sourceChars ? ` de ${entry.sourceChars}` : ""}]`);
    console.log(`REDUÇÃO: ${(report.reduction * 100).toFixed(1)}%`);
    console.log(`INFORMAÇÃO OBRIGATÓRIA: ${report.mandatoryOk ? "preservada" : "PERDIDA"}`);
    for (const check of checks) console.log(`  ${check.ok ? "ok  " : "FALTA"} ${check.item}`);
  }
  return report.mandatoryOk ? 0 : 2;
}

process.exitCode = main();
