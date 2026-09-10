import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ContainerRunner, verifyContainerIsolation } from '../../src/container/runner.js';

const execFileAsync = promisify(execFile);

async function binaryExists(name: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(name, ['--version'], { timeout: 3_000 });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

const hasDocker = await binaryExists('docker');

describe('ContainerRunner', () => {
  describe('constructor', () => {
    it('sets defaults when no options provided', () => {
      const runner = new ContainerRunner();
      assert.ok(runner);
    });

    it('uses provided image and dockerPath', () => {
      const runner = new ContainerRunner({
        image: 'node:18-alpine',
        dockerPath: '/usr/bin/docker',
      });
      assert.ok(runner);
    });
  });

  describe('isDockerAvailable', () => {
    it('returns false when docker binary not found', async () => {
      const runner = new ContainerRunner({
        dockerPath: 'nonexistent-docker-xyz-123',
      });
      const available = await runner.isDockerAvailable();
      assert.equal(available, false);
    });

    it('returns true when docker is installed', { skip: hasDocker ? false : 'docker not installed' }, async () => {
      const runner = new ContainerRunner();
      const available = await runner.isDockerAvailable();
      assert.equal(available, true);
    });
  });

  describe('verifyContainerIsolation', () => {
    it('validates correct container isolation', async () => {
      const result = await verifyContainerIsolation({
        container: true,
        containerImage: 'node:20-slim',
        isolated: true,
      });
      assert.equal(result.valid, true);
      assert.equal(result.reason, undefined);
    });

    it('rejects when container is false', async () => {
      const result = await verifyContainerIsolation({
        container: false,
        containerImage: 'node:20-slim',
        isolated: true,
      });
      assert.equal(result.valid, false);
      assert.ok(result.reason);
      assert.ok(result.reason.includes('container isolation'));
    });

    it('rejects when containerImage is missing', async () => {
      const result = await verifyContainerIsolation({
        container: true,
        isolated: true,
      });
      assert.equal(result.valid, false);
      assert.ok(result.reason);
      assert.ok(result.reason.includes('image'));
    });

    it('rejects when isolated is false', async () => {
      const result = await verifyContainerIsolation({
        container: true,
        containerImage: 'node:20-slim',
        isolated: false,
      });
      assert.equal(result.valid, false);
      assert.ok(result.reason);
      assert.ok(result.reason.includes('isolated'));
    });

    it('rejects when container is undefined', async () => {
      const result = await verifyContainerIsolation({});
      assert.equal(result.valid, false);
      assert.ok(result.reason);
    });

    it('validates when only container and image are provided (isolated defaults to undefined)', async () => {
      const result = await verifyContainerIsolation({
        container: true,
        containerImage: 'node:20-slim',
      });
      assert.equal(result.valid, true);
    });
  });
});
