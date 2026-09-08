#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const LOCK_STALE_MS = 30000;
const LOCK_RETRY_MS = 50;
// Cross-process writes can queue behind several short observations on slower
// Windows filesystems; keep the lock bounded but long enough to avoid drops.
const LOCK_MAX_RETRIES = 600;

function acquireLock(lockPath) {
  const dir = path.dirname(lockPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const ownerId = crypto.randomBytes(8).toString("hex");
  const deadline = Date.now() + LOCK_RETRY_MS * LOCK_MAX_RETRIES;

  while (Date.now() < deadline) {
    try {
      const lockData = JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), ownerId });
      fs.writeFileSync(lockPath, lockData, { flag: "wx", mode: 0o600 });
      return { ownerId };
    } catch (err) {
      // Windows may report a sharing violation as EPERM/EACCES and make
      // existsSync(lockPath) return false while the competing lock is open.
      const windowsContention = process.platform === "win32"
        && (err.code === "EPERM" || err.code === "EACCES");
      const lockExists = err.code === "EEXIST"
        || windowsContention
        || ((err.code === "EPERM" || err.code === "EACCES") && fs.existsSync(lockPath));
      if (lockExists) {
        try {
          const content = fs.readFileSync(lockPath, "utf8").trim();
          const lock = JSON.parse(content);
          const lockAge = fs.statSync(lockPath).mtimeMs;
          const age = Date.now() - lockAge;

          if (age > LOCK_STALE_MS) {
            let pidAlive = false;
            try {
              process.kill(lock.pid, 0);
              pidAlive = true;
            } catch {
              pidAlive = false;
            }

            if (!pidAlive) {
              tryRecoverStaleLock(lockPath, lock);
            }
          }
        } catch {}
        const jitter = Math.floor(Math.random() * LOCK_RETRY_MS);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS + jitter);
      } else {
        throw err;
      }
    }
  }

  throw new Error(`Failed to acquire lock after timeout: ${lockPath}`);
}

function tryRecoverStaleLock(lockPath, originalLock) {
  const recoveryPath = `${lockPath}.recovery`;
  let recoveryLock = null;

  try {
    const recoveryData = JSON.stringify({
      pid: process.pid,
      createdAt: new Date().toISOString(),
      ownerId: crypto.randomBytes(8).toString("hex"),
      recovering: lockPath
    });
    fs.writeFileSync(recoveryPath, recoveryData, { flag: "wx", mode: 0o600 });
    recoveryLock = JSON.parse(recoveryData);
  } catch {
    return false;
  }

  try {
    let currentContent;
    try {
      currentContent = fs.readFileSync(lockPath, "utf8").trim();
    } catch {
      return false;
    }

    let currentLock;
    try {
      currentLock = JSON.parse(currentContent);
    } catch {
      return false;
    }

    if (currentLock.ownerId !== originalLock.ownerId) {
      return false;
    }

    let pidAlive = false;
    try {
      process.kill(currentLock.pid, 0);
      pidAlive = true;
    } catch {
      pidAlive = false;
    }

    if (pidAlive) {
      return false;
    }

    try {
      const verifyContent = fs.readFileSync(lockPath, "utf8").trim();
      const verifyLock = JSON.parse(verifyContent);
      if (verifyLock.ownerId !== originalLock.ownerId) {
        return false;
      }
      fs.unlinkSync(lockPath);
      return true;
    } catch {
      return false;
    }
  } finally {
    try {
      if (recoveryLock) {
        const rc = fs.readFileSync(recoveryPath, "utf8").trim();
        const rl = JSON.parse(rc);
        if (rl.ownerId === recoveryLock.ownerId) {
          fs.unlinkSync(recoveryPath);
        }
      }
    } catch {}
  }
}

function releaseLock(lockPath, ownerId) {
  try {
    const content = fs.readFileSync(lockPath, "utf8").trim();
    const lock = JSON.parse(content);
    if (lock.pid === process.pid && (!ownerId || lock.ownerId === ownerId)) {
      fs.unlinkSync(lockPath);
    }
  } catch {}
}

function withLock(lockPath, fn) {
  const { ownerId } = acquireLock(lockPath);
  try {
    return fn();
  } finally {
    releaseLock(lockPath, ownerId);
  }
}

function getLockPath(filePath) {
  return `${filePath}.lock`;
}

module.exports = { acquireLock, releaseLock, withLock, getLockPath };
