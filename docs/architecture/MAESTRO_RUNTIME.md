# Maestro Runtime

> Status: Current — descreve o runtime implementado nesta base.

The optional local runtime converts a Task into a traceable Run, Step, ExecutionPackage, provider process, artifacts, Git observation, and real Verification. Operational data is stored outside `DEV/` through `RunStore`; the initial portable implementation is an atomic private JSON file for Node 20 compatibility.

Runtime support starts at Node.js `>=20.0.0`. The required CI matrix runs the full suite on
Linux with Node.js 20, 22, and 24; Windows and macOS receive smoke coverage on Node.js 20
and 24.

`orquestrador-maestro run --provider codex "task"` and `orquestrador-maestro run --provider claude "task"` are additive commands. Provider completion alone does not complete a Run: the configured or conservatively inferred verification commands must pass.

The portable JSON store is safe for multiple local Maestro processes: mutations are serialized with an OS-visible lock, reload the latest committed generation inside the critical section, fsync the temporary generation before atomic rename, and sync the parent directory where the platform supports it. A future SQLite implementation must preserve the `RunStore` contract and these concurrency/durability invariants without changing legacy behavior.

Projects and managed commands are stored as additive RunStore records. The `terminals` collection is optional in the existing version-1 JSON shape, so previously created runtime files remain readable.
