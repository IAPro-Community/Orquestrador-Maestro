# Evidence and Discovery

## Evidence first

Documentation describes the current product, not intent.

Use this evidence hierarchy when a capability claim matters:

1. working implementation;
2. automated tests;
3. runtime behavior/evidence;
4. public contracts: API, CLI, schemas;
5. UI routes/components/behavior;
6. configuration, migrations and persisted schemas;
7. executable examples;
8. existing documentation.

Existing docs are discovery signals, not proof by themselves.

When sources disagree, investigate the stronger/current evidence. If evidence remains insufficient, mark the capability `unverified`.

Use `planned` only when explicit roadmap/issue/contract evidence says it is planned. Do not infer roadmap status from missing code.

## Repository discovery

Adapt discovery to the actual stack. Inspect relevant sources such as:

- repository instructions: AGENTS.md, CLAUDE.md, CONTRIBUTING, README;
- apps, packages, services, modules, routes, controllers, handlers, pages/components;
- CLI commands and API entry points;
- schemas, migrations and configuration;
- tests, E2E and examples;
- Docker/Kubernetes/deployment files;
- CI/CD;
- package/build manifests and environment examples;
- existing docs and documentation generators.

Do not assume JavaScript, Go, Java, Python or any other language.

## Feature inventory

For each meaningful capability capture only fields supported by evidence:

- name and purpose;
- user value;
- implementation location and entry point;
- status;
- configuration and permissions;
- dependencies;
- limitations;
- tests;
- current documentation;
- evidence.

Useful status vocabulary:

- stable;
- beta;
- experimental;
- internal;
- legacy;
- deprecated;
- in-development;
- planned;
- unverified.

## Escalation

Escalate/report instead of silently expanding scope when:

- code and runtime behavior materially disagree;
- status cannot be determined;
- credentials are required and unavailable;
- a visual flow cannot be accessed;
- verification exposes a product defect;
- implementation changes would be required;
- a security issue appears;
- release/readiness evaluation is requested.
