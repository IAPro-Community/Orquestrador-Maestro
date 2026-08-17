# Maestro VS Code Extension

`extensions/vscode-maestro` is an optional VS Code client. It launches `orquestrador-maestro bridge --stdio`, renders project status, Skills grouped by origin, provider availability, project Runs, and managed commands. It provides `Maestro: Run Task`, provider selection, Run inspection, and `Maestro: Start Managed Command`.

The extension contains no skill discovery, provider execution, verification, Run Store, or workflow business logic. Protocol incompatibilities surface as bridge errors; v1 does not claim run streaming or approvals.
