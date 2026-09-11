const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { TokenService } = require("../src/TokenService");

describe("TokenService", () => {
  it("should generate token pair", async () => {
    const service = new TokenService();
    const tokens = await service.generateTokenPair("user1");
    assert.ok(tokens.accessToken);
    assert.ok(tokens.refreshToken);
  });

  it("should validate access token", async () => {
    const service = new TokenService();
    const tokens = await service.generateTokenPair("user1");
    const valid = await service.validateAccessToken("user1", tokens.accessToken);
    assert.equal(valid, true);
  });
});
