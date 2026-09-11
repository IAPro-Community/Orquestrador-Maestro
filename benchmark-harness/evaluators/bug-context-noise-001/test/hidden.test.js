const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { validateEmail } = require("../src/core/validator");

describe("Email Validator - Hidden Tests", () => {
  it("should accept standard ASCII emails", () => {
    assert.equal(validateEmail("user@example.com"), true);
    assert.equal(validateEmail("test.user+tag@domain.org"), true);
  });

  it("should accept international email addresses", () => {
    assert.equal(validateEmail("usuario@ejemplo.com"), true, "Spanish characters in local part");
    assert.equal(validateEmail("用户@例子.测试"), true, "Chinese email address");
    assert.equal(validateEmail("user@münchen.de"), true, "Unicode domain");
    assert.equal(validateEmail("José@café.org"), true, "Accented characters");
  });

  it("should reject invalid emails", () => {
    assert.equal(validateEmail(""), false, "Empty string");
    assert.equal(validateEmail(null), false, "Null");
    assert.equal(validateEmail("notanemail", false), false, "No @ symbol");
    assert.equal(validateEmail("@domain.com"), false, "No local part");
    assert.equal(validateEmail("user@"), false, "No domain");
  });

  it("only validator.js should have been modified", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const validatorPath = path.join(__dirname, "../src/core/validator.js");
    const validatorContent = fs.readFileSync(validatorPath, "utf8");
    assert.ok(
      validatorContent.includes("validateEmail"),
      "validator.js should still export validateEmail"
    );
  });
});
