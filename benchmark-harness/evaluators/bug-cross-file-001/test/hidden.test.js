const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { AuthMiddleware } = require("../src/auth/middleware");
const { TokenService } = require("../src/auth/token-service");
const { MigrationService } = require("../src/users/migration-service");

describe("Cross-File Auth Bug - Hidden Tests", () => {
  it("token validation should work before migration", () => {
    const userStore = new Map();
    userStore.set("user1", { id: "user1", name: "Alice", email: "alice@test.com", token: "tok_abc" });

    const tokenService = new TokenService(userStore);
    // Manually set a valid token entry
    tokenService.validTokens.set("tok_abc", { userId: "user1", createdAt: Date.now() });

    const middleware = new AuthMiddleware(tokenService);
    const result = middleware.authenticate("Bearer tok_abc");
    assert.equal(result.authenticated, true);
    assert.equal(result.userId, "user1");
  });

  it("token validation should work after migration", () => {
    const userStore = new Map();
    userStore.set("user1", { id: "user1", name: "Alice", email: "alice@test.com", token: "tok_abc" });

    const tokenService = new TokenService(userStore);
    tokenService.validTokens.set("tok_abc", { userId: "user1", createdAt: Date.now() });

    const migrationService = new MigrationService(userStore);
    migrationService.migrateUser("user1");

    const middleware = new AuthMiddleware(tokenService);
    const result = middleware.authenticate("Bearer tok_abc");
    assert.equal(result.authenticated, true, "Token should be valid after migration");
    assert.equal(result.userId, "user1");
  });

  it("migration should update user schema", () => {
    const userStore = new Map();
    userStore.set("user1", { id: "user1", name: "Alice", email: "alice@test.com", token: "tok_abc" });

    const migrationService = new MigrationService(userStore);
    const result = migrationService.migrateUser("user1");

    assert.equal(result.success, true);
    const migrated = userStore.get("user1");
    assert.ok(migrated.authToken, "Migrated user should have authToken field");
    assert.ok(migrated.migratedAt, "Migrated user should have migratedAt field");
    assert.equal(migrated.token, undefined, "Old token field should be removed");
  });

  it("token service should handle both old and new schema fields", () => {
    const userStore = new Map();
    userStore.set("user2", { id: "user2", name: "Bob", email: "bob@test.com", token: "tok_xyz" });

    const tokenService = new TokenService(userStore);
    tokenService.validTokens.set("tok_xyz", { userId: "user2", createdAt: Date.now() });

    const result = tokenService.validateToken("tok_xyz");
    assert.equal(result.valid, true);
  });
});
