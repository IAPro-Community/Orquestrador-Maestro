/**
 * Evidence model — raw artifacts produced by agent and verifier runs.
 * @module evidence
 */

/** File-level evidence captured during a benchmark run. */
export interface EvidenceFile {
  /** Relative path inside the evidence directory. */
  path: string;
  /** SHA-256 hash of the file contents. */
  hash: string;
  /** MIME type when known. */
  mimeType?: string;
}

/** Filesystem snapshot of the workspace after an agent run. */
export interface FilesystemEvidence {
  /** Files created or modified by the agent. */
  created?: string[];
  /** Files deleted by the agent. */
  deleted?: string[];
  /** Files whose content changed. */
  modified?: string[];
  /** Full git diff (unified format). */
  gitDiff?: string;
}

/** Git commit produced (or intended) during the run. */
export interface GitEvidence {
  /** Commit SHA if the agent committed. */
  commitSha?: string;
  /** Branch name. */
  branch?: string;
  /** Whether the working tree is clean after the run. */
  clean?: boolean;
}

/**
 * Complete evidence bundle for a single benchmark run.
 *
 * Evidence is the ground truth for scoring — it is never inferred
 * and must be captured verbatim from agent and verifier execution.
 */
export interface RunEvidenceBundle {
  /** Run identifier this evidence belongs to. */
  runId: string;
  /** Scenario identifier. */
  scenarioId: string;
  /** Directory containing all raw evidence. */
  rawDir: string;
  /** Individual evidence files. */
  files?: EvidenceFile[];
  /** Agent process output (stdout + stderr combined). */
  agentOutput: string;
  /** Agent process exit code. */
  agentExitCode?: number;
  /** Verifier process output (stdout + stderr combined). */
  verifierOutput: string;
  /** Verifier process exit code. */
  verifierExitCode?: number;
  /** Filesystem changes observed. */
  filesystem?: FilesystemEvidence;
  /** Git state after the run. */
  git?: GitEvidence;
  /** Path to the agent session file. */
  sessionFile?: string;
  /** ISO-8601 timestamp when evidence was captured. */
  capturedAt: string;
}
