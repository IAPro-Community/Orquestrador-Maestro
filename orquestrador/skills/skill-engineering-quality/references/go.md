# Go Quality

Use the Go version declared by `go.mod`/`go.work` and the repository's supported toolchain.

## Baseline

Prefer project-native commands first. A typical healthy baseline includes:

- `gofmt` check; `goimports` only when the project uses or intentionally adopts it;
- `go vet ./...`;
- `go test ./...`;
- `go test -race ./...` where supported and proportionate;
- `golangci-lint` when the repository already uses it or benefits from a consolidated linter;
- `govulncheck ./...` when vulnerability scanning is in scope.

Do not run Staticcheck separately if the authoritative golangci-lint configuration already executes equivalent analyzers.

## Tooling

When supported by the project's Go version, prefer reproducible versioned tool dependencies instead of machine-global assumptions. Do not force a Go upgrade solely to modernize tool declaration.

## Review hotspots

Quality review should notice, when relevant:

- ignored errors and incorrect wrapping;
- context not propagated through request boundaries;
- HTTP/database operations without appropriate timeouts;
- resources not closed;
- goroutines without lifecycle/cancellation;
- race-prone shared state;
- panic used for ordinary operational errors;
- oversized interfaces or premature abstractions;
- generic `utils` dumping grounds;
- unsafe SQL/query construction;
- generated code being edited or linted as source.

Do not impose ceremonial repositories/services/interfaces when the current design is simpler and maintainable.

## Commands

Keep fast checks local and heavier checks in CI as appropriate. Race and vulnerability scans may be CI-only if local latency is material, but CI must make that ownership explicit.
