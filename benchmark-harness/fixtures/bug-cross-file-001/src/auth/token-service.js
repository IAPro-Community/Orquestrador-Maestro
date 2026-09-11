"use strict";

const { randomBytes } = require("node:crypto");

class TokenService {
  constructor(userStore) {
    this.userStore = userStore;
    this.validTokens = new Map();
  }

  generateToken(userId) {
    const token = randomBytes(32).toString("hex");
    this.validTokens.set(token, { userId, createdAt: Date.now() });
    return token;
  }

  validateToken(token) {
    const entry = this.validTokens.get(token);
    if (!entry) return { valid: false, error: "Token not found" };

    const user = this.userStore.get(entry.userId);
    if (!user) return { valid: false, error: "User not found" };

    // BUG: Uses old schema field `token` instead of `authToken`
    // When user has been migrated, user.token is undefined
    // but user.authToken exists. This causes validation to fail.
    if (user.token !== token && user.authToken !== token) {
      return { valid: false, error: "Token mismatch" };
    }

    return { valid: true, userId: entry.userId };
  }

  revokeToken(token) {
    return this.validTokens.delete(token);
  }
}

module.exports = { TokenService };
