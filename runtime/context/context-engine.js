"use strict";

const crypto = require("node:crypto");
const { gatherPreflight } = require("../planner/context-preflight");
const { ContextBudget } = require("./context-budget");
const { rankEvidenceCandidates } = require("../resolution/evidence-ranker");
const { buildContextEvidenceCandidate } = require("../resolution/evidence/signal-extractor");
const {
  BASELINE_BRIEF_MAX_CHARS,
  normalizeContextExperiment,
  requestedBriefMaxChars,
  evaluateBriefAuthorityCoverage,
  buildContextExperimentMetrics
} = require("../resolution/context-experiment");

function compactBrief(brief) {
  if (!brief || typeof brief !== "object") return null;
  const entries = Array.isArray(brief.manifest?.entries)
    ? brief.manifest.entries.map((entry) => ({
        path: entry.path,
        reason: entry.reason,
        chars: entry.chars,
        truncated: entry.truncated === true,
        digest: entry.digest,
        strategy: entry.strategy,
        sourceDigest: entry.sourceDigest || null,
        range: entry.range || null
      }))
    : [];
  return {
    task: brief.task || "",
    content: typeof brief.content === "string" ? brief.content : "",
    manifest: {
      version: brief.manifest?.version || 1,
      headCommit: brief.manifest?.headCommit || null,
      contentDigest: brief.manifest?.contentDigest || null,
      entries
    }
  };
}

function briefCoveredPaths(items) {
  const brief = items.find((item) => item.key === "context.brief");
  return new Set((brief?.value?.manifest?.entries || []).map((entry) => entry.path));
}

function deduplicateBriefCoveredDevItems(items) {
  const covered = briefCoveredPaths(items);
  if (covered.size === 0) return { primary: items, duplicates: [] };
  const duplicates = items.filter((item) => {
    if (!String(item.key || "").startsWith("devstate.")) return false;
    const sourcePath = item.sources?.[0]?.path;
    return typeof sourcePath === "string" && covered.has(sourcePath);
  });
  return {
    primary: items.filter((item) => !duplicates.includes(item)),
    duplicates
  };
}

class ContextEngine {
  constructor({ workspacePath, semanticRanker }) {
    this.workspacePath = workspacePath;
    this.semanticRanker = semanticRanker;
    this.lastBuildMetrics = null;
  }

  getLastBuildMetrics() {
    return this.lastBuildMetrics ? JSON.parse(JSON.stringify(this.lastBuildMetrics)) : null;
  }

  async _discoverFacts(intent, options = {}) {
    const items = [];
    const facts = gatherPreflight(this.workspacePath, intent, { briefMaxChars: options.briefMaxChars });

    if (facts.projectName) {
      items.push({
        key: "project.name",
        value: facts.projectName,
        kind: "FACT",
        confidence: 1,
        relevance: 1,
        sources: [{ type: "package.json", path: "package.json" }]
      });
    }

    if (facts.stack) {
      items.push({
        key: "backend.framework",
        value: facts.stack,
        kind: "FACT",
        confidence: 1,
        relevance: 1,
        sources: [{ type: "package.json", path: "package.json" }]
      });
    }

    if (facts.hasAuth) {
      items.push({
        key: "project.hasAuth",
        value: true,
        kind: "FACT",
        confidence: 1,
        relevance: 1,
        sources: [{ type: "package.json", path: "package.json" }]
      });
    }

    for (const [key, value] of [
      ["project.hasDatabase", facts.hasDatabase],
      ["project.hasPayments", facts.hasPayments],
      ["project.hasTests", facts.hasTests]
    ]) {
      if (value === true) {
        items.push({
          key,
          value: true,
          kind: "FACT",
          confidence: 1,
          relevance: 1,
          sources: [{ type: "package.json", path: "package.json" }]
        });
      }
    }

    if (facts.framework) {
      items.push({
        key: "project.framework",
        value: facts.framework,
        kind: "FACT",
        confidence: 1,
        relevance: 1,
        sources: [{ type: "package.json", path: "package.json" }]
      });
    }

    if (facts.agentsContract) {
      items.push({
        key: "project.agentsContract",
        value: facts.agentsContract,
        kind: "FACT",
        confidence: 1,
        relevance: 1,
        sources: [{ type: "agents-contract", path: "AGENTS.md" }]
      });
    }

    if (facts.contextBrief && typeof facts.contextBrief === "object") {
      items.push({
        key: "context.brief",
        value: compactBrief(facts.contextBrief),
        kind: "FACT",
        confidence: 1,
        relevance: 1,
        sources: [{ type: "context-brief", path: "orquestrador/bin/context-brief.js" }]
      });
    }

    if (facts.devState) {
      for (const [devFile, content] of Object.entries(facts.devState)) {
        items.push({
          key: `devstate.${devFile}`,
          value: content,
          kind: "FACT",
          confidence: 1,
          relevance: 1,
          sources: [{ type: "dev-file", path: devFile }]
        });
      }
    }

    return items;
  }

