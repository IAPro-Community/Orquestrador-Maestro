"use strict";
/**
 * Shared token utilities.
 * @module utils/tokens
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUnavailableTokens = createUnavailableTokens;
var tokens_js_1 = require("../types/tokens.js");
/**
 * Creates a {@link TokenUsage} with all fields set to unavailable.
 *
 * Used as a fallback when no token data can be extracted from the
 * agent session, stdout, or provider API response.
 */
function createUnavailableTokens() {
    return {
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        total: null,
        source: tokens_js_1.TokenSource.Unavailable,
        confidence: tokens_js_1.TokenConfidence.Unavailable,
    };
}
