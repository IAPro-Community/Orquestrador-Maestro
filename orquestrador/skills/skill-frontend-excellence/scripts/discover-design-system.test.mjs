import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverDesignSystem } from "./discover-design-system.mjs";

function fixture() { return fs.mkdtempSync(path.join(os.tmpdir(), "maestro-design-system-")); }

test("explicit synthetic design system resolves with full confidence", () => {
  const cwd = fixture(); fs.writeFileSync(path.join(cwd, "AGENTS.md"), "Use @acme/ui as the project design system.\n");
  const result = discoverDesignSystem({ cwd });
  assert.deepEqual({ status: result.status, provider: result.provider, requiresUserDecision: result.requiresUserDecision }, { status: "resolved", provider: "@acme/ui", requiresUserDecision: false });
});

test("dominant imports resolve while dependency-only evidence does not", () => {
  const cwd = fixture();
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ dependencies: { "@acme/ui": "1.0.0" } }));
  fs.writeFileSync(path.join(cwd, "screen.tsx"), "import { Button } from '@example/design-system';\nimport { Card } from '@example/design-system';\n");
  const result = discoverDesignSystem({ cwd });
  assert.equal(result.status, "resolved"); assert.equal(result.provider, "@example/design-system");
  const dependencyOnly = fixture(); fs.writeFileSync(path.join(dependencyOnly, "package.json"), JSON.stringify({ dependencies: { "@acme/ui": "1.0.0" } }));
  assert.equal(discoverDesignSystem({ cwd: dependencyOnly }).status, "unresolved");
});

test("two equally used systems and no system require a user decision", () => {
  const ambiguous = fixture();
  fs.writeFileSync(path.join(ambiguous, "a.tsx"), "import { A } from '@one/ui';\n"); fs.writeFileSync(path.join(ambiguous, "b.tsx"), "import { B } from '@two/ui';\n");
  const result = discoverDesignSystem({ cwd: ambiguous }); assert.equal(result.status, "ambiguous"); assert.equal(result.implementationAllowed, false);
  const unresolved = fixture(); const none = discoverDesignSystem({ cwd: unresolved }); assert.equal(none.status, "unresolved"); assert.equal(none.requiresUserDecision, true); assert.equal(none.implementationAllowed, false);
});