  async buildContext(intent, maxTokens = 8000, options = {}) {
    const mode = options.adaptiveResolutionMode || "shadow";
    const contract = normalizeContextExperiment({ mode, experiment: options.adaptiveResolutionExperiment });
    const requestedMaxChars = requestedBriefMaxChars(contract);

    let baselineItems = null;
    if (contract?.arm === "treatment" && requestedMaxChars !== BASELINE_BRIEF_MAX_CHARS) {
      baselineItems = await this._discoverFacts(intent, { briefMaxChars: BASELINE_BRIEF_MAX_CHARS });
    }

    let items = await this._discoverFacts(intent, { briefMaxChars: requestedMaxChars });
    const candidateBrief = items.find((item) => item.key === "context.brief")?.value;
    const baselineBrief = baselineItems?.find((item) => item.key === "context.brief")?.value || candidateBrief;
    const requireDigestEquality = requestedMaxChars < BASELINE_BRIEF_MAX_CHARS;
    let coverage = evaluateBriefAuthorityCoverage(this.workspacePath, candidateBrief, baselineBrief, { requireDigestEquality });
    const attemptedCoverage = coverage;
    let effectiveMaxChars = requestedMaxChars;
    let fallbackReason = null;

    if (contract?.arm === "treatment" && !coverage.safe) {
      fallbackReason = coverage.changed.length > 0 ? "changed-authority-context" : "missing-authority-context";
      effectiveMaxChars = BASELINE_BRIEF_MAX_CHARS;
      items = baselineItems || await this._discoverFacts(intent, { briefMaxChars: effectiveMaxChars });
      const fallbackBrief = items.find((item) => item.key === "context.brief")?.value;
      coverage = evaluateBriefAuthorityCoverage(this.workspacePath, fallbackBrief, fallbackBrief);
    }

    if (this.semanticRanker) {
      const enrichment = await this.semanticRanker.rankAndEnrich(intent, items);
      for (const item of items) {
        if (enrichment[item.key]) {
          const enrich = enrichment[item.key];
          if (enrich.relevance !== undefined) item.relevance = enrich.relevance;
          if (item.kind !== "FACT" && enrich.confidence !== undefined) item.confidence = enrich.confidence;
        }
      }
      if (enrichment.newInferences) {
        for (const inf of enrichment.newInferences) {
          items.push({
            key: inf.key,
            value: inf.value,
            kind: "INFERENCE",
            confidence: inf.confidence || 0.5,
            relevance: inf.relevance || 1,
            sources: inf.sources || [{ type: "ai-enrichment" }]
          });
        }
      }
    }

    const { primary, duplicates } = deduplicateBriefCoveredDevItems(items);
    const resolutionMode = options.resolutionMode || "shadow";
    if (!["shadow", "advisory", "enforce"].includes(resolutionMode)) {
      throw new TypeError("resolutionMode must be shadow, advisory, or enforce");
    }
    if (resolutionMode === "enforce" && options.enforceAuthorized !== true) {
      const error = new Error("RESOLUTION_ENFORCE_NOT_READY: context selection enforce requires explicit authorization");
      error.code = "RESOLUTION_ENFORCE_NOT_READY";
      throw error;
    }
    const resolutionStrategy = options.resolutionStrategy
      || contract?.strategy
      || (maxTokens <= 4000 ? "targeted" : maxTokens >= 12000 ? "deep" : "balanced");
    const candidates = primary.map((item) => buildContextEvidenceCandidate(intent, item, {
      estimatedTokens: ContextBudget.estimateItemTokens(item)
    }));
    const candidateByKey = new Map(primary.map((item, index) => [item.key, candidates[index]]));
    const itemByCandidateId = new Map(primary.map((item, index) => [candidates[index].id, item]));
    const evidenceAdvice = rankEvidenceCandidates(candidates, {
      strategy: resolutionStrategy,
      tokenBudget: maxTokens
    });
    const rankingApplied = resolutionMode === "enforce" && options.enforceAuthorized === true;
    const rankedPrimary = rankingApplied
      ? evidenceAdvice.selected.map((entry) => itemByCandidateId.get(entry.id)).filter(Boolean)
      : primary;
    let budgetedItems = ContextBudget.applyBudget(rankedPrimary, maxTokens, { intent, ensureOne: false });
    const briefSelected = budgetedItems.some((item) => item.key === "context.brief");

    if (!briefSelected && duplicates.length > 0) {
      const withoutBrief = items.filter((item) => item.key !== "context.brief");
      budgetedItems = ContextBudget.applyBudget(withoutBrief, maxTokens, { intent });
    }

    const estimatedTokens = ContextBudget.estimateContextTokens(intent, budgetedItems);
    const budgetOverrun = budgetedItems.overBudget === true;
    const serializedContext = ContextBudget.serialize({ intent, items: budgetedItems });
    const contextDigest = crypto.createHash("sha256").update(serializedContext, "utf8").digest("hex");
    const briefItem = budgetedItems.find((item) => item.key === "context.brief");
    const briefUsedChars = briefItem?.value?.content?.length || 0;
    const experiment = buildContextExperimentMetrics({
      contract,
      requestedMaxChars,
      effectiveMaxChars,
      coverage,
      attemptedCoverage,
      fallbackReason,
      estimatedTokens,
      selectedItems: budgetedItems.length,
      discoveredItems: items.length,
      deduplicatedItems: briefSelected ? duplicates.length : 0,
      briefUsedChars
    });

    const actualEvidenceIds = budgetedItems
      .map((item) => candidateByKey.get(item.key)?.id)
      .filter(Boolean);
    this.lastBuildMetrics = Object.freeze({
      version: 2,
      estimatedTokens,
      budgetOverrun,
      contextDigest,
      maxTokens,
      discoveredItems: items.length,
      selectedItems: budgetedItems.length,
      deduplicatedItems: briefSelected ? duplicates.length : 0,
      briefSelected,
      briefMaxChars: effectiveMaxChars,
      briefUsedChars,
      briefContentDigest: briefItem?.value?.manifest?.contentDigest || null,
      authorityCoverage: coverage,
      evidenceRanking: Object.freeze({
        mode: resolutionMode,
        strategy: resolutionStrategy,
        applied: rankingApplied,
        candidates: evidenceAdvice.stats.inputCandidates,
        selected: evidenceAdvice.stats.selectedCandidates,
        rejected: evidenceAdvice.skipped.length,
        estimatedSelectedTokens: evidenceAdvice.estimatedSelectedTokens,
        budgetOverflow: evidenceAdvice.budgetOverflow,
        selectedIds: Object.freeze(evidenceAdvice.selected.map((entry) => entry.id)),
        actualContextIds: Object.freeze(actualEvidenceIds),
        rejectedReasons: Object.freeze(evidenceAdvice.skipped.map((entry) => Object.freeze({ id: entry.id, reason: entry.reason })))
      }),
      experiment
    });

    return { intent, items: budgetedItems };
  }
}

module.exports = { ContextEngine, compactBrief, deduplicateBriefCoveredDevItems };
