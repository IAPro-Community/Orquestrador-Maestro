# Python, PHP, Ruby, Rust, Elixir and Dart/Flutter

Preserve each ecosystem's existing environment/package manager and lockfile. Never introduce a second manager merely to normalize repositories.

## Python

Detect uv, Poetry, PDM, pip-tools, Pipenv or requirements-based setups.

Prefer existing tools. Modern baselines often use Ruff for lint/format where adopted, plus mypy or Pyright when the project has typed Python. Preserve pytest/unittest and framework-native test commands. Do not install Black + Ruff formatter simultaneously without a deliberate ownership decision.

For Django/FastAPI/Flask, keep framework startup/config checks and migration safety separate from generic lint.

## PHP

Respect Composer, PHP version constraints and framework scripts. Reuse PHP-CS-Fixer/Pint/PHP_CodeSniffer and PHPStan/Psalm when already present. Run PHPUnit/Pest and framework checks as appropriate. Do not configure overlapping style tools.

## Ruby

Respect Bundler and Ruby version files. Prefer existing RuboCop/StandardRB ownership, RSpec/Minitest and Rails-native checks. Do not rewrite style wholesale as part of an unrelated baseline.

## Rust

Treat `cargo fmt --check`, `cargo clippy`, `cargo test` and `cargo build/check` as the typical starting point, respecting workspace members and feature flags. Do not enable clippy lints indiscriminately without checking project policy.

## Elixir

Use Mix project conventions: formatter check, compiler warnings, ExUnit and existing Credo/Dialyzer setup where present. Respect umbrella apps.

## Dart / Flutter

Use `dart format` check semantics, `dart analyze`, tests and Flutter-specific test/build commands when a Flutter app is detected. Respect `analysis_options.yaml` and generated code conventions.

## General rule

If the project already has a healthy equivalent, improve that configuration rather than replacing it with the examples above.
