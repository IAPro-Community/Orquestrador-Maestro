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

// RFC-0003: unbounded details bloat JSONL and smuggle bulk content past
// review. Truncated (not rejected) so adapter flows keep working.
const MAX_DETAILS_CHARS = 4000;

/**
 * Uniform trust predicate for READS. A bare `verified:true` (legacy rows,
 * hand-edited JSONL) has no authority: verified requires an identified
 * verifier and a parseable verifiedAt. Write paths enforce this via
 * resolveVerification(); every read path below must use this predicate.
 */
function isTrulyVerified(obs) {
  if (!obs || obs.verified !== true) return false;
  if (typeof obs.verifier !== "string" || obs.verifier.trim().length === 0) return false;
  if (typeof obs.verifiedAt !== "string" || Number.isNaN(Date.parse(obs.verifiedAt))) return false;
  return true;
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?prior/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?:/i,
  /system\s*prompt/i,
  /act\s+as\s+if/i,
  /pretend\s+you\s+are/i,
  /<script>/i,
  /\{\{[\s\S]*?\}\}/
];

class Memory {
  constructor(options = {}) {
    const canonicalRoot = path.join(os.homedir(), ".orquestrador-maestro");
    const legacyRoot = path.join(os.homedir(), ".orquestrador");
    const maestroRoot = fs.existsSync(canonicalRoot) ? canonicalRoot : legacyRoot;
    this.baseDir = options.baseDir || process.env.ORQUESTRADOR_MAESTRO_MEMORY_DIR || path.join(maestroRoot, "memory");
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
      .replace(/-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g, "[PRIVATE_KEY_REDACTED]")
      .replace(/(?:sk-|pk-|rk-|sk-ant-|sk-proj-)[A-Za-z0-9_-]{20,}/g, "[API_KEY_REDACTED]")
      .replace(/(?:ghp_|github_pat_|gho_|ghu_)[A-Za-z0-9_]{20,}/g, "[GITHUB_TOKEN_REDACTED]")
      .replace(/\bglpat-[A-Za-z0-9_-]{20,}/g, "[GITLAB_TOKEN_REDACTED]")
      .replace(/\bAIza[A-Za-z0-9_-]{35}\b/g, "[GOOGLE_KEY_REDACTED]")
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[AWS_KEY_REDACTED]")
      .replace(/xox[baprs]-[A-Za-z0-9-]{20,}/g, "[SLACK_TOKEN_REDACTED]")
      .replace(/cookie\s*[:=]\s*[^\s`"']+/gi, "[COOKIE_REDACTED]")
      .replace(/(?:AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID)\s*[:=]\s*[^\s`"']+/gi, "[AWS_KEY_REDACTED]")
      .replace(/(?:GOOGLE_APPLICATION_CREDENTIALS|GITHUB_TOKEN)\s*[:=]\s*[^\s`"']+/gi, "[CREDENTIAL_REDACTED]")
      .replace(/\.env[^a-zA-Z0-9]/gi, "[ENV_FILE_REDACTED]");
  }

  redactValue(value) {
    if (typeof value === "string") return this.redactContent(value);
    if (Array.isArray(value)) return value.map(item => this.redactValue(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.redactValue(item)]));
    }
    return value;
  }

  truncateDetails(details) {
    if (typeof details !== "string") return details;
    if (details.length <= MAX_DETAILS_CHARS) return details;
    return details.slice(0, MAX_DETAILS_CHARS) + "\n[truncated]";
  }

  containsPrivateContent(content) {
    if (typeof content !== "string") return false;
    return /<private>[\s\S]*?<\/private>/i.test(content);
  }

  containsPrivateDeep(value) {
    if (typeof value === "string") return this.containsPrivateContent(value);
    if (Array.isArray(value)) return value.some(item => this.containsPrivateDeep(item));
    if (value && typeof value === "object") {
      return Object.values(value).some(item => this.containsPrivateDeep(item));
    }
    return false;
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
    if (this.detectInjectionDeep({ summary: obs.summary, details: obs.details, files: obs.files, tags: obs.tags, source: obs.source, taskId: obs.taskId })) {
      throw new Error("Potential prompt injection detected in content");
    }
    return true;
  }

  detectInjectionDeep(value) {
    if (typeof value === "string") return this.detectInjection(value);
    if (Array.isArray(value)) return value.some(item => this.detectInjectionDeep(item));
    if (value && typeof value === "object") {
      return Object.values(value).some(item => this.detectInjectionDeep(item));
    }
    return false;
  }

  resolveVerification(observation) {
    // Hard line: a bare `verified` claim has no authority. It only counts
    // with an identified verifier (human or process) and a timestamp.
    const claimsVerified = observation.verified === true || observation.verified === "true";
    const verifier = typeof observation.verifier === "string" ? observation.verifier.trim() : "";
    const verifyNote = typeof observation.verifyNote === "string" ? observation.verifyNote.slice(0, 280) : "";
    const hasVerifiedAt = typeof observation.verifiedAt === "string" && observation.verifiedAt.length > 0;
    // Garbage verifiedAt downgrades to a claim; only absent (fresh record)
    // or parseable timestamps confer authority with a verifier.
    const verifiedAtValid = hasVerifiedAt && !Number.isNaN(Date.parse(observation.verifiedAt));
    if (claimsVerified && verifier.length > 0 && (verifiedAtValid || !hasVerifiedAt)) {
      return {
        verified: true,
        verifier,
        verifiedAt: verifiedAtValid ? observation.verifiedAt : new Date().toISOString(),
        verifyNote,
        verifiedClaimed: false
      };
    }
    if (claimsVerified) {
      return { verified: false, verifier: "", verifiedAt: null, verifyNote, verifiedClaimed: true };
    }
    return { verified: false, verifier: "", verifiedAt: null, verifyNote: "", verifiedClaimed: false };
  }

  writeAtomic(filePath, content) {
    const crypto = require("node:crypto");
    const tmpPath = `${filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString("hex")}`;
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

  /**
   * Per-project capture policy (`DEV/memory-policy.json`):
   * `{ "capture": false }` opts the project out of new captures;
   * `{ "excludedPaths": [...] }` drops matching files from records.
   * Absent file means defaults (capture on). A malformed file throws
   * (fail closed: a privacy file must not be silently ignored).
   */
  loadProjectPolicy(projectRoot) {
    const defaults = { capture: true, excludedPaths: [] };
    if (!projectRoot) return defaults;
    const policyPath = path.join(path.resolve(projectRoot), "DEV", "memory-policy.json");
    if (!fs.existsSync(policyPath)) return defaults;
    const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8"));
    return {
      capture: parsed.capture !== false,
      excludedPaths: Array.isArray(parsed.excludedPaths)
        ? parsed.excludedPaths.filter(p => typeof p === "string")
        : []
    };
  }

  applyPolicyFile(observation, policy) {
    if (!policy) return observation;
    if (policy.capture === false) return null;
    const excluded = policy.excludedPaths || [];
    if (excluded.length === 0 || !Array.isArray(observation.files)) return observation;
    return {
      ...observation,
      files: observation.files.filter(f => !excluded.some(x => String(f).includes(x)))
    };
  }

  record(projectId, observation, options = {}) {
    // Per-project policy file first: opted-out projects capture nothing.
    const filePolicy = options.policy
      || (options.projectRoot ? this.loadProjectPolicy(options.projectRoot) : null);
    if (filePolicy) {
      if (filePolicy.capture === false) return null;
      observation = this.applyPolicyFile(observation, filePolicy) || observation;
    }
    const privateFields = [
      observation.summary,
      observation.details,
      observation.files,
      observation.tags,
      observation.source
    ];
    if (privateFields.some(field => this.containsPrivateDeep(field))) {
      throw new Error("Private content cannot be persisted to memory");
    }

    // Fail loud on injection in ANY field before policy/redaction, so
    // smuggled instructions can neither persist nor vanish silently.
    if (this.detectInjectionDeep({
      summary: observation.summary,
      details: observation.details,
      files: observation.files,
      tags: observation.tags,
      source: observation.source,
      taskId: observation.taskId
    })) {
      throw new Error("Potential prompt injection detected in content");
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

    if (!scope || !isValidScope(scope)) {
      return null;
    }

    const obs = {
      schemaVersion: this.schemaVersion,
      id: observation.id || this.generateId(),
      timestamp: observation.timestamp || new Date().toISOString(),
      project: projectId,
      type: observation.type,
      summary: this.redactContent(observation.summary),
      details: observation.details ? this.truncateDetails(this.redactContent(observation.details)) : null,
      files: (observation.files || []).map(f => this.redactContent(f)),
      tags: this.redactValue(observation.tags || []),
      ...this.resolveVerification(observation),
      source: this.redactValue(observation.source || {}),
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
      observations = query.verified
        ? observations.filter(obs => isTrulyVerified(obs))
        : observations.filter(obs => !isTrulyVerified(obs));
    }
    if (query.tags && query.tags.length > 0) {
      observations = observations.filter(obs =>
        query.tags.some(tag => (obs.tags || []).includes(tag))
      );
    }
    if (query.files && query.files.length > 0) {
      observations = observations.filter(obs =>
        query.files.some(file => (obs.files || []).includes(file))
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
      observations = query.verified
        ? observations.filter(obs => isTrulyVerified(obs))
        : observations.filter(obs => !isTrulyVerified(obs));
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
    const obs = observations.find(o => o.id === observationId) || null;
    if (!obs) return null;
    // Display normalization: legacy/hand-edited rows with bare
    // `verified:true` must not present as verified to consumers.
    if (obs.verified === true && !isTrulyVerified(obs)) {
      return { ...obs, verified: false, verifiedClaimed: true };
    }
    return obs;
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
      verified: isTrulyVerified(obs),
      verifier: obs.verifier || "",
      branch: obs.scope?.branch
    }));
  }

  promote(projectId, observationId, destination, options = {}) {
    const obs = this.show(projectId, observationId);
    if (!obs) throw new Error(`Observation not found: ${observationId}`);
    if (!isTrulyVerified(obs)) {
      throw new Error("Cannot promote unverified observation (requires verified:true with verifier and verifiedAt; bare --verified claims are recorded as verifiedClaimed, not verified)");
    }

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
        content: `## ${obs.type}: ${obs.summary}\n\n${obs.details || ""}\n\nFiles: ${(obs.files || []).join(", ")}\nTags: ${(obs.tags || []).join(", ")}\nVerified: ${isTrulyVerified(obs)}\n`
      };
    }

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      const destinationStat = fs.lstatSync(destPath);
      if (destinationStat.isSymbolicLink()) throw new Error("Symlink destination is not allowed");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
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
      if (isTrulyVerified(obs)) verified++;
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
          const existingIsVerified = isTrulyVerified(existing);
          const obsIsVerified = isTrulyVerified(obs);
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

  consolidate(projectId, observationIds, consolidatedObs, options = {}) {
    if (options.policy && options.policy.capture === false) return null;
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

      // Fail loud like record(): caller-supplied consolidated content with
      // injection or private markers throws instead of vanishing via DROP.
      if (this.detectInjectionDeep({
        summary: consolidatedObs.summary,
        details: consolidatedObs.details,
        files: consolidatedObs.files,
        tags: consolidatedObs.tags,
        source: consolidatedObs.source,
        taskId: consolidatedObs.taskId
      })) {
        throw new Error("Potential prompt injection detected in content");
      }
      if (this.containsPrivateDeep(consolidatedObs.summary) ||
          this.containsPrivateDeep(consolidatedObs.details) ||
          this.containsPrivateDeep(consolidatedObs.files) ||
          this.containsPrivateDeep(consolidatedObs.tags) ||
          this.containsPrivateDeep(consolidatedObs.source)) {
        throw new Error("Private content cannot be persisted to memory");
      }

      const consolidated = {
        schemaVersion: this.schemaVersion,
        id: consolidatedObs.id || this.generateId(),
        timestamp: consolidatedObs.timestamp || new Date().toISOString(),
        project: projectId,
        type: consolidatedObs.type || "discovery",
        summary: this.redactContent(consolidatedObs.summary),
        details: consolidatedObs.details ? this.truncateDetails(this.redactContent(consolidatedObs.details)) : null,
        files: this.redactValue([...new Set(observations.flatMap(obs => obs.files || []))]),
        tags: this.redactValue([...new Set(observations.flatMap(obs => obs.tags || []))]),
        source: this.redactValue(consolidatedObs.source || {}),
        // Scope is inherited from the sources, never caller-supplied: a
        // consolidated record must not escape the visibility boundary of
        // what it was consolidated from. taskId overrides are dropped for
        // the same reason.
        scope: firstScope,
        consolidatedFrom: observationIds
      };

      const consolidatedPrivateFields = [
        consolidated.summary,
        consolidated.details,
        consolidated.files,
        consolidated.tags,
        consolidated.source
      ];
      if (consolidatedPrivateFields.some(field => this.containsPrivateDeep(field))) {
        throw new Error("Private content cannot be persisted to memory");
      }

      const consolidatedPolicy = this.capturePolicy.evaluate(consolidated);
      if (consolidatedPolicy.policy === POLICIES.DROP) {
        return null;
      }

      // Verified is inherited only when every source is verified with an
      // identified verifier; a bare claim never upgrades through consolidation.
      const allSourcesVerified = observations.every(o => isTrulyVerified(o));
      const claim = this.resolveVerification(consolidatedObs);
      if (claim.verified && allSourcesVerified) {
        consolidated.verified = true;
        consolidated.verifier = claim.verifier;
        consolidated.verifiedAt = claim.verifiedAt;
        consolidated.verifyNote = claim.verifyNote;
      } else {
        consolidated.verified = false;
        if (claim.verified || claim.verifiedClaimed || consolidatedObs.verified) {
          consolidated.verifiedClaimed = true;
        }
      }

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
        if (isTrulyVerified(obs)) return true;
        if (obs.scope?.promoted) return true;
        const age = (now - new Date(obs.timestamp)) / (1000 * 60 * 60 * 24);
        return age <= maxAgeDays;
      });

      if (filtered.length > maxCount) {
        const verified = filtered.filter(obs => isTrulyVerified(obs) || obs.scope?.promoted);
        const unverified = filtered.filter(obs => !isTrulyVerified(obs) && !obs.scope?.promoted);
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

  forget(projectId, observationId, options = {}) {
    const filePath = this.getObservationsFile(projectId);
    const lockPath = getLockPath(filePath);
    return withLock(lockPath, () => {
      const { valid: observations, malformedLines } = this.readObservations(filePath);
      const target = observations.find(obs => obs.id === observationId);
      // Verified or promoted rows need explicit --force: silent convenient
      // deletion of trusted records is a data-loss path.
      if (target && (isTrulyVerified(target) || target.scope?.promoted) && !options.force) {
        throw new Error("Refusing to forget verified/promoted observation without --force");
      }
      const filtered = observations.filter(obs => obs.id !== observationId);
      const removed = observations.length - filtered.length;
      if (removed > 0) {
        const lines = [...filtered.map(obs => JSON.stringify(obs)), ...malformedLines];
        this.writeAtomic(filePath, lines.join("\n") + "\n");
      }
      return { removed };
    });
  }

  exportData(projectId) {
    const filePath = this.getObservationsFile(projectId);
    const { valid: observations, malformed } = this.readObservations(filePath);
    return {
      format: "maestro-memory-export/v1",
      project: projectId,
      exportedAt: new Date().toISOString(),
      malformed,
      observations
    };
  }

  importData(projectId, payload, options = {}) {
    const list = typeof payload === "string" ? JSON.parse(payload).observations ?? JSON.parse(payload) : payload.observations ?? payload;
    if (!Array.isArray(list)) throw new Error("Import payload must be an array or an export object with observations[]");
    const filePath = this.getObservationsFile(projectId);
    const lockPath = getLockPath(filePath);
    return withLock(lockPath, () => {
      this.ensureProjectDir(projectId);
      const { valid: existing } = this.readObservations(filePath);
      const knownIds = new Set(existing.map(o => o.id));
      let imported = 0;
      const rejected = [];
      const accepted = [];
      list.forEach((raw, index) => {
        try {
          const candidate = {
            ...raw,
            project: projectId,
            // Imported rows never inherit trust: verification must be
            // re-earned in this repository, never copied across.
            verified: false,
            verifier: "",
            verifiedAt: null,
            verifiedClaimed: Boolean(raw.verified || raw.verifiedClaimed)
          };
          this.validateObservation(candidate);
          if (knownIds.has(candidate.id)) {
            rejected.push({ index, reason: "duplicate id" });
            return;
          }
          knownIds.add(candidate.id);
          accepted.push(candidate);
          imported++;
        } catch (err) {
          rejected.push({ index, reason: err.message });
        }
      });
      if (accepted.length > 0 && !options.dryRun) {
        const lines = accepted.map(o => JSON.stringify(o));
        fs.appendFileSync(filePath, lines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
      }
      return { imported: options.dryRun ? 0 : imported, candidates: accepted.length, rejected };
    });
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
        ? filtered.filter(obs => isTrulyVerified(obs))
        : [];
      const prunable = keepVerified
        ? filtered.filter(obs => !isTrulyVerified(obs))
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
  memory forget [--project PATH] --id ID [--force]
  memory export [--project PATH] [--output FILE]
  memory import [--project PATH] --input FILE [--dry-run]
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
  --verified         Reivindicar verificacao (só vale com --verifier; sem ele vira verifiedClaimed)
  --verifier ID      Quem verificou (humano ou processo); obrigatório para verified:true
  --verify-note TEXT Motivo da verificacao (ate 280 caracteres)
  --unverified       Filtrar nao verificados
  --task ID          ID da tarefa
  --search TEXT      Texto para buscar
  --from DATE        Data inicial
  --to DATE          Data final
  --limit N          Limite de resultados
  --id ID            ID da observation
  --force            Confirmar operacao destrutiva (forget de linha verificada)
  --output FILE      Arquivo de destino do export (padrao: stdout)
  --input FILE       Arquivo de origem do import
  --dry-run          Validar import sem escrever
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
      try {
        const obs = memory.record(project, {
          type, summary,
          details: memory.getArg(rest, "--details"),
          files: memory.getArgList(rest, "--files"),
          tags: memory.getArgList(rest, "--tags"),
          verified: rest.includes("--verified"),
          verifier: memory.getArg(rest, "--verifier"),
          verifyNote: memory.getArg(rest, "--verify-note"),
          taskId: memory.getArg(rest, "--task"),
          scope: memory.resolveScope(project, rest, projectPath)
        }, { gitContext: gitCtx, projectRoot: projectPath });
        console.log(JSON.stringify(obs, null, 2));
        return 0;
      } catch (err) {
        console.error(`record failed: ${err.message}`);
        return 1;
      }
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
    case "forget": {
      const id = memory.getArg(rest, "--id");
      if (!id) { console.error("--id required"); return 1; }
      try {
        const result = memory.forget(project, id, { force: rest.includes("--force") });
        console.log(JSON.stringify(result, null, 2));
        return 0;
      } catch (err) {
        console.error(`forget failed: ${err.message}`);
        return 1;
      }
    }
    case "timeline": {
      const tl = memory.timeline(project, { limit: memory.getArgNumber(rest, "--limit") || 50 });
      console.log(JSON.stringify(tl, null, 2));
      return 0;
    }
    case "export": {
      const out = memory.getArg(rest, "--output");
      const data = memory.exportData(project);
      const text = JSON.stringify(data, null, 2);
      if (out) {
        fs.writeFileSync(path.resolve(out), text + "\n", "utf8");
      } else {
        console.log(text);
      }
      return 0;
    }
    case "import": {
      const input = memory.getArg(rest, "--input");
      if (!input) { console.error("--input required"); return 1; }
      try {
        const payload = fs.readFileSync(path.resolve(input), "utf8");
        const result = memory.importData(project, payload, { dryRun: rest.includes("--dry-run") });
        console.log(JSON.stringify(result, null, 2));
        return result.rejected.length > 0 && !rest.includes("--dry-run") ? 2 : 0;
      } catch (err) {
        console.error(`import failed: ${err.message}`);
        return 1;
      }
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

module.exports = { Memory, isTrulyVerified };
