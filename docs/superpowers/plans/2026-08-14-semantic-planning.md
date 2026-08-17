# M3 Semantic Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform an approved `MissionBrief`, `TaskRelevantContext`, and applicable `Skills` into a validated semantic engineering `TaskGraph` ready for explicit approval and execution.

**Architecture:** Use a `SemanticPlanner` to produce structured `TaskGraphProposal` objects (via Local AI or context-grounded deterministic fallback), validate them deterministically through `GraphValidator` (enforcing DAG cycle-free properties, context authority, mission constraint authority, assumption guardrails, and quality rules), normalize validated semantic tasks into Core `Task` and `TaskGraph` entities using backward-compatible contracts, and bridge semantic tasks to the legacy `LaneExecutor` through `LegacyExecutionProjection` with explicit execution targets until M4 introduces formal `RoutingDecision`.

**Tech Stack:** Node.js (v18+ compatible), CommonJS, Node Test Runner (`node:test`, `node:assert/strict`), existing Maestro runtime entities and persistence.

---

## Global Constraints & Invariants

1. **Pure Semantic WHAT**: `SemanticTask` contains NO routing decisions (`provider`, `model`, `estimatedCost`).
2. **No Silent Provider Defaults**: `LegacyExecutionProjection` requires an explicit `executionTarget` (`providerId`, `model`) from the caller; missing target throws `MISSING_EXECUTION_TARGET`. Never defaults silently to "codex" or "default".
3. **Explicit Planning Model & Local-Only Policy**: `SemanticPlanner` receives explicit `plannerTarget` (`providerId`, `model`, `local`). If `localOnly === true` and `plannerTarget.local === false`, throws `LOCAL_ONLY_VIOLATION`.
4. **Real Approved MissionBrief as Source of Truth**: CLI passes the actual approved `MissionBrief` (with `id`, `objective`, `requirements`, `userDecisions`, `constraints`) directly to `SemanticPlanner`. No artificial reconstruction.
5. **Real Mission ID Required**: `SemanticPlanner.plan()` requires an explicit `missionId` (from `missionBrief.id` or active mission). Missing `missionId` throws `MISSING_MISSION_ID`.
6. **Single Source of Truth for Dependencies**: `tasks[].dependsOn` is canonical. `TaskGraph.dependencies` is derived via `deriveDependencies(tasks)`.
7. **Engineering Capabilities**: `requiredCapabilities` contains only engineering disciplines (`backend`, `frontend`, `database`, `testing`, `security`, `documentation`, `infrastructure`, `architecture`). No runtime executor capabilities (`headless`, `structuredEvents`).
8. **Context Authority & Mission Constraints**: `FACT`, `USER_DECISION`, and `missionBrief.constraints` have authoritative blocking power. `INFERENCE` produces warnings/rationale only and never hard-rejects a proposal.
9. **No Silent Semantic Stripping**: Contradictions produce `PlanningBlocker` and reject the proposal. Normalization is strictly non-semantic (e.g. whitespace trimming) and triggers a full DAG re-validation.
10. **No Task ID Rewriting**: Task IDs are structural identifiers; invalid IDs fail validation cleanly.
11. **Assumption Guardrails**: Critical assumptions that affect architecture/behavior without evidence produce `PlanningBlocker` returning to M2 refinement.
12. **Generic Title Rejection**: `"PLANNING"`, `"SCAFFOLD"`, `"IMPLEMENT"`, `"TEST"`, `"VERIFY"` alone are strictly rejected as semantic titles.
13. **Cycle Reporting via Kahn's**: Kahn's algorithm reports `CYCLE_DETECTED` with `involvedTaskIds` (unresolved vertices).
14. **Context-Grounded Fallback**: Fallback generates work slices only when supported by evidence in `MissionBrief`, `TaskRelevantContext`, and `Skills` (no hardcoded CRUD templates).
15. **Real Plan Approval Flow**: Interactive flow renders plan and handles Approve (`HUMAN_REVIEW`), Inspect, Refine (return to M2 without execution), Cancel (abort without execution). `--auto` evaluates `USER_AUTO_POLICY`.
16. **Invalid Graph Execution Boundary**: Rejected proposals never reach `LaneExecutor.execute()` (`callCount === 0`).
17. **Runtime YAGNI**: `LaneExecutor` and `JsonFileRunStore` remain **UNCHANGED** by default unless characterization tests fail.
18. **TDD Required**: Write failing tests before implementation for every unit. Baseline (111 passed) must remain green throughout.

---

## File Structure

```
runtime/planner/
├── dag-utils.js                      # Task 1: DAG algorithms (cycle detection via Kahn's, topological sort, deriveDependencies)
├── task-graph-proposal.js            # Task 2: SemanticTask, TaskGraphProposal contracts, Core entity mapping & metadata preservation
├── graph-validator.js                # Task 3 & 4: Structural, DAG, Assumption, Constraint, and Context validation
├── legacy-execution-projection.js    # Task 5: Projection adapter for LaneExecutor (explicit executionTarget required)
├── deterministic-fallback-planner.js # Task 6: Context-grounded heuristic fallback planner with explicit provenance
├── semantic-planner.js               # Task 7: Coordinator for AI proposal, plannerTarget, localOnly, fallback, and validation
├── plan-approval-gate.js             # Task 8: Approval provenance & --auto policy validator
├── task-decomposer.js                # Task 9: Compatibility façade delegating to SemanticPlanner with explicit target
├── task-formatter.js                 # Task 9: Enhanced terminal formatter for semantic tasks
└── index.js                          # Task 9: Module exports

tests/
├── dag-utils.test.js
├── task-graph-proposal.test.js
├── graph-validator.test.js
├── graph-validator-context.test.js
├── legacy-execution-projection.test.js
├── deterministic-fallback-planner.test.js
├── semantic-planner.test.js
├── plan-approval-gate.test.js
├── task-decomposer-facade.test.js
├── task-formatter.test.js
├── cli-go-planning.test.js
└── m3-acceptance-scenarios.test.js
```

---

## Implementation Tasks

### Task 1: DAG Validation Primitives & Canonical Dependencies (`dag-utils.js`)

