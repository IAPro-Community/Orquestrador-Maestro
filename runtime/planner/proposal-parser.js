"use strict";

const { extractAssistantText } = require("../providers/provider-output");

class StructuredOutputError extends Error {
  constructor(message) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

function parseRefinementProposal(rawOutput) {
  if (typeof rawOutput !== "string" || rawOutput.trim() === "") {
    throw new StructuredOutputError("Output is empty or not a string.");
  }

  // Normalize a structured NDJSON event stream (opencode run --format json,
  // claude stream-json, ...) into the assistant's plain-text response. A single
  // JSON object is passed through unchanged; transport-error events are returned
  // verbatim so they are rejected below rather than read as an empty proposal.
  const content = extractAssistantText(rawOutput);

  let jsonStr = content;
  const match = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (match) {
    jsonStr = match[1];
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new StructuredOutputError("Failed to parse JSON.");
  }

  // Schema validation
  if (parsed && typeof parsed === "object") {
    // Reject provider transport errors (e.g. `opencode run` error events)
    // instead of silently treating them as an empty proposal.
    if (parsed.type === "error" || (parsed.error && typeof parsed.error === "object")) {
      throw new StructuredOutputError("Provider returned a transport error, not a proposal.");
    }
    if (parsed.addRequirements && !Array.isArray(parsed.addRequirements)) {
      throw new StructuredOutputError("addRequirements must be an array.");
    }
    if (parsed.addConstraints && !Array.isArray(parsed.addConstraints)) {
      throw new StructuredOutputError("addConstraints must be an array.");
    }
    if (parsed.detectedUnknowns && !Array.isArray(parsed.detectedUnknowns)) {
      throw new StructuredOutputError("detectedUnknowns must be an array.");
    }

    // Default valid shape
    return {
      updates: parsed.updates || {},
      addRequirements: parsed.addRequirements || [],
      addConstraints: parsed.addConstraints || [],
      detectedUnknowns: parsed.detectedUnknowns || [],
      question: parsed.question || null,
      recommendation: parsed.recommendation || null
    };
  }

  throw new StructuredOutputError("Output is not a valid object.");
}

module.exports = {
  parseRefinementProposal,
  StructuredOutputError
};
