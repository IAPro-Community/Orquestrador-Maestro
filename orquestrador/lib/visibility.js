#!/usr/bin/env node
"use strict";

function isValidScope(scope) {
  if (!scope || typeof scope !== "object") return false;
  const level = scope.level;
  if (typeof level !== "string") return false;

  switch (level) {
    case "repository":
      return typeof scope.repositoryId === "string" && scope.repositoryId.length > 0;
    case "branch":
      return typeof scope.repositoryId === "string" && scope.repositoryId.length > 0
        && typeof scope.branch === "string" && scope.branch.length > 0;
    case "workspace":
      return typeof scope.repositoryId === "string" && scope.repositoryId.length > 0
        && typeof scope.workspaceId === "string" && scope.workspaceId.length > 0;
    case "commit":
      return typeof scope.repositoryId === "string" && scope.repositoryId.length > 0
        && typeof scope.headCommit === "string" && scope.headCommit.length > 0;
    case "task":
      return typeof scope.repositoryId === "string" && scope.repositoryId.length > 0
        && typeof scope.taskId === "string" && scope.taskId.length > 0;
    default:
      return false;
  }
}

function isObservationVisible(observation, currentContext, options = {}) {
  if (!observation || !observation.scope) return false;
  if (!currentContext) return false;

  const obsScope = observation.scope;
  const level = obsScope.level;

  if (!isValidScope(obsScope)) return false;

  switch (level) {
    case "repository":
      return obsScope.repositoryId === currentContext.repositoryId;

    case "branch":
      if (obsScope.repositoryId !== currentContext.repositoryId) return false;
      if (currentContext.detached) return false;
      return obsScope.branch === currentContext.branch;

    case "workspace":
      if (obsScope.repositoryId !== currentContext.repositoryId) return false;
      return obsScope.workspaceId === currentContext.workspaceId;

    case "task":
      if (obsScope.repositoryId !== currentContext.repositoryId) return false;
      if (!options.taskId) return false;
      if (obsScope.taskId !== options.taskId) return false;
      if (obsScope.branch && currentContext.branch && obsScope.branch !== currentContext.branch) return false;
      return true;

    case "commit":
      if (obsScope.repositoryId !== currentContext.repositoryId) return false;
      if (options.allowAncestry && currentContext.headCommit && obsScope.headCommit) {
        try {
          const { isAncestor } = require("./git-context.js");
          return isAncestor(
            currentContext.projectRoot,
            obsScope.headCommit,
            currentContext.headCommit
          );
        } catch {
          return obsScope.headCommit === currentContext.headCommit;
        }
      }
      return obsScope.headCommit === currentContext.headCommit;

    default:
      return false;
  }
}

function resolveObservationScope({ type, gitContext, taskId, explicitScope, fallbackRepositoryId }) {
  if (explicitScope && explicitScope.level) {
    const scope = { level: explicitScope.level };
    if (gitContext) {
      scope.repositoryId = gitContext.repositoryId;
      scope.branch = gitContext.branch;
      scope.workspaceId = gitContext.workspaceId;
      scope.headCommit = gitContext.headCommit;
    } else if (fallbackRepositoryId) {
      scope.repositoryId = fallbackRepositoryId;
    }
    if (taskId) scope.taskId = taskId;
    return scope;
  }

  const defaultScopeByType = {
    decision: "branch",
    discovery: "branch",
    problem: "branch",
    implementation: "branch",
    verification: "branch",
    risk: "branch",
    dependency: "branch",
    attempt: "task",
    failure: "branch",
    environment: "workspace",
    workaround: "workspace"
  };

  let level = defaultScopeByType[type] || "branch";

  if (gitContext && gitContext.detached && level === "branch") {
    level = "commit";
  }

  if (level === "task" && !taskId) {
    level = gitContext && gitContext.detached ? "commit" : "branch";
  }

  if (level === "branch" && !(gitContext && gitContext.branch)) {
    level = "repository";
  }
  if (level === "workspace" && !(gitContext && gitContext.workspaceId)) {
    level = "repository";
  }
  if (level === "commit" && !(gitContext && gitContext.headCommit)) {
    level = "repository";
  }

  const scope = { level };

  if (gitContext) {
    scope.repositoryId = gitContext.repositoryId;
    scope.branch = gitContext.branch;
    scope.workspaceId = gitContext.workspaceId;
    scope.headCommit = gitContext.headCommit;
  } else if (fallbackRepositoryId) {
    scope.repositoryId = fallbackRepositoryId;
  }
  if (taskId) scope.taskId = taskId;

  return scope;
}

function rankObservations(observations, taskTokens, currentContext, options = {}) {
  return observations.map(obs => {
    let score = 0;
    const blockers = [];

    if (!isObservationVisible(obs, currentContext, options)) {
      return { obs, score: -1, blocked: true, reason: "visibility blocked" };
    }

    if (obs.verified) score += 10;

    const obsTokens = tokenizeRank(
      (obs.summary || "") + " " +
      (obs.details || "") + " " +
      (obs.tags || []).join(" ")
    );

    for (const t of taskTokens) {
      if (obsTokens.includes(t)) score += 5;
      if ((obs.tags || []).some(tag => tag.toLowerCase().includes(t))) score += 3;
    }

    if (obs.scope) {
      if (obs.scope.level === "branch" && obs.scope.branch === currentContext.branch) score += 4;
      if (obs.scope.level === "workspace" && obs.scope.workspaceId === currentContext.workspaceId) score += 2;
      if (obs.scope.level === "repository") score += 1;
    }

    if (obs.timestamp) {
      const age = (Date.now() - new Date(obs.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      if (age < 1) score += 3;
      else if (age < 7) score += 2;
      else if (age < 30) score += 1;
    }

    return { obs, score, blocked: false };
  })
  .filter(r => !r.blocked && r.score > 0)
  .sort((a, b) => b.score - a.score);
}

function tokenizeRank(text) {
  if (!text || typeof text !== "string") return [];
  const STOP_WORDS = new Set([
    "the", "and", "that", "this", "with", "for", "from", "are", "was",
    "para", "com", "uma", "um", "dos", "das", "que", "por", "mais",
    "continue", "continuar", "fazer", "ajustar", "using", "used",
    "have", "has", "had", "was", "were", "been", "being"
  ]);
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 3 && !STOP_WORDS.has(token));
}

module.exports = {
  isValidScope,
  isObservationVisible,
  resolveObservationScope,
  rankObservations,
  tokenizeRank
};
