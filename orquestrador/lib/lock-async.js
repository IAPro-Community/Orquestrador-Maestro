"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { releaseLock, tryRecoverStaleLock } = require("./lock");

const LOCK_STALE_MS = 30000;
const LOCK_TIMEOUT_MS = 30000;
const LOCK_RETRY_MS = 50;

// Serialize contenders inside this process without blocking its event loop.
const asyncMutexes = new Map();
function acquireAsyncMutex(key) {
  const previous = asyncMutexes.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const chained = previous.then(() => current);
  asyncMutexes.set(key, chained);
  chained.then(() => {
    if (asyncMutexes.get(key) === chained) asyncMutexes.delete(key);
  }, () => {});
  return { ready: previous, release };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquireLockNonBlocking(lockPath) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  const ownerId = crypto.randomBytes(8).toString("hex");
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), ownerId }), {
        flag: "wx", mode: 0o600
      });
      return { ownerId };
    } catch (error) {
      const contention = error.code === "EEXIST" ||
        (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code));
      if (!contention) throw error;
      try {
        const [current, stat] = await Promise.all([
          fs.readFile(lockPath, "utf8").then((raw) => JSON.parse(raw)),
          fs.stat(lockPath)
        ]);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          let alive = true; // Fail closed for permission errors or ambiguous PIDs.
          try { process.kill(current.pid, 0); }
          catch (error) { if (error.code === "ESRCH") alive = false; }
          if (!alive) tryRecoverStaleLock(lockPath, current);
        }
      } catch {
        // Another process may still be writing the lock or releasing it.
      }
      await delay(LOCK_RETRY_MS + Math.floor(Math.random() * LOCK_RETRY_MS));
    }
  }
  throw new Error("Failed to acquire lock after timeout: " + lockPath);
}

async function withLockAsync(lockPath, fn) {
  const { ready, release } = acquireAsyncMutex(path.resolve(lockPath));
  await ready;
  try {
    const { ownerId } = await acquireLockNonBlocking(lockPath);
    try {
      return await fn();
    } finally {
      releaseLock(lockPath, ownerId);
    }
  } finally {
    release();
  }
}

module.exports = { withLockAsync };
