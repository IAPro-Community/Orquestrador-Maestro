"use strict";

const defaultPrompts = require("@clack/prompts");
const { DynamicInterviewer } = require("./dynamic-interviewer");
const { createIntentSpec } = require("./intent-spec");
const { IntentRefiner } = require("./intent-refiner");
const { evaluateReadiness } = require("./readiness-evaluator");
const { BatchIntentDiscoverer } = require("./batch-intent-discoverer");
const { IntentReconciler } = require("./intent-reconciler");
const { BatchRefinementCoordinator } = require("./batch-refinement-coordinator");
const { ClackBatchInteractionAdapter } = require("./clack-batch-adapter");

class AiInterviewer {
  constructor({ resolvedSkills, preflightFacts, application, intent, aiProvider = "opencode", prompts = defaultPrompts, maxDiscoveryRounds, autoPolicy }) {
    this.p = prompts;
    this.resolvedSkills = resolvedSkills;
    this.facts = preflightFacts;
    this.app = application;
    this.intent = intent;
    this.aiProvider = aiProvider;
    this.maxDiscoveryRounds = maxDiscoveryRounds;
    this.autoPolicy = autoPolicy;
    this.conversationHistory = [];
    this.intentSpec = createIntentSpec(intent);
    this.refiner = new IntentRefiner({
      aiProvider,
      application,
      taskRelevantContext: { items: Object.entries(preflightFacts || {}).map(([k, v]) => ({ key: k, value: v, type: "FACT" })) }
    });
  }

  async runInteractive() {
    const provider = this.app.providers.get(this.aiProvider);
    let fallbackToLegacy = false;

    if (!provider) {
      fallbackToLegacy = true;
    } else {
      try {
        const installation = await provider.detect();
        if (!installation.installed) {
          fallbackToLegacy = true;
        }
      } catch (e) {
        fallbackToLegacy = true;
      }
    }

    if (fallbackToLegacy) {
      this.p.note(`Provedor de IA (${this.aiProvider}) nao detectado. Usando modo de refinamento por heuristica.`, "Fallback");
      const fallback = new DynamicInterviewer({ resolvedSkills: this.resolvedSkills, preflightFacts: this.facts });
      return fallback.runInteractive();
    }

    this.p.note(`Assistente Inteligente ativado (${this.aiProvider}). Analisando projeto e skills...`, "AI Planner");

    return await this._runBatchRefinementDefault(provider);
  }

  async _runBatchRefinementDefault(provider) {
    const taskRelevantContext = { items: Object.entries(this.facts || {}).map(([k, v]) => ({ key: k, value: v, type: "FACT" })) };
    const discoverer = new BatchIntentDiscoverer({ provider });
    const reconciler = new IntentReconciler({ provider });
    const adapter = new ClackBatchInteractionAdapter({ prompts: this.p });

    const coordinator = new BatchRefinementCoordinator({
      discoverer,
      reconciler,
      adapter
    });

    const s = this.p.spinner();
    try {
      s.start("IA descobrindo decisoes em lote...");
      const result = await coordinator.run(this.intentSpec, taskRelevantContext, this.resolvedSkills, {
        batchSize: 4,
        maxDiscoveryRounds: this.maxDiscoveryRounds || 3
      });
      s.stop();

      if (result.cancelled) {
        this.p.log.info("Operacao cancelada pelo usuario.");
        return this.buildSpec();
      }

      if (result.blocked) {
        const summary = (result.blockers || []).map((b) => b.description).join("; ");
        if (typeof this.p.log?.error === "function") {
          this.p.log.error(`Nao foi possivel esgotar os bloqueios da intent. Pendentes: ${summary}`);
        }
        this.intentSpec = createIntentSpec(this.intentSpec.intent, {
          ...result.intentSpec,
          status: "REFINING"
        });
        return this.buildSpec();
      }

      if (result.success && result.intentSpec) {
        this.intentSpec = createIntentSpec(this.intentSpec.intent, {
          ...result.intentSpec,
          status: "REFINING"
        });
      }

      if (this.p.log && typeof this.p.log.success === "function") {
        this.p.log.success(`Refinamento concluido: ${result.totalQuestions} questoes em ${result.batchesProcessed} lote(s).`);
      }
      return this.buildSpec();
    } catch (e) {
      s.stop();
      throw e;
    }
  }

