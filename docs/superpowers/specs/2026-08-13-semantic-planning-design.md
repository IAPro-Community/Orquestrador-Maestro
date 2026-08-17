# M3 — Semantic Planning Architecture Specification

- **Status**: APPROVED (WITH FINAL REFINEMENTS)
- **Author**: Antigravity (Orquestrador)
- **Date**: 2026-08-13
- **Milestone**: M3 — Semantic Planning

---

## 1. Executive Summary

Milestone M3 evolves the planning subsystem of Orquestrador Maestro from generic, template-driven workflow phases (`PLANNING` → `SCAFFOLD` → `TEST` → `VERIFY`) into a **Context-Aware Semantic Engineering Planner**.

The primary architectural separation established in M3 is:
- **M3 (Semantic Planning)**: **WHAT** needs to be done? Decomposes an approved `MissionBrief` into concrete, cohesive units of engineering work informed by `TaskRelevantContext` and relevant `Skills`.
- **M4 (Model Routing & Execution)**: **WHO / WHICH MODEL** executes each task? Selects provider, model, tier, and execution profile based on semantic task metadata.

Following the core principle proven in M2:
> **AI proposes. Core validates. Human approves (or User Auto Policy evaluates). Core executes.**

```
Approved MissionBrief
        +
TaskRelevantContext (M1)
        +
Relevant Skills
        │
        ▼
┌───────────────────────────────────────┐
│     SemanticPlanner (Local AI)        │  ──> AI proposes TaskGraphProposal
│     (or deterministic fallback)       │      with explicit planningMode provenance
└───────────────────────────────────────┘
        │
        ▼  (TaskGraphProposal)
┌───────────────────────────────────────┐
│     GraphValidator (Deterministic)    │  ──> DAG validation (Cycles, Dangling, Self-deps)
│  - No Silent Semantic Stripping       │  ──> Context authority: FACT/DECISION can block;
│  - Fail-closed on Contradictions      │      INFERENCE informs rationale/warnings only
└───────────────────────────────────────┘
        │
        ▼  (Semantic TaskGraph)
┌───────────────────────────────────────┐
│       Plan Approval Gate              │  ──> HUMAN_REVIEW: Interactive review & approval
│  (HUMAN_REVIEW or USER_AUTO_POLICY)   │  ──> USER_AUTO_POLICY: Zero blockers, strict gates
└───────────────────────────────────────┘
        │ (Approved)
        ▼
┌───────────────────────────────────────┐
│     LegacyExecutionProjection         │  ──> Maps SemanticTask -> legacy fields for LaneExecutor
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│     LaneExecutor (Runtime Unchanged)  │  ──> Parallel DAG execution
└───────────────────────────────────────┘
```

---

## 2. Current State & Compatibility Analysis

### 2.1 Current Task Contract (`runtime/core/entities.js`)
`createTask(input)` validates and creates:
```javascript
{
  kind: "task",
  id: string,               // required non-empty
  description: string,      // required non-empty
  projectId: string,        // optional
  createdAt: string,        // optional ISO timestamp
  metadata: object          // optional arbitrary metadata
}
```

### 2.2 Current TaskGraph Contract (`runtime/core/entities.js`)
`createTaskGraph(input)` validates:
```javascript
{
  kind: "task_graph",
  id: string,               // required non-empty
  missionId: string,        // required non-empty
  tasks: Task[],            // optional array of Task entities
  dependencies: object      // optional map: { [taskId]: string[] }
}
```

### 2.3 Existing Runtime & YAGNI
- **`LaneExecutor` (`runtime/planner/lane-executor.js`)**: Already natively executes a DAG via `(t.dependsOn || []).every(dep => completed.has(dep))` and supports parallelism up to `maxParallel`. It remains **UNCHANGED** by default.
- **`JsonFileRunStore` (`runtime/store/json-file-run-store.js`)**: Already persists `tasks`, `taskGraphs`, and `missionBriefs`. Remains **UNCHANGED** unless tests prove metadata is dropped.
- **Legacy compatibility**: A dedicated projection layer (`LegacyExecutionProjection`) bridges `SemanticTask` to the legacy task properties (`label`, `description`, `dependsOn`, `skills`, `provider`, `model`) expected by `LaneExecutor`.

---

## 3. Architectural Design & Contracts

