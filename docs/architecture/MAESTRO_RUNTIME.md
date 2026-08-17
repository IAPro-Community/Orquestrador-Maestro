# Maestro Runtime

The optional local runtime converts a Task into a traceable Run, Step, ExecutionPackage, provider process, artifacts, Git observation, and real Verification. Operational data is stored outside `DEV/` through `RunStore`; the initial portable implementation is an atomic private JSON file for Node 18 compatibility.

`orquestrador-maestro run --provider codex "task"` and `orquestrador-maestro run --provider claude "task"` are additive commands. Provider completion alone does not complete a Run: the configured or conservatively inferred verification commands must pass.

The initial store is safe for a single local process. A future SQLite implementation must preserve `RunStore` and add multi-process locking without changing legacy behavior.

Projects and managed commands are stored as additive RunStore records. The `terminals` collection is optional in the existing version-1 JSON shape, so previously created runtime files remain readable.
