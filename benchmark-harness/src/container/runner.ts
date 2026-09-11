/**
 * Container runner for isolated benchmark execution.
 *
 * Uses spawn with manual timeout to ensure Docker containers are
 * properly killed on timeout (execFile timeout doesn't kill containers).
 *
 * @module container/runner
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { runCmd } from '../utils/run-cmd.js';

/** Container execution options. */
export interface ContainerRunOptions {
  /** Docker image to use. */
  image: string;
  /** Working directory inside the container. */
  workDir: string;
  /** Volume mounts: host -> container. */
  mounts?: Array<{ host: string; container: string; readonly?: boolean }>;
  /** Environment variables. */
  env?: Record<string, string>;
  /** Command to execute. */
  command: string[];
  /** Timeout in milliseconds. */
  timeoutMs: number;
  /** Memory limit (e.g. '4g'). */
  memoryLimit?: string;
  /** CPU limit. */
  cpuLimit?: number;
  /** Network mode. */
  networkMode?: 'none' | 'bridge' | 'host';
}

/** Result of a container execution. */
export interface ContainerRunResult {
  /** Process exit code. */
  exitCode: number;
  /** Combined stdout + stderr. */
  output: string;
  /** Container ID (for cleanup). */
  containerId: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Whether the container was successfully cleaned up. */
  cleanedUp: boolean;
}

/** Container lifecycle management. */
export class ContainerRunner {
  private readonly image: string;
  private readonly dockerPath: string;

  constructor(options?: { image?: string; dockerPath?: string }) {
    this.image = options?.image ?? 'node:20-slim';
    this.dockerPath = options?.dockerPath ?? 'docker';
  }

  /**
   * Check if Docker is available in the environment.
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      const { stdout } = await runCmd(this.dockerPath, ['--version'], {
        timeout: 5_000,
      });
      return stdout.includes('Docker version');
    } catch {
      return false;
    }
  }

  /**
   * Run a command inside a fresh container.
   *
   * Uses spawn with manual timeout to ensure the container is killed
   * on timeout (execFile timeout only kills the docker client, not the container).
   */
  async run(options: ContainerRunOptions): Promise<ContainerRunResult> {
    const containerName = `benchmark-${randomUUID().slice(0, 8)}`;
    const startMs = Date.now();

    // Pull image if needed
    await this.pullImage(options.image ?? this.image);

    // Build docker run command (foreground, not -d)
    const args = this.buildArgs(containerName, options);

    return new Promise<ContainerRunResult>((resolve) => {
      const child = spawn(this.dockerPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeoutMs,
      });

      let stdout = '';
      let stdoutLen = 0;
      let stderr = '';
      let stderrLen = 0;
      const MAX_OUTPUT = 100 * 1024 * 1024; // 100MB

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdoutLen < MAX_OUTPUT) {
          const str = chunk.toString();
          stdout += str;
          stdoutLen += str.length;
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderrLen < MAX_OUTPUT) {
          const str = chunk.toString();
          stderr += str;
          stderrLen += str.length;
        }
      });

      // Manual timeout: kill the container if it exceeds timeoutMs
      const timer = setTimeout(async () => {
        child.kill('SIGKILL');
        await this.removeContainer(containerName);
        const durationMs = Date.now() - startMs;
        resolve({
          exitCode: 124, // timeout exit code (like `timeout` command)
          output: stdout + stderr,
          containerId: containerName,
          durationMs,
          cleanedUp: true,
        });
      }, options.timeoutMs);

      child.on('close', async (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startMs;
        // --rm handles cleanup on clean exit
        resolve({
          exitCode: code ?? 1,
          output: stdout + stderr,
          containerId: containerName,
          durationMs,
          cleanedUp: true,
        });
      });

      child.on('error', async (err) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startMs;
        const cleanedUp = await this.removeContainer(containerName);
        resolve({
          exitCode: 1,
          output: `${stdout}${stderr}\n${err.message}`,
          containerId: containerName,
          durationMs,
          cleanedUp,
        });
      });
    });
  }

  /**
   * Run a benchmark task inside an isolated container.
   */
  async runBenchmark(options: {
    task: string;
    workspace: string;
    fixturePath: string;
    command: string[];
    env?: Record<string, string>;
    timeoutMs: number;
    memoryLimit?: string;
    networkMode?: 'none' | 'bridge';
  }): Promise<ContainerRunResult> {
    const workDir = '/benchmark';
    const fixtureDir = join(workDir, 'fixture');

    return this.run({
      image: this.image,
      workDir,
      mounts: [
        { host: options.workspace, container: workDir },
        { host: options.fixturePath, container: fixtureDir, readonly: true },
      ],
      env: {
        ...options.env,
        BENCHMARK_TASK: options.task,
        BENCHMARK_FIXTURE: fixtureDir,
      },
      command: options.command,
      timeoutMs: options.timeoutMs,
      memoryLimit: options.memoryLimit,
      networkMode: options.networkMode ?? 'none',
    });
  }

  private buildArgs(containerName: string, options: ContainerRunOptions): string[] {
    const args = ['run', '--rm', '--name', containerName];

    // Network isolation for official benchmarks
    if (options.networkMode) {
      args.push(`--network=${options.networkMode}`);
    }

    // Memory limit
    if (options.memoryLimit) {
      args.push(`--memory=${options.memoryLimit}`);
    }

    // CPU limit
    if (options.cpuLimit) {
      args.push(`--cpus=${options.cpuLimit}`);
    }

    // Volume mounts
    for (const mount of options.mounts ?? []) {
      const ro = mount.readonly ? ':ro' : '';
      args.push('-v', `${mount.host}:${mount.container}${ro}`);
    }

    // Environment variables
    for (const [key, value] of Object.entries(options.env ?? {})) {
      args.push('-e', `${key}=${value}`);
    }

    // Working directory
    args.push('-w', options.workDir);

    // Image
    args.push(options.image ?? this.image);

    // Command
    args.push(...options.command);

    return args;
  }

  private async pullImage(image: string): Promise<void> {
    try {
      await runCmd(this.dockerPath, ['pull', image], {
        timeout: 120_000,
      });
    } catch {
      // Image pull failed — may already exist locally
    }
  }

  private async removeContainer(name: string): Promise<boolean> {
    try {
      await runCmd(this.dockerPath, ['rm', '-f', name], {
        timeout: 10_000,
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Container integrity check — ensures official benchmarks
 * ran in isolated containers.
 */
export async function verifyContainerIsolation(evidence: {
  container?: boolean;
  containerImage?: string;
  isolated?: boolean;
}): Promise<{ valid: boolean; reason?: string }> {
  if (!evidence.container) {
    return {
      valid: false,
      reason: 'Official benchmark requires container isolation (--container=true)',
    };
  }

  if (!evidence.containerImage) {
    return {
      valid: false,
      reason: 'Container image must be specified for official benchmarks',
    };
  }

  if (evidence.isolated === false) {
    return {
      valid: false,
      reason: 'Official benchmark must be isolated (isolated=true)',
    };
  }

  return { valid: true };
}
