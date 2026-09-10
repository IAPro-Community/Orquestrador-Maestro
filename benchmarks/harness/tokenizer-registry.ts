export interface TokenEstimate {
  tokens: number;
  estimated: boolean;
  confidence: number;
}

export interface Tokenizer {
  count(text: string): number;
}

export class TokenizerRegistry {
  private tokenizers = new Map<string, Tokenizer>();

  private key(provider: string, model: string): string {
    return `${provider}/${model}`;
  }

  register(provider: string, model: string, tokenizer: Tokenizer): void {
    this.tokenizers.set(this.key(provider, model), tokenizer);
  }

  estimate(provider: string, model: string, text: string): TokenEstimate | null {
    const tokenizer = this.tokenizers.get(this.key(provider, model));
    if (!tokenizer) return null;

    const tokens = tokenizer.count(text);
    return {
      tokens,
      estimated: true,
      confidence: 0.7,
    };
  }

  has(provider: string, model: string): boolean {
    return this.tokenizers.has(this.key(provider, model));
  }

  get(provider: string, model: string): Tokenizer | undefined {
    return this.tokenizers.get(this.key(provider, model));
  }
}

const defaultRegistry = new TokenizerRegistry();

function approxTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

defaultRegistry.register("*", "*", { count: approxTokenCount });

export { defaultRegistry };
