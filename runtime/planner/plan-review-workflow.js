"use strict";

const p = require("@clack/prompts");
const { PlanRevisionService } = require("./plan-revision-service");
const { PlanArtifactRenderer } = require("./plan-artifact-renderer");

class PlanReviewWorkflow {
  constructor({ revisionService, notifier, aiImproveFn, regenerateFn, prompts } = {}) {
    this.revisionService = revisionService || null;
    this.notifier = notifier || null;
    this.aiImproveFn = aiImproveFn || null;
    this.regenerateFn = regenerateFn || null;
    this.prompts = prompts || p;
  }

  async conductReview(missionId, originalProposal, options = {}) {
    if (!missionId || typeof missionId !== "string") throw new TypeError("missionId is required");
    if (!originalProposal || typeof originalProposal !== "object") throw new TypeError("originalProposal is required");

    const revisionService = this.revisionService;
    const prompts = this.prompts;
    let reviewApproved = false;
    let pendingRevision;
    let pendingProposal;

    while (!reviewApproved) {
      const action = await prompts.select({
        message: "Como deseja revisar o plano de engenharia?",
        options: [
          { value: "ver-plano", label: "Ver plano no terminal" },
          { value: "editar", label: "Abrir editor externo para edicao" },
          { value: "melhorar-ia", label: "Pedir a IA para melhorar o plano" },
          { value: "regenerar", label: "Regenerar plano com a IA" },
          { value: "recompilar", label: "Recompilar plano apos edicao" },
          { value: "aprovar", label: "Aprovar plano como esta" },
          { value: "cancelar", label: "Cancelar operacao" }
        ]
      });

      if (prompts.isCancel(action) || action === "cancelar") {
        if (revisionService) await revisionService.cancel(missionId);
        prompts.cancel("Operacao cancelada pelo usuario.");
        return { approved: false, cancelled: true };
      }

      if (action === "aprovar") {
        const confirm = await prompts.confirm({
          message: "Tem certeza que deseja aprovar este plano?"
        });
        if (prompts.isCancel(confirm)) {
          prompts.log.info("Aprovacao cancelada.");
          continue;
        }
        if (!confirm) {
          prompts.log.info("Aprovacao nao confirmada.");
          continue;
        }
        const approval = await revisionService.approveRevision(
          missionId,
          options.taskGraphId || originalProposal.id || "unknown",
          "approved",
          { ...(options.actor ? { actor: options.actor } : {}), revision: pendingRevision, revisedProposal: pendingProposal }
        );
        prompts.log.success(`Plano aprovado (${approval.approvalType}).`);
        reviewApproved = true;
        return { approved: true, approval };
      }

      if (action === "ver-plano") {
        const read = await revisionService.store.readPlanArtifact(missionId);
        if (read.exists) {
          prompts.note(read.content, "Plano de Engenharia");
        } else {
          prompts.log.error("Arquivo de plano nao encontrado.");
        }
      }

      if (action === "editar") {
        pendingRevision = undefined;
        pendingProposal = undefined;
        const openResult = await revisionService.openForReview(missionId);
        if (openResult.launched) {
          prompts.log.info("Editor aberto. Faca suas alteracoes e salve o arquivo.");
        } else {
          prompts.log.error(`Falha ao abrir editor: ${openResult.reason}`);
        }
      }

      if (action === "melhorar-ia") {
        pendingRevision = undefined;
        pendingProposal = undefined;
        if (!this.aiImproveFn) {
          prompts.log.warning("Funcao de melhoria por IA nao disponivel.");
          continue;
        }
        const read = await revisionService.store.readPlanArtifact(missionId);
        if (!read.exists) {
          prompts.log.error("Arquivo de plano nao encontrado.");
          continue;
        }
        prompts.log.info("Solicitando melhoria via IA...");
        try {
          const improved = await this.aiImproveFn(read.content, originalProposal);
          if (improved && improved.content) {
            await revisionService.store.writePlanArtifact(missionId, improved.content);
            prompts.log.success("Plano melhorado pela IA. Recompilando...");
            const revision = await revisionService.compileRevision(missionId, originalProposal, { taskGraphId: options.taskGraphId, reason: "AI improvement", source: "ai-improvement", actor: "ai" });
            if (revision.valid) {
              pendingRevision = revision.revision;
              pendingProposal = revision.revisedProposal;
              prompts.log.success(`Plano recompilado (${revision.tasks.length} tarefas).`);
            } else {
              prompts.log.error("Plano melhorado contem erros:");
              for (const err of revision.errors) prompts.log.error(`  - ${err}`);
            }
          } else {
            prompts.log.info("IA nao sugeriu alteracoes.");
          }
        } catch (err) {
          prompts.log.error(`Falha na melhoria IA: ${err.message}`);
        }
      }

      if (action === "regenerar") {
        pendingRevision = undefined;
        pendingProposal = undefined;
        if (!this.regenerateFn) {
          prompts.log.warning("Funcao de regeneracao nao disponivel.");
          continue;
        }
        const confirm = await prompts.confirm({
          message: "Regenerar o plano descartara alteracoes atuais. Continuar?"
        });
        if (prompts.isCancel(confirm) || !confirm) {
          prompts.log.info("Regeneracao cancelada.");
          continue;
        }
        prompts.log.info("Regenerando plano...");
        try {
          const regenerated = await this.regenerateFn(originalProposal);
          if (regenerated && regenerated.content) {
            await revisionService.store.writePlanArtifact(missionId, regenerated.content);
            prompts.log.success("Plano regenerado. Recompilando...");
            const revision = await revisionService.compileRevision(missionId, originalProposal, { taskGraphId: options.taskGraphId, reason: "AI regeneration", source: "ai-regeneration", actor: "ai" });
            if (revision.valid) {
              pendingRevision = revision.revision;
              pendingProposal = revision.revisedProposal;
              prompts.log.success(`Plano recompilado (${revision.tasks.length} tarefas).`);
            } else {
              prompts.log.error("Plano regenerado contem erros:");
              for (const err of revision.errors) prompts.log.error(`  - ${err}`);
            }
          } else {
            prompts.log.error("Regeneracao nao retornou conteúdo.");
          }
        } catch (err) {
          prompts.log.error(`Falha na regeneracao: ${err.message}`);
        }
      }

      if (action === "recompilar") {
        pendingRevision = undefined;
        pendingProposal = undefined;
        const revision = await revisionService.compileRevision(missionId, originalProposal, { taskGraphId: options.taskGraphId, reason: "human plan edit", source: "human-editor", actor: options.actor || "user" });
        if (!revision.changed) {
          prompts.log.info("Nenhuma alteracao detectada no plano.");
        } else if (!revision.valid) {
          prompts.log.error("Plano revisado contem erros:");
          for (const err of revision.errors) {
            prompts.log.error(`  - ${err}`);
          }
        } else {
          pendingRevision = revision.revision;
          pendingProposal = revision.revisedProposal;
          prompts.log.success(`Plano recompilado com sucesso (${revision.tasks.length} tarefas).`);
        }
      }
    }

    return { approved: reviewApproved };
  }
}

module.exports = { PlanReviewWorkflow };