### 3.1 Semantic Task Contract (Pure "WHAT", No Routing)
A `SemanticTask` describes solely the engineering work to be performed. Routing fields (`provider`, `model`, `estimatedCost`) are strictly **excluded** from `SemanticTask` and deferred to M4.

```typescript
interface SemanticTask {
  id: string;                       // e.g. "task-1" or "task-domain-products"
  title: string;                    // Short, clear action (e.g. "Implement Product persistence")
  objective: string;                // Detailed goal and scope
  type: SemanticTaskType;           // "analyze" | "domain" | "persistence" | "service" | "api" | "ui" | "test" | "verify" | "other"
  dependsOn: string[];              // IDs of prerequisite tasks
  acceptanceCriteria: string[];     // Testable conditions for task completion
  verificationHints: string[];      // Suggested verification commands (e.g. ["npm test", "npm run lint"])
  requiredSkills: string[];         // Domain skills (e.g. ["sql-migrations", "api-conventions"])
  requiredCapabilities: EngineeringCapability[]; // e.g. ["backend", "database", "testing"]
  complexity: "simple" | "medium" | "complex" | "expert";
  risk: "low" | "medium" | "high" | "critical";
  sourceRequirements: string[];     // Requirements from MissionBrief satisfied by this task
  planningReason: string;           // Rationale for why this task was created
  dependencyReasons: Record<string, string>; // Map of depId -> reason for dependency
}
```

#### Engineering Capabilities vs Executor Capabilities
- `requiredCapabilities` in M3 represents **Engineering Capabilities** needed to accomplish the task:
  - `backend`, `frontend`, `database`, `testing`, `security`, `documentation`, `infrastructure`, `architecture`.
- **Executor / Provider Capabilities** (`headless`, `structuredEvents`, `streaming`, `mcp`, `sandboxControl`) belong strictly to M4 Model Routing and are **NOT** part of M3.

#### Independence of Complexity and Risk
- `complexity` measures cognitive difficulty and domain intricacy (`simple` | `medium` | `complex` | `expert`).
- `risk` measures blast radius, data loss potential, and breaking change severity (`low` | `medium` | `high` | `critical`).
- `risk` is NOT derived from `skill.safety` or complexity; it is an independent domain assessment.

### 3.2 Legacy Execution Projection (M3 → LaneExecutor Adapter)
To maintain 100% backward compatibility with `LaneExecutor` without polluting `SemanticTask`:

```javascript
class LegacyExecutionProjection {
  static projectTask(semanticTask, options = {}) {
    const defaultProvider = options.defaultProvider || "codex";
    const defaultModel = options.defaultModel || "default";
    return Object.freeze({
      id: semanticTask.id,
      label: semanticTask.title,
      description: `${semanticTask.objective}\n\nAcceptance Criteria:\n${semanticTask.acceptanceCriteria.map(c => `- ${c}`).join("\n")}`,
      skills: semanticTask.requiredSkills || [],
      dependsOn: semanticTask.dependsOn || [],
      provider: defaultProvider,
      model: defaultModel,
      semanticMetadata: semanticTask
    });
  }

  static projectGraph(taskGraph, options = {}) {
    return taskGraph.tasks.map(t => LegacyExecutionProjection.projectTask(t, options));
  }
}
```

### 3.3 TaskGraphProposal Contract
The intermediate proposal generated by the AI (or deterministic fallback):

```typescript
interface TaskGraphProposal {
  planningMode: "local-ai" | "deterministic-fallback";
  tasks: SemanticTaskProposal[];
  assumptions: string[];
  warnings: Array<{ code: string; message: string; taskId?: string }>;
  blockers: Array<{ code: string; dimension: string; description: string }>;
  rationale: string;
}
```

#### Rules on Planning Assumptions
- `assumptions` may document non-critical working hypotheses.
- **Assumptions CANNOT**:
  - Replace missing mission requirements;
  - Alter or contradict the `MissionBrief`;
  - Invent unapproved product decisions;
  - Bypass or silently resolve a `PlanningBlocker`;
  - Automatically become a `USER_DECISION`.
- If an assumption is required to decide mission behavior or architecture, it must be treated as a `PlanningBlocker` returning to M2 refinement.

### 3.4 GraphValidator & Context Authority
`GraphValidator` executes deterministic, fail-closed validation:

