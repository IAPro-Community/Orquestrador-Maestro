"use strict";

function asStep(step) { return typeof step === "string" ? { id: step, title: step } : { ...step, title: step.title || step.label || step.id }; }
function phaseFor(stepId, phases = []) {
  const index = phases.findIndex((phase) => {
    const ids = Array.isArray(phase.steps) ? phase.steps : phase.step ? [phase.step] : [];
    return phase.id === stepId || ids.includes(stepId);
  });
  const phase = index >= 0 ? phases[index] : null;
  return { id: phase?.id || stepId || "unknown", index: index >= 0 ? index + 1 : 1, total: phases.length || 1 };
}
function evidenceFor(step, workflowState, runState) {
  const candidates = [
    ...(Array.isArray(runState?.evidence) ? runState.evidence : []),
    ...(Array.isArray(runState?.result?.evidence) ? runState.result.evidence : []),
    ...(Array.isArray(workflowState?.evidence) ? workflowState.evidence : [])
  ];
  return candidates.filter((entry) => entry && (entry.stepId === step.id || !entry.stepId)).map((entry) => typeof entry === "string" ? entry : entry.value || entry.path || entry.summary || entry).filter(Boolean);
}

function projectProgress({ workflowState = {}, workflowLock = {}, runState = {}, agents = [], interactionProfile } = {}) {
  const resolved = workflowLock.resolved || workflowLock;
  const steps = (resolved.steps || []).map(asStep);
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === workflowState.currentStep));
  const currentStep = steps[currentIndex] || { id: workflowState.currentStep || "unknown", title: workflowState.currentStep || "Aguardando etapa" };
  const previous = steps.slice(0, currentIndex);
  const nextStep = steps[currentIndex + 1];
  const agent = currentStep.agent || runState.agent || (Array.isArray(agents) && agents[0]?.id) || undefined;
  const interaction = interactionProfile || { id: "default", source: "default" };
  const result = {
    status: workflowState.status || runState.status || "idle",
    taskId: workflowState.taskId || workflowLock.taskId,
    workflow: workflowState.workflow || workflowLock.workflow,
    phase: phaseFor(currentStep.id, resolved.phases),
    current: { title: currentStep.title, status: currentStep.status || workflowState.status || "running", ...(agent ? { agent } : {}) },
    completed: previous.length,
    total: steps.length,
    lastCompleted: previous.length ? { title: previous[previous.length - 1].title, evidence: evidenceFor(previous[previous.length - 1], workflowState, runState) } : null,
    next: nextStep ? { title: nextStep.title } : null,
    blockers: workflowState.blockers || runState.blockers || [],
    gates: workflowState.gates || {},
    interaction: { id: interaction.id, source: interaction.source }
  };
  if (workflowState.approvals) result.approvals = workflowState.approvals;
  return result;
}

module.exports = { projectProgress };
