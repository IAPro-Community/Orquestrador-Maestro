"use strict";

const { TokenService } = require("./token-service");

class AuthMiddleware {
  constructor(tokenService) {
    this.tokenService = tokenService;
  }

  authenticate(authHeader) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { authenticated: false, error: "Missing or invalid authorization header" };
    }

    const token = authHeader.slice(7);
    const result = this.tokenService.validateToken(token);

    if (!result.valid) {
      return { authenticated: false, error: result.error };
    }

    return { authenticated: true, userId: result.userId };
  }
}

module.exports = { AuthMiddleware };
