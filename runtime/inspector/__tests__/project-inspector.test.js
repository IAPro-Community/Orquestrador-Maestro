"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const { inspectProject } = require("../project-inspector");

test("project-inspector identifies frameworks and package managers correctly", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "maestro-inspector-"));

  try {
    // Mock package.json
    await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({
      dependencies: {
        "react": "^18.0.0",
        "express": "^4.0.0"
      },
      devDependencies: {
        "typescript": "^5.0.0",
        "jest": "^29.0.0"
      }
    }));

    // Mock source files
    await fs.writeFile(path.join(tmpDir, "index.ts"), "console.log('hi');");
    await fs.writeFile(path.join(tmpDir, "app.js"), "console.log('js');");

    const snapshot = await inspectProject(tmpDir, "proj-1");

    assert.equal(snapshot.kind, "project_snapshot");
    assert.equal(snapshot.projectId, "proj-1");

    // Package managers
    assert.ok(snapshot.packageManagers.includes("npm"), "npm should be identified because of package.json");

    // Frameworks
    assert.ok(snapshot.frameworks.includes("react"));
    assert.ok(snapshot.frameworks.includes("express"));

    // Languages
    assert.ok(snapshot.languages.includes("typescript"));
    assert.ok(snapshot.languages.includes("javascript"));

    // Tests
    assert.equal(snapshot.tests, "jest");

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