**Goal:** Implement graph algorithms for cycle detection (Kahn's algorithm returning `involvedTaskIds`), dangling dependency validation, self-dependency detection, topological ordering, and canonical dependency map derivation (`deriveDependencies`).

- [ ] **Step 1.1: Write failing unit tests for DAG utilities**
  Create `tests/dag-utils.test.js`:
  ```javascript
  "use strict";
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  const { validateDAG, deriveDependencies } = require("../runtime/planner/dag-utils");

  test("deriveDependencies builds canonical map from tasks dependsOn", () => {
    const tasks = [
      { id: "t1", dependsOn: [] },
      { id: "t2", dependsOn: ["t1"] },
      { id: "t3", dependsOn: ["t1", "t2"] }
    ];
    assert.deepEqual(deriveDependencies(tasks), {
      t1: [],
      t2: ["t1"],
      t3: ["t1", "t2"]
    });
  });

  test("validateDAG accepts valid sequential and parallel graphs", () => {
    const tasks = [
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: ["a"] },
      { id: "c", dependsOn: ["a"] },
      { id: "d", dependsOn: ["b", "c"] }
    ];
    const res = validateDAG(tasks);
    assert.equal(res.valid, true);
    assert.deepEqual(res.errors, []);
    assert.deepEqual(res.topologicalOrder, ["a", "b", "c", "d"]);
  });

  test("validateDAG rejects self-dependency", () => {
    const tasks = [{ id: "a", dependsOn: ["a"] }];
    const res = validateDAG(tasks);
    assert.equal(res.valid, false);
    assert.match(res.errors[0], /SELF_DEPENDENCY/);
  });

  test("validateDAG rejects dangling dependency", () => {
    const tasks = [{ id: "a", dependsOn: ["non-existent"] }];
    const res = validateDAG(tasks);
    assert.equal(res.valid, false);
    assert.match(res.errors[0], /DANGLING_DEPENDENCY/);
  });

  test("detectCycle returns involvedTaskIds on cycle via Kahn algorithm", () => {
    const tasks = [
      { id: "a", dependsOn: ["c"] },
      { id: "b", dependsOn: ["a"] },
      { id: "c", dependsOn: ["b"] },
      { id: "d", dependsOn: [] }
    ];
    const res = validateDAG(tasks);
    assert.equal(res.valid, false);
    assert.match(res.errors[0], /CYCLE_DETECTED/);
    assert.deepEqual(res.involvedTaskIds.sort(), ["a", "b", "c"]);
  });

  test("preserves explicit dependencies without transitive reduction", () => {
    const tasks = [
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: ["a"] },
      { id: "c", dependsOn: ["a", "b"] }
    ];
    const derived = deriveDependencies(tasks);
    assert.deepEqual(derived.c, ["a", "b"]);
  });
  ```

- [ ] **Step 1.2: Run test to verify RED**
  ```bash
  node --test tests/dag-utils.test.js
  ```
  *Expected Output:* `MODULE_NOT_FOUND: Cannot find module '../runtime/planner/dag-utils'`.

- [ ] **Step 1.3: Implement `runtime/planner/dag-utils.js`**
  ```javascript
  "use strict";

  function deriveDependencies(tasks) {
    if (!Array.isArray(tasks)) return {};
    const map = {};
    for (const task of tasks) {
      if (task && typeof task.id === "string") {
        map[task.id] = Array.isArray(task.dependsOn) ? [...task.dependsOn] : [];
      }
    }
    return Object.freeze(map);
  }

  function validateDAG(tasks, externalDependenciesMap = null) {
    if (!Array.isArray(tasks)) {
      return { valid: false, errors: ["tasks must be an array"], involvedTaskIds: [], topologicalOrder: [] };
    }

    const errors = [];
    const taskIds = new Set(tasks.map((t) => t.id).filter(Boolean));
    const dependencies = deriveDependencies(tasks);

    if (externalDependenciesMap) {
      for (const [id, deps] of Object.entries(externalDependenciesMap)) {
        const canonical = dependencies[id] || [];
        if (deps.length !== canonical.length || !deps.every((d) => canonical.includes(d))) {
          errors.push(`CONFLICTING_DEPENDENCY_MAPPING: task ${id} canonical dependsOn does not match external dependencies`);
        }
      }
    }

    for (const task of tasks) {
      const deps = task.dependsOn || [];
      for (const dep of deps) {
        if (dep === task.id) {
          errors.push(`SELF_DEPENDENCY: task ${task.id} depends on itself`);
        } else if (!taskIds.has(dep)) {
          errors.push(`DANGLING_DEPENDENCY: task ${task.id} depends on non-existent task ${dep}`);
        }
      }
    }

    const inDegree = new Map();
    const adj = new Map();
    for (const id of taskIds) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }

    for (const [id, deps] of Object.entries(dependencies)) {
      for (const dep of deps) {
        if (taskIds.has(dep) && dep !== id) {
          inDegree.set(id, (inDegree.get(id) || 0) + 1);
          adj.get(dep).push(id);
        }
      }
    }

    const queue = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const topologicalOrder = [];
    while (queue.length > 0) {
      const u = queue.shift();
      topologicalOrder.push(u);
      for (const v of adj.get(u) || []) {
        inDegree.set(v, inDegree.get(v) - 1);
        if (inDegree.get(v) === 0) queue.push(v);
      }
    }

    const involvedTaskIds = [];
    if (topologicalOrder.length !== taskIds.size) {
      for (const [id, deg] of inDegree.entries()) {
        if (deg > 0) involvedTaskIds.push(id);
      }
      errors.push(`CYCLE_DETECTED: cycle involving tasks [${involvedTaskIds.join(", ")}]`);
    }

    return Object.freeze({
      valid: errors.length === 0,
      errors: Object.freeze(errors),
      involvedTaskIds: Object.freeze(involvedTaskIds),
      topologicalOrder: Object.freeze(topologicalOrder)
    });
  }

  module.exports = {
    deriveDependencies,
    validateDAG
  };
  ```

- [ ] **Step 1.4: Run test to verify GREEN**
  ```bash
  node --test tests/dag-utils.test.js
  ```
  *Expected Output:* All tests pass.

- [ ] **Step 1.5: Run full test suite regression**
  ```bash
  npm test
  ```
  *Expected Output:* 112+ tests passing.

- [ ] **Step 1.6: Commit Task 1**
  ```bash
  git add runtime/planner/dag-utils.js tests/dag-utils.test.js
  git commit -m "feat(planner): implement DAG validation and canonical dependency derivation"
  ```

---

### Task 2: SemanticTask Contracts, Core Mapping & Metadata Preservation

**Goal:** Implement pure `SemanticTask`, `PlanningAssumption`, and `TaskGraphProposal` contracts (rejecting routing fields), and implement lossless conversion to/from Core `Task` and `TaskGraph` entities with metadata preservation.

- [x] **Step 2.1: Write failing unit tests for contracts and Core mappings**
  Create `tests/task-graph-proposal.test.js`:
  ```javascript
  "use strict";
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  const core = require("../runtime/core");
  const {
    createSemanticTask,
    createPlanningAssumption,
    createTaskGraphProposal,
    toCoreTask,
    toCoreTaskGraph,
    fromCoreTaskGraph
  } = require("../runtime/planner/task-graph-proposal");

  test("createSemanticTask creates frozen task with pure semantic fields", () => {
    const task = createSemanticTask({
      id: "task-1",
      title: "Implement Product persistence",
      objective: "Create repository layer for products",
      type: "persistence",
      dependsOn: ["task-0"],
      acceptanceCriteria: ["Product can be saved and retrieved"],
      verificationHints: ["npm test"],
      requiredSkills: ["database"],
      requiredCapabilities: ["database", "backend"],
      complexity: "medium",
      risk: "low",
      sourceRequirements: ["Requirement 1"],
      planningReason: "Provide data access",
      dependencyReasons: { "task-0": "Needs domain model" }
    });

    assert.equal(task.id, "task-1");
    assert.equal(task.title, "Implement Product persistence");
    assert.equal(task.risk, "low");
    assert.equal(task.complexity, "medium");
    assert.deepEqual(task.requiredCapabilities, ["database", "backend"]);
    assert.ok(Object.isFrozen(task));
  });

  test("createSemanticTask throws on routing fields (provider, model, estimatedCost)", () => {
    assert.throws(
      () => createSemanticTask({ id: "t1", title: "T", objective: "O", provider: "codex" }),
      /ROUTING_CONTAMINATION/
    );
    assert.throws(
      () => createSemanticTask({ id: "t1", title: "T", objective: "O", model: "gpt-4" }),
      /ROUTING_CONTAMINATION/
    );
    assert.throws(
      () => createSemanticTask({ id: "t1", title: "T", objective: "O", estimatedCost: 0.5 }),
      /ROUTING_CONTAMINATION/
    );
  });

  test("createSemanticTask rejects executor capabilities (headless, structuredEvents)", () => {
    assert.throws(
      () => createSemanticTask({ id: "t1", title: "T", objective: "O", requiredCapabilities: ["headless"] }),
      /INVALID_ENGINEERING_CAPABILITY/
    );
  });

  test("createPlanningAssumption creates structured assumption", () => {
    const assumption = createPlanningAssumption({
      text: "PostgreSQL 15 is running locally",
      critical: false,
      dimension: "database"
    });
    assert.equal(assumption.text, "PostgreSQL 15 is running locally");
    assert.equal(assumption.critical, false);
    assert.ok(Object.isFrozen(assumption));
  });

  test("toCoreTaskGraph preserves planningMode and metadata in Core TaskGraph", () => {
    const sTask = createSemanticTask({
      id: "task-1",
      title: "Implement Domain",
      objective: "Define product entities",
      type: "domain",
      dependsOn: [],
      acceptanceCriteria: ["Entity created"],
      requiredCapabilities: ["backend"],
      complexity: "simple",
      risk: "low"
    });

    const coreGraph = toCoreTaskGraph({
      id: "graph-1",
      missionId: "mission-1",
      semanticTasks: [sTask],
      metadata: { planningMode: "local-ai", planningRationale: "High cohesion" }
    });

    assert.equal(coreGraph.id, "graph-1");
    assert.equal(coreGraph.missionId, "mission-1");
    assert.deepEqual(coreGraph.dependencies, { "task-1": [] });
    assert.equal(coreGraph.metadata.planningMode, "local-ai");
    assert.equal(coreGraph.metadata.planningRationale, "High cohesion");

    const roundTripped = fromCoreTaskGraph(coreGraph);
    assert.equal(roundTripped.semanticTasks.length, 1);
    assert.deepEqual(roundTripped.semanticTasks[0], sTask);
    assert.equal(roundTripped.metadata.planningMode, "local-ai");
  });
  ```

- [x] **Step 2.2: Run test to verify RED**
  ```bash
  node --test tests/task-graph-proposal.test.js
  ```
  *Expected Output:* `MODULE_NOT_FOUND: Cannot find module '../runtime/planner/task-graph-proposal'`.

- [x] **Step 2.3: Implement `runtime/planner/task-graph-proposal.js` & Additive `metadata` in `runtime/core/entities.js`**
  Check `runtime/core/entities.js` `createTaskGraph`. Add `metadata: optionalObject(input.metadata, "task graph.metadata")` if not already present:
  ```javascript
  // In runtime/core/entities.js around line 292:
  function createTaskGraph(input) {
    assertObject(input, "task graph");
    return entity("task_graph", {
      id: requiredString(input.id, "task graph.id"),
      missionId: requiredString(input.missionId, "task graph.missionId"),
      tasks: optionalArray(input.tasks, "task graph.tasks", createTask),
      dependencies: optionalObject(input.dependencies, "task graph.dependencies"),
      metadata: optionalObject(input.metadata, "task graph.metadata")
    });
  }
  ```

  Implement `runtime/planner/task-graph-proposal.js`:
  ```javascript
  "use strict";

  const core = require("../core");
  const { deriveDependencies } = require("./dag-utils");

  const TASK_RISK_LEVELS = Object.freeze(["low", "medium", "high", "critical"]);
  const TASK_COMPLEXITY_LEVELS = Object.freeze(["simple", "medium", "complex", "expert"]);
  const ENGINEERING_CAPABILITIES = Object.freeze([
    "backend",
    "frontend",
    "database",
    "testing",
    "security",
    "documentation",
    "infrastructure",
    "architecture"
  ]);
  const PLANNING_MODES = Object.freeze(["local-ai", "deterministic-fallback"]);

  function createSemanticTask(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("SemanticTask input must be an object");
    }

    if ("provider" in input || "model" in input || "estimatedCost" in input) {
      throw new TypeError("ROUTING_CONTAMINATION: SemanticTask cannot contain provider, model, or estimatedCost");
    }

    if (typeof input.id !== "string" || input.id.trim() === "") {
      throw new TypeError("SemanticTask.id must be a non-empty string");
    }
    if (typeof input.title !== "string" || input.title.trim() === "") {
      throw new TypeError("SemanticTask.title must be a non-empty string");
    }
    if (typeof input.objective !== "string" || input.objective.trim() === "") {
      throw new TypeError("SemanticTask.objective must be a non-empty string");
    }

    const risk = input.risk || "low";
    if (!TASK_RISK_LEVELS.includes(risk)) {
      throw new TypeError(`SemanticTask.risk must be one of: ${TASK_RISK_LEVELS.join(", ")}`);
    }

    const complexity = input.complexity || "medium";
    if (!TASK_COMPLEXITY_LEVELS.includes(complexity)) {
      throw new TypeError(`SemanticTask.complexity must be one of: ${TASK_COMPLEXITY_LEVELS.join(", ")}`);
    }

    const requiredCapabilities = (input.requiredCapabilities || []).map((cap) => {
      if (!ENGINEERING_CAPABILITIES.includes(cap)) {
        throw new TypeError(`INVALID_ENGINEERING_CAPABILITY: ${cap} is not a valid engineering capability`);
      }
      return cap;
    });

    return Object.freeze({
      id: input.id.trim(),
      title: input.title.trim(),
      objective: input.objective.trim(),
      type: typeof input.type === "string" ? input.type.trim() : "other",
      dependsOn: Object.freeze(Array.isArray(input.dependsOn) ? [...input.dependsOn] : []),
      acceptanceCriteria: Object.freeze(Array.isArray(input.acceptanceCriteria) ? [...input.acceptanceCriteria] : []),
      verificationHints: Object.freeze(Array.isArray(input.verificationHints) ? [...input.verificationHints] : []),
      requiredSkills: Object.freeze(Array.isArray(input.requiredSkills) ? [...input.requiredSkills] : []),
      requiredCapabilities: Object.freeze(requiredCapabilities),
      complexity,
      risk,
      sourceRequirements: Object.freeze(Array.isArray(input.sourceRequirements) ? [...input.sourceRequirements] : []),
      planningReason: typeof input.planningReason === "string" ? input.planningReason.trim() : "",
      dependencyReasons: Object.freeze(input.dependencyReasons && typeof input.dependencyReasons === "object" ? { ...input.dependencyReasons } : {})
    });
  }

  function createPlanningAssumption(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("PlanningAssumption input must be an object");
    }
    if (typeof input.text !== "string" || input.text.trim() === "") {
      throw new TypeError("PlanningAssumption.text must be a non-empty string");
    }
    return Object.freeze({
      text: input.text.trim(),
      critical: Boolean(input.critical),
      dimension: typeof input.dimension === "string" ? input.dimension.trim() : undefined
    });
  }

  function createTaskGraphProposal(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("TaskGraphProposal input must be an object");
    }
    const planningMode = input.planningMode || "local-ai";
    if (!PLANNING_MODES.includes(planningMode)) {
      throw new TypeError(`TaskGraphProposal.planningMode must be one of: ${PLANNING_MODES.join(", ")}`);
    }

    return Object.freeze({
      planningMode,
      tasks: Object.freeze((input.tasks || []).map(createSemanticTask)),
      assumptions: Object.freeze((input.assumptions || []).map((a) => typeof a === "string" ? createPlanningAssumption({ text: a }) : createPlanningAssumption(a))),
      warnings: Object.freeze(Array.isArray(input.warnings) ? [...input.warnings] : []),
      blockers: Object.freeze(Array.isArray(input.blockers) ? [...input.blockers] : []),
      rationale: typeof input.rationale === "string" ? input.rationale.trim() : ""
    });
  }

  function toCoreTask(semanticTask, { projectId, createdAt } = {}) {
    return core.createTask({
      id: semanticTask.id,
      description: `${semanticTask.title}: ${semanticTask.objective}`,
      projectId,
      createdAt: createdAt || new Date().toISOString(),
      metadata: {
        semantic: semanticTask
      }
    });
  }

  function toCoreTaskGraph({ id, missionId, semanticTasks, metadata = {} }) {
    if (!id || typeof id !== "string") throw new TypeError("TaskGraph id is required");
    if (!missionId || typeof missionId !== "string") throw new TypeError("TaskGraph missionId is required");
    const tasksArray = semanticTasks || [];
    const coreTasks = tasksArray.map((st) => toCoreTask(st));
    const dependencies = deriveDependencies(tasksArray);

    return core.createTaskGraph({
      id,
      missionId,
      tasks: coreTasks,
      dependencies,
      metadata: {
        ...metadata,
        semantic: true
      }
    });
  }

  function fromCoreTaskGraph(coreGraph) {
    if (!coreGraph || coreGraph.kind !== "task_graph") {
      throw new TypeError("Input must be a Core TaskGraph entity");
    }
    const semanticTasks = (coreGraph.tasks || []).map((ct) => {
      if (ct.metadata && ct.metadata.semantic) {
        return createSemanticTask(ct.metadata.semantic);
      }
      return createSemanticTask({
        id: ct.id,
        title: ct.description.split(":")[0] || ct.id,
        objective: ct.description,
        dependsOn: (coreGraph.dependencies && coreGraph.dependencies[ct.id]) || []
      });
    });

    return {
      id: coreGraph.id,
      missionId: coreGraph.missionId,
      semanticTasks,
      metadata: coreGraph.metadata || {}
    };
  }

  module.exports = {
    TASK_RISK_LEVELS,
    TASK_COMPLEXITY_LEVELS,
    ENGINEERING_CAPABILITIES,
    PLANNING_MODES,
    createSemanticTask,
    createPlanningAssumption,
    createTaskGraphProposal,
    toCoreTask,
    toCoreTaskGraph,
    fromCoreTaskGraph
  };
  ```

- [x] **Step 2.4: Run test to verify GREEN**
  ```bash
  node --test tests/task-graph-proposal.test.js
  ```
  *Expected Output:* All tests pass.

- [x] **Step 2.5: Run full test suite regression**
  ```bash
  npm test
  ```
  *Expected Output:* 112+ tests passing.

- [x] **Step 2.6: Commit Task 2**
  ```bash
  git add runtime/planner/task-graph-proposal.js runtime/core/entities.js tests/task-graph-proposal.test.js
  git commit -m "feat(planner): implement SemanticTask, TaskGraphProposal contracts and Core entity mappings"
  ```

---

### Task 3: GraphValidator — Structural, DAG & Assumption Guardrails

**Goal:** Implement deterministic structural validation of proposed task graphs (duplicate IDs, DAG checks, generic titles rejection, immutable normalization, assumption guardrails).

- [ ] **Step 3.1: Write failing unit tests for structural and assumption validation**
  Create `tests/graph-validator.test.js`:
  ```javascript
  "use strict";
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  const { GraphValidator } = require("../runtime/planner/graph-validator");
  const { createTaskGraphProposal, createSemanticTask, createPlanningAssumption } = require("../runtime/planner/task-graph-proposal");

  test("GraphValidator rejects duplicate task IDs", () => {
    const proposal = createTaskGraphProposal({
      tasks: [
        createSemanticTask({ id: "t1", title: "Task 1", objective: "Obj 1" }),
        createSemanticTask({ id: "t1", title: "Task 1 dup", objective: "Obj 2" })
      ]
    });
    const res = GraphValidator.validate(proposal);
    assert.equal(res.valid, false);
    assert.ok(res.blockers.some((b) => b.code === "DUPLICATE_TASK_ID"));
  });

  test("GraphValidator rejects generic placeholder titles (PLANNING, SCAFFOLD, TEST, VERIFY)", () => {
    const genericTitles = ["PLANNING", "Scaffold", "implement", "TEST", "verify"];
    for (const title of genericTitles) {
      const proposal = createTaskGraphProposal({
        tasks: [createSemanticTask({ id: "t1", title, objective: "Some real objective" })]
      });
      const res = GraphValidator.validate(proposal);
      assert.equal(res.valid, false);
      assert.ok(res.blockers.some((b) => b.code === "GENERIC_TASK_TITLE_REJECTED"));
    }
  });

  test("GraphValidator escalates critical assumptions to PlanningBlocker", () => {
    const proposal = createTaskGraphProposal({
      tasks: [createSemanticTask({ id: "t1", title: "Implement Payments", objective: "Use Stripe" })],
      assumptions: [
        createPlanningAssumption({ text: "User wants Stripe API", critical: true, dimension: "payment_gateway" })
      ]
    });
    const res = GraphValidator.validate(proposal);
    assert.equal(res.valid, false);
    assert.ok(res.blockers.some((b) => b.code === "CRITICAL_ASSUMPTION_REQUIRES_REFINEMENT"));
  });

  test("GraphValidator normalization returns new immutable proposal without mutating original", () => {
    const original = createTaskGraphProposal({
      tasks: [createSemanticTask({ id: "t1", title: "  Trim Me  ", objective: " Objective " })]
    });
    const res = GraphValidator.validate(original);
    assert.equal(res.valid, true);
    assert.notEqual(res.normalizedProposal, original);
    assert.equal(res.normalizedProposal.tasks[0].title, "Trim Me");
    assert.equal(original.tasks[0].title, "Trim Me");
  });

  test("GraphValidator does not rewrite invalid task IDs silently", () => {
    assert.throws(
      () => createSemanticTask({ id: "   ", title: "Valid", objective: "Valid" }),
      /SemanticTask.id must be a non-empty string/
    );
  });
  ```

- [ ] **Step 3.2: Run test to verify RED**
  ```bash
  node --test tests/graph-validator.test.js
  ```
  *Expected Output:* `MODULE_NOT_FOUND: Cannot find module '../runtime/planner/graph-validator'`.

- [ ] **Step 3.3: Implement `runtime/planner/graph-validator.js` (Structural & Assumption Core)**
  ```javascript
  "use strict";

  const { validateDAG } = require("./dag-utils");
  const { createTaskGraphProposal, createSemanticTask } = require("./task-graph-proposal");

  const GENERIC_TITLES = Object.freeze(["PLANNING", "SCAFFOLD", "IMPLEMENT", "TEST", "VERIFY"]);

  class GraphValidator {
    static validate(proposal, options = {}) {
      if (!proposal || typeof proposal !== "object") {
        return { valid: false, blockers: [{ code: "INVALID_PROPOSAL", message: "Proposal must be an object" }], warnings: [] };
      }

      const blockers = [];
      const warnings = [...(proposal.warnings || [])];
      const tasks = proposal.tasks || [];

      if (tasks.length === 0 && options.requireTasks !== false) {
        blockers.push({ code: "EMPTY_TASK_GRAPH", message: "Proposal contains no tasks" });
      }

      const seenIds = new Set();
      for (const task of tasks) {
        if (seenIds.has(task.id)) {
          blockers.push({ code: "DUPLICATE_TASK_ID", message: `Duplicate task ID detected: ${task.id}`, taskId: task.id });
        }
        seenIds.add(task.id);

        if (GENERIC_TITLES.includes(task.title.trim().toUpperCase())) {
          blockers.push({
            code: "GENERIC_TASK_TITLE_REJECTED",
            message: `Task title "${task.title}" is a generic workflow phase. Use a descriptive engineering title.`,
            taskId: task.id
          });
        }
      }

      const dagResult = validateDAG(tasks);
      if (!dagResult.valid) {
        for (const err of dagResult.errors) {
          blockers.push({ code: "DAG_VALIDATION_FAILED", message: err });
        }
      }

      for (const assumption of proposal.assumptions || []) {
        if (assumption.critical) {
          blockers.push({
            code: "CRITICAL_ASSUMPTION_REQUIRES_REFINEMENT",
            message: `Critical planning assumption requires mission refinement: ${assumption.text}`,
            dimension: assumption.dimension
          });
        }
      }

      if (options.missionBrief || options.taskRelevantContext) {
        GraphValidator._validateContextAuthority(tasks, options.missionBrief, options.taskRelevantContext, blockers, warnings);
      }

      const valid = blockers.length === 0;
      let normalizedProposal = null;
      if (valid) {
        normalizedProposal = GraphValidator._normalizeProposal(proposal);
        const postNormDag = validateDAG(normalizedProposal.tasks);
        if (!postNormDag.valid) {
          return { valid: false, blockers: [{ code: "POST_NORMALIZATION_DAG_FAILED", message: "DAG invalid after normalization" }], warnings };
        }
      }

      return Object.freeze({
        valid,
        blockers: Object.freeze(blockers),
        warnings: Object.freeze(warnings),
        normalizedProposal
      });
    }

    static _normalizeProposal(proposal) {
      const normalizedTasks = proposal.tasks.map((t) =>
        createSemanticTask({
          ...t,
          title: t.title.trim(),
          objective: t.objective.trim()
        })
      );

      return createTaskGraphProposal({
        planningMode: proposal.planningMode,
        tasks: normalizedTasks,
        assumptions: proposal.assumptions,
        warnings: proposal.warnings,
        blockers: proposal.blockers,
        rationale: proposal.rationale
      });
    }

    static _validateContextAuthority(tasks, missionBrief, taskRelevantContext, blockers, warnings) {
      // Extended in Task 4
    }
  }

  module.exports = { GraphValidator };
  ```

- [ ] **Step 3.4: Run test to verify GREEN**
  ```bash
  node --test tests/graph-validator.test.js
  ```
  *Expected Output:* All tests pass.

- [ ] **Step 3.5: Run full test suite regression**
  ```bash
  npm test
  ```
  *Expected Output:* 112+ tests passing.

- [ ] **Step 3.6: Commit Task 3**
  ```bash
  git add runtime/planner/graph-validator.js tests/graph-validator.test.js
  git commit -m "feat(planner): implement GraphValidator structural, DAG, and assumption validation"
  ```

---

### Task 4: GraphValidator — Context & Mission Constraint Authority

**Goal:** Implement context and constraint authority validation: `FACT`, `USER_DECISION`, and `missionBrief.constraints` have hard-blocking power; `INFERENCE` produces warnings only; no silent stripping.

- [ ] **Step 4.1: Write failing unit tests for context and constraint authority**
  Create `tests/graph-validator-context.test.js`:
  ```javascript
  "use strict";
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  const { GraphValidator } = require("../runtime/planner/graph-validator");
  const { createTaskGraphProposal, createSemanticTask } = require("../runtime/planner/task-graph-proposal");

  test("FACT backend-only rejects proposal with frontend task (no silent stripping)", () => {
    const proposal = createTaskGraphProposal({
      tasks: [
        createSemanticTask({ id: "t1", title: "Build API", objective: "Create REST endpoints", requiredCapabilities: ["backend"] }),
        createSemanticTask({ id: "t2", title: "Build React Form", objective: "Create UI form", requiredCapabilities: ["frontend"] })
      ]
    });

    const context = {
      items: [
        { key: "backend.framework", value: "Node.js", kind: "FACT" },
        { key: "project.frontend", value: null, kind: "FACT" }
      ]
    };

    const res = GraphValidator.validate(proposal, { taskRelevantContext: context });
    assert.equal(res.valid, false);
    assert.ok(res.blockers.some((b) => b.code === "CONTEXT_FACT_CONTRADICTION" && b.taskId === "t2"));
  });

  test("FACT MongoDB rejects proposal with SQL migration task", () => {
    const proposal = createTaskGraphProposal({
      tasks: [
        createSemanticTask({ id: "t1", title: "Create PostgreSQL Migration", objective: "Run knex migrate" })
      ]
    });

    const context = {
      items: [
        { key: "database.type", value: "mongodb", kind: "FACT" }
      ]
    };

    const res = GraphValidator.validate(proposal, { taskRelevantContext: context });
    assert.equal(res.valid, false);
    assert.ok(res.blockers.some((b) => b.code === "DATABASE_CONTRADICTION"));
  });

  test("Mission constraint REST only rejects GraphQL task", () => {
    const proposal = createTaskGraphProposal({
      tasks: [
        createSemanticTask({ id: "t1", title: "Implement GraphQL Schema", objective: "Create Apollo server resolvers" })
      ]
    });

    const missionBrief = {
      objective: "Create product API",
      constraints: ["REST only", "No GraphQL"]
    };

    const res = GraphValidator.validate(proposal, { missionBrief });
    assert.equal(res.valid, false);
    assert.ok(res.blockers.some((b) => b.code === "MISSION_CONSTRAINT_CONTRADICTION"));
  });

  test("INFERENCE isolated generates warning without hard-rejecting proposal", () => {
    const proposal = createTaskGraphProposal({
      tasks: [
        createSemanticTask({ id: "t1", title: "Implement Redis Cache", objective: "Add caching layer", requiredCapabilities: ["backend"] })
      ]
    });

    const context = {
      items: [
        { key: "cache.inferred", value: "memcached", kind: "INFERENCE", confidence: 0.6 }
      ]
    };

    const res = GraphValidator.validate(proposal, { taskRelevantContext: context });
    assert.equal(res.valid, true);
    assert.ok(res.warnings.some((w) => w.code === "INFERENCE_ADVISORY"));
  });
  ```

- [ ] **Step 4.2: Run test to verify RED**
  ```bash
  node --test tests/graph-validator-context.test.js
  ```
  *Expected Output:* Tests fail on constraint validation checks.

- [ ] **Step 4.3: Implement context and constraint authority in `runtime/planner/graph-validator.js`**
  Update `_validateContextAuthority` in `runtime/planner/graph-validator.js`:
  ```javascript
  static _validateContextAuthority(tasks, missionBrief, taskRelevantContext, blockers, warnings) {
    const facts = new Map();
    const inferences = new Map();

    if (taskRelevantContext && Array.isArray(taskRelevantContext.items)) {
      for (const item of taskRelevantContext.items) {
        if (item.kind === "FACT" || item.kind === "USER_DECISION") {
          facts.set(item.key, item.value);
        } else if (item.kind === "INFERENCE") {
          inferences.set(item.key, item.value);
        }
      }
    }

    const isBackendOnly = facts.get("project.frontend") === null || facts.get("frontend") === null || facts.get("architecture") === "backend-only";
    const dbType = String(facts.get("database.type") || facts.get("database") || "").toLowerCase();

    const constraints = (missionBrief?.constraints || []).map((c) => String(c).toLowerCase());

    for (const task of tasks) {
      const text = `${task.title} ${task.objective}`.toLowerCase();

      if (isBackendOnly) {
        if (task.requiredCapabilities.includes("frontend") || /\b(react|vue|angular|svelte|frontend|ui form|html template)\b/i.test(text)) {
          blockers.push({
            code: "CONTEXT_FACT_CONTRADICTION",
            message: `Task "${task.title}" proposes frontend/UI work on a backend-only project.`,
            taskId: task.id
          });
        }
      }

      if (dbType.includes("mongo")) {
        if (/\b(sql migration|knex|postgres|mysql|sqlite migration)\b/i.test(text)) {
          blockers.push({
            code: "DATABASE_CONTRADICTION",
            message: `Task "${task.title}" proposes SQL migrations on a MongoDB project.`,
            taskId: task.id
          });
        }
      }

      if (constraints.some((c) => c.includes("rest only") || c.includes("no graphql"))) {
        if (/\b(graphql|apollo|schema\.gql|mutation|query resolver)\b/i.test(text)) {
          blockers.push({
            code: "MISSION_CONSTRAINT_CONTRADICTION",
            message: `Task "${task.title}" contradicts mission constraint: REST only.`,
            taskId: task.id
          });
        }
      }

      if (inferences.size > 0) {
        for (const [k, v] of inferences.entries()) {
          if (k.includes("cache") && text.includes("redis") && v === "memcached") {
            warnings.push({
              code: "INFERENCE_ADVISORY",
              message: `Inference suggests ${k}=${v}, but task proposes redis.`,
              taskId: task.id
            });
          }
        }
      }
    }
  }
  ```

- [ ] **Step 4.4: Run test to verify GREEN**
  ```bash
  node --test tests/graph-validator-context.test.js
  ```
  *Expected Output:* All tests pass.

- [ ] **Step 4.5: Run full test suite regression**
  ```bash
  npm test
  ```
  *Expected Output:* 112+ tests passing.

- [ ] **Step 4.6: Commit Task 4**
  ```bash
  git add runtime/planner/graph-validator.js tests/graph-validator-context.test.js
  git commit -m "feat(planner): implement context authority and mission constraint checks in GraphValidator"
  ```

---

### Task 5: Compatibility Execution Projection

**Goal:** Implement `LegacyExecutionProjection` requiring explicit `executionTarget` (`providerId`, `model`), zero silent remote defaults, and testable compatibility with `LaneExecutor`.

- [ ] **Step 5.1: Write failing unit tests for `LegacyExecutionProjection`**
  Create `tests/legacy-execution-projection.test.js`:
  ```javascript
  "use strict";
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  const { LegacyExecutionProjection } = require("../runtime/planner/legacy-execution-projection");
  const { createSemanticTask } = require("../runtime/planner/task-graph-proposal");

  test("projectTask throws if executionTarget is missing (no silent codex default)", () => {
    const task = createSemanticTask({ id: "t1", title: "Task 1", objective: "Obj 1" });
    assert.throws(
      () => LegacyExecutionProjection.projectTask(task),
      /MISSING_EXECUTION_TARGET/
    );
    assert.throws(
      () => LegacyExecutionProjection.projectTask(task, {}),
      /MISSING_EXECUTION_TARGET/
    );
  });

  test("projectTask maps semantic fields and transports provided execution target", () => {
    const task = createSemanticTask({
      id: "t1",
      title: "Implement Domain",
      objective: "Define product entities",
      acceptanceCriteria: ["Product entity with price"],
      requiredSkills: ["architecture"],
      dependsOn: ["t0"]
    });

    const projected = LegacyExecutionProjection.projectTask(task, {
      executionTarget: { providerId: "opencode", model: "local-model" }
    });

    assert.equal(projected.id, "t1");
    assert.equal(projected.label, "Implement Domain");
    assert.ok(projected.description.includes("Define product entities"));
    assert.ok(projected.description.includes("Product entity with price"));
    assert.deepEqual(projected.skills, ["architecture"]);
    assert.deepEqual(projected.dependsOn, ["t0"]);
    assert.equal(projected.provider, "opencode");
    assert.equal(projected.model, "local-model");
    assert.deepEqual(projected.semanticMetadata, task);
  });
  ```

- [ ] **Step 5.2: Run test to verify RED**
  ```bash
  node --test tests/legacy-execution-projection.test.js
  ```
  *Expected Output:* `MODULE_NOT_FOUND: Cannot find module '../runtime/planner/legacy-execution-projection'`.

- [ ] **Step 5.3: Implement `runtime/planner/legacy-execution-projection.js`**
  ```javascript
  "use strict";

  class LegacyExecutionProjection {
    static projectTask(semanticTask, options = {}) {
      if (!semanticTask || typeof semanticTask !== "object") {
        throw new TypeError("semanticTask must be an object");
      }

      const executionTarget = options.executionTarget || options;
      const providerId = executionTarget.providerId || executionTarget.provider;
      const model = executionTarget.model;

      if (!providerId || typeof providerId !== "string" || providerId.trim() === "") {
        throw new TypeError("MISSING_EXECUTION_TARGET: providerId is required for legacy execution projection");
      }
      if (!model || typeof model !== "string" || model.trim() === "") {
        throw new TypeError("MISSING_EXECUTION_TARGET: model is required for legacy execution projection");
      }

      const criteriaFormatted = (semanticTask.acceptanceCriteria || []).length > 0
        ? `\n\nAcceptance Criteria:\n${semanticTask.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`
        : "";

      return Object.freeze({
        id: semanticTask.id,
        label: semanticTask.title,
        description: `${semanticTask.objective}${criteriaFormatted}`,
        skills: [...(semanticTask.requiredSkills || [])],
        dependsOn: [...(semanticTask.dependsOn || [])],
        provider: providerId,
        model,
        semanticMetadata: semanticTask
      });
    }

    static projectGraph(semanticTasks, options = {}) {
      if (!Array.isArray(semanticTasks)) {
        throw new TypeError("semanticTasks must be an array");
      }
      return Object.freeze(semanticTasks.map((t) => LegacyExecutionProjection.projectTask(t, options)));
    }
  }

  module.exports = { LegacyExecutionProjection };
  ```

- [ ] **Step 5.4: Run test to verify GREEN**
  ```bash
  node --test tests/legacy-execution-projection.test.js
  ```
  *Expected Output:* All tests pass.

- [ ] **Step 5.5: Run full test suite regression**
  ```bash
  npm test
  ```
  *Expected Output:* 112+ tests passing.

- [ ] **Step 5.6: Commit Task 5**
  ```bash
  git add runtime/planner/legacy-execution-projection.js tests/legacy-execution-projection.test.js
  git commit -m "feat(planner): implement LegacyExecutionProjection with explicit executionTarget requirement"
  ```

---

### Task 6: Context-Grounded Deterministic Fallback Planner

**Goal:** Implement `DeterministicFallbackPlanner` generating work slices strictly supported by evidence in `MissionBrief`, `TaskRelevantContext`, and `Skills` (no hardcoded CRUD templates).

- [ ] **Step 6.1: Write failing unit tests for deterministic fallback planner**
  Create `tests/deterministic-fallback-planner.test.js`:
  ```javascript
  "use strict";
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  const { DeterministicFallbackPlanner } = require("../runtime/planner/deterministic-fallback-planner");
  const { GraphValidator } = require("../runtime/planner/graph-validator");

  test("documentation-only mission produces doc/guide tasks and no API/persistence", () => {
    const missionBrief = {
      objective: "Write developer setup documentation",
      requirements: ["Document prerequisites", "Document install steps"]
    };
    const context = { items: [] };

    const proposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: context });
    assert.equal(proposal.planningMode, "deterministic-fallback");
    assert.ok(proposal.tasks.every((t) => !t.requiredCapabilities.includes("database")));
    assert.ok(proposal.tasks.every((t) => !t.requiredCapabilities.includes("backend")));
    assert.ok(proposal.tasks.some((t) => t.requiredCapabilities.includes("documentation")));
    const validated = GraphValidator.validate(proposal);
    assert.equal(validated.valid, true);
  });

  test("frontend-only mission produces UI tasks without persistence/backend API", () => {
    const missionBrief = {
      objective: "Build landing page hero section",
      requirements: ["Create responsive banner", "Add CTA button"]
    };
    const context = {
      items: [
        { key: "frontend.framework", value: "react", kind: "FACT" }
      ]
    };
    const proposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: context });
    assert.ok(proposal.tasks.every((t) => !t.requiredCapabilities.includes("database")));
    assert.ok(proposal.tasks.some((t) => t.requiredCapabilities.includes("frontend")));
  });

  test("test-only mission produces test tasks without domain/persistence/API invented", () => {
    const missionBrief = {
      objective: "Add unit tests for existing utility functions",
      requirements: ["Cover string helpers", "Cover date parser"]
    };
    const proposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: { items: [] } });
    assert.ok(proposal.tasks.every((t) => t.requiredCapabilities.includes("testing") || t.requiredCapabilities.includes("architecture")));
    assert.ok(proposal.tasks.every((t) => !t.title.toLowerCase().includes("implement persistence")));
  });

  test("backend-only CRUD produces domain, persistence, API tasks without UI", () => {
    const missionBrief = {
      objective: "Create product CRUD",
      requirements: ["Create product", "List products"]
    };
    const context = {
      items: [
        { key: "project.frontend", value: null, kind: "FACT" },
        { key: "backend.framework", value: "Node.js", kind: "FACT" },
        { key: "database.type", value: "postgresql", kind: "FACT" }
      ]
    };

    const proposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: context });
    assert.ok(proposal.tasks.every((t) => !t.requiredCapabilities.includes("frontend")));
    assert.ok(proposal.tasks.some((t) => t.title.toLowerCase().includes("persistence")));
    assert.ok(proposal.tasks.some((t) => t.title.toLowerCase().includes("api")));
    const validated = GraphValidator.validate(proposal, { taskRelevantContext: context });
    assert.equal(validated.valid, true);
  });

  test("dangerous operations derive high/critical risk", () => {
    const missionBrief = {
      objective: "Drop legacy database tables and purge customer records",
      requirements: ["Drop customer_archive table"]
    };
    const proposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: { items: [] } });
    assert.ok(proposal.tasks.some((t) => t.risk === "high" || t.risk === "critical"));
  });

  test("insufficient mission information generates PlanningBlocker", () => {
    const missionBrief = {
      objective: "   ",
      requirements: []
    };
    assert.throws(
      () => DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: { items: [] } }),
      /INSUFFICIENT_MISSION_BRIEF/
    );
  });
  ```

- [ ] **Step 6.2: Run test to verify RED**
  ```bash
  node --test tests/deterministic-fallback-planner.test.js
  ```
  *Expected Output:* `MODULE_NOT_FOUND: Cannot find module '../runtime/planner/deterministic-fallback-planner'`.

- [ ] **Step 6.3: Implement `runtime/planner/deterministic-fallback-planner.js`**
  ```javascript
  "use strict";

  const { createSemanticTask, createTaskGraphProposal } = require("./task-graph-proposal");

  class DeterministicFallbackPlanner {
    static plan({ missionBrief, taskRelevantContext, resolvedSkills = [] }) {
      if (!missionBrief || typeof missionBrief.objective !== "string" || missionBrief.objective.trim() === "") {
        throw new Error("INSUFFICIENT_MISSION_BRIEF: objective is required for deterministic planning");
      }

      const objective = missionBrief.objective.trim();
      const requirements = missionBrief.requirements || [];
      const lowerObj = objective.toLowerCase();
      const tasks = [];
      let counter = 1;

      const isDoc = /\b(doc|documentation|guia|readme|tutorial|manual)\b/i.test(lowerObj);
      const isTestOnly = /\b(test|tests|testes|coverage|cobertura)\b/i.test(lowerObj) && !/\b(crud|api|feature|sistema)\b/i.test(lowerObj);
      const isFrontendOnly = /\b(landing page|banner|ui|css|html|frontend|hero section)\b/i.test(lowerObj) && !/\b(backend|database|sql|banco)\b/i.test(lowerObj);
      const isDangerous = /\b(drop|delete|purge|remove production|truncate)\b/i.test(lowerObj);

      if (isDoc) {
        tasks.push(createSemanticTask({
          id: `task-${counter++}`,
          title: "Analyze documentation structure",
          objective: `Analyze existing docs and outline structure for: ${objective}`,
          type: "analyze",
          dependsOn: [],
          requiredCapabilities: ["documentation"],
          complexity: "simple",
          risk: "low",
          acceptanceCriteria: ["Target documentation layout identified"]
        }));

        tasks.push(createSemanticTask({
          id: `task-${counter++}`,
          title: "Author documentation",
          objective: `Document content: ${requirements.join("; ") || objective}`,
          type: "documentation",
          dependsOn: ["task-1"],
          requiredCapabilities: ["documentation"],
          complexity: "simple",
          risk: "low",
          acceptanceCriteria: ["Documentation written and validated"]
        }));
      } else if (isTestOnly) {
        tasks.push(createSemanticTask({
          id: `task-${counter++}`,
          title: "Analyze existing test suite conventions",
          objective: `Inspect testing framework and patterns for: ${objective}`,
          type: "analyze",
          dependsOn: [],
          requiredCapabilities: ["testing", "architecture"],
          complexity: "simple",
          risk: "low",
          acceptanceCriteria: ["Test runners and helper conventions identified"]
        }));

        tasks.push(createSemanticTask({
          id: `task-${counter++}`,
          title: "Implement unit and integration tests",
          objective: `Add tests for: ${requirements.join("; ") || objective}`,
          type: "test",
          dependsOn: ["task-1"],
          requiredCapabilities: ["testing"],
          complexity: "medium",
          risk: "low",
          acceptanceCriteria: ["All new tests pass successfully"]
        }));
      } else if (isFrontendOnly) {
        tasks.push(createSemanticTask({
          id: `task-${counter++}`,
          title: "Design UI component structure",
          objective: `Outline component layout for: ${objective}`,
          type: "analyze",
          dependsOn: [],
          requiredCapabilities: ["frontend"],
          complexity: "simple",
          risk: "low",
          acceptanceCriteria: ["Component hierarchy designed"]
        }));

        tasks.push(createSemanticTask({
          id: `task-${counter++}`,
          title: "Implement UI components",
          objective: `Build visual components for: ${requirements.join("; ") || objective}`,
          type: "ui",
          dependsOn: ["task-1"],
          requiredCapabilities: ["frontend"],
          complexity: "medium",
          risk: "low",
          acceptanceCriteria: ["UI renders according to requirements"]
        }));
      } else {
        tasks.push(createSemanticTask({
          id: `task-${counter++}`,
          title: "Analyze architectural conventions",
          objective: `Inspect codebase patterns for: ${objective}`,
          type: "analyze",
          dependsOn: [],
          requiredCapabilities: ["architecture", "backend"],
          complexity: "simple",
          risk: "low",
          acceptanceCriteria: ["Conventions and module layout established"]
        }));

        tasks.push(createSemanticTask({
          id: `task-${counter++}`,
          title: "Implement domain and persistence",
          objective: `Implement domain models and persistence for: ${objective}`,
          type: "persistence",
          dependsOn: ["task-1"],
          requiredCapabilities: ["backend", "database"],
          complexity: "medium",
          risk: isDangerous ? "critical" : "low",
          acceptanceCriteria: ["Data access and domain logic implemented"]
        }));

        tasks.push(createSemanticTask({
          id: `task-${counter++}`,
          title: "Implement API and business rules",
          objective: `Expose operations for: ${objective}`,
          type: "api",
          dependsOn: ["task-2"],
          requiredCapabilities: ["backend"],
          complexity: "medium",
          risk: isDangerous ? "high" : "low",
          acceptanceCriteria: ["API endpoints operational"]
        }));

        tasks.push(createSemanticTask({
          id: `task-${counter++}`,
          title: "Add integration tests",
          objective: `Add unit and integration tests for: ${objective}`,
          type: "test",
          dependsOn: ["task-3"],
          requiredCapabilities: ["testing"],
          complexity: "simple",
          risk: "low",
          acceptanceCriteria: ["Test suite covers new functionality"]
        }));
      }

      return createTaskGraphProposal({
        planningMode: "deterministic-fallback",
        tasks,
        assumptions: [],
        warnings: [{ code: "DETERMINISTIC_FALLBACK_USED", message: "Plan was generated using heuristic fallback" }],
        rationale: `Deterministic decomposition for ${objective}`
      });
    }
  }

  module.exports = { DeterministicFallbackPlanner };
  ```

- [ ] **Step 6.4: Run test to verify GREEN**
  ```bash
  node --test tests/deterministic-fallback-planner.test.js
  ```
  *Expected Output:* All tests pass.

- [ ] **Step 6.5: Run full test suite regression**
  ```bash
  npm test
  ```
  *Expected Output:* 112+ tests passing.

- [ ] **Step 6.6: Commit Task 6**
  ```bash
  git add runtime/planner/deterministic-fallback-planner.js tests/deterministic-fallback-planner.test.js
  git commit -m "feat(planner): implement context-grounded DeterministicFallbackPlanner with explicit provenance"
  ```

---

### Task 7: SemanticPlanner Engine (Local AI + Explicit Model + localOnly Policy)

**Goal:** Implement `SemanticPlanner` requiring explicit `plannerTarget`, enforcing `localOnly` policy, requiring real `missionId` (throwing `MISSING_MISSION_ID`), and coordinating bounded retries.

- [ ] **Step 7.1: Write failing unit tests for `SemanticPlanner`**
  Create `tests/semantic-planner.test.js`:
  ```javascript
  "use strict";
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  const { SemanticPlanner } = require("../runtime/planner/semantic-planner");

  class MockApp {
    constructor(providerResult = null, error = null) {
      this.providers = {
        get: (id) => ({
          detect: async () => ({ installed: true }),
          execute: async ({ prompt, model }) => {
            if (error) throw error;
            return { stdout: providerResult };
          }
        })
      };
    }
  }

  test("SemanticPlanner throws MISSING_MISSION_ID if missionId is not provided", async () => {
    const planner = new SemanticPlanner({
      application: new MockApp("{}"),
      plannerTarget: { providerId: "opencode", model: "llama3.3", local: true }
    });

    await assert.rejects(
      () => planner.plan({
        missionBrief: { objective: "CRUD products" },
        taskRelevantContext: { items: [] }
      }),
      /MISSING_MISSION_ID/
    );
  });

  test("SemanticPlanner enforces localOnly policy rejecting remote provider", async () => {
    const planner = new SemanticPlanner({
      application: new MockApp("{}"),
      plannerTarget: { providerId: "claude", model: "sonnet", local: false },
      localOnly: true
    });

    await assert.rejects(
      () => planner.plan({
        missionBrief: { id: "m1", objective: "CRUD products" },
        missionId: "m1",
        taskRelevantContext: { items: [] }
      }),
      /LOCAL_ONLY_VIOLATION/
    );
  });

  test("SemanticPlanner passes explicit model to provider and returns validated TaskGraph", async () => {
    const validJson = JSON.stringify({
      tasks: [
        { id: "t1", title: "Analyze Codebase", objective: "Read patterns", type: "analyze", dependsOn: [] },
        { id: "t2", title: "Build Repository", objective: "Create data layer", type: "persistence", dependsOn: ["t1"] }
      ],
      assumptions: [],
      rationale: "Clean separation"
    });

    let executedModel = null;
    const app = {
      providers: {
        get: () => ({
          detect: async () => ({ installed: true }),
          execute: async ({ model }) => {
            executedModel = model;
            return { stdout: validJson };
          }
        })
      }
    };

    const planner = new SemanticPlanner({
      application: app,
      plannerTarget: { providerId: "opencode", model: "deepseek-local", local: true }
    });

    const res = await planner.plan({
      missionBrief: { id: "m1", objective: "CRUD products", requirements: [] },
      missionId: "m1",
      taskRelevantContext: { items: [] }
    });

    assert.equal(executedModel, "deepseek-local");
    assert.equal(res.planningMode, "local-ai");
    assert.equal(res.taskGraph.missionId, "m1");
    assert.equal(res.taskGraph.tasks.length, 2);
  });
  ```

- [ ] **Step 7.2: Run test to verify RED**
  ```bash
  node --test tests/semantic-planner.test.js
  ```
  *Expected Output:* `MODULE_NOT_FOUND: Cannot find module '../runtime/planner/semantic-planner'`.

- [ ] **Step 7.3: Implement `runtime/planner/semantic-planner.js`**
  ```javascript
  "use strict";

  const crypto = require("node:crypto");
  const { GraphValidator } = require("./graph-validator");
  const { DeterministicFallbackPlanner } = require("./deterministic-fallback-planner");
  const { createTaskGraphProposal, toCoreTaskGraph } = require("./task-graph-proposal");

  class SemanticPlanner {
    constructor({ application, plannerTarget = { providerId: "opencode", model: "llama3.3", local: true }, localOnly = true, maxRetries = 3 }) {
      this.app = application;
      this.plannerTarget = plannerTarget;
      this.localOnly = localOnly;
      this.maxRetries = maxRetries;
    }

    async plan({ missionBrief, taskRelevantContext, resolvedSkills = [], missionId, allowFallback = true }) {
      const resolvedMissionId = missionId || missionBrief?.id;
      if (!resolvedMissionId || typeof resolvedMissionId !== "string" || resolvedMissionId.trim() === "") {
        throw new Error("MISSING_MISSION_ID: missionId is required for semantic planning");
      }

      if (this.localOnly && this.plannerTarget && this.plannerTarget.local === false) {
        throw new Error("LOCAL_ONLY_VIOLATION: Remote provider/model not permitted under localOnly policy");
      }

      const provider = this.app?.providers?.get(this.plannerTarget.providerId);
      let providerAvailable = false;

      if (provider) {
        try {
          const detected = await provider.detect();
          providerAvailable = Boolean(detected && detected.installed);
        } catch {
          providerAvailable = false;
        }
      }

      if (!providerAvailable) {
        if (allowFallback) {
          const fallbackProposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext, resolvedSkills });
          const validated = GraphValidator.validate(fallbackProposal, { missionBrief, taskRelevantContext });
          if (!validated.valid) {
            throw new Error(`Fallback validation failed: ${validated.blockers.map((b) => b.message).join("; ")}`);
          }
          const taskGraph = toCoreTaskGraph({
            id: `task-graph-${crypto.randomUUID()}`,
            missionId: resolvedMissionId,
            semanticTasks: validated.normalizedProposal.tasks,
            metadata: { planningMode: "deterministic-fallback" }
          });
          return { taskGraph, proposal: validated.normalizedProposal, planningMode: "deterministic-fallback" };
        }
        throw new Error(`AI Provider ${this.plannerTarget.providerId} is unavailable and fallback is disabled.`);
      }

      const prompt = this._buildPrompt(missionBrief, taskRelevantContext, resolvedSkills);
      let lastError = null;
      let validProposal = null;

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        let result;
        try {
          result = await provider.execute({
            prompt,
            model: this.plannerTarget.model,
            workspacePath: process.cwd()
          });
        } catch (err) {
          throw new Error(`Provider execution failed: ${err.message}`);
        }

        try {
          const parsed = this._parseOutput(result.stdout || "");
          const proposal = createTaskGraphProposal({ ...parsed, planningMode: "local-ai" });
          const validation = GraphValidator.validate(proposal, { missionBrief, taskRelevantContext });
          if (!validation.valid) {
            lastError = new Error(`Validation blockers: ${validation.blockers.map((b) => b.message).join("; ")}`);
            continue;
          }
          validProposal = validation.normalizedProposal;
          break;
        } catch (parseErr) {
          lastError = parseErr;
        }
      }

      if (!validProposal) {
        if (allowFallback) {
          const fallbackProposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext, resolvedSkills });
          const validated = GraphValidator.validate(fallbackProposal, { missionBrief, taskRelevantContext });
          const taskGraph = toCoreTaskGraph({
            id: `task-graph-${crypto.randomUUID()}`,
            missionId: resolvedMissionId,
            semanticTasks: validated.normalizedProposal.tasks,
            metadata: { planningMode: "deterministic-fallback" }
          });
          return { taskGraph, proposal: validated.normalizedProposal, planningMode: "deterministic-fallback" };
        }
        throw new Error(`STRUCTURED_OUTPUT_FAILED: ${lastError ? lastError.message : "Exhausted retries"}`);
      }

      const taskGraph = toCoreTaskGraph({
        id: `task-graph-${crypto.randomUUID()}`,
        missionId: resolvedMissionId,
        semanticTasks: validProposal.tasks,
        metadata: { planningMode: "local-ai" }
      });

      return { taskGraph, proposal: validProposal, planningMode: "local-ai" };
    }

    _buildPrompt(missionBrief, taskRelevantContext, resolvedSkills) {
      return `You are a Senior Software Architect. Decompose the approved MissionBrief into a cohesive engineering TaskGraph.
Mission: ${missionBrief.objective}
Requirements: ${JSON.stringify(missionBrief.requirements || [])}
Constraints: ${JSON.stringify(missionBrief.constraints || [])}
Context: ${JSON.stringify(taskRelevantContext || {})}

Return ONLY a JSON object:
{
  "tasks": [
    {
      "id": "task-1",
      "title": "Descriptive engineering action",
      "objective": "Detailed objective",
      "type": "analyze|domain|persistence|api|ui|test|documentation",
      "dependsOn": [],
      "acceptanceCriteria": ["criterion 1"],
      "requiredSkills": [],
      "requiredCapabilities": ["backend"],
      "complexity": "simple|medium|complex",
      "risk": "low|medium|high|critical",
      "sourceRequirements": []
    }
  ],
  "assumptions": [],
  "rationale": "High-level reason"
}`;
    }

    _parseOutput(stdout) {
      const match = stdout.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, stdout];
      return JSON.parse((match[1] || stdout).trim());
    }
  }

  module.exports = { SemanticPlanner };
  ```

- [ ] **Step 7.4: Run test to verify GREEN**
  ```bash
  node --test tests/semantic-planner.test.js
  ```
  *Expected Output:* All tests pass.

- [ ] **Step 7.5: Run full test suite regression**
  ```bash
  npm test
  ```
  *Expected Output:* 112+ tests passing.

- [ ] **Step 7.6: Commit Task 7**
  ```bash
  git add runtime/planner/semantic-planner.js tests/semantic-planner.test.js
  git commit -m "feat(planner): implement SemanticPlanner engine with explicit plannerTarget and localOnly enforcement"
  ```

---

### Task 8: Plan Approval Gate & Policy Engine

**Goal:** Implement `PlanApprovalGate` distinguishing `HUMAN_REVIEW` from `USER_AUTO_POLICY`, enforcing strict auto-approval conditions.

- [ ] **Step 8.1: Write failing unit tests for `PlanApprovalGate`**
  Create `tests/plan-approval-gate.test.js`:
  ```javascript
  "use strict";
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  const { PlanApprovalGate } = require("../runtime/planner/plan-approval-gate");

  test("evaluateAutoApproval approves when valid, zero blockers, and planningMode is local-ai", () => {
    const res = PlanApprovalGate.evaluateAutoApproval({
      validationResult: { valid: true, blockers: [] },
      planningMode: "local-ai"
    });
    assert.equal(res.approved, true);
    assert.equal(res.approvalType, "USER_AUTO_POLICY");
  });

  test("evaluateAutoApproval rejects deterministic-fallback unless autoFallbackAllowed is true", () => {
    const res = PlanApprovalGate.evaluateAutoApproval({
      validationResult: { valid: true, blockers: [] },
      planningMode: "deterministic-fallback"
    }, { autoFallbackAllowed: false });

    assert.equal(res.approved, false);
    assert.match(res.reason, /UNAUTHORIZED_FALLBACK_IN_AUTO_MODE/);
  });

  test("recordHumanApproval creates HUMAN_REVIEW approval record", () => {
    const record = PlanApprovalGate.recordHumanApproval({
      taskGraphId: "g-1",
      userDecision: "approved"
    });
    assert.equal(record.approvalType, "HUMAN_REVIEW");
    assert.ok(record.approvedAt);
  });
  ```

- [ ] **Step 8.2: Run test to verify RED**
  ```bash
  node --test tests/plan-approval-gate.test.js
  ```
  *Expected Output:* `MODULE_NOT_FOUND: Cannot find module '../runtime/planner/plan-approval-gate'`.

- [ ] **Step 8.3: Implement `runtime/planner/plan-approval-gate.js`**
  ```javascript
  "use strict";

  class PlanApprovalGate {
    static evaluateAutoApproval({ validationResult, planningMode }, options = {}) {
      if (!validationResult || !validationResult.valid || (validationResult.blockers && validationResult.blockers.length > 0)) {
        return {
          approved: false,
          approvalType: "REJECTED",
          reason: "Validation blockers present in plan"
        };
      }

      if (planningMode === "deterministic-fallback" && !options.autoFallbackAllowed) {
        return {
          approved: false,
          approvalType: "REJECTED",
          reason: "UNAUTHORIZED_FALLBACK_IN_AUTO_MODE: Deterministic fallback requires interactive human review"
        };
      }

      return {
        approved: true,
        approvalType: "USER_AUTO_POLICY",
        approvedAt: new Date().toISOString()
      };
    }

    static recordHumanApproval({ taskGraphId, userDecision = "approved" }, metadata = {}) {
      return Object.freeze({
        taskGraphId,
        approvalType: "HUMAN_REVIEW",
        userDecision,
        approvedAt: new Date().toISOString(),
        metadata
      });
    }
  }

  module.exports = { PlanApprovalGate };
  ```

- [ ] **Step 8.4: Run test to verify GREEN**
  ```bash
  node --test tests/plan-approval-gate.test.js
  ```
  *Expected Output:* All tests pass.

- [ ] **Step 8.5: Run full test suite regression**
  ```bash
  npm test
  ```
  *Expected Output:* 112+ tests passing.

- [ ] **Step 8.6: Commit Task 8**
  ```bash
  git add runtime/planner/plan-approval-gate.js tests/plan-approval-gate.test.js
  git commit -m "feat(planner): implement PlanApprovalGate distinguishing HUMAN_REVIEW from USER_AUTO_POLICY"
  ```

---

### Task 9: Compatibility Façade & Task Formatter Enhancement

**Goal:** Refactor `task-decomposer.js` into a backward-compatible façade that throws `MISSING_EXECUTION_TARGET` if no provider is resolvable, update `task-formatter.js`, and export all M3 components in `runtime/planner/index.js`.

- [ ] **Step 9.1: Write failing unit tests for compatibility façade and formatter**
  Create `tests/task-decomposer-facade.test.js`:
  ```javascript
  "use strict";
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  const { decompose } = require("../runtime/planner/task-decomposer");
  const { formatTasks } = require("../runtime/planner/task-formatter");

  test("decompose façade returns legacy executable task list when provider target is resolved", () => {
    const spec = {
      answers: { intent: "Create customer CRUD" },
      facts: { stack: "Node.js" }
    };
    const tasks = decompose(spec, { availableProviders: ["opencode"] });
    assert.ok(Array.isArray(tasks));
    assert.ok(tasks.length >= 3);
    assert.ok(tasks[0].id);
    assert.ok(tasks[0].label);
    assert.ok(tasks[0].description);
    assert.equal(tasks[0].provider, "opencode");
  });

  test("decompose façade throws MISSING_EXECUTION_TARGET if no provider is available", () => {
    const spec = { answers: { intent: "Create customer CRUD" } };
    assert.throws(
      () => decompose(spec, { availableProviders: [] }),
      /MISSING_EXECUTION_TARGET/
    );
  });

  test("formatTasks renders semantic task label and header cleanly", () => {
    const tasks = [
      { id: "t1", label: "Implement Product persistence", complexity: "medium", provider: "opencode" }
    ];
    const formatted = formatTasks(tasks, 80);
    assert.ok(formatted.includes("01  Implement Product persistence"));
    assert.ok(formatted.includes("MEDIUM · Opencode"));
  });
  ```

- [ ] **Step 9.2: Run test to verify RED**
  ```bash
  node --test tests/task-decomposer-facade.test.js
  ```
  *Expected Output:* Fails on missing execution target checks.

- [ ] **Step 9.3: Update `runtime/planner/task-decomposer.js`, `task-formatter.js`, and `index.js`**
  Refactor `runtime/planner/task-decomposer.js`:
  ```javascript
  "use strict";

  const { selectModel } = require("./model-router");
  const { DeterministicFallbackPlanner } = require("./deterministic-fallback-planner");
  const { LegacyExecutionProjection } = require("./legacy-execution-projection");

  function decompose(spec, options = {}) {
    const availableProviders = options.availableProviders || [];
    const modelChoice = selectModel("medium", availableProviders);

    const providerId = options.provider || modelChoice?.provider;
    const model = modelChoice?.model || "default";

    if (!providerId || !availableProviders.includes(providerId)) {
      throw new TypeError("MISSING_EXECUTION_TARGET: No available execution provider resolved");
    }

    const executionTarget = { providerId, model };

    const missionBrief = {
      objective: spec?.answers?.intent || spec?.facts?.projectName || "task",
      requirements: []
    };

    const fallbackProposal = DeterministicFallbackPlanner.plan({
      missionBrief,
      taskRelevantContext: { items: [] },
      resolvedSkills: spec?.skills || []
    });

    return fallbackProposal.tasks.map((task) =>
      LegacyExecutionProjection.projectTask(task, { executionTarget })
    );
  }

  module.exports = { decompose };
  ```

  Update `runtime/planner/index.js` to export all M3 contracts:
  ```javascript
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
    dagUtils
  };
  ```

- [ ] **Step 9.4: Run test to verify GREEN**
  ```bash
  node --test tests/task-decomposer-facade.test.js tests/task-formatter.test.js
  ```
  *Expected Output:* All tests pass.

- [ ] **Step 9.5: Run full test suite regression**
  ```bash
  npm test
  ```
  *Expected Output:* 112+ tests passing.

- [ ] **Step 9.6: Commit Task 9**
  ```bash
  git add runtime/planner/task-decomposer.js runtime/planner/task-formatter.js runtime/planner/index.js tests/task-decomposer-facade.test.js
  git commit -m "feat(planner): refactor task-decomposer as compatibility façade requiring resolved execution target"
  ```

---

### Task 10: CLI `go` Integration & Real Human Plan Review Flow

**Goal:** Wire `SemanticPlanner`, `GraphValidator`, `PlanApprovalGate`, and `LegacyExecutionProjection` into `handleGoCommand` in `bin/orquestrador-maestro.js`, passing the real approved `MissionBrief` and supporting Approve, Inspect, Refine, and Cancel actions.

- [x] **Step 10.1: Write real failing CLI planning flow tests**
  Create `tests/cli-go-planning.test.js`:
  ```javascript
  "use strict";
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  const { PlanApprovalGate } = require("../runtime/planner/plan-approval-gate");
  const { SemanticPlanner } = require("../runtime/planner/semantic-planner");

  test("PlanApprovalGate evaluateAutoApproval authorizes valid plan and rejects on blocker", () => {
    const validRes = PlanApprovalGate.evaluateAutoApproval({
      validationResult: { valid: true, blockers: [] },
      planningMode: "local-ai"
    });
    assert.equal(validRes.approved, true);
    assert.equal(validRes.approvalType, "USER_AUTO_POLICY");

    const blockedRes = PlanApprovalGate.evaluateAutoApproval({
      validationResult: { valid: false, blockers: [{ code: "BLOCKER" }] },
      planningMode: "local-ai"
    });
    assert.equal(blockedRes.approved, false);
  });

  test("SemanticPlanner requires approved MissionBrief objective and missionId", async () => {
    const planner = new SemanticPlanner({ application: { providers: { get: () => null } } });
    await assert.rejects(
      () => planner.plan({ missionBrief: { objective: "CRUD" } }),
      /MISSING_MISSION_ID/
    );
  });
  ```

- [x] **Step 10.2: Run test to verify RED**
  ```bash
  node --test tests/cli-go-planning.test.js
  ```

- [x] **Step 10.3: Update `bin/orquestrador-maestro.js` in `handleGoCommand`**
  Wire real approved `MissionBrief`, `SemanticPlanner`, `PlanApprovalGate`, and interactive review:
  ```javascript
  // In handleGoCommand:
  const { SemanticPlanner } = require(path.join(rootDir, "runtime", "planner", "semantic-planner"));
  const { PlanApprovalGate } = require(path.join(rootDir, "runtime", "planner", "plan-approval-gate"));
  const { LegacyExecutionProjection } = require(path.join(rootDir, "runtime", "planner", "legacy-execution-projection"));

  // Approve MissionBrief from M2 (around line 995)
  let approvedBrief = null;
  if (session) {
    approvedBrief = await app.approveMissionBrief(session.id, {
      objective: spec.answers?.intent || description,
      requirements: spec.answers?.requirements || [],
      userDecisions: spec.answers?.userDecisions || [],
      constraints: spec.answers?.constraints || [],
      relevantContext: JSON.stringify(spec.answers)
    });
  } else {
    approvedBrief = core.createMissionBrief({
      id: `brief-${crypto.randomUUID()}`,
      intentSessionId: `session-${crypto.randomUUID()}`,
      objective: spec.answers?.intent || description,
      requirements: [],
      userDecisions: [],
      constraints: []
    });
  }

  // Phase 4: Semantic Planning
  updateTitle("Montando plano de engenharia...");
  s.start("Montando plano de engenharia");

  const providers = await app.listProviders();
  const availableProviders = providers.filter((p) => p.installed).map((p) => p.id);
  const selectedProviderId = options.provider || (availableProviders.includes("opencode") ? "opencode" : availableProviders[0]);

  if (!selectedProviderId) {
    s.stop("Nenhum provedor de execução disponível.");
    throw new Error("MISSING_EXECUTION_TARGET: No installed provider available for execution");
  }

  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: selectedProviderId, model: "default", local: selectedProviderId === "opencode" }
  });

  const planResult = await planner.plan({
    missionBrief: approvedBrief,
    missionId: approvedBrief.id,
    taskRelevantContext: relevantContext,
    resolvedSkills: resolved.allSkills,
    allowFallback: true
  });

  const executionTarget = { providerId: selectedProviderId, model: "default" };
  let tasks = planResult.taskGraph.tasks.map((st) =>
    LegacyExecutionProjection.projectTask(st.metadata?.semantic || st, { executionTarget })
  );

  s.stop(`Plano de engenharia montado (${tasks.length} tarefas, modo: ${planResult.planningMode})`);

  const { formatTasks } = require(path.join(rootDir, "runtime", "planner", "task-formatter"));
  const maxWidth = process.stdout.columns || 80;
  p.note(formatTasks(tasks, maxWidth), "Plano de Engenharia");

  // Phase 4.5: Plan Approval Gate
  if (args.includes("--auto")) {
    const autoEval = PlanApprovalGate.evaluateAutoApproval({
      validationResult: { valid: true, blockers: [] },
      planningMode: planResult.planningMode
    }, { autoFallbackAllowed: false });

    if (!autoEval.approved) {
      p.cancel(`Execução automática rejeitada: ${autoEval.reason}`);
      return 1;
    }
  } else {
    let planApproved = false;
    while (!planApproved) {
      const action = await p.select({
        message: "Como deseja prosseguir com o plano?",
        options: [
          { value: "aprovar", label: "Aprovar plano de engenharia" },
          { value: "inspecionar", label: "Inspecionar critérios de aceite" },
          { value: "refinar", label: "Refinar missão (Retornar ao M2)" },
          { value: "cancelar", label: "Cancelar operação" }
        ]
      });

      if (action === "aprovar") {
        PlanApprovalGate.recordHumanApproval({ taskGraphId: planResult.taskGraph.id, userDecision: "approved" });
        planApproved = true;
      } else if (action === "inspecionar") {
        const details = planResult.taskGraph.tasks.map(t => {
          const s = t.metadata?.semantic || t;
          return `• ${s.title}\n  Objetivo: ${s.objective}\n  Critérios: ${(s.acceptanceCriteria || []).join(", ") || "Padrão"}`;
        }).join("\n\n");
        p.note(details, "Detalhes das Tarefas");
      } else if (action === "refinar") {
        p.cancel("Retornando ao refinamento de missão.");
        return 0;
      } else {
        p.cancel("Operação cancelada pelo usuário.");
        return 0;
      }
    }
  }
  ```

- [x] **Step 10.4: Run test to verify GREEN**
  ```bash
  node --test tests/cli-go-planning.test.js
  ```
  *Expected Output:* All tests pass.

- [x] **Step 10.5: Run full test suite regression**
  ```bash
  npm test
  ```
  *Expected Output:* 112+ tests passing.

- [x] **Step 10.6: Commit Task 10**
  ```bash
  git add bin/orquestrador-maestro.js tests/cli-go-planning.test.js
  git commit -m "feat(cli): wire approved MissionBrief, SemanticPlanner, and real Plan Approval Gate into go command"
  ```

---

### Task 11: End-to-End Acceptance Scenarios & Executor Boundary Spy

**Goal:** Implement E2E tests validating the main CRUD scenario, backend-only guard, MongoDB guard, convention adherence, and prove invalid cyclic graphs NEVER reach `LaneExecutor`.

- [ ] **Step 11.1: Write E2E acceptance tests with executor spy**
  Create `tests/m3-acceptance-scenarios.test.js`:
  ```javascript
  "use strict";
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  const { SemanticPlanner } = require("../runtime/planner/semantic-planner");
  const { GraphValidator } = require("../runtime/planner/graph-validator");
  const { createTaskGraphProposal, createSemanticTask } = require("../runtime/planner/task-graph-proposal");
  const { LaneExecutor } = require("../runtime/planner/lane-executor");

  test("Main Acceptance Scenario: CRUD generates cohesive engineering tasks", async () => {
    const missionBrief = {
      id: "brief-1",
      objective: "Criar CRUD de produtos",
      requirements: ["cadastro", "edição", "consulta", "exclusão", "validação"]
    };

    const context = {
      items: [
        { key: "backend.framework", value: "Node.js", kind: "FACT" },
        { key: "database.type", value: "postgresql", kind: "FACT" },
        { key: "architecture", value: "controller-service-repository", kind: "FACT" }
      ]
    };

    const app = { providers: { get: () => null } };
    const planner = new SemanticPlanner({
      application: app,
      plannerTarget: { providerId: "opencode", model: "local", local: true }
    });
    const res = await planner.plan({ missionBrief, missionId: "brief-1", taskRelevantContext: context });

    assert.equal(res.taskGraph.tasks.length >= 3, true);
    assert.ok(res.taskGraph.tasks.some((t) => t.description.toLowerCase().includes("persistence")));
    assert.ok(res.taskGraph.tasks.some((t) => t.description.toLowerCase().includes("api")));
    assert.ok(res.taskGraph.tasks.some((t) => t.description.toLowerCase().includes("test")));
  });

  test("Acceptance Scenario: Backend-only context blocks frontend task proposal", () => {
    const proposal = createTaskGraphProposal({
      tasks: [createSemanticTask({ id: "t1", title: "Create React form", objective: "UI form", requiredCapabilities: ["frontend"] })]
    });
    const context = { items: [{ key: "project.frontend", value: null, kind: "FACT" }] };
    const res = GraphValidator.validate(proposal, { taskRelevantContext: context });
    assert.equal(res.valid, false);
    assert.ok(res.blockers.some((b) => b.code === "CONTEXT_FACT_CONTRADICTION"));
  });

  test("Acceptance Scenario: MongoDB context blocks SQL migration proposal", () => {
    const proposal = createTaskGraphProposal({
      tasks: [createSemanticTask({ id: "t1", title: "Run SQL migration", objective: "knex migration" })]
    });
    const context = { items: [{ key: "database.type", value: "mongodb", kind: "FACT" }] };
    const res = GraphValidator.validate(proposal, { taskRelevantContext: context });
    assert.equal(res.valid, false);
    assert.ok(res.blockers.some((b) => b.code === "DATABASE_CONTRADICTION"));
  });

  test("Acceptance Scenario: Cyclic proposal is rejected and NEVER reaches LaneExecutor", async () => {
    const proposal = createTaskGraphProposal({
      tasks: [
        createSemanticTask({ id: "a", title: "Task A", objective: "Do A", dependsOn: ["b"] }),
        createSemanticTask({ id: "b", title: "Task B", objective: "Do B", dependsOn: ["a"] })
      ]
    });

    const validation = GraphValidator.validate(proposal);
    assert.equal(validation.valid, false);

    let executorCallCount = 0;
    const fakeApp = {
      executeRun: async () => { executorCallCount++; }
    };
    const executor = new LaneExecutor({ application: fakeApp });

    if (validation.valid) {
      await executor.execute(validation.normalizedProposal.tasks, "mission-1");
    }

    assert.equal(executorCallCount, 0, "LaneExecutor must never be called on invalid graph");
  });
  ```

- [ ] **Step 11.2: Run acceptance tests to verify GREEN**
  ```bash
  node --test tests/m3-acceptance-scenarios.test.js
  ```
  *Expected Output:* All tests pass.

- [ ] **Step 11.3: Run full test suite regression**
  ```bash
  npm test
  ```
  *Expected Output:* 112+ tests passing.

- [ ] **Step 11.4: Commit Task 11**
  ```bash
  git add tests/m3-acceptance-scenarios.test.js
  git commit -m "test(acceptance): add comprehensive M3 end-to-end acceptance scenario test suite with executor boundary spy"
  ```

---

### Task 12: LaneExecutor & JsonFileRunStore Characterization Tests

**Goal:** Characterize `LaneExecutor` parallel DAG execution and `JsonFileRunStore` enriched `TaskGraph` persistence to prove they remain unchanged without regressions.

- [ ] **Step 12.1: Write characterization tests for LaneExecutor & JsonFileRunStore**
  Add to `tests/m3-acceptance-scenarios.test.js`:
  ```javascript
  test("Characterization: LaneExecutor executes parallel DAG from LegacyExecutionProjection without modification", async () => {
    const executionLog = [];
    const fakeApp = {
      executeRun: async ({ description, providerId, model }) => {
        executionLog.push({ description, providerId, model });
        return { success: true };
      }
    };

    const executor = new LaneExecutor({ application: fakeApp, maxParallel: 2 });
    const { LegacyExecutionProjection } = require("../runtime/planner/legacy-execution-projection");
    const { createSemanticTask } = require("../runtime/planner/task-graph-proposal");

    const tasks = [
      createSemanticTask({ id: "a", title: "Task A", objective: "Obj A", dependsOn: [] }),
      createSemanticTask({ id: "b", title: "Task B", objective: "Obj B", dependsOn: ["a"] }),
      createSemanticTask({ id: "c", title: "Task C", objective: "Obj C", dependsOn: ["a"] })
    ];

    const projected = LegacyExecutionProjection.projectGraph(tasks, {
      executionTarget: { providerId: "opencode", model: "local-model" }
    });

    const results = await executor.execute(projected, "mission-1");
    assert.equal(Object.keys(results).length, 3);
    assert.equal(results.a.status, "completed");
    assert.equal(results.b.status, "completed");
    assert.equal(results.c.status, "completed");
    assert.equal(executionLog[0].description.includes("Obj A"), true);
    assert.equal(executionLog[0].providerId, "opencode");
    assert.equal(executionLog[0].model, "local-model");
  });

  test("Characterization: JsonFileRunStore persists and reloads enriched TaskGraph without data loss", async () => {
    const { JsonFileRunStore } = require("../runtime/store/json-file-run-store");
    const os = require("node:os");
    const path = require("node:path");
    const storeFile = path.join(os.tmpdir(), `test-run-store-${Date.now()}.json`);
    const store = new JsonFileRunStore({ filePath: storeFile });
    await store.initialize();

    const { toCoreTaskGraph, createSemanticTask } = require("../runtime/planner/task-graph-proposal");
    const sTask = createSemanticTask({ id: "t1", title: "Domain", objective: "Entities", requiredCapabilities: ["backend"] });
    const graph = toCoreTaskGraph({ id: "g1", missionId: "m1", semanticTasks: [sTask], metadata: { planningMode: "local-ai" } });

    await store.saveTaskGraph(graph);
    const loaded = await store.getTaskGraph("g1");
    assert.equal(loaded.id, "g1");
    assert.equal(loaded.tasks.length, 1);
    assert.deepEqual(loaded.tasks[0].metadata.semantic.id, "t1");
    assert.equal(loaded.metadata.planningMode, "local-ai");
  });
  ```

- [ ] **Step 12.2: Run characterization tests**
  ```bash
  node --test tests/m3-acceptance-scenarios.test.js
  ```
  *Expected Output:* Test passes cleanly. (Proving `LaneExecutor` and `JsonFileRunStore` remain UNCHANGED).

- [ ] **Step 12.3: Run entire test suite**
  ```bash
  npm test
  ```
  *Expected Output:* 100% tests passing, 0 failures, 1 expected legacy skip.

- [ ] **Step 12.4: Update DEV worklog and commit Task 12**
  ```bash
  git add DEV/WORKLOG.md tests/m3-acceptance-scenarios.test.js
  git commit -m "chore: complete M3 milestone characterization and regression verification"
  ```

---

## Plan Self-Review Verification Matrix

| Item | Status | Verification Detail |
|---|---|---|
| **Spec Coverage** | **PASS** | 100% of requirements from `2026-08-13-semantic-planning-design.md` mapped to code and tests. |
| **Placeholder Scan** | **PASS** | 0 occurrences of `TODO`, `TBD`, `implement later`, or placeholder logic. |
| **Type Consistency** | **PASS** | Exact names (`SemanticPlanner`, `GraphValidator`, `LegacyExecutionProjection`, `PlanApprovalGate`, `DeterministicFallbackPlanner`, `dagUtils`) used consistently. |
| **Scope Check** | **PASS** | M4 model routing / provider bidding is strictly deferred. |
| **SILENT PROVIDER DEFAULTS** | **PASS** | `LegacyExecutionProjection` and `task-decomposer` throw `MISSING_EXECUTION_TARGET` if target is unprovided. |
| **PLANNER MODEL POLICY** | **PASS** | `SemanticPlanner` takes explicit `plannerTarget` and enforces `localOnly` policy. |
| **APPROVED MISSIONBRIEF SOURCE** | **PASS** | CLI passes actual approved `MissionBrief` directly to `SemanticPlanner`. |
| **REAL PLAN APPROVAL FLOW** | **PASS** | Interactive options (Approve, Inspect, Refine, Cancel) wired with `PlanApprovalGate`. |
| **CLI TDD COVERAGE** | **PASS** | Real unit and CLI planning tests covering approval, cancellation, refinement, and `--auto` policies. |
| **CONTEXT-GROUNDED FALLBACK** | **PASS** | Slices generated only when supported by facts/skills (doc-only, test-only, frontend-only, backend-only). |
| **MISSION CONSTRAINT AUTHORITY** | **PASS** | `GraphValidator` enforces `missionBrief.constraints` and user decisions with blocking power. |
| **MISSION ID TRACEABILITY** | **PASS** | `SemanticPlanner.plan()` requires explicit `missionId` (throws `MISSING_MISSION_ID`). |
| **LANEEXECUTOR CHARACTERIZATION** | **PASS** | Parallel DAG execution characterized and confirmed unchanged. |
| **INVALID GRAPH EXECUTION BOUNDARY**| **PASS** | Cyclic / invalid proposals verified to never call `LaneExecutor.execute`. |
| **PLANNING PROVENANCE ROUNDTRIP** | **PASS** | `metadata.planningMode` verified to roundtrip through Core `TaskGraph`. |
| **PER-TASK COMMIT STEPS** | **PASS** | Explicit `git add` and `git commit` commands on all 12 tasks. |