  async runBatch() {
    const provider = this.app.providers.get(this.aiProvider);

    if (provider) {
      try {
        const installation = await provider.detect();
        if (installation.installed) {
          const taskRelevantContext = { items: Object.entries(this.facts || {}).map(([k, v]) => ({ key: k, value: v, type: "FACT" })) };
          const discoverer = new BatchIntentDiscoverer({ provider });
          const reconciler = new IntentReconciler({ provider });
          const adapter = { collectBatch: async () => ({ action: "cancel", answers: {} }) };
          const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
          const result = await coordinator.run(this.intentSpec, taskRelevantContext, this.resolvedSkills, {
            auto: true,
            batchSize: 4,
            maxDiscoveryRounds: this.maxDiscoveryRounds || 3,
            autoPolicy: this.autoPolicy || null
          });

          if (result.autoBlocked && result.autoBlocked.type === "HUMAN_INPUT_REQUIRED") {
            return this._buildAutoStatus("HUMAN_INPUT_REQUIRED", result.autoBlocked.dimensions || []);
          }

          if (result.blocked) {
            const summary = (result.blockers || []).map((b) => b.description).join("; ");
            throw new Error(
              `M2_AUTO_BLOCKED: Nao foi possivel resolver todos os bloqueios em modo automatico. Blockers: ${summary}`
            );
          }

          if (result.success && result.ready && result.intentSpec) {
            // Batch coordinator returned a validated reconciled IntentSpec — no redundant legacy refine call.
            this.intentSpec = createIntentSpec(this.intentSpec.intent, {
              ...result.intentSpec,
              status: "REFINING"
            });
            return this.buildSpec();
          }

          if (result.success && result.intentSpec) {
            this.intentSpec = createIntentSpec(this.intentSpec.intent, {
              ...result.intentSpec,
              status: "REFINING"
            });
          }
        }
      } catch (e) {
        // Provider runtime failure is atomic — do not silently fall back to legacy.
        throw e;
      }
    }

    // Legacy single-pass fallback: provider unavailable at detection time,
    // or batch mode could not reach readiness (existing deterministic contract).
    try {
      this.intentSpec = await this.refiner.refine(this.intentSpec);
    } catch (e) {
      throw e;
    }

    const evalResult = evaluateReadiness(this.intentSpec);
    if (!evalResult.ready) {
      throw new Error("Falta informacao bloqueante e --auto foi fornecido. Blockers: " + evalResult.blockers.map(b => b.description).join(", "));
    }

    return this.buildSpec();
  }

  _buildAutoStatus(status, dimensions) {
    return Object.freeze({
      status,
      ambiguity: 1,
      facts: this.facts,
      skills: this.resolvedSkills,
      unresolvedDimensions: Object.freeze([...dimensions]),
      answers: {
        intent: this.intentSpec.objective,
        ai_refinement: JSON.stringify(this.intentSpec),
        requirements: [...this.intentSpec.requirements],
        constraints: [...this.intentSpec.constraints],
        userDecisions: [...this.intentSpec.userDecisions],
        unknowns: [...this.intentSpec.unknowns]
      }
    });
  }

  buildSpec() {
    return Object.freeze({
      ambiguity: evaluateReadiness(this.intentSpec).ready ? 0 : 1,
      facts: this.facts,
      skills: this.resolvedSkills,
      answers: {
        intent: this.intentSpec.objective,
        ai_refinement: JSON.stringify(this.intentSpec),
        requirements: [...this.intentSpec.requirements],
        constraints: [...this.intentSpec.constraints],
        userDecisions: [...this.intentSpec.userDecisions],
        unknowns: [...this.intentSpec.unknowns]
      }
    });
  }
}

module.exports = { AiInterviewer };
