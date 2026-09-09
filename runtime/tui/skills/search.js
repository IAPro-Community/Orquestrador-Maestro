"use strict";

const MAX_CATALOG_MS = 10;

function damerauLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 0);
}

const dlCache = new Map();
function levenshteinDistance(a, b) {
  const key = a.length <= b.length ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  const hit = dlCache.get(key);
  if (hit !== undefined) return hit;
  const value = damerauLevenshtein(a, b);
  if (dlCache.size > 20000) dlCache.clear();
  dlCache.set(key, value);
  return value;
}

function normScore(distance, length) {
  if (length === 0) return 0;
  return 1 - distance / length;
}

function fieldPrefixBoost(needle, haystack) {
  const n = tokenize(needle)[0];
  const h = tokenize(haystack);
  if (!n) return 0;
  for (const item of h) {
    if (item.startsWith(n)) return 0.25;
  }
  if (h.some((item) => item.includes(n))) return 0.1;
  return 0;
}

function matchField(needle, haystack) {
  const n = tokenize(needle).join(" ");
  if (!n) return 0;
  const tokens = tokenize(haystack);
  if (tokens.length === 0) return 0;
  if (tokens.join(" ") === n) return 1;
  if (tokens.join(" ").includes(n)) return 0.9;
  let best = 0;
  for (const token of tokens) {
    const dist = levenshteinDistance(n, token);
    const score = normScore(dist, Math.max(n.length, token.length));
    if (score > best) best = score;
  }
  if (best > 0.66) return best;
  return 0;
}

const SEARCH_FIELDS = [
  { key: "id", weight: 1.0 },
  { key: "displayName", weight: 1.0 },
  { key: "description", weight: 0.8 },
  { key: "rawCategory", weight: 0.7 },
  { key: "normalizedCategory", weight: 0.7 },
  { key: "source", weight: 0.5 },
  { key: "triggers", weight: 0.9, join: true },
  { key: "aliases", weight: 0.9, join: true },
  { key: "tags", weight: 0.6, join: true }
];

function searchSkills(views, query, { scope = "all", status } = {}) {
  const startedAt = Date.now();
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return { results: [], elapsedMs: 0 };

  const results = [];
  for (let index = 0; index < views.length; index++) {
    const view = views[index];
    if (scope === "project" && view.source !== "project") continue;
    if (scope === "global" && !["maestro", "global"].includes(view.source)) continue;
    if (status && view.status !== status) continue;
    let best = 0;
    let bestKey = null;
    for (const field of SEARCH_FIELDS) {
      const fields = Array.isArray(view[field.key])
        ? view[field.key].join(" ")
        : String(view[field.key] || "");
      if (!fields) continue;
      const fieldScore = matchField(needle, fields);
      const prefix = fieldPrefixBoost(needle, fields) * field.weight;
      const combined = fieldScore * field.weight + prefix;
      if (combined > best) {
        best = combined;
        bestKey = field.key;
      }
    }
    if (best > 0.4) {
      results.push({ index, score: best, key: bestKey });
    }
  }
  results.sort((a, b) => b.score - a.score || a.index - b.index);
  return { results, elapsedMs: Date.now() - startedAt };
}

module.exports = { searchSkills, levenshteinDistance, normalize: tokenize, MAX_CATALOG_MS };
