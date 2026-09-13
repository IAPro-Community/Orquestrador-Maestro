"use strict";

const { extractAssistantText } = require("../providers/provider-output");

function reviewRequired(policy) {
  return policy?.reviewRequirement === "independent";
}

function bounded(value, maxChars) {
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  if (text.length <= maxChars) return { value: text, truncated: false };
  return { value: `${text.slice(0, Math.max(0, maxChars - 28))}\n...[truncated]`, truncated: true };
}

function buildReviewPrompt({ task = {}, diff = "", verification = {}, evidence = [], constraints = [], maxTokens = 12000 } = {}) {
  const maxChars = Math.max(4000, maxTokens * 4);
  const sections = [
    ["OBJECTIVE", task.expectedOutcome || task.objective || task.description || ""],
    ["ACCEPTANCE", task.acceptanceCriteria || []],
    ["CONSTRAINTS", constraints],
    ["VERIFICATION", { status: verification.status, checks: verification.checks || [] }],
    ["EVIDENCE", evidence.map((item) => ({ type: item?.type, acceptanceCriterion: item?.acceptanceCriterion, acceptanceCriterionId: item?.acceptanceCriterionId, content: item?.content }))],
    ["DIFF", diff]
  ];
  let remaining = maxChars;
  let truncated = false;
  const output = ["You are an independent engineering reviewer. Do not edit files. Return only JSON: {\"verdict\":\"approved|rejected|inconclusive\",\"findings\":[],\"summary\":\"...\"}."];
  for (const [name, value] of sections) {
    const sectionBudget = remaining <= 0 ? 0 : Math.min(remaining, name === "DIFF" ? remaining : Math.max(500, Math.floor(maxChars / 3)));
    const item = bounded(value, sectionBudget);
    output.push(`${name}:\n${item.value}`);
    remaining -= item.value.length;
    truncated ||= item.truncated;
  }
  return Object.freeze({ prompt: output.join("\n\n"), truncated });
}

function parseReviewResult(stdout) {
  const text = String(extractAssistantText(stdout) || "").trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  try {
    const parsed = JSON.parse(text);
    if (!parsed || !["approved", "rejected", "inconclusive"].includes(parsed.verdict)) throw new Error("invalid verdict");
    return Object.freeze({ verdict: parsed.verdict, findings: Array.isArray(parsed.findings) ? parsed.findings : [], summary: typeof parsed.summary === "string" ? parsed.summary : "" });
  } catch {
    return Object.freeze({ verdict: "inconclusive", findings: [{ code: "REVIEW_RESULT_INVALID" }], summary: "Reviewer did not return the required JSON contract." });
  }
}

module.exports = { reviewRequired, buildReviewPrompt, parseReviewResult };
