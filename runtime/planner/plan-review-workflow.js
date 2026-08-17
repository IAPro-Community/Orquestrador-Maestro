"use strict";

const p = require("@clack/prompts");
const { PlanRevisionService } = require("./plan-revision-service");
const { PlanArtifactRenderer } = require("./plan-artifact-renderer");

class PlanReviewWorkflow {
  constructor({ revisionService, notifier, aiImproveFn, regenerateFn } = {}) {
    this.revisionService = revisionService || null;
    this.notifier = notifier || null;
    this.aiImproveFn = aiImproveFn || null;
    this.regenerateFn = regenerateFn || null;
  }

  async conductReview(missionId, originalProposal, options = {}) {
    if (!missionId || typeof missionId !== "string") throw new TypeError("missionId is required");
    if (!originalProposal || typeof originalProposal !== "object") throw new TypeError("originalProposal is required");

    const revisionService = this.revisionService;
    let reviewApproved = false;

    while (!reviewApproved) {
      const action = await p.select({
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

      if (p.isCancel(action) || action === "cancelar") {
        if (revisionService) await revisionService.cancel(missionId);
        p.cancel("Operacao cancelada pelo usuario.");
        return { approved: false, cancelled: true };
      }

      if (action === "aprovar") {
        const confirm = await p.confirm({
          message: "Tem certeza que deseja aprovar este plano?"
        });
        if (p.isCancel(confirm)) {
          p.log.info("Aprovacao cancelada.");
          continue;
        }
        if (!confirm) {
          p.log.info("Aprovacao nao confirmada.");
          continue;
        }
        const approval = await revisionService.approveRevision(missionId, originalProposal.id || "unknown", "approved");
        p.log.success(`Plano aprovado (${approval.approvalType}).`);
        reviewApproved = true;
        return { approved: true, approval };
      }

      if (action === "ver-plano") {
        const read = await revisionService.store.readPlanArtifact(missionId);
        if (read.exists) {
          p.note(read.content, "Plano de Engenharia");
        } else {
          p.log.error("Arquivo de plano nao encontrado.");
        }
      }

      if (action === "editar") {
        const openResult = await revisionService.openForReview(missionId);
        if (openResult.launched) {
          p.log.info("Editor aberto. Faca suas alteracoes e salve o arquivo.");
        } else {
          p.log.error(`Falha ao abrir editor: ${openResult.reason}`);
        }
      }

      if (action === "melhorar-ia") {
        if (!this.aiImproveFn) {
          p.log.warning("Funcao de melhoria por IA nao disponivel.");
          continue;
        }
        const read = await revisionService.store.readPlanArtifact(missionId);
        if (!read.exists) {
          p.log.error("Arquivo de plano nao encontrado.");
          continue;
        }
        p.log.info("Solicitando melhoria via IA...");
        try {
          const improved = await this.aiImproveFn(read.content, originalProposal);
          if (improved && improved.content) {
            await revisionService.store.writePlanArtifact(missionId, improved.content);
            p.log.success("Plano melhorado pela IA. Recompilando...");
            const revision = await revisionService.compileRevision(missionId, originalProposal);
            if (revision.valid) {
              p.log.success(`Plano recompilado (${revision.tasks.length} tarefas).`);
            } else {
              p.log.error("Plano melhorado contem erros:");
              for (const err of revision.errors) p.log.error(`  - ${err}`);
            }
          } else {
            p.log.info("IA nao sugeriu alteracoes.");
          }
        } catch (err) {
          p.log.error(`Falha na melhoria IA: ${err.message}`);
        }
      }

      if (action === "regenerar") {
        if (!this.regenerateFn) {
          p.log.warning("Funcao de regeneracao nao disponivel.");
          continue;
        }
        const confirm = await p.confirm({
          message: "Regenerar o plano descartara alteracoes atuais. Continuar?"
        });
        if (p.isCancel(confirm) || !confirm) {
          p.log.info("Regeneracao cancelada.");
          continue;
        }
        p.log.info("Regenerando plano...");
        try {
          const regenerated = await this.regenerateFn(originalProposal);
          if (regenerated && regenerated.content) {
            await revisionService.store.writePlanArtifact(missionId, regenerated.content);
            p.log.success("Plano regenerado. Recompilando...");
            const revision = await revisionService.compileRevision(missionId, originalProposal);
            if (revision.valid) {
              p.log.success(`Plano recompilado (${revision.tasks.length} tarefas).`);
            } else {
              p.log.error("Plano regenerado contem erros:");
              for (const err of revision.errors) p.log.error(`  - ${err}`);
            }
          } else {
            p.log.error("Regeneracao nao retornou conteúdo.");
          }
        } catch (err) {
          p.log.error(`Falha na regeneracao: ${err.message}`);
        }
      }

      if (action === "recompilar") {
        const revision = await revisionService.compileRevision(missionId, originalProposal);
        if (!revision.changed) {
          p.log.info("Nenhuma alteracao detectada no plano.");
        } else if (!revision.valid) {
          p.log.error("Plano revisado contem erros:");
          for (const err of revision.errors) {
            p.log.error(`  - ${err}`);
          }
        } else {
          p.log.success(`Plano recompilado com sucesso (${revision.tasks.length} tarefas).`);
        }
      }
    }

    return { approved: reviewApproved };
  }
}

module.exports = { PlanReviewWorkflow };
