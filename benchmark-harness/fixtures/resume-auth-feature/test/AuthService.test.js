const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { AuthService } = require("../src/AuthService");

describe("AuthService", () => {
  it("should register a user", () => {
    const auth = new AuthService();
    const result = auth.register("alice", "password123");
    assert.equal(result.success, true);
  });

  it("should login with correct credentials", () => {
    const auth = new AuthService();
    auth.register("alice", "password123");
    const result = auth.login("alice", "password123");
    assert.equal(result.success, true);
    assert.ok(result.sessionId);
  });
});
