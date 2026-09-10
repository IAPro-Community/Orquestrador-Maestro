import fs from "node:fs";

export interface SanitizedEvidence {
  original: string;
  sanitized: string;
  redactions: number;
  sanitizedAt: string;
}

const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // API keys
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi, replacement: "$1=REDACTED_API_KEY" },
  // Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9_\-\.]{20,}/g, replacement: "Bearer REDACTED_TOKEN" },
  // JWT tokens
  { pattern: /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, replacement: "REDACTED_JWT" },
  // Generic tokens
  { pattern: /(?:token|secret|password|passwd|pwd)\s*[:=]\s*["']([^"']{8,})["']/gi, replacement: "$1=REDACTED_SECRET" },
  // Authorization headers
  { pattern: /Authorization:\s*[A-Za-z0-9_\-\. ]{10,}/g, replacement: "Authorization: REDACTED_AUTH" },
  // AWS keys
  { pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g, replacement: "REDACTED_AWS_KEY" },
  // Private keys
  { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g, replacement: "REDACTED_PRIVATE_KEY" },
  // Connection strings
  { pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']+/g, replacement: "REDACTED_CONNECTION_STRING" },
  // Passwords in URLs
  { pattern: /:\/\/[^:]+:([^@\s]{4,})@/g, replacement: "://REDACTED:REDACTED_PASSWORD@" },
  // Email addresses (PII)
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "REDACTED_EMAIL" },
  // Phone numbers (Brazilian format)
  { pattern: /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[\-]?\d{4}/g, replacement: "REDACTED_PHONE" },
  // CPF/CNPJ
  { pattern: /\d{3}\.?\d{3}\.?\d{3}[\-]?\d{2}/g, replacement: "REDACTED_CPF" },
  { pattern: /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[\-]?\d{2}/g, replacement: "REDACTED_CNPJ" },
  // IP addresses (optional, but common in logs)
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "REDACTED_IP" },
  // Environment variable values that look like secrets
  { pattern: /(?:process\.env\.[A-Z_]+)\s*=\s*["'][^"']+["']/g, replacement: "process.env.REDACTED = \"REDACTED\"" },
];

class EvidenceSanitizer {
  sanitize(raw: string): SanitizedEvidence {
    let sanitized = raw;
    let redactions = 0;

    for (const { pattern, replacement } of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      const matches = sanitized.match(regex);
      if (matches) {
        redactions += matches.length;
      }
      sanitized = sanitized.replace(pattern, replacement);
    }

    return {
      original: raw,
      sanitized,
      redactions,
      sanitizedAt: new Date().toISOString(),
    };
  }

  sanitizeFile(filePath: string): SanitizedEvidence {
    const raw = fs.readFileSync(filePath, "utf8");
    const result = this.sanitize(raw);
    fs.writeFileSync(filePath, result.sanitized, "utf8");
    return result;
  }
}

export { EvidenceSanitizer };