```
TaskGraphProposal
        │
        ▼
1. Structural & ID Validation (Unique IDs, non-empty fields)
        │
        ▼
2. DAG Validation (No self-deps, no dangling deps, no cycles via Kahn's algorithm)
        │
        ▼
3. Semantic Quality (No generic placeholders, valid acceptance criteria, valid enums)
        │
        ▼
4. Context Authority & Contradiction Checks
   - FACT / USER_DECISION / Constraints: Hard Block on Contradiction (NO SILENT STRIPPING)
   - INFERENCE: Warnings / Rationale adjustments only (NO hard reject)
        │
        ▼
5. Non-Semantic Normalization (String trimming, ID formatting)
        │
        ▼
6. Re-validate Full DAG after Normalization
        │
        ▼
Result: { valid: boolean, taskGraph?: TaskGraph, blockers: Blocker[], warnings: Warning[] }
```

#### No Silent Semantic Stripping
- If a proposed task contradicts a `FACT` (e.g. proposes React UI on a backend-only project, or SQL migrations on a MongoDB project), `GraphValidator` **DOES NOT** silently strip the task.
- It produces a `PlanningBlocker` / `ValidationIssue` and **rejects the proposal**.
- Automated normalization is strictly limited to non-semantic sanitization (e.g. whitespace trimming). After any normalization, the full DAG is re-validated.

#### Context Authority Hierarchy
1. `FACT`, `USER_DECISION`, explicit constraints, and critical project rules have **authoritative blocking power**.
2. `INFERENCE` carries lower confidence and **cannot hard-reject a task on its own**; it generates warnings and planning notes.

### 3.5 DAG Utilities (`runtime/planner/dag-utils.js`)
YAGNI principle strictly applied. Contains only what is actively required:
- `detectCycle(tasks, dependencies)`: Cycle detection using Kahn's algorithm / in-degree tracking.
- `validateDAG(tasks, dependencies)`: Validates no self-dependencies, no dangling dependencies, and no cycles.
- `topologicalSort(tasks, dependencies)`: Produces topological ordering for execution planning.
- **Transitive reduction is EXCLUDED** in M3 to preserve explicit semantic dependencies and `dependencyReasons`.

### 3.6 Deterministic Fallback & Provenance Policy
- `SemanticPlanner` records explicit provenance: `planningMode: "local-ai" | "deterministic-fallback"`.
- **Interactive Mode**: Fallback may generate a plan based on resolved skills and context facts for Human Review.
- **Batch (`--auto`) Mode**: Deterministic fallback is **NOT executed automatically** unless explicitly authorized by policy. If local AI fails in `--auto`, planning fails closed.
- `localOnly: true` is strictly enforced: no silent cloud provider calls.

### 3.7 Plan Approval Model (`HUMAN_REVIEW` vs `USER_AUTO_POLICY`)
The plan approval gate explicitly records its authorization type:
- `approvalType: "HUMAN_REVIEW"`: User manually inspected and approved the plan via interactive prompt.
- `approvalType: "USER_AUTO_POLICY"`: Approved automatically by `--auto` flag. **NEVER marked as `HUMAN_REVIEWED`**.
- `USER_AUTO_POLICY` may ONLY proceed if all of the following hold:
  1. `GraphValidator` returns `valid: true`;
  2. Zero `PlanningBlockers`;
  3. Zero unresolved critical context conflicts;
  4. Valid `MissionBrief` derived from valid `IntentSpec`;
  5. `planningMode` is authorized by auto-execution policy.

---

## 4. File Boundaries

### Files to Reuse Unchanged
- `runtime/core/validation.js`
- `runtime/context/context-engine.js`
- `runtime/context/semantic-ranker.js`
- `runtime/skills/registry.js`
- `runtime/git/monitor.js`
- `runtime/verification/engine.js`
- `runtime/workspaces/manager.js`
- `runtime/planner/lane-executor.js` *(Kept unchanged; consumes projected tasks)*
- `runtime/store/json-file-run-store.js` *(Kept unchanged)*

