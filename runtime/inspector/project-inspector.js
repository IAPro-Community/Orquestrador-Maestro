"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createProjectSnapshot } = require("../core/entities");

/**
 * Inspects a project directory and builds a ProjectSnapshot.
 * @param {string} workspaceRoot
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
async function inspectProject(workspaceRoot, projectId) {
  const snapshot = {
    projectId,
    languages: [],
    frameworks: [],
    packageManagers: [],
    architecture: "unknown",
    frontend: "unknown",
    backend: "unknown",
    tests: "unknown",
    skills: [],
    timestamp: new Date()
  };

  try {
    const packageJsonPath = path.join(workspaceRoot, "package.json");
    const packageData = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(packageData);

    snapshot.packageManagers.push("npm"); // Simplification for now

    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {})
    };

    if (allDeps["react"]) snapshot.frameworks.push("react");
    if (allDeps["express"]) snapshot.frameworks.push("express");
    if (allDeps["next"]) snapshot.frameworks.push("next");
    if (allDeps["vue"]) snapshot.frameworks.push("vue");
    if (allDeps["@nestjs/core"]) snapshot.frameworks.push("nestjs");

    if (allDeps["jest"]) snapshot.tests = "jest";
    else if (allDeps["vitest"]) snapshot.tests = "vitest";

    if (allDeps["typescript"]) snapshot.languages.push("typescript");

  } catch (error) {
    // No package.json or unreadable
  }

  try {
    const files = await fs.readdir(workspaceRoot);
    let hasJs = false;
    let hasTs = false;
    let hasPy = false;
    let hasGo = false;

    for (const file of files) {
      if (file.endsWith(".js") || file.endsWith(".jsx")) hasJs = true;
      if (file.endsWith(".ts") || file.endsWith(".tsx")) hasTs = true;
      if (file.endsWith(".py")) hasPy = true;
      if (file.endsWith(".go")) hasGo = true;
    }

    if (hasJs && !snapshot.languages.includes("javascript")) snapshot.languages.push("javascript");
    if (hasTs && !snapshot.languages.includes("typescript")) snapshot.languages.push("typescript");
    if (hasPy && !snapshot.languages.includes("python")) snapshot.languages.push("python");
    if (hasGo && !snapshot.languages.includes("go")) snapshot.languages.push("go");

  } catch (error) {
    // Ignore read errors
  }

  // Use core entities to strictly validate and freeze
  return createProjectSnapshot(snapshot);
}

module.exports = {
  inspectProject
};
