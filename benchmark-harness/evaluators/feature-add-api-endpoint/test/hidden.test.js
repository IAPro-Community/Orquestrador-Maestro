const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { matchRoute, routes } = require("../src/routes/users");

describe("API Endpoint - Hidden Tests", () => {
  it("GET /api/users/:id/profile route should be registered", () => {
    const profileRoute = routes.find(
      (r) => r.method === "GET" && r.path === "/api/users/:id/profile"
    );
    assert.ok(profileRoute, "GET /api/users/:id/profile route should exist");
  });

  it("profile endpoint handler should return user with activity", async () => {
    const profileRoute = routes.find(
      (r) => r.method === "GET" && r.path === "/api/users/:id/profile"
    );
    assert.ok(profileRoute, "Profile route must exist");

    let capturedStatus;
    let capturedBody;
    const mockRes = {
      writeHead: (status) => { capturedStatus = status; },
      end: (body) => { capturedBody = body; },
    };

    await profileRoute.handler({ params: { id: "1" } }, mockRes);
    assert.equal(capturedStatus, 200);
    const parsed = JSON.parse(capturedBody);
    assert.ok(parsed.profile, "Response should have profile field");
    assert.equal(parsed.profile.id, "1");
    assert.ok(Array.isArray(parsed.profile.activity), "Profile should include activity array");
  });

  it("profile endpoint should return 404 for invalid user", async () => {
    const profileRoute = routes.find(
      (r) => r.method === "GET" && r.path === "/api/users/:id/profile"
    );
    assert.ok(profileRoute, "Profile route must exist");

    let capturedStatus;
    let capturedBody;
    const mockRes = {
      writeHead: (status) => { capturedStatus = status; },
      end: (body) => { capturedBody = body; },
    };

    await profileRoute.handler({ params: { id: "999" } }, mockRes);
    assert.equal(capturedStatus, 404);
    const parsed = JSON.parse(capturedBody);
    assert.ok(parsed.error, "Response should have error field");
  });

  it("profile endpoint should validate user ID format", async () => {
    const profileRoute = routes.find(
      (r) => r.method === "GET" && r.path === "/api/users/:id/profile"
    );
    assert.ok(profileRoute, "Profile route must exist");

    let capturedStatus;
    const mockRes = {
      writeHead: (status) => { capturedStatus = status; },
      end: () => {},
    };

    await profileRoute.handler({ params: { id: "" } }, mockRes);
    assert.equal(capturedStatus, 400, "Empty ID should return 400");
  });
});
