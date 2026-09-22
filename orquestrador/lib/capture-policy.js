#!/usr/bin/env node
"use strict";

/**
 * CapturePolicy — controls what gets recorded to episodic memory.
 *
 * Policies:
 *   ALLOW          — observation recorded as-is (after redaction)
 *   REDACT         — observation recorded, sensitive fields redacted
 *   METADATA_ONLY  — only type/timestamp/project/branch stored, content dropped
 *   DROP           — observation not recorded at all
 */

const POLICIES = {
  ALLOW: "ALLOW",
  REDACT: "REDACT",
  METADATA_ONLY: "METADATA_ONLY",
  DROP: "DROP"
};

const PRIVATE_PATTERNS = [
  /<private>[\s\S]*?<\/private>/i,
  /api[_-]?key\s*[:=]\s*[^\s`"']+/gi,
  /secret\s*[:=]\s*[^\s`"']+/gi,
  /password\s*[:=]\s*[^\s`"']+/gi,
  /bearer\s+[A-Za-z0-9._-]+/gi,
  /ghp_[A-Za-z0-9]{36}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/g
];

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?prior/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?:/i,
  /system\s*prompt/i,
  /act\s+as\s+if/i,
  /pretend\s+you\s+are/i,
  /<script>/i
];

class CapturePolicy {
  constructor(options = {}) {
    this.defaultPolicy = options.defaultPolicy || POLICIES.ALLOW;
    this.sensitivePatterns = options.sensitivePatterns || PRIVATE_PATTERNS;
    this.injectionPatterns = options.injectionPatterns || INJECTION_PATTERNS;
  }

  evaluate(observation) {
    if (!observation || typeof observation !== "object") {
      return { policy: POLICIES.DROP, reason: "invalid observation" };
    }

    const content = [
      observation.summary || "",
      observation.details || "",
      (observation.files || []).join(" "),
      (observation.tags || []).join(" ")
    ].join(" ");

    if (this.containsInjection(content)) {
      return { policy: POLICIES.DROP, reason: "prompt injection detected" };
    }

    if (this.containsPrivateContent(content)) {
      return { policy: POLICIES.REDACT, reason: "private content detected" };
    }

    if (this.isMetadataOnly(observation)) {
      return { policy: POLICIES.METADATA_ONLY, reason: "low-value observation" };
    }

    return { policy: this.defaultPolicy, reason: "default policy" };
  }

  containsPrivateContent(content) {
    if (typeof content !== "string") return false;
    return this.sensitivePatterns.some(pattern => {
      pattern.lastIndex = 0;
      return pattern.test(content);
    });
  }

  containsInjection(content) {
    if (typeof content !== "string") return false;
    return this.injectionPatterns.some(pattern => pattern.test(content));
  }

  isMetadataOnly(observation) {
    const trivialTypes = ["environment", "dependency"];
    return trivialTypes.includes(observation.type);
  }

  applyPolicy(observation, policyResult) {
    if (!policyResult) {
      policyResult = this.evaluate(observation);
    }

    switch (policyResult.policy) {
      case POLICIES.DROP:
        return null;

      case POLICIES.METADATA_ONLY:
        return {
          schemaVersion: observation.schemaVersion || 1,
          id: observation.id,
          timestamp: observation.timestamp,
          project: observation.project,
          type: observation.type,
          summary: "[metadata only]",
          details: null,
          files: [],
          tags: [],
          verified: observation.verified || false,
          source: { tool: observation.source?.tool || "unknown" },
          scope: observation.scope || { level: "repository" },
          capturePolicy: POLICIES.METADATA_ONLY
        };

      case POLICIES.REDACT:
        return {
          ...observation,
          summary: this.redactText(observation.summary || ""),
          details: observation.details ? this.redactText(observation.details) : null,
          files: (observation.files || []).map(f => this.redactText(f)),
          tags: (observation.tags || []).map(t => this.redactText(t)),
          source: this.redactSource(observation.source || {}),
          capturePolicy: POLICIES.REDACT
        };

      case POLICIES.ALLOW:
      default:
        return {
          ...observation,
          capturePolicy: POLICIES.ALLOW
        };
    }
  }

  redactText(text) {
    if (typeof text !== "string") return text;
    return text
      .replace(/api[_-]?key\s*[:=]\s*[^\s`"']+/gi, "api_key=[REDACTED]")
      .replace(/secret\s*[:=]\s*[^\s`"']+/gi, "secret=[REDACTED]")
      .replace(/password\s*[:=]\s*[^\s`"']+/gi, "password=[REDACTED]")
      .replace(/bearer\s+[A-Za-z0-9._-]+/gi, "bearer=[REDACTED]")
      .replace(/ghp_[A-Za-z0-9]{36}/g, "[GITHUB_TOKEN_REDACTED]")
      .replace(/sk-[A-Za-z0-9]{20,}/g, "[API_KEY_REDACTED]")
      .replace(/-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/g, "[PRIVATE_KEY_REDACTED]");
  }

  redactSource(source) {
    if (!source || typeof source !== "object") return source;
    const redacted = { ...source };
    if (redacted.session) redacted.session = "[REDACTED]";
    if (redacted.commit) redacted.commit = "[REDACTED]";
    return redacted;
  }
}

module.exports = { CapturePolicy, POLICIES };
