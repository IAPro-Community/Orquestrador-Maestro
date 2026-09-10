"use strict";

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000;
    this.maxAttempts = options.maxAttempts || 5;
    this.attempts = new Map();
  }

  isAllowed(key) {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record) {
      this.attempts.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.maxAttempts - 1 };
    }

    if (now - record.windowStart > this.windowMs) {
      this.attempts.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.maxAttempts - 1 };
    }

    if (record.count >= this.maxAttempts) {
      const retryAfter = this.windowMs - (now - record.windowStart);
      return { allowed: false, remaining: 0, retryAfter };
    }

    record.count++;
    return { allowed: true, remaining: this.maxAttempts - record.count };
  }

  reset(key) {
    this.attempts.delete(key);
  }
}

module.exports = { RateLimiter };
