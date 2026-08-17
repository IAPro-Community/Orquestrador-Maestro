"use strict";

const { validateDAG } = require("./dag-utils");
const { createTaskGraphProposal, createSemanticTask } = require("./task-graph-proposal");

const GENERIC_TITLES = Object.freeze(["PLANNING", "SCAFFOLD", "IMPLEMENT", "TEST", "VERIFY"]);

class GraphValidator {
  static validate(proposal, options = {}) {
    if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
      return Object.freeze({
        valid: false,
        blockers: Object.freeze([{ code: "INVALID_PROPOSAL", message: "Proposal must be a non-array object" }]),
        warnings: Object.freeze([])
      });
    }

    const opts = options || {};
    const blockers = [...(proposal.blockers || [])];
    const warnings = [...(proposal.warnings || [])];
    const tasks = proposal.tasks || [];

    if (tasks.length === 0 && opts.requireTasks !== false) {
      blockers.push({ code: "EMPTY_TASK_GRAPH", message: "Proposal contains no tasks" });
    }

    const seenIds = new Set();
    for (const task of tasks) {
      if (seenIds.has(task.id)) {
        blockers.push({ code: "DUPLICATE_TASK_ID", message: `Duplicate task ID detected: ${task.id}`, taskId: task.id });
      }
      seenIds.add(task.id);

      if (task.title && GENERIC_TITLES.includes(task.title.trim().toUpperCase())) {
        blockers.push({
          code: "GENERIC_TASK_TITLE_REJECTED",
          message: `Task title "${task.title}" is a generic workflow phase. Use a descriptive engineering title.`,
          taskId: task.id
        });
      }
    }

    const dagResult = validateDAG(tasks);
    if (!dagResult.valid) {
      for (const err of dagResult.errors) {
        blockers.push({ code: "DAG_VALIDATION_FAILED", message: err });
      }
    }

    for (const assumption of proposal.assumptions || []) {
      if (assumption && assumption.critical) {
        blockers.push({
          code: "CRITICAL_ASSUMPTION_REQUIRES_REFINEMENT",
          message: `Critical planning assumption requires mission refinement: ${assumption.text}`,
          dimension: assumption.dimension
        });
      }
    }

    if (opts.missionBrief || opts.taskRelevantContext) {
      GraphValidator._validateContextAuthority(tasks, opts.missionBrief, opts.taskRelevantContext, blockers, warnings);
    }

    const valid = blockers.length === 0;
    let normalizedProposal = null;
    if (valid) {
      normalizedProposal = GraphValidator._normalizeProposal(proposal);
      const postNormDag = validateDAG(normalizedProposal.tasks);
      if (!postNormDag.valid) {
        return Object.freeze({
          valid: false,
          blockers: Object.freeze([{ code: "POST_NORMALIZATION_DAG_FAILED", message: "DAG invalid after normalization" }]),
          warnings: Object.freeze(warnings),
          normalizedProposal: null
        });
      }
    }

    return Object.freeze({
      valid,
      blockers: Object.freeze(blockers),
      warnings: Object.freeze(warnings),
      normalizedProposal
    });
  }

  static _normalizeProposal(proposal) {
    const normalizedTasks = (proposal.tasks || []).map((t) =>
      createSemanticTask({
        ...t,
        title: t.title.trim(),
        objective: t.objective.trim()
      })
    );

    return createTaskGraphProposal({
      planningMode: proposal.planningMode,
      tasks: normalizedTasks,
      assumptions: proposal.assumptions,
      warnings: proposal.warnings,
      blockers: proposal.blockers,
      rationale: proposal.rationale
    });
  }

  static _validateContextAuthority(tasks, missionBrief, taskRelevantContext, blockers, warnings) {
    const facts = new Map();
    const inferences = new Map();

    if (taskRelevantContext && Array.isArray(taskRelevantContext.items)) {
      for (const item of taskRelevantContext.items) {
        if (item.kind === "FACT" || item.kind === "USER_DECISION") {
          facts.set(item.key, item.value);
        } else if (item.kind === "INFERENCE") {
          inferences.set(item.key, item.value);
        }
      }
    }

    const isBackendOnly = facts.get("project.frontend") === null || facts.get("frontend") === null || facts.get("architecture") === "backend-only";
    const dbType = String(facts.get("database.type") || facts.get("database") || "").toLowerCase();

    const userDecisions = (missionBrief?.userDecisions || []).map((d) => String(d).toLowerCase());
    const constraints = (missionBrief?.constraints || []).map((c) => String(c).toLowerCase());
    const reusePersistence = userDecisions.some((d) => /\b(reutilizar|reuso|manter|preserve|keep|reuse)\b.*\b(persistencia|persistência|banco|database|db)\b/i.test(d)) ||
      constraints.some((c) => /\b(reutilizar|reuso|manter|preserve|keep|reuse)\b.*\b(persistencia|persistência|banco|database|db)\b/i.test(c));

    for (const task of tasks) {
      const text = `${task.title} ${task.objective}`.toLowerCase();

      if (isBackendOnly) {
        if ((task.requiredCapabilities || []).includes("frontend") || /\b(react|vue|angular|svelte|frontend|ui form|html template)\b/i.test(text)) {
          blockers.push({
            code: "CONTEXT_FACT_CONTRADICTION",
            message: `Task "${task.title}" proposes frontend/UI work on a backend-only project.`,
            taskId: task.id
          });
        }
      }

      if (dbType.includes("mongo")) {
        if (/\b(sql migration|knex|postgres|mysql|sqlite migration)\b/i.test(text)) {
          blockers.push({
            code: "DATABASE_CONTRADICTION",
            message: `Task "${task.title}" proposes SQL migrations on a MongoDB project.`,
            taskId: task.id
          });
        }
      }

      if (reusePersistence && dbType) {
        const otherDbs = ["mongo", "sqlite", "mysql", "mariadb", "postgres"].filter((db) => !dbType.includes(db));
        for (const otherDb of otherDbs) {
          if (new RegExp(`\\b${otherDb}\\b`, "i").test(text)) {
            blockers.push({
              code: "DATABASE_CONTRADICTION",
              message: `Task "${task.title}" proposes switching database to ${otherDb} while mission specifies reusing existing persistence (${dbType}).`,
              taskId: task.id
            });
            break;
          }
        }
      }

      if (constraints.some((c) => c.includes("rest only") || c.includes("no graphql"))) {
        if (/\b(graphql|apollo|schema\.gql|mutation|query resolver)\b/i.test(text)) {
          blockers.push({
            code: "MISSION_CONSTRAINT_CONTRADICTION",
            message: `Task "${task.title}" contradicts mission constraint: REST only.`,
            taskId: task.id
          });
        }
      }

      if (inferences.size > 0) {
        for (const [k, v] of inferences.entries()) {
          if (k.includes("cache") && text.includes("redis") && v === "memcached") {
            warnings.push({
              code: "INFERENCE_ADVISORY",
              message: `Inference suggests ${k}=${v}, but task proposes redis.`,
              taskId: task.id
            });
          }
        }
      }
    }
  }
}

module.exports = { GraphValidator };
