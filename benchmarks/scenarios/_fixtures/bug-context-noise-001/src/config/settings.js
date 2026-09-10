"use strict";

const config = {
  port: process.env.PORT || 3000,
  dbUrl: process.env.DB_URL || "sqlite://:memory:",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-do-not-use-in-production",
  sessionTimeout: 3600000,
  maxRetries: 3,
};

module.exports = { config };
