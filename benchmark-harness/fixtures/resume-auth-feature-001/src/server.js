"use strict";

const http = require("node:http");
const { AuthMiddleware } = require("./auth/middleware");
const { RateLimiter } = require("./auth/rate-limiter");

const auth = new AuthMiddleware();
const rateLimiter = new RateLimiter({ windowMs: 60000, maxAttempts: 5 });

function createServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const ip = req.socket.remoteAddress || "unknown";
      const rateCheck = rateLimiter.isAllowed(ip);

      if (!rateCheck.allowed) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Too many requests", retryAfter: rateCheck.retryAfter }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;
      const { username, password } = JSON.parse(body);

      const result = auth.login(username, password);
      if (!result.success) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: result.error }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessionId: result.sessionId }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  return server;
}

module.exports = { createServer, auth, rateLimiter };
