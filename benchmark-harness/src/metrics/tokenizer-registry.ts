/**
 * Tokenizer registry for provider/model-specific token counting.
 * @module metrics/tokenizer-registry
 */

/**
 * Token count estimate with provenance metadata.
 */
export interface TokenEstimate {
  /** Number of tokens counted. */
  tokens: number;
  /** Whether this count is an exact tokenization or an estimate. */
  estimated: boolean;
  /** Confidence level: 1.0 = exact, < 1.0 = approximation. */
  confidence: number;
}

/**
 * Interface for a tokenizer that can count tokens in text.
 */
export interface Tokenizer {
  /** Count the number of tokens in the given text. */
  count(text: string): number;
}

/**
 * A registration entry pairing a provider/model to a tokenizer.
 */
interface TokenizerEntry {
  provider: string;
  model: string;
  tokenizer: Tokenizer;
}

/**
 * Registry of tokenizers keyed by provider and model.
 *
 * Providers register their tokenizer implementations, and consumers
 * can then estimate token counts for any (provider, model, text) tuple.
 * If no tokenizer is registered for a given combination, `estimate`
 * returns `null`.
 *
 * @example
 * ```ts
 * const registry = new TokenizerRegistry();
 * registry.register('openai', 'gpt-4o', { count: (t) => t.length / 4 });
 * const result = registry.estimate('openai', 'gpt-4o', 'Hello, world!');
 * ```
 */
export class TokenizerRegistry {
  private tokenizers = new Map<string, Tokenizer>();

  private key(provider: string, model: string): string {
    return `${provider}/${model}`;
  }

  /**
   * Register a tokenizer for a specific provider and model.
   * Overwrites any previously registered tokenizer for the same key.
   */
  register(provider: string, model: string, tokenizer: Tokenizer): void {
    this.tokenizers.set(this.key(provider, model), tokenizer);
  }

  /**
   * Estimate the token count for the given text using the registered tokenizer.
   * Returns `null` if no tokenizer is registered for the given provider/model.
   */
  estimate(provider: string, model: string, text: string): TokenEstimate | null {
    const tokenizer = this.tokenizers.get(this.key(provider, model));
    if (!tokenizer) return null;

    const tokens = tokenizer.count(text);
    // All registered tokenizers are heuristic approximations (tiktoken-based).
    // Exact tokenization would require provider API calls; we use estimates.
    return {
      tokens,
      estimated: true,
      confidence: 0.8,
    };
  }

  /**
   * Check whether a tokenizer is registered for the given provider/model.
   */
  has(provider: string, model: string): boolean {
    return this.tokenizers.has(this.key(provider, model));
  }

  /**
   * Remove a tokenizer registration.
   * Returns `true` if the entry existed and was removed.
   */
  unregister(provider: string, model: string): boolean {
    return this.tokenizers.delete(this.key(provider, model));
  }

  /**
   * List all registered provider/model keys.
   */
  list(): string[] {
    return Array.from(this.tokenizers.keys());
  }
}
