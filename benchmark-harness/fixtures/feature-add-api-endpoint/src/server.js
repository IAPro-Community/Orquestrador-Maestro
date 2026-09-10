"use strict";

const http = require("node:http");
const { matchRoute, routes } = require("./routes/users");

function createServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const match = matchRoute(req.method, url.pathname);

    if (match) {
      req.params = match.params;
      try {
        await match.handler(req, res);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  return server;
}

module.exports = { createServer };
