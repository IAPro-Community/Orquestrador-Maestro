"use strict";

const { acquireLock, releaseLock } = require("./lock");

// In-process mutex registry, keyed by lock path.
//
// `acquireLock` busy-waits with Atomics.wait, which BLOCKS the event loop. That
// is correct across separate processes (each has its own thread) but deadlocks
// inside a single process: the waiter freezes the very thread that must run the
// lock holder's continuation. An async mutex is therefore required for
// intra-process concurrency, while the lockfile remains the cross-process guard.
const asyncMutexes = new Map();

/**
 * Queue behind any previous holder of the same key.
 * @returns {{ready: Promise<void>, release: () => void}}
 */
function acquireAsyncMutex(key) {
  const previous = asyncMutexes.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const chained = previous.then(() => current);
  asyncMutexes.set(key, chained);
  // Drop the entry once the queue drains so the map does not grow unbounded.
  chained.then(() => {
    if (asyncMutexes.get(key) === chained) asyncMutexes.delete(key);
  }, () => {});
  // `ready` resolves once every earlier holder has released; the caller may then
  // enter the critical section.
  return { ready: previous, release };
}

/**
 * Cross-process safe AND intra-process safe critical section.
 *
 * Order matters: the in-process mutex is taken first so concurrent callers in
 * this process queue instead of deadlocking on the blocking file lock; the
 * exclusive lockfile then guards against other processes.
 */
async function withLockAsync(lockPath, fn) {
  const { ready, release } = acquireAsyncMutex(lockPath);
  await ready;
  try {
    const { ownerId } = acquireLock(lockPath);
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