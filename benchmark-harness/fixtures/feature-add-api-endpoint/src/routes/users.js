"use strict";

const { findUserById, getUserActivity } = require("../models/user");

const routes = [];

function registerRoute(method, path, handler) {
  routes.push({ method, path, handler });
}

function matchRoute(method, url) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const routeParts = route.path.split("/");
    const urlParts = url.split("/");
    if (routeParts.length !== urlParts.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(":")) {
        params[routeParts[i].slice(1)] = urlParts[i];
      } else if (routeParts[i] !== urlParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { handler: route.handler, params };
  }
  return null;
}

// Existing routes
registerRoute("GET", "/api/users", async (req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ users: Array.from(require("../models/user").users.values()) }));
});

registerRoute("GET", "/api/users/:id", async (req, res) => {
  const user = findUserById(req.params.id);
  if (!user) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "User not found" }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ user }));
});

module.exports = { registerRoute, matchRoute, routes };
