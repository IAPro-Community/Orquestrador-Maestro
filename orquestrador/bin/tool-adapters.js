#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const manifestPath = path.join(path.resolve(__dirname, ".."), "TOOL_ADAPTERS.json");
const repositoryRoot = path.resolve(__dirname, "..", "..");
const canonicalSkillPath = path.join(repositoryRoot, "codex", "skills", "orquestrador-maestro", "SKILL.md");

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function validate(manifest) {
  if (manifest.schemaVersion !== 1 || !manifest.adapters || !manifest.policy) {
    throw new Error("Manifesto de adaptadores inválido.");
  }
  for (const [id, adapter] of Object.entries(manifest.adapters)) {
    if (!adapter.displayName || !adapter.command || !adapter.config || !Array.isArray(adapter.capabilities)) {
      throw new Error(`Adaptador incompleto: ${id}`);
    }
    for (const scope of ["global", "project"]) {
      if (!Array.isArray(adapter.config[scope])) throw new Error(`Configuração ${scope} inválida: ${id}`);
    }
  }
}

function help() {
  console.log("Uso: orquestrador-maestro adapters <list|paths|validate> [id]");
  console.log("     orquestrador-maestro adapters render <junie|goose|openhands> --project-path PATH [--dry-run|--apply] [--refresh]");
  console.log("Nota 1.1.0: o manifesto lista 9 adaptadores, mas só junie|goose|openhands têm renderizador (os demais falham com mensagem explícita).");
}

function parseRenderOptions(args) {
  let projectPath;
  let mode = "dry-run";
  let refresh = false;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--project-path") {
      projectPath = args[++index];
      if (!projectPath) throw new Error("--project-path exige um caminho.");
    } else if (option === "--apply") {
      if (mode === "dry-run" && args.includes("--dry-run")) throw new Error("Use apenas --dry-run ou --apply.");
      mode = "apply";
    } else if (option === "--dry-run") {
      if (mode === "apply") throw new Error("Use apenas --dry-run ou --apply.");
      mode = "dry-run";
    } else if (option === "--refresh") {
      refresh = true;
    } else {
      throw new Error(`Opcao desconhecida: ${option}`);
    }
  }
  if (!projectPath) throw new Error("Renderizacao exige --project-path PATH.");
  return { projectPath: path.resolve(projectPath), mode, refresh };
}

function safeProjectFile(projectRoot, relativePath) {
  const resolved = path.resolve(projectRoot, relativePath);
  const prefix = projectRoot.endsWith(path.sep) ? projectRoot : `${projectRoot}${path.sep}`;
  if (resolved !== projectRoot && !resolved.startsWith(prefix)) {
    throw new Error(`Destino fora do projeto: ${relativePath}`);
  }
  return resolved;
}

function readCanonicalSkill() {
  if (!fs.existsSync(canonicalSkillPath)) throw new Error(`Skill canonica nao encontrada: ${canonicalSkillPath}`);
  return fs.readFileSync(canonicalSkillPath, "utf8");
}

function renderPlan(id, projectRoot) {
  const skill = readCanonicalSkill();
  const plan = [];
  const add = (relativePath, content, reason) => plan.push({ relativePath, content, reason });
  if (id === "junie") {
    const config = {
      "skill-locations": ["./skills"],
      "skill-default-locations": true,
      "command-locations": ["./commands"],
      "command-default-locations": true,
      "agent-locations": ["./agents"],
      "agent-default-location": true
    };
    if (fs.existsSync(path.join(projectRoot, "AGENTS.md"))) config["guidelines-location"] = "../AGENTS.md";
    add(".junie/config.json", `${JSON.stringify(config, null, 2)}\n`, "configuracao segura de fontes do projeto");
    add(".junie/skills/orquestrador-maestro/SKILL.md", skill, "skill compartilhada");
  } else if (id === "goose") {
    add(".agents/skills/orquestrador-maestro/SKILL.md", skill, "skill compartilhada");
  } else if (id === "openhands") {
    add(".agents/skills/orquestrador-maestro/SKILL.md", skill, "skill compartilhada");
    add(".agents/agents/orquestrador-maestro.md", `---\nname: orquestrador-maestro\ndescription: Aplica o contrato do Orquestrador Maestro neste repositorio.\n---\n\nSiga o AGENTS.md do repositorio e aplique o contrato do Orquestrador Maestro. Preserve dados privados, valide antes de declarar conclusao e mantenha mudancas pequenas e reversiveis.\n`, "agente baseado em arquivo");
  } else {
    throw new Error(`Renderizador ainda nao disponivel: ${id}`);
  }
  return plan.map((item) => ({ ...item, target: safeProjectFile(projectRoot, item.relativePath) }));
}

function render(id, args) {
  const { projectPath, mode, refresh } = parseRenderOptions(args);
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new Error(`Projeto nao encontrado ou invalido: ${projectPath}`);
  }
  const plan = renderPlan(id, projectPath);
  console.log(`Adaptador: ${id}`);
  console.log(`Projeto: ${projectPath}`);
  console.log(`Modo: ${mode}`);
  for (const item of plan) {
    const exists = fs.existsSync(item.target);
    let status = exists ? (refresh && mode === "apply" ? "atualizado" : "preservado") : mode === "apply" ? "criado" : "planejado";
    if (mode === "apply" && (!exists || refresh)) {
      fs.mkdirSync(path.dirname(item.target), { recursive: true });
      fs.writeFileSync(item.target, item.content, "utf8");
    }
    console.log(`${status}\t${item.relativePath}\t${item.reason}`);
  }
  console.log("Credenciais, sessoes, cache, logs, historico e bancos nao foram gerenciados.");
  return 0;
}

function main([command = "list", id, ...args]) {
  const manifest = readManifest();
  if (["help", "--help", "-h"].includes(command)) {
    help();
    return 0;
  }
  validate(manifest);
  if (command === "validate") {
    console.log(`Manifesto válido: ${Object.keys(manifest.adapters).length} adaptadores.`);
    return 0;
  }
  if (command === "list") {
    for (const [adapterId, adapter] of Object.entries(manifest.adapters)) {
      console.log(`${adapterId}\t${adapter.displayName}\t${adapter.surfaces.join(",")}\t${adapter.capabilities.join(",")}`);
    }
    return 0;
  }
  if (command === "paths") {
    if (!id || !manifest.adapters[id]) throw new Error(`Adaptador desconhecido: ${id || "[ausente]"}`);
    console.log(JSON.stringify({ id, ...manifest.adapters[id].config }, null, 2));
    return 0;
  }
  if (command === "render") {
    if (!id || !manifest.adapters[id]) throw new Error(`Adaptador desconhecido: ${id || "[ausente]"}`);
    return render(id, args);
  }
  throw new Error(`Comando desconhecido: ${command}`);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
}
