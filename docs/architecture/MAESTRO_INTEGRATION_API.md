# Maestro Integration API

`orquestrador-maestro bridge --stdio` exposes protocol version 1 as JSON-RPC 2.0 over newline-delimited JSON. `initialize` negotiates the protocol version. Read methods include `project.inspect`, `skills.list`, `providers.list`, `runs.list`, `runs.get`, `artifacts.list`, `artifacts.get`, and `verification.get`.

`runs.create`, `runs.cancel`, `runs.inspect`, `projects.list`, `projects.get`, `projects.register`, `terminals.list`, `terminals.get`, `terminals.create`, `terminals.attach`, `terminals.close`, `terminals.registerClient`, `terminals.updateClientStatus` and `terminals.capabilities` are available when the runtime service is present. `terminals.start`, `terminals.stop` and `terminals.input` remain compatibility methods for the original non-interactive managed command.

Terminal sessions are metadata only: no prompt, screen buffer, ANSI stream or secret is persisted. A `tmux` session is persistent and attachable; a `vscode` session is rendered and owned exclusively by VS Code's native terminal API. Missing `tmux` produces the explicit JSON-RPC error `-32010` with its backend name. A second writable agent for the same workspace produces `-32011` with the existing session id.

The VS Code extension and the TUI use this API/application boundary as clients. The extension owns only presentation and user interaction; provider execution, Skill discovery, verification, Git observation, and persistence remain in the Runtime.
