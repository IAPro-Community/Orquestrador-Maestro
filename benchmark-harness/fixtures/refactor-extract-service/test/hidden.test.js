const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Refactor Extract Service - Hidden Tests", () => {
  it("EmailService should exist in src/services/EmailService.js", () => {
    const emailServicePath = path.join(__dirname, "../src/services/EmailService.js");
    assert.ok(fs.existsSync(emailServicePath), "EmailService.js should exist");
  });

  it("EmailService should export sendWelcome, sendPasswordReset, sendNotification", () => {
    const emailServicePath = path.join(__dirname, "../src/services/EmailService.js");
    const content = fs.readFileSync(emailServicePath, "utf8");
    assert.ok(content.includes("sendWelcome"), "EmailService should have sendWelcome method");
    assert.ok(content.includes("sendPasswordReset"), "EmailService should have sendPasswordReset method");
    assert.ok(content.includes("sendNotification"), "EmailService should have sendNotification method");
  });

  it("Monolith should not contain email sending logic inline", () => {
    const monolithPath = path.join(__dirname, "../src/monolith.js");
    const content = fs.readFileSync(monolithPath, "utf8");
    // Should not have inline email log pushes — should delegate to EmailService
    const inlineEmailPushes = (content.match(/emailLog\.push/g) || []).length;
    assert.equal(inlineEmailPushes, 0, "Monolith should not push to emailLog directly");
  });

  it("Monolith should import or use EmailService", () => {
    const monolithPath = path.join(__dirname, "../src/monolith.js");
    const content = fs.readFileSync(monolithPath, "utf8");
    assert.ok(
      content.includes("EmailService") || content.includes("emailService"),
      "Monolith should reference EmailService"
    );
  });

  it("EmailService should be functional when instantiated", () => {
    const { EmailService } = require("../src/services/EmailService");
    const service = new EmailService();
    assert.equal(typeof service.sendWelcome, "function");
    assert.equal(typeof service.sendPasswordReset, "function");
    assert.equal(typeof service.sendNotification, "function");
  });
});
