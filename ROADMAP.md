# Roadmap - Orquestrador Maestro Evolution

> Nota: roadmap descreve plano, não capability. O que vale como capability
> atual está em `docs/product/CAPABILITY_MATRIX.json` com `status: stable`.

## Overview
Evolve Maestro to include episodic memory and benchmark engine, following the Master Prompt phases.

## Phase 0: Discovery ✅
**Status:** Completed
**Output:**
- INSPIRATION_MATRIX.md
- ADR-001 (Episodic Memory)

## Phase 1: Benchmark Protocol
**Status:** Complete (superseded by shipped `benchmark-harness/` with 13 scenarios in 0.2.0–0.4.0)
**Goal:** Define benchmark schema, scenarios, isolation, acceptance
**Output:**
- BENCHMARK_SCHEMA.json
- scenarios/ directory with 6 initial scenarios
- Benchmark runner implementation
- Tests for benchmark

## Phase 2: Baseline V0
**Status:** Not started
**Goal:** Execute Vanilla vs Maestro Core baseline
**Output:**
- Raw benchmark data
- Initial report

## Phase 3: Episodic Memory Core
**Status:** Complete (shipped: `memory record/search/show/timeline` with JSONL, isolation, redaction, tests)
**Goal:** Implement record, search, show, timeline with JSONL
**Output:**
- memory.js module
- Observation schema
- Project isolation
- Redaction
- Tests

## Phase 4: Context Intelligence
**Status:** Not started
**Goal:** Integrate context brief + episodic search + budget + classification
**Output:**
- Enhanced context-brief.js
- Task classification
- Context budget management

## Phase 5: Knowledge Promotion
**Status:** Not started
**Goal:** Implement memory promote with conflict and security
**Output:**
- memory promote command
- Promotion rules

## Phase 6: Retention/Dedupe/Consolidation
**Status:** Not started
**Goal:** Implement necessary complexity for data management
**Output:**
- Retention policy
- Deduplication
- Consolidation rules

## Phase 7: Automatic Capture Adapters
**Status:** Not started
**Goal:** Implement adapters for different tools progressively
**Output:**
- Tool-specific adapters (Claude, Codex, OpenCode, etc.)

## Phase 8: Benchmark V1
**Status:** Not started
**Goal:** Execute Vanilla vs Maestro Core vs Maestro Memory
**Output:**
- Complete benchmark data
- Statistical analysis

## Phase 9: Analysis
**Status:** Not started
**Goal:** Calculate success rate, median tokens, tokens/successful task, etc.
**Output:**
- Analysis report

## Phase 10: Public Report
**Status:** Not started
**Goal:** Generate benchmark.md, benchmark.json, optional HTML
**Output:**
- Reproducible public report
- Marketing summary

## Current Focus
Stabilize the 0.4.x runtime: durable privacy, terminal persistence, diagnostic sanitizer, usage CLI and cross-platform validation.

## Success Criteria
- Memory isolated per project
- Record, search, show, timeline work
- Redaction has tests
- Malformed data doesn't break Maestro
- Context brief works without memory
- Context brief retrieves relevant memory
- Irrelevant memory not loaded
- Budget respected
- Canonical context prevails
- Injection via observation has no authority
- Windows/Linux/macOS considered
- Node supported continues working
- Tests are green

## Risks
1. Complexity increase
2. Performance overhead
3. Maintenance burden
4. Dependency creep
5. Cross-platform compatibility

## Mitigations
1. Start simple, evolve based on evidence
2. Measure performance in benchmarks
3. Keep zero-dependency principle
4. Test on all platforms
5. Graceful degradation