### Files to Modify
- `runtime/core/entities.js`: Additive helper / metadata validation if required.
- `runtime/planner/task-decomposer.js`: Refactored to delegate to `SemanticPlanner` for backward compatibility.
- `runtime/planner/task-formatter.js`: Formats semantic tasks (title, objective, criteria, dependencies, engineering capabilities).
- `runtime/planner/index.js`: Exports new semantic planning components.
- `bin/orquestrador-maestro.js`: Integrates `SemanticPlanner`, `GraphValidator`, and Plan Approval Gate in `go` command.

### Files to Create
- `runtime/planner/dag-utils.js`: Pure DAG algorithms (cycle detection, dangling checks, topological sort).
- `runtime/planner/semantic-planner.js`: Coordinates AI proposal generation, fallback, and validation.
- `runtime/planner/task-graph-proposal.js`: Data structure and validation for proposals.
- `runtime/planner/graph-validator.js`: Deterministic validator enforcing DAG, context authority, and quality rules.
- `runtime/planner/legacy-execution-projection.js`: Adapter projecting `SemanticTask` to legacy task format for `LaneExecutor`.
- `tests/planner/dag-utils.test.js`: Unit tests for DAG operations.
- `tests/planner/graph-validator.test.js`: Unit tests for graph validation and context authority.
- `tests/planner/semantic-planner.test.js`: Unit tests for planner orchestration and fallback policies.
- `tests/planner/legacy-execution-projection.test.js`: Unit tests for compatibility projection.

---

## 5. Verification & Test Strategy

The test suite must explicitly cover the following 16 scenarios:

1. **Routing Decoupling**: `SemanticTask` does not contain mandatory routing decisions (`provider`, `model`, `estimatedCost`).
2. **Compatibility Projection**: `LegacyExecutionProjection` provides legacy `provider`, `model`, `label`, `description`, `dependsOn` for `LaneExecutor`.
3. **Engineering Capabilities**: `requiredCapabilities` contains engineering disciplines (`backend`, `database`, etc.) and rejects runtime executor capabilities (`headless`, `structuredEvents`).
4. **Context Authority (FACT)**: Contradicting a project `FACT` triggers `PlanningBlocker` and rejects proposal.
5. **Context Authority (INFERENCE)**: Isolated `INFERENCE` produces warnings/notes but does not hard-reject valid proposals.
6. **No Silent Stripping**: Context or MissionBrief contradictions are never silently stripped; the proposal is rejected.
7. **Fallback Provenance**: Fallback plan explicitly records `planningMode: "deterministic-fallback"`.
8. **Auto-Mode Fallback Guard**: `--auto` does not execute unauthorized deterministic fallback silently.
9. **Approval Provenance**: Auto-approved plan is marked `USER_AUTO_POLICY` and never `HUMAN_REVIEW`.
10. **Risk Model Independence**: `task.risk` accepts `low`, `medium`, `high`, `critical` and is independent of `complexity` and `skill.safety`.
11. **Dependency Reasons**: `dependencyReasons` is preserved across normalization and graph generation.
12. **No Transitive Reduction**: Explicit semantic dependencies are preserved without artificial reduction.
13. **Assumptions Integrity**: Planning assumptions cannot alter `MissionBrief` or create product decisions.
14. **Critical Assumption Escalation**: A critical unverified assumption escalates to `PlanningBlocker` returning to M2 refinement.
15. **LaneExecutor Compatibility**: Existing `LaneExecutor` continues executing projected DAG without modification.
16. **Legacy TaskGraph Compatibility**: Legacy `TaskGraph` loading and existing 111 baseline tests remain green.

---

## 6. Out of Scope for M3

The following items are strictly deferred to M4 or future milestones:
- Full `ModelRouter` redesign and dynamic provider bidding
- Execution profile dispatch & cost optimization policies
- Self-healing and repair loops
- Automated verification evidence collector pipeline
- Global distributed scheduler
- Multi-project control plane
- TUI interactive DAG editor

---

## 7. Self-Review Results

- **TODO/TBD Check**: 0 occurrences. All contracts, error modes, and boundaries are explicitly defined.
- **Contradiction Check**: No contradictions between M1 provenance, M2 refinement contracts, and M3 planning.
- **Overengineering Check**: Reuses existing `TaskGraph`, `JsonFileRunStore`, and `LaneExecutor` without introducing unneeded entity layers or graph databases.
- **Compatibility Check**: All additions are strictly additive. Baseline suite (111 passed) preserved.
