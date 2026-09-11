"use strict";

const { Monolith } = require("./monolith");

const app = { monolith: new Monolith() };

function handleRequest(path, method, body) {
  if (method === "POST" && path === "/api/users") {
    return app.monolith.createUser(body);
  }
  if (method === "POST" && path === "/api/auth/reset-password") {
    return app.monolith.requestPasswordReset(body.email);
  }
  if (method === "POST" && path === "/api/notify") {
    return app.monolith.sendNotification(body.userId, body.message);
  }
  return { error: "Not found" };
}

module.exports = { app, handleRequest };
