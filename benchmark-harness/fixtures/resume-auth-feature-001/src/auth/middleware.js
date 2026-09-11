"use strict";

const { randomBytes } = require("node:crypto");

class AuthMiddleware {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
  }

  register(username, password) {
    if (this.users.has(username)) {
      return { success: false, error: "Username already exists" };
    }
    const salt = randomBytes(16).toString("hex");
    const hash = require("node:crypto").createHash("sha256").update(password + salt).digest("hex");
    this.users.set(username, { salt, hash });
    return { success: true };
  }

  login(username, password) {
    const user = this.users.get(username);
    if (!user) return { success: false, error: "Invalid credentials" };

    const hash = require("node:crypto").createHash("sha256").update(password + user.salt).digest("hex");
    if (hash !== user.hash) return { success: false, error: "Invalid credentials" };

    const sessionId = randomBytes(32).toString("hex");
    this.sessions.set(sessionId, {
      username,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    return { success: true, sessionId };
  }

  validateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { valid: false };
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(sessionId);
      return { valid: false, reason: "expired" };
    }
    return { valid: true, username: session.username };
  }

  logout(sessionId) {
    return this.sessions.delete(sessionId);
  }
}

module.exports = { AuthMiddleware };
