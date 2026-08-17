"use strict";

const { IntentRouter } = require("./intent-router");
const { gatherPreflight } = require("./context-preflight");
const { DynamicInterviewer } = require("./dynamic-interviewer");
const { decompose, TASK_TYPES } = require("./task-decomposer");
const { classifyComplexity, selectModel, estimateCost, COMPLEXITY_LEVELS } = require("./model-router");
const { LaneExecutor } = require("./lane-executor");
const { compactContext } = require("./context-compactor");
const { SemanticPlanner } = require("./semantic-planner");
const { GraphValidator } = require("./graph-validator");
const { LegacyExecutionProjection } = require("./legacy-execution-projection");
const { PlanApprovalGate } = require("./plan-approval-gate");
const { DeterministicFallbackPlanner } = require("./deterministic-fallback-planner");
const { PlanArtifactRenderer } = require("./plan-artifact-renderer");
const { PlanArtifactStore } = require("./plan-artifact-store");
const { ExternalEditorLauncher } = require("./external-editor-launcher");
const { PlanRevisionCompiler } = require("./plan-revision-compiler");
const { PlanRevisionService } = require("./plan-revision-service");
const { PlanReviewWorkflow } = require("./plan-review-workflow");
const { computeSemanticDiff, hasChanges, describeDiff } = require("./plan-semantic-diff");
const { createBatchQuestion, VALID_ANSWER_TYPES } = require("./batch-question");
const { validateQuestionSet, SUPPORTED_OPERATORS } = require("./question-set-validator");
const { scheduleQuestions, evaluateActivation } = require("./question-scheduler");
const { BatchAnswerCollector } = require("./batch-answer-collector");
const { BatchAnswerApplier } = require("./batch-answer-applier");
const { BatchIntentDiscoverer } = require("./batch-intent-discoverer");
const { IntentReconciler } = require("./intent-reconciler");
const { BatchRefinementCoordinator } = require("./batch-refinement-coordinator");
const { ClackBatchInteractionAdapter } = require("./clack-batch-adapter");
const dagUtils = require("./dag-utils");

module.exports = {
  IntentRouter,
  gatherPreflight,
  DynamicInterviewer,
  decompose,
  TASK_TYPES,
  classifyComplexity,
  selectModel,
  estimateCost,
  COMPLEXITY_LEVELS,
  LaneExecutor,
  compactContext,
  SemanticPlanner,
  GraphValidator,
  LegacyExecutionProjection,
  PlanApprovalGate,
  DeterministicFallbackPlanner,
  PlanArtifactRenderer,
  PlanArtifactStore,
  ExternalEditorLauncher,
  PlanRevisionCompiler,
  PlanRevisionService,
  PlanReviewWorkflow,
  computeSemanticDiff,
  hasChanges,
  describeDiff,
  createBatchQuestion,
  VALID_ANSWER_TYPES,
  validateQuestionSet,
  SUPPORTED_OPERATORS,
  scheduleQuestions,
  evaluateActivation,
  BatchAnswerCollector,
  BatchAnswerApplier,
  BatchIntentDiscoverer,
  IntentReconciler,
  BatchRefinementCoordinator,
  ClackBatchInteractionAdapter,
  dagUtils
};
