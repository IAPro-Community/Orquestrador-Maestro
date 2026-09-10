"use strict";

const { randomBytes } = require("node:crypto");

class Monolith {
  constructor() {
    this.users = new Map();
    this.emailLog = [];
  }

  createUser(userData) {
    const id = `user-${Date.now()}`;
    this.users.set(id, { id, ...userData, createdAt: new Date().toISOString() });

    // Email logic mixed in — should be extracted
    const verificationToken = randomBytes(16).toString("hex");
    this.emailLog.push({
      to: userData.email,
      subject: "Welcome!",
      body: `Hello ${userData.name}, welcome to our platform!`,
      token: verificationToken,
      sentAt: new Date().toISOString(),
    });

    return { id, verificationToken };
  }

  requestPasswordReset(email) {
    const user = Array.from(this.users.values()).find((u) => u.email === email);
    if (!user) return { success: false, error: "User not found" };

    // Email logic mixed in — should be extracted
    const resetToken = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    this.emailLog.push({
      to: email,
      subject: "Password Reset",
      body: `Click here to reset your password: /reset?token=${resetToken}`,
      token: resetToken,
      expiresAt,
      sentAt: new Date().toISOString(),
    });

    return { success: true, resetToken, expiresAt };
  }

  sendNotification(userId, message) {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: "User not found" };

    // Email logic mixed in — should be extracted
    this.emailLog.push({
      to: user.email,
      subject: "Notification",
      body: message,
      sentAt: new Date().toISOString(),
    });

    return { success: true };
  }

  getEmailLog() {
    return [...this.emailLog];
  }
}

module.exports = { Monolith };
