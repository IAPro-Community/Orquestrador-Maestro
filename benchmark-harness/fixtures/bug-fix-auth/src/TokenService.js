"use strict";

const { randomBytes } = require("node:crypto");

class TokenService {
  constructor() {
    this.refreshTokensIssued = new Set();
    this.accessTokens = new Map();
  }

  async generateTokenPair(userId) {
    const accessToken = randomBytes(32).toString("hex");
    const refreshToken = randomBytes(32).toString("hex");
    this.refreshTokensIssued.add(refreshToken);
    this.accessTokens.set(userId, {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + 3600000,
    });
    return { accessToken, refreshToken };
  }

  async refreshTokens(userId, oldRefreshToken) {
    if (!this.refreshTokensIssued.has(oldRefreshToken)) {
      return null;
    }
    // BUG: Old token remains in the Set — reuse is possible!
    return this.generateTokenPair(userId);
  }

  async validateAccessToken(userId, token) {
    const existing = this.accessTokens.get(userId);
    return !!existing && existing.accessToken === token && existing.expiresAt > Date.now();
  }
}

module.exports = { TokenService };
