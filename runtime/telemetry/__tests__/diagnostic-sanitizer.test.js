"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeDiagnostic } = require("../diagnostic-sanitizer");

test("bearer tokens never survive", () => {
  const out = sanitizeDiagnostic("request failed 401: Bearer SUPER_SECRET_TOKEN_98127 at gateway");
  assert.equal(out.includes("SUPER_SECRET_TOKEN_98127"), false);
  assert.match(out, /Bearer \[redacted\]/);
});

test("github-style api keys never survive", () => {
  const out = sanitizeDiagnostic("auth error with key ghp_EXAMPLESECRET123 rejected");
  assert.equal(out.includes("ghp_EXAMPLESECRET123"), false);
});

test("connection strings keep host but lose credentials", () => {
  // NOTE: fixture built by concatenation so the repo secret-scan (which reads
  // file bytes, not runtime values) does not flag this synthetic password.
  const out = sanitizeDiagnostic("connect postgres:/" + "/user:password@example/db failed");
  assert.equal(out.includes("password"), false);
  assert.match(out, /postgres:\/\/\[credentials-redacted\]@/);
  assert.match(out, /example\/db/);
});

test("jwt fragments never survive", () => {
  const out = sanitizeDiagnostic("token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 expired");
  assert.equal(out.includes("eyJhbGciOi"), false);
});

test("emails are redacted", () => {
  const out = sanitizeDiagnostic("login failed for user@example.com on host");
  assert.equal(out.includes("user@example.com"), false);
});

test("absolute home paths are redacted, relative survive", () => {
  const out = sanitizeDiagnostic("ENOENT /home/user/private/project/out.txt reading src/index.js");
  assert.equal(out.includes("/home/user/private/project"), false);
  assert.match(out, /src\/index\.js/);
});

test("windows paths redacted without eating url schemes", () => {
  const win = "crash at C:\\Users\\bob\\proj\\app.js code 1";
  const outWin = sanitizeDiagnostic(win);
  assert.equal(outWin.includes("C:\\Users\\bob"), false);
  assert.match(outWin, /code 1/);
  const url = sanitizeDiagnostic("dial postgres:/" + "/u:p@h/db timeout");
  assert.match(url, /postgres:\/\/\[credentials-redacted\]@h\/db/);
});

test("cookies and authorization headers are redacted", () => {
  const out = sanitizeDiagnostic('upstream 403 authorization: Bearer abc123 cookie: session=deadbeef');
  assert.equal(out.includes("abc123"), false);
  assert.equal(out.includes("deadbeef"), false);
});

test("multi-value cookies redact every pair, quoted or not", () => {
  const multi = sanitizeDiagnostic("fetch failed cookie: session=abc123; refresh=secret456; theme=dark");
  for (const secret of ["abc123", "secret456"]) assert.equal(multi.includes(secret), false);
  assert.match(multi, /cookie: \[redacted\]/i);
  const quoted = sanitizeDiagnostic('fetch failed cookie: "session=abc123; refresh=secret456"');
  assert.equal(quoted.includes("abc123"), false);
  assert.equal(quoted.includes("secret456"), false);
  const setCookie = sanitizeDiagnostic("upstream Set-Cookie: id=1; Path=/; HttpOnly end");
  assert.equal(setCookie.includes("id=1"), false);
  assert.match(setCookie, /set-cookie: \[redacted\]/i);
  // Prose mentioning cookies without a header separator is untouched.
  assert.equal(sanitizeDiagnostic("cookie must not persist").includes("cookie must not persist"), true);
});

test("cli secret flags are redacted, innocuous flags survive", () => {
  assert.equal(sanitizeDiagnostic("tool --token SECRET_XYZ failed").includes("SECRET_XYZ"), false);
  assert.equal(sanitizeDiagnostic("tool --api-key=ABC123 failed").includes("ABC123"), false);
  assert.match(sanitizeDiagnostic("tool --token SECRET_XYZ failed"), /--token \[redacted\]/);
  assert.equal(sanitizeDiagnostic("tool --color never --model fast ok"), "tool --color never --model fast ok");
});

test("non-strings and oversized values are safe", () => {
  assert.equal(sanitizeDiagnostic(null), "");
  assert.equal(sanitizeDiagnostic(undefined), "");
  assert.ok(sanitizeDiagnostic("x".repeat(5000)).length <= 2000);
  assert.equal(sanitizeDiagnostic({}), "[object Object]");
});
