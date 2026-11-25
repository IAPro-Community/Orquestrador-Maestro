# Inspiration Matrix - Claude-Mem Concepts

## Analysis Date
2026-09-02

## Source
claude-mem (https://github.com/thedotmack/claude-mem)
License: Apache-2.0

## Matrix

### Persistent observations
**Value for Maestro:** High
**Decision:** ADAPT
**Reason:** Core requirement for episodic memory. Claude-mem implements observation capture from tool usage. Maestro needs similar concept but adapted to its orchestration focus (decisions, discoveries, problems, not just tool calls).

### Progressive disclosure
**Value for Maestro:** High
**Decision:** ADOPT CONCEPT
**Reason:** Essential for context economy. Claude-mem's 3-layer workflow (search → timeline → details) aligns perfectly with Maestro's "minimum sufficient context" principle. Implement native version.

### Semantic summaries
**Value for Maestro:** Medium
**Decision:** DEFER
**Reason:** Useful but adds complexity. First implement lexical/structured search, then evaluate if semantic summaries provide meaningful improvement.

### Search (hybrid semantic + keyword)
**Value for Maestro:** Medium
**Decision:** DEFER
**Reason:** Claude-mem uses Chroma vector DB + FTS5. Premature for Maestro's initial implementation. Start with lexical/structured search (tags, type, files, recency). Evaluate semantic search later if benchmarks show need.

### Timeline
**Value for Maestro:** Medium
**Decision:** ADOPT CONCEPT
**Reason:** Useful for understanding context around observations. Implement simple chronological view.

### Observation IDs
**Value for Maestro:** High
**Decision:** ADOPT
**Reason:** Essential for referencing observations in context brief and promotion. Implement unique IDs.

### Recuperação seletiva (selective retrieval)
**Value for Maestro:** High
**Decision:** ADOPT
**Reason:** Core to context budget management. Never load all observations; select based on relevance.

### Privacy/exclusion mechanisms
**Value for Maestro:** High
**Decision:** ADAPT
**Reason:** Critical for security. Claude-mem uses `<private>` tags. Maestro needs redaction policy for secrets, API keys, etc. Implement native redaction.

### Integração por hooks
**Value for Maestro:** Medium
**Decision:** ADAPT
**Reason:** Claude-mem uses 5 lifecycle hooks. Maestro already has hooks concept. Adapt to capture observations from tool events without heavy integration.

### Armazenamento (SQLite + ChromaDB)
**Value for Maestro:** Medium
**Decision:** DEFER
**Reason:** Claude-mem uses SQLite + ChromaDB. Maestro should start with JSONL for simplicity. Evolve to SQLite if justified by volume/search needs.

### Indexação
**Value for Maestro:** Medium
**Decision:** ADOPT CONCEPT
**Reason:** Necessary for fast search. Implement simple index by type, tags, files, recency.

### FTS (Full-Text Search)
**Value for Maestro:** Medium
**Decision:** DEFER
**Reason:** Useful but premature. Start with basic token matching in summaries/tags.

### Embeddings/vector search
**Value for Maestro:** Low
**Decision:** DEFER
**Reason:** Premature for initial implementation. Requires external dependencies (Chroma, embeddings model). First prove simple search works.

### Worker/daemon
**Value for Maestro:** Low
**Decision:** DEFER
**Reason:** Adds complexity not yet justified. Maestro is CLI-based, not persistent service. Capture observations via CLI commands or hooks, not daemon.

### Viewer (web UI)
**Value for Maestro:** Low
**Decision:** DEFER
**Reason:** Useful later for debugging/analysis. Not essential for core functionality.

### Integrações (Claude Code, OpenCode, etc.)
**Value for Maestro:** Medium
**Decision:** ADAPT
**Reason:** Maestro already integrates with multiple tools. Create adapters for observation capture per tool, but keep them simple.

### Multi-session strategy
**Value for Maestro:** High
**Decision:** ADOPT
**Reason:** Core to Maestro's purpose. Observations must persist across sessions and be retrievable.

### Lifecycle capture
**Value for Maestro:** High
**Decision:** ADAPT
**Reason:** Capture at meaningful points: decision made, problem discovered, verification passed. Not every tool call.

### Semantic summaries (auto-generated)
**Value for Maestro:** Low
**Decision:** DEFER
**Reason:** Could use LLM for summarization but adds cost/complexity. First use manual summaries in observations.

## Summary of Decisions

### ADOPT (directly use)
- Observation IDs
- Selective retrieval
- Multi-session strategy

### ADAPT (modify for Maestro)
- Persistent observations
- Privacy/exclusion mechanisms
- Hooks integration
- Integrações

### DEFER (consider later)
- Semantic summaries
- Hybrid search (semantic + keyword)
- Timeline
- SQLite storage
- FTS
- Embeddings/vector search
- Worker/daemon
- Viewer
- Auto-generated summaries

### REJECT (not applicable)
- None yet (all concepts have some value, but timing differs)

## Next Steps
1. Design Maestro-native observation schema
2. Design project identity strategy
3. Design context brief + memory integration
4. Design benchmark engine
5. Implement Phase 1: Episodic Memory Core