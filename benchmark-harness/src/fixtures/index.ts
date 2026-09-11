/**
 * Golden fixture management.
 *
 * Handles hashing, copying, and integrity validation of benchmark fixtures.
 * @module fixtures
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, copyFile, mkdir, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Recursively list all files under a directory.
 */
async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Compute SHA-256 hash of all files in a fixture directory.
 *
 * Files are sorted by relative path for deterministic hashing.
 * The hash covers both file paths and their contents.
 *
 * @param fixturePath  Path to the fixture directory.
 * @returns            Hex-encoded SHA-256 hash string.
 */
export async function hashFixture(fixturePath: string): Promise<string> {
  const hash = createHash('sha256');
  const files = await listFiles(fixturePath);

  // Sort by relative path for determinism.
  files.sort();

  for (const filePath of files) {
    const relativePath = filePath.slice(fixturePath.length);
    const content = await readFile(filePath);
    hash.update(relativePath);
    hash.update('\0');
    hash.update(content);
    hash.update('\n');
  }

  return hash.digest('hex');
}

/**
 * Copy a fixture directory to a temporary location.
 *
 * Creates a unique temp directory and copies all fixture files into it.
 *
 * @param fixturePath  Path to the source fixture directory.
 * @returns            Path to the temporary copy.
 */
export async function copyFixtureToTemp(fixturePath: string, runId?: string): Promise<string> {
  const suffix = runId ? `-${runId}` : '';
  const tempDir = join(tmpdir(), `fixture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${suffix}`);

  // Remove any stale temp dir (shouldn't exist, but defensive).
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore.
  }

  await mkdir(tempDir, { recursive: true });
  await copyDir(fixturePath, tempDir);

  return tempDir;
}

/**
 * Recursively copy a directory.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * Validate fixture integrity by comparing the current hash against expected.
 *
 * @param fixturePath   Path to the fixture directory.
 * @param expectedHash  Expected SHA-256 hash.
 * @returns             true if hashes match, false otherwise.
 */
export async function validateFixtureIntegrity(
  fixturePath: string,
  expectedHash: string,
): Promise<boolean> {
  try {
    const actualHash = await hashFixture(fixturePath);
    return actualHash === expectedHash;
  } catch {
    return false;
  }
}
