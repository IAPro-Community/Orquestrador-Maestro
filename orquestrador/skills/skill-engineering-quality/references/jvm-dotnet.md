# JVM and .NET Quality

## Java / Kotlin

Detect Maven vs Gradle and preserve the wrapper (`mvnw`, `gradlew`) when present.

Use existing plugins and conventions before adding new ones. Relevant quality layers may include:

- compiler warnings and null-safety/type checks;
- formatter already adopted by the project;
- Checkstyle, SpotBugs, PMD, Error Prone, Detekt or ktlint when already authoritative or clearly justified;
- JUnit/Kotest and existing integration-test tasks;
- Maven `verify` or the project's Gradle `check`/build lifecycle.

For Spring Boot/Ktor, validate with the framework's established test/build tasks. Do not introduce multiple overlapping static analyzers merely to maximize rule count.

Keep generated sources, annotation processor output and build directories out of hand edits.

## .NET

Detect solution/project topology, target frameworks, SDK pinning through `global.json`, and central package management.

Prefer:

- `dotnet format --verify-no-changes` when compatible with project policy;
- compiler/analyzer warnings, nullable reference types and existing Roslyn analyzers;
- `dotnet test`;
- `dotnet build` or repository-specific build command.

Do not blindly turn all warnings into errors in a mature codebase without measuring existing debt. Introduce stricter gates incrementally when necessary.

Respect solution filters, test categories, source generators and analyzers already owned by the repository.
