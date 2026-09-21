# Frontend Definition of Done

No frontend task is complete because the build is green.

## Always

- [ ] design-system discovery is `resolved` (or explicit user decision is recorded)
- [ ] no visual implementation proceeds on `ambiguous`/`unresolved` discovery
- [ ] build
- [ ] typecheck (when the project has it)
- [ ] lint (when the project has it)
- [ ] unit/integration tests relevant to the change
- [ ] application boots (or Storybook/fixture when the app cannot boot in this environment)
- [ ] browser smoke test
- [ ] console clean of **new** errors
- [ ] responsive validation (`390`, `768`, `1280`, `1440`)
- [ ] accessibility validation
- [ ] contrast validation
- [ ] screenshots stored
- [ ] visual inspection / structured review
- [ ] component-library compliance (active design-system lookup done)
- [ ] design-profile compliance
- [ ] requested behavior verified

## MIGRATE / REFACTOR / PRESERVE

- [ ] baseline comparison
- [ ] no unintended redesign

## REDESIGN / HIGH

- [ ] design direction validated
- [ ] identity from Design Profile maintained
- [ ] business flow preserved
