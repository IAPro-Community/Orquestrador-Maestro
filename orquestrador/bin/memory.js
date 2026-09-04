#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");

const MEMORY_SCHEMA = require("../schemas/MEMORY_SCHEMA.json");
const OBSERVATION_TYPES = MEMORY_SCHEMA.properties.type.enum;
const { classifyTask } = require("../lib/task-classifier.js");
const { CapturePolicy, POLICIES } = require("../lib/capture-policy.js");
const { resolveGitContext, resolveProjectRoot, shouldUseMemory } = require("../lib/git-context.js");
const { isValidScope, isObservationVisible, resolveObservationScope, rankObservations } = require("../lib/visibility.js");
const { withLock, getLockPath } = require("../lib/lock.js");

const SAFE_DESTINATIONS = [
  "DEV/CONTEXT.md",
  "DEV/DECISIONS.md",
  "DEV/ARCHITECTURE.md",
  "DEV/RUNBOOKS"
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?prior/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?:/i,
  /system\s*prompt/i,
  /act\s+as\s+if/i,
  /pretend\s+you\s+are/i,
  /<script>/i,
  /\{\{.*\}\}/
];

class Memory {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.env.ORQUESTRADOR_MAESTRO_MEMORY_DIR || path.join(os.homedir(), ".orquestrador", "memory");
    this.schemaVersion = 1;
    this.capturePolicy = options.capturePolicy || new CapturePolicy();
  }

  generateId() {
    return `obs_${crypto.randomBytes(8).toString("hex")}`;
  }

  resolveProjectFromArgs(args, fallback) {
    const project = this.getArg(args, "--project");
    const projectPath = project || fallback;
    const root = resolveProjectRoot(projectPath);
    return root ? this.resolveRepositoryId(root) : this.resolveRepositoryId(projectPath);
  }

  resolveProjectRootFromArgs(args, fallback) {
    const project = this.getArg(args, "--project");
    return resolveProjectRoot(project || fallback) || path.resolve(project || fallback);
  }

  getArg(args, name) {
    const idx = args.indexOf(name);
    if (idx === -1) return null;
    return args[idx + 1] || null;
  }

  getArgList(args, name) {
    const val = this.getArg(args, name);
    return val ? val.split(",").map(s => s.trim()).filter(Boolean) : [];
  }

  getArgNumber(args, name) {
    const val = this.getArg(args, name);
    return val ? Number.parseInt(val, 10) : null;
  }

  resolveRepositoryId(projectRoot) {
    const { resolveRepositoryId: resolveFromGitContext } = require("../lib/git-context.js");
    return resolveFromGitContext(projectRoot);
  }

  resolveScope(projectId, args, projectRoot) {
    const explicit = this.getArg(args, "--scope");
    const gitCtx = projectRoot ? resolveGitContext(projectRoot) : null;
    const taskId = this.getArg(args, "--task");

    if (explicit) {
      return resolveObservationScope({
        type: this.getArg(args, "--type") || "discovery",
        gitContext: gitCtx,
        taskId,
        explicitScope: { level: explicit }
      });
    }

    return resolveObservationScope({
      type: this.getArg(args, "--type") || "discovery",
      gitContext: gitCtx,
      taskId,
      explicitScope: null
    });
  }

  detectInjection(content) {
    if (typeof content !== "string") return false;
    return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(content));
  }

  getProjectDir(projectId) {
    const safeId = projectId.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 64);
    return path.join(this.baseDir, "repositories", safeId);
  }

  getObservationsFile(projectId) {
    return path.join(this.getProjectDir(projectId), "observations.jsonl");
  }

  ensureProjectDir(projectId) {
    const dir = this.getProjectDir(projectId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    return dir;
  }

  redactContent(content) {
    if (typeof content !== "string") return content;
    return content
      .replace(/(?:mysql|postgres|postgresql|mongodb):\/\/[^\s`"']+/gi, "[CONNECTION_STRING_REDACTED]")
      .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|authorization|bearer)\s*[:=]\s*[^\s`"']+/giu, "$1=[REDACTED]")
      .replace(/(?:[A-Za-z]:[\\/]|\/Users\/|\/home\/|\/root\/)[^\s`"']+/gu, "[PATH_REDACTED]")
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL_REDACTED]")
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[PHONE_REDACTED]")
      .replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, "[SSN_REDACTED]")
      .replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT_REDACTED]")
      .replace(/-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/g, "[PRIVATE_KEY_REDACTED]")
      .replace(/(?:sk-|pk-|rk-)[A-Za-z0-9]{20,}/g, "[API_KEY_REDACTED]")
      .replace(/ghp_[A-Za-z0-9]{36}/g, "[GITHUB_TOKEN_REDACTED]")
      .replace(/cookie\s*[:=]\s*[^\s`"']+/gi, "[COOKIE_REDACTED]")
      .replace(/(?:AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID)\s*[:=]\s*[^\s`"']+/gi, "[AWS_KEY_REDACTED]")
      .replace(/(?:GOOGLE_APPLICATION_CREDENTIALS|GITHUB_TOKEN)\s*[:=]\s*[^\s`"']+/gi, "[CREDENTIAL_REDACTED]")
      .replace(/\.env[^a-zA-Z0-9]/gi, "[ENV_FILE_REDACTED]");
  }

  containsPrivateContent(content) {
    if (typeof content !== "string") return false;
    return /<private>[\s\S]*?<\/private>/i.test(content);
  }

  stripPrivateContent(content) {
    if (typeof content !== "string") return content;
    return content.replace(/<private>[\s\S]*?<\/private>/gi, "").trim();
  }

  validateObservation(obs) {
    if (!obs.schemaVersion || obs.schemaVersion !== 1) {
      throw new Error("Invalid schemaVersion");
    }
    if (!obs.id || !/^obs_[a-f0-9]{16}$/.test(obs.id)) {
      throw new Error("Invalid observation ID");
    }
    if (!OBSERVATION_TYPES.includes(obs.type)) {
      throw new Error(`Invalid observation type: ${obs.type}`);
    }
    if (!obs.summary || obs.summary.length === 0) {
      throw new Error("Summary is required");
    }
    if (obs.summary.length > 500) {
      throw new Error("Summary must be at most 500 characters");
    }
    if (!obs.project) {
      throw new Error("Project is required");
    }
    if (!obs.scope || !isValidScope(obs.scope)) {
      throw new Error("Invalid observation scope: scope is required and must have valid level with required identifiers");
    }
    if (this.detectInjection(obs.summary) || this.detectInjection(obs.details || "")) {
      throw new Error("Potential prompt injection detected in content");
    }
    return true;
  }

  writeAtomic(filePath, content) {
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, content, { encoding: "utf8", mode: 0o600 });
    try {
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch {}
      throw err;
    }
  }

  appendObservation(filePath, obs) {
    const line = JSON.stringify(obs) + "\n";
    fs.appendFileSync(filePath, line, { encoding: "utf8", mode: 0o600 });
  }

  readObservations(filePath) {
    if (!fs.existsSync(filePath)) return { valid: [], malformed: 0, malformedLines: [] };
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const valid = [];
    const malformedLines = [];
    let malformed = 0;
    for (const line of lines) {
      try {
        valid.push(JSON.parse(line));
      } catch {
        malformed++;
        malformedLines.push(line);
      }
    }
    return { valid, malformed, malformedLines };
  }

  record(projectId, observation, options = {}) {
    if (this.containsPrivateContent(observation.summary) || this.containsPrivateContent(observation.details || "")) {
      throw new Error("Private content cannot be persisted to memory");
    }

    const policyResult = this.capturePolicy.evaluate(observation);
    if (policyResult.policy === POLICIES.DROP) {
      return null;
    }

    this.ensureProjectDir(projectId);

    let scope = observation.scope;
    if (!scope || !scope.level || !isValidScope(scope)) {
      const gitCtx = options.gitContext || (options.projectRoot ? resolveGitContext(options.projectRoot) : null);
      scope = resolveObservationScope({
        type: observation.type,
        gitContext: gitCtx,
        taskId: observation.taskId,
        explicitScope: observation.scope,
        fallbackRepositoryId: projectId
      });
    }

    const obs = {
      schemaVersion: this.schemaVersion,
      id: observation.id || this.generateId(),
      timestamp: observation.timestamp || new Date().toISOString(),
      project: projectId,
      type: observation.type,
      summary: this.redactContent(observation.summary),
      details: observation.details ? this.redactContent(observation.details) : null,
      files: (observation.files || []).map(f => this.redactContent(f)),
      tags: observation.tags || [],
      verified: observation.verified || false,
      source: observation.source || {},
      scope,
      capturePolicy: policyResult.policy
    };

    if (observation.taskId) obs.taskId = observation.taskId;

    const applied = this.capturePolicy.applyPolicy(obs, policyResult);
    if (!applied) return null;

    this.validateObservation(applied);

    const filePath = this.getObservationsFile(projectId);
    const lockPath = getLockPath(filePath);

    return withLock(lockPath, () => {
      this.appendObservation(filePath, applied);
      return applied;
    });
  }

  search(projectId, query = {}) {
    const filePath = this.getObservationsFile(projectId);
    const { valid: initialObservations } = this.readObservations(filePath);
    let observations = [...initialObservations];

    if (query.type) {
      observations = observations.filter(obs => obs.type === query.type);
    }
    if (query.verified !== undefined) {
      observations = observations.filter(obs => obs.verified === query.verified);
    }
    if (query.tags && query.tags.length > 0) {
      observations = observations.filter(obs =>
        query.tags.some(tag => obs.tags.includes(tag))
      );
    }
    if (query.files && query.files.length > 0) {
      observations = observations.filter(obs =>
        query.files.some(file => obs.files.includes(file))
      );
    }
    if (query.from) {
      const fromDate = new Date(query.from);
      observations = observations.filter(obs => new Date(obs.timestamp) >= fromDate);
    }
    if (query.to) {
      const toDate = new Date(query.to);
      observations = observations.filter(obs => new Date(obs.timestamp) <= toDate);
    }
    if (query.search) {
      const searchTokens = this.tokenize(query.search);
      if (searchTokens.length > 0) {
        observations = observations.filter(obs => {
          if (query.taskId && (obs.taskId === query.taskId || obs.scope?.taskId === query.taskId)) {
            return true;
          }
          const obsTokens = this.tokenize(
            (obs.summary || "") + " " + (obs.details || "") + " " + (obs.tags || []).join(" ")
          );
          const overlap = searchTokens.filter(t => obsTokens.includes(t));
          return overlap.length > 0;
        });
      }
    }
    if (query.branch) {
      observations = observations.filter(obs =>
        obs.scope && (obs.scope.branch === query.branch || obs.scope.level === "repository")
      );
    }
    if (query.scope) {
      observations = observations.filter(obs =>
        obs.scope && obs.scope.level === query.scope
      );
    }

    observations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (query.limit) {
      observations = observations.slice(0, query.limit);
    }

    return observations;
  }

  searchWithVisibility(projectId, gitContext, query = {}) {
    const filePath = this.getObservationsFile(projectId);
    const { valid: allObservations } = this.readObservations(filePath);

    const metrics = { considered: 0, visible: 0, selected: 0 };

    metrics.considered = allObservations.length;

    let observations = allObservations.filter(obs =>
      isObservationVisible(obs, gitContext, { taskId: query.taskId, allowAncestry: query.allowAncestry })
    );

    metrics.visible = observations.length;

    if (query.type) {
      observations = observations.filter(obs => obs.type === query.type);
    }
    if (query.verified !== undefined) {
      observations = observations.filter(obs => obs.verified === query.verified);
    }
    if (query.search) {
      const searchTokens = this.tokenize(query.search);
      if (searchTokens.length > 0) {
        observations = observations.filter(obs => {
          if (query.taskId && (obs.taskId === query.taskId || obs.scope?.taskId === query.taskId)) {
            return true;
          }
          const obsTokens = this.tokenize(
            (obs.summary || "") + " " + (obs.details || "") + " " + (obs.tags || []).join(" ")
          );
          return searchTokens.some(t => obsTokens.includes(t));
        });
      }
    }

    if (query.rank && query.search) {
      const taskTokens = this.tokenize(query.search);
      const ranked = rankObservations(observations, taskTokens, gitContext, { taskId: query.taskId });
      observations = ranked.map(r => r.obs);
    } else {
      observations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    if (query.limit) {
      observations = observations.slice(0, query.limit);
    }

    metrics.selected = observations.length;

    observations.metrics = metrics;
    return observations;
  }

  tokenize(text) {
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

  show(projectId, observationId) {
    const filePath = this.getObservationsFile(projectId);
    const { valid: observations } = this.readObservations(filePath);
    return observations.find(obs => obs.id === observationId) || null;
  }

  timeline(projectId, options = {}) {
    return this.search(projectId, {
      from: options.from,
      to: options.to,
      limit: options.limit || 50
    }).map(obs => ({
      id: obs.id,
      timestamp: obs.timestamp,
      type: obs.type,
      summary: obs.summary,
      verified: obs.verified,
      branch: obs.scope?.branch
    }));
  }

  promote(projectId, observationId, destination, options = {}) {
    const obs = this.show(projectId, observationId);
    if (!obs) throw new Error(`Observation not found: ${observationId}`);
    if (!obs.verified) throw new Error("Cannot promote unverified observation");

    const projectRoot = options.projectRoot || process.cwd();
    const resolvedRoot = resolveProjectRoot(projectRoot) || path.resolve(projectRoot);
    const destPath = path.resolve(resolvedRoot, destination);

    const rootPath = path.resolve(resolvedRoot);
    const relativeDest = path.relative(rootPath, destPath);
    if (relativeDest.startsWith("..") || path.isAbsolute(relativeDest)) {
      throw new Error("Destination must be within project root");
    }

    try {
      const realDestPath = fs.realpathSync(path.dirname(destPath));
      const relativeRealDir = path.relative(rootPath, realDestPath);
      if (relativeRealDir.startsWith("..") || path.isAbsolute(relativeRealDir)) {
        throw new Error("Symlink escape detected");
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    const normalizedDest = path.normalize(destination).replace(/\\/g, "/");
    const isSafeDest = SAFE_DESTINATIONS.some(d => normalizedDest === d || normalizedDest.startsWith(d + "/"));
    if (!isSafeDest) {
      throw new Error(`Destination must be one of: ${SAFE_DESTINATIONS.join(", ")}`);
    }

    if (!options.apply) {
      return {
        observation: obs,
        destination,
        status: "dry-run",
        content: `## ${obs.type}: ${obs.summary}\n\n${obs.details || ""}\n\nFiles: ${obs.files.join(", ")}\nTags: ${obs.tags.join(", ")}\nVerified: ${obs.verified}\n`
      };
    }

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const entry = `\n\n## ${obs.type}: ${obs.summary}\n\n${obs.details || ""}\n\n- Source: observation ${obs.id}\n- Promoted at: ${new Date().toISOString()}\n- Branch: ${obs.scope?.branch || "unknown"}\n`;

    const lockPath = getLockPath(destPath);
    return withLock(lockPath, () => {
      let existingContent = "";
      if (fs.existsSync(destPath)) {
        existingContent = fs.readFileSync(destPath, "utf8");
      }
      this.writeAtomic(destPath, existingContent + entry);

      const obsFilePath = this.getObservationsFile(projectId);
      const obsLockPath = getLockPath(obsFilePath);
      withLock(obsLockPath, () => {
        const { valid: observations, malformedLines } = this.readObservations(obsFilePath);
        const idx = observations.findIndex(o => o.id === observationId);
        if (idx !== -1) {
          if (!observations[idx].scope) observations[idx].scope = {};
          observations[idx].scope.promoted = true;
          const lines = [...observations.map(o => JSON.stringify(o)), ...malformedLines];
          this.writeAtomic(obsFilePath, lines.join("\n") + "\n");
        }
      });

      return {
        observation: obs,
        destination,
        status: "promoted",
        promotedAt: new Date().toISOString()
      };
    });
  }

  stats(projectId) {
    const filePath = this.getObservationsFile(projectId);
    const { valid: observations, malformed } = this.readObservations(filePath);
    const byType = {};
    let verified = 0;
    for (const obs of observations) {
      byType[obs.type] = (byType[obs.type] || 0) + 1;
      if (obs.verified) verified++;
    }
    return { total: observations.length, byType, verified, unverified: observations.length - verified, malformed };
  }

  listProjects() {
    const projectsDir = path.join(this.baseDir, "repositories");
    if (!fs.existsSync(projectsDir)) return [];
    return fs.readdirSync(projectsDir).filter(dir => {
      const dirPath = path.join(projectsDir, dir);
      return fs.statSync(dirPath).isDirectory();
    });
  }

  dedupe(projectId) {
    const filePath = this.getObservationsFile(projectId);
    const lockPath = getLockPath(filePath);

    return withLock(lockPath, () => {
      const { valid: observations, malformed, malformedLines } = this.readObservations(filePath);
      const initialCount = observations.length;
      const seen = new Map();
      const deduped = [];

      for (const obs of observations) {
        const scopeKey = obs.scope
          ? `${obs.scope.level}:${obs.scope.repositoryId || ""}:${obs.scope.branch || ""}:${obs.scope.workspaceId || ""}:${obs.scope.taskId || ""}:${obs.scope.headCommit || ""}`
          : "no-scope";
        const key = `${scopeKey}:${obs.type}:${(obs.summary || "").substring(0, 100)}`;
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, obs);
          deduped.push(obs);
        } else {
          const existingIsVerified = existing.verified;
          const obsIsVerified = obs.verified;
          if (obsIsVerified && !existingIsVerified) {
            const index = deduped.findIndex(d => d.id === existing.id);
            if (index !== -1) deduped[index] = obs;
            seen.set(key, obs);
          } else if (!obsIsVerified && existingIsVerified) {
            continue;
          } else if (new Date(obs.timestamp) > new Date(existing.timestamp)) {
            const index = deduped.findIndex(d => d.id === existing.id);
            if (index !== -1) deduped[index] = obs;
            seen.set(key, obs);
          }
        }
      }

      const lines = [...deduped.map(obs => JSON.stringify(obs)), ...malformedLines];
      this.writeAtomic(filePath, lines.join("\n") + "\n");
      return { deduped: initialCount - deduped.length, remaining: deduped.length, malformed };
    });
  }

  consolidate(projectId, observationIds, consolidatedObs) {
    const filePath = this.getObservationsFile(projectId);
    const lockPath = getLockPath(filePath);

    const preCheck = this.readObservations(filePath);
    const preCheckObs = observationIds.map(id => preCheck.valid.find(o => o.id === id)).filter(Boolean);
    if (preCheckObs.length === 0) throw new Error("No valid observations found to consolidate");

    return withLock(lockPath, () => {
      const observations = observationIds.map(id => this.show(projectId, id)).filter(Boolean);
      if (observations.length === 0) throw new Error("No valid observations found to consolidate");

      const levels = [...new Set(observations.map(o => o.scope?.level).filter(Boolean))];
      if (levels.length > 1) {
        throw new Error("Cannot consolidate observations from different scope levels");
      }

      const scopeLevel = levels[0];
      if (scopeLevel === "branch") {
        const branches = [...new Set(observations.map(o => o.scope?.branch).filter(Boolean))];
        if (branches.length > 1) {
          throw new Error("Cannot consolidate observations from different branches");
        }
      }
      if (scopeLevel === "workspace") {
        const workspaces = [...new Set(observations.map(o => o.scope?.workspaceId).filter(Boolean))];
        if (workspaces.length > 1) {
          throw new Error("Cannot consolidate observations from different workspaces");
        }
      }
      if (scopeLevel === "task") {
        const taskIds = [...new Set(observations.map(o => o.scope?.taskId).filter(Boolean))];
        if (taskIds.length > 1) {
          throw new Error("Cannot consolidate observations from different tasks");
        }
      }
      if (scopeLevel === "commit") {
        const commits = [...new Set(observations.map(o => o.scope?.headCommit).filter(Boolean))];
        if (commits.length > 1) {
          throw new Error("Cannot consolidate observations from different commits");
        }
      }

      const firstScope = observations[0].scope || { level: "repository" };

      const consolidated = {
        schemaVersion: this.schemaVersion,
        id: consolidatedObs.id || this.generateId(),
        timestamp: consolidatedObs.timestamp || new Date().toISOString(),
        project: projectId,
        type: consolidatedObs.type || "discovery",
        summary: this.redactContent(consolidatedObs.summary),
        details: consolidatedObs.details ? this.redactContent(consolidatedObs.details) : null,
        files: [...new Set(observations.flatMap(obs => obs.files || []))],
        tags: [...new Set(observations.flatMap(obs => obs.tags || []))],
        verified: consolidatedObs.verified || false,
        source: consolidatedObs.source || {},
        scope: consolidatedObs.scope || firstScope,
        consolidatedFrom: observationIds
      };

      if (consolidatedObs.taskId) consolidated.taskId = consolidatedObs.taskId;

      this.validateObservation(consolidated);

      const { valid: allObservations, malformedLines } = this.readObservations(filePath);
      const filtered = allObservations.filter(obs => !observationIds.includes(obs.id));
      filtered.push(consolidated);
      const lines = [...filtered.map(obs => JSON.stringify(obs)), ...malformedLines];
      this.writeAtomic(filePath, lines.join("\n") + "\n");
      return consolidated;
    });
  }

  retention(projectId, options = {}) {
    const filePath = this.getObservationsFile(projectId);
    const lockPath = getLockPath(filePath);

    return withLock(lockPath, () => {
      const { valid: observations, malformed, malformedLines } = this.readObservations(filePath);
      const initialCount = observations.length;
      const now = new Date();
      const maxAgeDays = options.maxAgeDays || 90;
      const maxCount = options.maxCount || 1000;

      let filtered = observations.filter(obs => {
        if (obs.verified) return true;
        if (obs.scope?.promoted) return true;
        const age = (now - new Date(obs.timestamp)) / (1000 * 60 * 60 * 24);
        return age <= maxAgeDays;
      });

      if (filtered.length > maxCount) {
        const verified = filtered.filter(obs => obs.verified || obs.scope?.promoted);
        const unverified = filtered.filter(obs => !obs.verified && !obs.scope?.promoted);
        unverified.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const keepUnverified = Math.max(0, maxCount - verified.length);
        filtered = [...verified, ...unverified.slice(0, keepUnverified)];
      }

      const lines = [...filtered.map(obs => JSON.stringify(obs)), ...malformedLines];
      this.writeAtomic(filePath, lines.join("\n") + "\n");
      return { retained: filtered.length, removed: initialCount - filtered.length, malformed };
    });
  }

  cleanup(projectId) {
    const dedupeResult = this.dedupe(projectId);
    const retentionResult = this.retention(projectId);
    return { deduped: dedupeResult.deduped, retained: retentionResult.retained, removed: retentionResult.removed };
  }

  prune(projectId, options = {}) {
    const filePath = this.getObservationsFile(projectId);
    const lockPath = getLockPath(filePath);

    return withLock(lockPath, () => {
      const { valid: observations, malformed, malformedLines } = this.readObservations(filePath);
      const initialCount = observations.length;
      let filtered = [...observations];

      const keepVerified = options.keepVerified !== false;
      const protectedObs = keepVerified
        ? filtered.filter(obs => obs.verified)
        : [];
      const prunable = keepVerified
        ? filtered.filter(obs => !obs.verified)
        : [...filtered];

      if (options.keepRecent) {
        prunable.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const slots = Math.max(0, options.keepRecent);
        filtered = [...protectedObs, ...prunable.slice(0, slots)];
      } else {
        filtered = [...protectedObs, ...prunable];
      }

      const lines = [...filtered.map(obs => JSON.stringify(obs)), ...malformedLines];
      this.writeAtomic(filePath, lines.join("\n") + "\n");
      return { pruned: initialCount - filtered.length, remaining: filtered.length, malformed };
    });
  }

  printHelp() {
    console.log(`Orquestrador Maestro Memory

Uso:
  memory record [--project PATH] --type TYPE --summary TEXT [opcoes]
  memory search [--project PATH] [--search TEXT] [--type TYPE] [--verified] [--unverified]
  memory show [--project PATH] --id ID
  memory timeline [--project PATH] [--limit N]
  memory promote [--project PATH] --id ID --destination PATH [--apply]
  memory stats [--project PATH]
  memory status
  memory cleanup [--project PATH]

Tipos: ${OBSERVATION_TYPES.join(", ")}

Flags:
  --project PATH     Diretorio do projeto (padrao: cwd)
  --type TYPE        Tipo da observation
  --summary TEXT     Resumo
  --details TEXT     Detalhes
  --files LIST       Arquivos (comma-separated)
  --tags LIST        Tags (comma-separated)
  --verified         Marcar como verificado
  --unverified       Filtrar nao verificados
  --task ID          ID da tarefa
  --search TEXT      Texto para buscar
  --from DATE        Data inicial
  --to DATE          Data final
  --limit N          Limite de resultados
  --id ID            ID da observation
  --branch BRANCH    Filtrar por branch
  --scope LEVEL      Escopo: repository, branch, workspace, commit, task
  --destination PATH Destino para promocao (DEV/CONTEXT.md, DEV/DECISIONS.md, DEV/ARCHITECTURE.md)
  --apply            Aplicar promocao (sem --apply e dry-run)
  --help             Mostra esta ajuda
`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const memory = new Memory();

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    memory.printHelp();
    return 0;
  }

  const subcommand = args[0];
  const rest = args.slice(1);

  if (subcommand === "status") {
    const projectPath = process.cwd();
    const gitCtx = resolveGitContext(projectPath);
    const repoId = gitCtx.repositoryId;
    const stats = memory.stats(repoId);
    console.log(JSON.stringify({
      repository: gitCtx.remote || gitCtx.projectRoot,
      repositoryId: repoId,
      branch: gitCtx.branch,
      detached: gitCtx.detached,
      head: gitCtx.headCommit,
      workspaceId: gitCtx.workspaceId,
      memory: { repository: stats.total, byType: stats.byType, verified: stats.verified }
    }, null, 2));
    return 0;
  }

  const projectPath = memory.resolveProjectRootFromArgs(rest, process.cwd());
  const project = memory.resolveProjectFromArgs(rest, process.cwd());
  const gitCtx = resolveGitContext(projectPath);

  switch (subcommand) {
    case "record": {
      const type = memory.getArg(rest, "--type");
      const summary = memory.getArg(rest, "--summary");
      if (!type || !summary) { console.error("--type and --summary required"); return 1; }
      const obs = memory.record(project, {
        type, summary,
        details: memory.getArg(rest, "--details"),
        files: memory.getArgList(rest, "--files"),
        tags: memory.getArgList(rest, "--tags"),
        verified: rest.includes("--verified"),
        taskId: memory.getArg(rest, "--task"),
        scope: memory.resolveScope(project, rest, projectPath)
      }, { gitContext: gitCtx, projectRoot: projectPath });
      console.log(JSON.stringify(obs, null, 2));
      return 0;
    }
    case "search": {
      const results = memory.search(project, {
        type: memory.getArg(rest, "--type"),
        tags: memory.getArgList(rest, "--tags"),
        search: memory.getArg(rest, "--search"),
        from: memory.getArg(rest, "--from"),
        to: memory.getArg(rest, "--to"),
        limit: memory.getArgNumber(rest, "--limit"),
        verified: rest.includes("--verified") ? true : rest.includes("--unverified") ? false : undefined,
        branch: memory.getArg(rest, "--branch"),
        scope: memory.getArg(rest, "--scope")
      });
      console.log(JSON.stringify(results, null, 2));
      return 0;
    }
    case "show": {
      const id = memory.getArg(rest, "--id");
      if (!id) { console.error("--id required"); return 1; }
      const obs = memory.show(project, id);
      if (!obs) { console.error("Not found"); return 1; }
      console.log(JSON.stringify(obs, null, 2));
      return 0;
    }
    case "timeline": {
      const tl = memory.timeline(project, { limit: memory.getArgNumber(rest, "--limit") || 50 });
      console.log(JSON.stringify(tl, null, 2));
      return 0;
    }
    case "promote": {
      const id = memory.getArg(rest, "--id");
      const dest = memory.getArg(rest, "--destination");
      if (!id || !dest) { console.error("--id and --destination required"); return 1; }
      const result = memory.promote(project, id, dest, { apply: rest.includes("--apply"), projectRoot: projectPath });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case "stats": {
      console.log(JSON.stringify(memory.stats(project), null, 2));
      return 0;
    }
    case "cleanup": {
      console.log(JSON.stringify(memory.cleanup(project), null, 2));
      return 0;
    }
    default:
      console.error(`Unknown: ${subcommand}`);
      memory.printHelp();
      return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { Memory };
