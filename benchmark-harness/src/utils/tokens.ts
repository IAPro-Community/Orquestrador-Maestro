/**
 * Shared token utilities.
 * @module utils/tokens
 */

import type { TokenUsage } from '../types/tokens.js';
import { TokenSource, TokenConfidence } from '../types/tokens.js';

/**
 * Creates a {@link TokenUsage} with all fields set to unavailable.
 *
 * Used as a fallback when no token data can be extracted from the
 * agent session, stdout, or provider API response.
 */
export function createUnavailableTokens(): TokenUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    total: null,
    source: TokenSource.Unavailable,
    confidence: TokenConfidence.Unavailable,
  };
}
