"use strict";
/**
 * Token usage with provenance hierarchy.
 * @module tokens
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenConfidence = exports.TokenSource = void 0;
/** How the token counts were obtained. */
var TokenSource;
(function (TokenSource) {
    /** Reported by the model provider API response. */
    TokenSource["ProviderReported"] = "provider-reported";
    /** Collected natively by OpenCode session tracking. */
    TokenSource["OpenCodeNative"] = "opencode-native";
    /** Derived from session file parsing heuristics. */
    TokenSource["SessionDerived"] = "session-derived";
    /** Counted with a local tokenizer (exact match). */
    TokenSource["TokenizerExact"] = "tokenizer-exact";
    /** Estimated via tiktoken or similar approximation. */
    TokenSource["TokenizerEstimated"] = "tokenizer-estimated";
    /** No token data available. */
    TokenSource["Unavailable"] = "unavailable";
})(TokenSource || (exports.TokenSource = TokenSource = {}));
/** Confidence level for the reported token counts. */
var TokenConfidence;
(function (TokenConfidence) {
    /** Provider-reported or tokenizer-exact; no uncertainty. */
    TokenConfidence["Exact"] = "exact";
    /** Derived from session logs with high reliability. */
    TokenConfidence["Reliable"] = "reliable";
    /** Estimated or approximated; may drift from actual. */
    TokenConfidence["Estimated"] = "estimated";
    /** No meaningful token data. */
    TokenConfidence["Unavailable"] = "unavailable";
})(TokenConfidence || (exports.TokenConfidence = TokenConfidence = {}));
