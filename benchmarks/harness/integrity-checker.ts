import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface FileHash {
  path: string;
  sha256: string;
  size: number;
}

export interface IntegrityResult {
  clean: boolean;
  violations: string[];
}

const PROTECTED_PATTERNS = [
  "test/**/*.test.js",
  "test/**/*.test.ts",
  "test/**/*.spec.js",
  "test/**/*.spec.ts",
  "package.json",
  "tsconfig.json",
  ".eslintrc*",
  "jest.config.*",
  "vitest.config.*",
  ".mocharc.*",
  "*.config.js",
  "*.config.ts",
];

function computeFileHash(filePath: string): FileHash {
  const content = fs.readFileSync(filePath);
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");
  const stat = fs.statSync(filePath);
  return { path: filePath, sha256, size: stat.size };
}

function isProtectedFile(filePath: string): boolean {
  const relativePath = filePath;
  return PROTECTED_PATTERNS.some((pattern) => {
    const regex = new RegExp(
      "^" +
        pattern
          .replace(/\*\*/g, ".*")
          .replace(/\*/g, "[^/]*")
          .replace(/\?/g, "[^/]")
          .replace(/\./g, "\\.") +
        "$"
    );
    return regex.test(relativePath);
  });
}

function findProtectedFiles(workspace: string): string[] {
  const results: string[] = [];

  function walkDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".planning") continue;
        walkDir(fullPath);
      } else {
        const relativePath = path.relative(workspace, fullPath);
        if (isProtectedFile(relativePath)) {
          results.push(fullPath);
        }
      }
    }
  }

  walkDir(workspace);
  return results;
}

class IntegrityChecker {
  computeProtectedHashes(workspace: string): FileHash[] {
    const files = findProtectedFiles(workspace);
    return files.map((f) => computeFileHash(f));
  }

  verifyIntegrity(before: FileHash[], after: FileHash[]): IntegrityResult {
    const violations: string[] = [];

    const beforeMap = new Map(before.map((f) => [f.path, f]));
    const afterMap = new Map(after.map((f) => [f.path, f]));

    // Check for modified protected files
    for (const [filePath, beforeHash] of beforeMap) {
      const afterHash = afterMap.get(filePath);
      if (!afterHash) {
        violations.push(`Protected file deleted: ${filePath}`);
        continue;
      }
      if (beforeHash.sha256 !== afterHash.sha256) {
        violations.push(`Protected file modified: ${filePath} (hash changed)`);
      }
    }

    // Check for newly added protected files
    for (const [filePath] of afterMap) {
      if (!beforeMap.has(filePath)) {
        violations.push(`New protected file added: ${filePath}`);
      }
    }

    return {
      clean: violations.length === 0,
      violations,
    };
  }
}

export { IntegrityChecker };
