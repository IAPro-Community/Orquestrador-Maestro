const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { RateLimiter } = require("../src/auth/rate-limiter");

describe("Rate Limiting - Hidden Tests", () => {
  it("RateLimiter should use sliding window algorithm", () => {
    const limiter = new RateLimiter({ windowMs: 1000, maxAttempts: 3 });

    const r1 = limiter.isAllowed("ip1");
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 2);

    const r2 = limiter.isAllowed("ip1");
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 1);

    const r3 = limiter.isAllowed("ip1");
    assert.equal(r3.allowed, true);
    assert.equal(r3.remaining, 0);

    const r4 = limiter.isAllowed("ip1");
    assert.equal(r4.allowed, false, "Should block after max attempts");
    assert.ok(r4.retryAfter > 0, "Should indicate retry time");
  });

  it("RateLimiter should track per-key (per-IP) limits independently", () => {
    const limiter = new RateLimiter({ windowMs: 1000, maxAttempts: 2 });

    limiter.isAllowed("ip_a");
    limiter.isAllowed("ip_a");
    const blocked = limiter.isAllowed("ip_a");
    assert.equal(blocked.allowed, false, "ip_a should be blocked");

    const allowed = limiter.isAllowed("ip_b");
    assert.equal(allowed.allowed, true, "ip_b should still be allowed");
  });

  it("RateLimiter should reset after window expires", async () => {
    const limiter = new RateLimiter({ windowMs: 50, maxAttempts: 1 });

    limiter.isAllowed("ip1");
    const blocked = limiter.isAllowed("ip1");
    assert.equal(blocked.allowed, false);

    await new Promise((r) => setTimeout(r, 60));
    const after = limiter.isAllowed("ip1");
    assert.equal(after.allowed, true, "Should allow after window resets");
  });

  it("RateLimiter should have reset method", () => {
    const limiter = new RateLimiter({ windowMs: 1000, maxAttempts: 1 });
    limiter.isAllowed("ip1");
    limiter.reset("ip1");
    const after = limiter.isAllowed("ip1");
    assert.equal(after.allowed, true, "Should allow after reset");
  });
});
