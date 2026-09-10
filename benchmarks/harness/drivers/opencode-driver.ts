import { execFile, type ExecFileException } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { AgentDriver } from "./agent-driver";
import type { Scenario, RunOptions, DriverResult, TokenUsage, ToolUsage, TokenSource } from "../types";

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface NdjsonEvent {
  type?: string;
  event?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    reasoning_tokens?: number;
  };
  model?: string;
  session?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ParsedNdjson {
  usage: TokenUsage | null;
  tools: ToolUsage | null;
  session: Record<string, unknown> | null;
  events: NdjsonEvent[];
}

interface OpenCodeVersion {
  version: string;
  binaryHash: string | null;
  installSource: string;
}

interface ExecutionEvidence {
  executionType: "real-execution";
  tokenSource: TokenSource;
  isolated: boolean;
  reproducible: boolean;
  version: OpenCodeVersion | null;
  filesChanged: string[];
}

interface ParsedOutput {
  usage: TokenUsage | null;
  tools: ToolUsage | null;
  session: Record<string, unknown> | null;
}

class OpenCodeDriver extends AgentDriver {
  private childPid: number | null = null;

  get name(): string {
    return "opencode";
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this._execFilePromise("which", ["opencode"]);
      return true;
    } catch {
      return false;
    }
  }

  async detectVersion(): Promise<OpenCodeVersion> {
    let version = "unknown";
    let binaryHash: string | null = null;
    let installSource = "unknown";

    try {
      const versionOutput = await this._execFilePromise("opencode", ["--version"]);
      version = versionOutput.trim().replace(/^opencode\s+/, "") || "unknown";
    } catch {
      // version detection failed
    }

    try {
      const binaryPath = await this._execFilePromise("which", ["opencode"]);
      const resolvedPath = binaryPath.trim();
      if (existsSync(resolvedPath)) {
        const binaryContent = readFileSync(resolvedPath);
        binaryHash = createHash("sha256").update(binaryContent).digest("hex");
      }
    } catch {
      // hash detection failed
    }

    try {
      const npmGlobal = execSync("npm list -g opencode --depth=0 2>/dev/null", {
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
      if (npmGlobal.includes("opencode")) {
        installSource = "npm-global";
        return { version, binaryHash, installSource };
      }
    } catch {
      // not npm global
    }

    try {
      const brewCheck = execSync("brew list opencode 2>/dev/null", {
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
      if (brewCheck.length > 0) {
        installSource = "homebrew";
        return { version, binaryHash, installSource };
      }
    } catch {
      // not homebrew
    }

    try {
      const cargoCheck = execSync("cargo install --list 2>/dev/null | grep opencode", {
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
      if (cargoCheck.includes("opencode")) {
        installSource = "cargo";
        return { version, binaryHash, installSource };
      }
    } catch {
      // not cargo
    }

    return { version, binaryHash, installSource };
  }

  async validateModel(model: string): Promise<{ valid: boolean; reason?: string }> {
    const parts = model.split("/");
    const provider = parts.length > 1 ? parts[0] : "unknown";

    try {
      const result = await this._execFilePromise("opencode", [
        "models",
        "--format", "json",
      ]);
      const models = JSON.parse(result) as Array<{ id: string; provider?: string }>;
      const found = models.some(
        (m) => m.id === model || m.id.endsWith(`/${model}`)
      );
      if (!found) {
        return { valid: false, reason: `Model "${model}" not found in available models` };
      }
      return { valid: true };
    } catch {
      return { valid: true };
    }
  }

  buildMessage(scenario: Scenario, condition: string): string {
    let message = scenario.prompt;

    if (condition === "maestro-core") {
      message =
        `You are working with the Orquestrador Maestro.\n\n` +
        `Rules:\n` +
        `- Use minimal sufficient context\n` +
        `- Verify results before declaring completion\n` +
        `- Do not commit without authorization\n\n` +
        `Flow: Observe → Route → Select → Act → Verify → Report\n\n` +
        `Task: ${scenario.prompt}`;
    }

    return message;
  }

  async execute(scenario: Scenario, options: RunOptions): Promise<DriverResult> {
    const startTime = Date.now();
    const message = this.buildMessage(scenario, options.condition);

    const args = [
      "run",
      message,
      "--format", "ndjson",
      "--model", options.model,
      "--dir", options.workDir,
      "--auto",
    ];

    if (options.variant) {
      args.push("--variant", options.variant);
    }

    const timeoutMs = options.timeoutMs || 120000;
    const result = await this.execOpencode(args, timeoutMs);
    const durationMs = Date.now() - startTime;

    const parsed = this.parseNdjsonOutput(result.stdout);
    const filesChanged = this.detectFilesChanged(options.workDir);

    return {
      success: result.exitCode === 0,
      error: result.exitCode !== 0 ? result.stderr.slice(-1000) : null,
      usage: parsed.usage || {
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        reasoningTokens: null,
        totalTokens: null,
        tokenSource: "unknown",
        confidence: 0,
      },
      durationMs,
      evidence: this.collectEvidence(result, parsed, options),
      tools: parsed.tools || {
        calls: 0,
        filesRead: 0,
        filesModified: 0,
        filesCreated: 0,
        filesDeleted: 0,
      },
      stdout: result.stdout.slice(-5000),
      session: parsed.session || undefined,
    };
  }

  collectEvidence(
    result: ExecResult,
    parsed: ParsedNdjson,
    options: RunOptions
  ): ExecutionEvidence {
    const hasProviderTokens = parsed.usage != null &&
      parsed.usage.tokenSource === "provider-reported";

    const tokenSource: TokenSource = hasProviderTokens
      ? "provider-reported"
      : "unknown";

    return {
      executionType: "real-execution",
      tokenSource,
      isolated: options.useContainer === true,
      reproducible: true,
      version: null,
      filesChanged: [],
    };
  }

  async cleanup(): Promise<void> {
    if (this.childPid != null) {
      try {
        process.kill(this.childPid, "SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          process.kill(this.childPid, "SIGKILL");
        } catch {
          // process already dead
        }
      } catch {
        // process already dead or not accessible
      }
      this.childPid = null;
    }
  }

  private _execFilePromise(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(cmd, args, (error: ExecFileException | null, stdout: string) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }

  private execOpencode(args: string[], timeoutMs: number): Promise<ExecResult> {
    return new Promise((resolve) => {
      const child = execFile(
        "opencode",
        args,
        {
          encoding: "utf8",
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error: ExecFileException | null, stdout: string, stderr: string) => {
          this.childPid = null;
          resolve({
            exitCode: error ? ((error as NodeJS.ErrnoException).errno ?? 1) : 0,
            stdout: stdout || "",
            stderr: stderr || "",
          });
        }
      );

      if (child.pid) {
        this.childPid = child.pid;
      }
    });
  }

  parseNdjsonOutput(stdout: string): ParsedNdjson {
    const lines = stdout.trim().split("\n").filter((l) => l.length > 0);
    const events: NdjsonEvent[] = [];
    let bestUsage: TokenUsage | null = null;
    let tools: ToolUsage | null = null;
    let session: Record<string, unknown> | null = null;

    let toolCalls = 0;
    let filesRead = 0;
    let filesModified = 0;
    let filesCreated = 0;
    let filesDeleted = 0;

    for (const line of lines) {
      try {
        const event = JSON.parse(line) as NdjsonEvent;
        events.push(event);

        if (event.session) {
          session = event.session;
        }

        if (event.type === "tool_use" || event.event === "tool_use") {
          toolCalls++;
        }
        if (event.type === "tool_result" || event.event === "tool_result") {
          const toolName = (event as Record<string, unknown>).tool as string | undefined;
          if (toolName === "read" || toolName === "Read") filesRead++;
          if (toolName === "write" || toolName === "Write") filesCreated++;
          if (toolName === "edit" || toolName === "Edit") filesModified++;
          if (toolName === "bash" || toolName === "Bash") {
            // bash could be any of the above; skip
          }
        }

        if (event.usage) {
          const u = event.usage;
          const inputTokens = u.input_tokens ?? u.prompt_tokens ?? null;
          const outputTokens = u.output_tokens ?? u.completion_tokens ?? null;
          const cacheRead = u.cache_read_input_tokens ?? null;
          const cacheWrite = u.cache_creation_input_tokens ?? null;
          const reasoning = u.reasoning_tokens ?? null;
          const total = u.total_tokens ??
            (inputTokens != null && outputTokens != null
              ? inputTokens + outputTokens + (reasoning ?? 0)
              : null);

          const usage: TokenUsage = {
            inputTokens,
            outputTokens,
            cachedTokens: cacheRead,
            reasoningTokens: reasoning,
            totalTokens: total,
            tokenSource: "provider-reported",
            confidence: 0.95,
          };

          if (!bestUsage || (total ?? 0) > (bestUsage.totalTokens ?? 0)) {
            bestUsage = usage;
          }
        }
      } catch {
        // skip non-JSON lines
      }
    }

    if (toolCalls > 0 || filesRead > 0 || filesModified > 0 || filesCreated > 0 || filesDeleted > 0) {
      tools = {
        calls: toolCalls,
        filesRead,
        filesModified,
        filesCreated,
        filesDeleted,
      };
    }

    return { usage: bestUsage, tools, session, events };
  }

  private detectFilesChanged(workDir: string): string[] {
    try {
      const output = execSync("git diff --name-only", {
        cwd: workDir,
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
      if (!output) return [];
      return output.split("\n").filter((l) => l.length > 0);
    } catch {
      return [];
    }
  }

  parseOutput(stdout: string): ParsedOutput {
    const parsed = this.parseNdjsonOutput(stdout);
    return {
      usage: parsed.usage,
      tools: parsed.tools,
      session: parsed.session,
    };
  }
}

export { OpenCodeDriver };
