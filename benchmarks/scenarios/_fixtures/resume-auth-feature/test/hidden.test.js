const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { AuthService } = require("../src/AuthService");

describe("AuthService - Hidden Tests", () => {
  it("should reject duplicate registration", () => {
    const auth = new AuthService();
    auth.register("alice", "password123");
    const result = auth.register("alice", "password456");
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it("should reject wrong password", () => {
    const auth = new AuthService();
    auth.register("alice", "password123");
    const result = auth.login("alice", "wrongpassword");
    assert.equal(result.success, false);
  });

  it("should validate session", () => {
    const auth = new AuthService();
    auth.register("alice", "password123");
    const login = auth.login("alice", "password123");
    const validation = auth.validateSession(login.sessionId);
    assert.equal(validation.valid, true);
    assert.equal(validation.username, "alice");
  });

  it("should invalidate session on logout", () => {
    const auth = new AuthService();
    auth.register("alice", "password123");
    const login = auth.login("alice", "password123");
    auth.logout(login.sessionId);
    const validation = auth.validateSession(login.sessionId);
    assert.equal(validation.valid, false);
  });

  it("should reject login for non-existent user", () => {
    const auth = new AuthService();
    const result = auth.login("nobody", "password");
    assert.equal(result.success, false);
  });
});
