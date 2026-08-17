"use strict";

function computeWaves(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];

  const taskMap = new Map();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  const assigned = new Set();
  const waves = [];

  while (assigned.size < tasks.length) {
    const wave = [];
    for (const task of tasks) {
      if (assigned.has(task.id)) continue;
      const deps = Array.isArray(task.dependsOn) ? task.dependsOn : [];
      if (deps.every((dep) => assigned.has(dep))) {
        wave.push(task.id);
      }
    }
    if (wave.length === 0) break;
    waves.push(wave);
    for (const id of wave) assigned.add(id);
  }

  return waves;
}

function renderTask(task, index) {
  const num = String(index + 1).padStart(2, "0");
  const lines = [];
  lines.push(`### ${num}. ${task.title}`);
  lines.push("");
  lines.push(`- **id**: ${task.id}`);
  lines.push(`- **type**: ${task.type || "other"}`);
  lines.push(`- **objective**: ${task.objective}`);
  if (task.complexity) lines.push(`- **complexity**: ${task.complexity}`);
  if (task.risk) lines.push(`- **risk**: ${task.risk}`);
  if (Array.isArray(task.requiredCapabilities) && task.requiredCapabilities.length > 0) {
    lines.push(`- **capabilities**: ${task.requiredCapabilities.join(", ")}`);
  }
  if (Array.isArray(task.dependsOn) && task.dependsOn.length > 0) {
    lines.push(`- **dependsOn**: ${task.dependsOn.join(", ")}`);
  }
  if (Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length > 0) {
    lines.push(`- **acceptanceCriteria**:`);
    for (const criterion of task.acceptanceCriteria) {
      lines.push(`  - ${criterion}`);
    }
  }
  if (Array.isArray(task.requiredSkills) && task.requiredSkills.length > 0) {
    lines.push(`- **requiredSkills**: ${task.requiredSkills.join(", ")}`);
  }
  if (task.planningReason) lines.push(`- **planningReason**: ${task.planningReason}`);
  if (task.dependencyReasons && Object.keys(task.dependencyReasons).length > 0) {
    lines.push(`- **dependencyReasons**:`);
    for (const [dep, reason] of Object.entries(task.dependencyReasons)) {
      lines.push(`  - ${dep}: ${reason}`);
    }
  }
  return lines.join("\n");
}

class PlanArtifactRenderer {
  static render(proposal, context = {}) {
    if (!proposal || typeof proposal !== "object") {
      throw new TypeError("proposal must be an object");
    }

    const tasks = Array.isArray(proposal.tasks) ? proposal.tasks : [];
    const assumptions = Array.isArray(proposal.assumptions) ? proposal.assumptions : [];
    const warnings = Array.isArray(proposal.warnings) ? proposal.warnings : [];
    const sections = [];

    sections.push("# Plan");
    sections.push("");

    if (tasks.length === 0) {
      sections.push("No tasks in this plan.");
    } else {
      sections.push("## Tasks");
      sections.push("");
      for (let i = 0; i < tasks.length; i++) {
        sections.push(renderTask(tasks[i], i));
        sections.push("");
      }
    }

    const waves = computeWaves(tasks);
    if (waves.length > 0) {
      sections.push("## Parallelism Waves");
      sections.push("");
      for (let w = 0; w < waves.length; w++) {
        sections.push(`### Wave ${w + 1}`);
        sections.push("");
        for (const taskId of waves[w]) {
          sections.push(`- ${taskId}`);
        }
        sections.push("");
      }
    }

    sections.push("## Metadata");
    sections.push("");
    sections.push(`- **planningMode**: ${proposal.planningMode || "unknown"}`);
    if (proposal.rationale) sections.push(`- **rationale**: ${proposal.rationale}`);
    sections.push("");

    if (assumptions.length > 0) {
      sections.push("## Assumptions");
      sections.push("");
      for (const a of assumptions) {
        const text = typeof a === "string" ? a : a.text || "";
        const critical = typeof a === "object" && a.critical ? " (critical)" : "";
        sections.push(`- ${text}${critical}`);
      }
      sections.push("");
    }

    if (warnings.length > 0) {
      sections.push("## Warnings");
      sections.push("");
      for (const w of warnings) {
        sections.push(`- ${w}`);
      }
      sections.push("");
    }

    if (context.missionBrief) {
      sections.push("## Mission Brief");
      sections.push("");
      const mb = context.missionBrief;
      if (mb.objective) sections.push(`- **objective**: ${mb.objective}`);
      if (Array.isArray(mb.requirements) && mb.requirements.length > 0) {
        sections.push(`- **requirements**:`);
        for (const r of mb.requirements) {
          sections.push(`  - ${r}`);
        }
      }
      if (Array.isArray(mb.constraints) && mb.constraints.length > 0) {
        sections.push(`- **constraints**:`);
        for (const c of mb.constraints) {
          sections.push(`  - ${c}`);
        }
      }
      sections.push("");
    }

    if (context.taskRelevantContext) {
      sections.push("## Context");
      sections.push("");
      const ctx = context.taskRelevantContext;
      if (Array.isArray(ctx.items)) {
        for (const item of ctx.items) {
          sections.push(`- **${item.key}**: ${JSON.stringify(item.value)} (${item.kind})`);
        }
      }
      sections.push("");
    }

    return sections.join("\n");
  }
}

module.exports = { PlanArtifactRenderer, computeWaves };
