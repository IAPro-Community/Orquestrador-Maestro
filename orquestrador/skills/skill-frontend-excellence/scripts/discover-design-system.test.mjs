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
  fs.writeFileSync(path.join(cwd, "screen.tsx"), "import { Button } from '@example/design-system';\nimport { Card } from '@example/design-system';\nimport { Input } from '@example/design-system';\nimport { Modal } from '@example/design-system';\n");
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

test("a single low-confidence import remains blocked", () => {
  const cwd = fixture();
  fs.writeFileSync(path.join(cwd, "screen.tsx"), "import { Button } from '@acme/ui';\n");
  const result = discoverDesignSystem({ cwd });
  assert.equal(result.confidence, 0.65);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.implementationAllowed, false);
  assert.equal(result.requiresUserDecision, true);
});

test("four coherent import evidences meet the implementation threshold", () => {
  const cwd = fixture();
  for (const name of ["a.tsx", "b.tsx", "c.tsx", "d.tsx"]) {
    fs.writeFileSync(path.join(cwd, name), "import { Button } from '@acme/ui';\n");
  }
  const result = discoverDesignSystem({ cwd });
  assert.equal(result.status, "resolved");
  assert.equal(result.provider, "@acme/ui");
  assert.ok(result.confidence >= 0.8);
  assert.equal(result.implementationAllowed, true);
});

test("JSON and YAML Design Profiles take precedence over installed dependencies and imports", () => {
  for (const extension of ["json", "yaml", "yml"]) {
    const cwd = fixture();
    fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ dependencies: { "@installed/ui": "1.0.0" } }));
    fs.writeFileSync(path.join(cwd, "screen.tsx"), "import { Button } from '@imported/ui';\n");
    const profile = extension === "json"
      ? JSON.stringify({ version: 1, product: { name: "Portal", kind: "portal" }, designSystem: { provider: "@profile/json" }, design: { creativity: "low", personality: ["clear"] } })
      : `version: 1\nproduct:\n  name: Portal\n  kind: portal\ndesignSystem:\n  provider: '@profile/${extension}'\ndesign:\n  creativity: low\n  personality:\n    - clear\n`;
    fs.writeFileSync(path.join(cwd, `design-profile.${extension}`), profile);
    const result = discoverDesignSystem({ cwd });
    assert.equal(result.status, "resolved");
    assert.equal(result.provider, `@profile/${extension}`);
    assert.equal(result.evidence[0].type, "design-profile");
  }
});

test("configured Design Profile paths are discovered without assuming a package layout", () => {
  const cwd = fixture();
  fs.mkdirSync(path.join(cwd, "config"));
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({
    frontendExcellence: { designProfile: "config/identity.json" }
  }));
  fs.writeFileSync(path.join(cwd, "config", "identity.json"), JSON.stringify({ designSystem: { provider: "configured-system" } }));
  const result = discoverDesignSystem({ cwd });
  assert.equal(result.status, "resolved");
  assert.equal(result.provider, "configured-system");
  assert.match(result.evidence[0].path, /config[\\/]identity\.json/u);
});

test("task scope resolves local evidence before global evidence", () => {
  const cwd = fixture();
  fs.mkdirSync(path.join(cwd, "src", "admin"), { recursive: true });
  fs.mkdirSync(path.join(cwd, "src", "checkout"), { recursive: true });
  for (const name of ["a.tsx", "b.tsx", "c.tsx", "d.tsx"]) {
    fs.writeFileSync(path.join(cwd, "src", "admin", name), "import { Button } from '@admin/ui';\n");
  }
  for (const name of ["a.tsx", "b.tsx", "c.tsx", "d.tsx"]) {
    fs.writeFileSync(path.join(cwd, "src", "checkout", name), "import { Button } from '@checkout/ui';\n");
  }
  const result = discoverDesignSystem({ cwd, taskScope: "src/checkout" });
  assert.equal(result.status, "resolved");
  assert.equal(result.provider, "@checkout/ui");
});

test("conflicting evidence inside the task scope remains ambiguous", () => {
  const cwd = fixture();
  fs.mkdirSync(path.join(cwd, "src", "feature"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "src", "feature", "a.tsx"), "import { A } from '@one/ui';\n");
  fs.writeFileSync(path.join(cwd, "src", "feature", "b.tsx"), "import { B } from '@two/ui';\n");
  fs.writeFileSync(path.join(cwd, "global.tsx"), "import { Global } from '@global/ui';\n".repeat(4));
  const result = discoverDesignSystem({ cwd, taskScope: "src/feature" });
  assert.equal(result.status, "ambiguous");
  assert.equal(result.implementationAllowed, false);
  assert.equal(result.requiresUserDecision, true);
});

test("installed dependencies without imports do not resolve a system", () => {
  const cwd = fixture();
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ dependencies: { "@acme/design-system": "1.0.0" } }));
  const result = discoverDesignSystem({ cwd });
  assert.equal(result.status, "unresolved");
  assert.equal(result.implementationAllowed, false);
});
