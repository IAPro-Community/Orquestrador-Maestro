/**
 * AgentDriver interface — contract for benchmark agent drivers.
 * @module driver
 */

import type { TokenUsage } from './tokens.js';

/** Options passed to {@link AgentDriver.execute}. */
export interface DriverExecuteOptions {
  /** Working directory for the agent execution. */
  workspace: string;
  /** Relative path to the golden fixture directory. */
  fixture: string;
  /** Wall-clock timeout in milliseconds. */
  timeoutMs: number;
  /** Model identifier to use (e.g. `'claude-sonnet-4-20250514'`). */
  model: string;
  /** Additional environment variables for the isolated condition. */
  env?: Record<string, string>;
}

/** Tool usage statistics extracted from agent execution. */
export interface ToolUsage {
  /** Total tool calls made. */
  calls: number;
  /** Number of files read. */
  filesRead: number;
  /** Number of files modified. */
  filesModified: number;
  /** Number of files created. */
  filesCreated: number;
  /** Number of files deleted. */
  filesDeleted: number;
}

/** Result returned by {@link AgentDriver.execute}. */
export interface DriverResult {
  /** Combined stdout + stderr output. */
  output: string;
  /** Process exit code (0 = success). */
  exitCode: number;
  /** Token usage reported by the driver (null if unavailable). */
  tokens: TokenUsage | null;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Path to the session file captured during execution. */
  sessionFile: string;
  /** Raw agent output (may differ from `output` when post-processed). */
  agentOutput: string;
  /** Tool usage statistics (null if unavailable). */
  toolUsage: ToolUsage | null;
}

/**
 * Contract that every agent driver must implement.
 *
 * A driver is responsible for translating a benchmark task into
 * provider-specific API calls (or CLI invocations) and capturing
 * the resulting output, token usage, and session artifacts.
 */
export interface AgentDriver {
  /** Human-readable driver name (e.g. `'opencode'`, `'claude'`). */
  name: string;
  /** SemVer version string. */
  version: string;

  /**
   * Execute a benchmark task.
   *
   * @param task    - The exact prompt / instruction to send to the agent.
   * @param options - Execution options (workspace, fixture, timeout, model).
   * @returns       - The result of the agent execution.
   */
  execute(task: string, options: DriverExecuteOptions): Promise<DriverResult>;

  /**
   * Check whether this driver is available in the current environment.
   *
   * @returns `true` if the driver can be used, `false` otherwise.
   */
  isAvailable(): Promise<boolean>;

  /**
   * (Optional) Extract token usage from a session file.
   *
   * Drivers that natively track tokens can implement this to allow
   * post-hoc extraction without re-executing the agent.
   *
   * @param sessionFile - Path to the session file.
   * @returns           - Token usage if parseable, otherwise `null`.
   */
  getTokenUsage?(sessionFile: string): Promise<TokenUsage | null>;
}
