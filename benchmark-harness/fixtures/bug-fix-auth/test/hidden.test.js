const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { TokenService } = require("../src/TokenService");

describe("TokenService - Hidden Tests", () => {
  it("should not allow refresh token reuse", async () => {
    const service = new TokenService();
    const tokens = await service.generateTokenPair("user1");

    const refreshed1 = await service.refreshTokens("user1", tokens.refreshToken);
    assert.ok(refreshed1, "First refresh should succeed");

    const refreshed2 = await service.refreshTokens("user1", tokens.refreshToken);
    assert.equal(refreshed2, null, "Second refresh with same token should fail");
  });

  it("should issue new tokens on successful refresh", async () => {
    const service = new TokenService();
    const tokens = await service.generateTokenPair("user1");

    const refreshed = await service.refreshTokens("user1", tokens.refreshToken);
    assert.ok(refreshed, "Refresh should succeed");
    assert.notEqual(refreshed.refreshToken, tokens.refreshToken, "New refresh token should be different");
    assert.notEqual(refreshed.accessToken, tokens.accessToken, "New access token should be different");
  });

  it("should invalidate old refresh token after use", async () => {
    const service = new TokenService();
    const tokens = await service.generateTokenPair("user1");

    await service.refreshTokens("user1", tokens.refreshToken);

    const exists = service.refreshTokensIssued.has(tokens.refreshToken);
    assert.equal(exists, false, "Old refresh token should be removed from valid set");
  });
});
