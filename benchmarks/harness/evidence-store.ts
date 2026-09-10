import fs from "node:fs";
import path from "node:path";

export interface EvidenceDir {
  runId: string;
  baseDir: string;
  agent: { events: string; stdout: string; stderr: string; session: string };
  workspace: { before: string; after: string; diff: string; status: string };
  verifier: { acceptance: string; stdout: string; stderr: string };
  normalized: { usage: string; tools: string; files: string; result: string };
  hashes: { protectedBefore: string; protectedAfter: string };
}

const CATEGORIES = {
  agent: ["events", "stdout", "stderr", "session"],
  workspace: ["before", "after", "diff", "status"],
  verifier: ["acceptance", "stdout", "stderr"],
  normalized: ["usage", "tools", "files", "result"],
  hashes: ["protectedBefore", "protectedAfter"],
} as const;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

class EvidenceStore {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    ensureDir(baseDir);
  }

  async createRun(runId: string): Promise<EvidenceDir> {
    const runDir = path.join(this.baseDir, runId);
    ensureDir(runDir);

    const dirs: EvidenceDir = {
      runId,
      baseDir: runDir,
      agent: { events: "", stdout: "", stderr: "", session: "" },
      workspace: { before: "", after: "", diff: "", status: "" },
      verifier: { acceptance: "", stdout: "", stderr: "" },
      normalized: { usage: "", tools: "", files: "", result: "" },
      hashes: { protectedBefore: "", protectedAfter: "" },
    };

    for (const [category, files] of Object.entries(CATEGORIES)) {
      const catDir = path.join(runDir, category);
      ensureDir(catDir);
      const categoryRecord = dirs[category as keyof typeof CATEGORIES] as Record<string, string>;
      for (const filename of files) {
        const filePath = path.join(catDir, filename);
        categoryRecord[filename] = filePath;
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, "", "utf8");
        }
      }
    }

    return dirs;
  }

  async saveRaw(runId: string, category: string, filename: string, data: Buffer | string): Promise<void> {
    const filePath = path.join(this.baseDir, runId, category, filename);
    ensureDir(path.dirname(filePath));
    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(filePath, data);
    } else {
      fs.writeFileSync(filePath, data, "utf8");
    }
  }

  async saveNormalized(runId: string, data: Record<string, unknown>): Promise<void> {
    const filePath = path.join(this.baseDir, runId, "normalized", "result.json");
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  }

  async loadRun(runId: string): Promise<EvidenceDir> {
    const runDir = path.join(this.baseDir, runId);
    if (!fs.existsSync(runDir)) {
      throw new Error(`Evidence run not found: ${runId}`);
    }

    const dirs: EvidenceDir = {
      runId,
      baseDir: runDir,
      agent: { events: "", stdout: "", stderr: "", session: "" },
      workspace: { before: "", after: "", diff: "", status: "" },
      verifier: { acceptance: "", stdout: "", stderr: "" },
      normalized: { usage: "", tools: "", files: "", result: "" },
      hashes: { protectedBefore: "", protectedAfter: "" },
    };

    for (const [category, files] of Object.entries(CATEGORIES)) {
      const catDir = path.join(runDir, category);
      const categoryRecord = dirs[category as keyof typeof CATEGORIES] as Record<string, string>;
      for (const filename of files) {
        const filePath = path.join(catDir, filename);
        categoryRecord[filename] = fs.existsSync(filePath) ? filePath : "";
      }
    }

    return dirs;
  }

  async freeze(runId: string): Promise<void> {
    const runDir = path.join(this.baseDir, runId);
    if (!fs.existsSync(runDir)) {
      throw new Error(`Evidence run not found: ${runId}`);
    }

    const freezeMarker = path.join(runDir, ".frozen");
    fs.writeFileSync(freezeMarker, new Date().toISOString(), "utf8");
  }
}

export { EvidenceStore };
