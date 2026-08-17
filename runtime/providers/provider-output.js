"use strict";

/**
 * Normalizes provider stdout into the assistant's plain-text response so that
 * downstream JSON parsers (refinement proposals, task-graph plans) can consume
 * either a single JSON object OR a structured JSON event stream (NDJSON).
 *
 * Support matrix:
 *  - Single JSON object (e.g. a codex --json execution) -> passthrough.
 *  - NDJSON event stream (e.g. `opencode run --format json` emitting
 *    step_start/text/step_finish events, or claude stream-json) -> the text
 *    parts are concatenated and returned.
 *  - Codex `exec --json`: each line is `{ "item": { type: "message", content: [...] } }`
 *    and the assistant text lives at `item.text` or `item.content[].text`.
 *  - Claude `--print --output-format stream-json`: assistant text lives at
 *    `message.content[].text` (and `delta.text` for content_block_delta events).
 *  - Transport error event (`type: "error"`) -> returned verbatim so callers
 *    reject it instead of mistaking it for an empty/valid proposal.
 */
function extractAssistantText(stdout) {
  if (typeof stdout !== "string" || stdout.trim() === "") {
    return stdout;
  }
  const trimmed = stdout.trim();
  const lines = trimmed.split("\n");

  // Single-line output: already a plain JSON object/proposal (or a lone error).
  if (lines.length === 1) {
    return trimmed;
  }

  const textParts = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // non-JSON line (e.g. the prompt echo) -> ignore
    }
    if (!obj || typeof obj !== "object") continue;

    // A transport error must never be read as a proposal.
    if (obj.type === "error" || (obj.error && typeof obj.error === "object")) {
      return line;
    }

    const text = stringifyAssistantText(obj);
    if (text && text.trim() !== "") {
      textParts.push(text);
    }
  }

  return textParts.length > 0 ? textParts.join("\n") : stdout;
}

/**
 * Collects the assistant's text payload from a single decoded NDJSON event,
 * regardless of which third-party CLI produced it.
 */
function stringifyAssistantText(obj) {
  if (!obj || typeof obj !== "object") return undefined;

  // opencode: { part: { type: "text", text } } or a top-level { text }.
  if (obj.part && typeof obj.part.text === "string" && obj.part.type === "text") {
    return obj.part.text;
  }
  if (typeof obj.text === "string") return obj.text;

  // codex exec --json: { item: { type: "message", content: [...] } }.
  if (obj.item && typeof obj.item === "object") {
    if (typeof obj.item.text === "string") return obj.item.text;
    const contentText = textFromContent(obj.item.content);
    if (contentText !== undefined) return contentText;
  }

  // claude --output-format stream-json: { message: { content: [...] } }.
  if (obj.message && typeof obj.message === "object") {
    const contentText = textFromContent(obj.message.content);
    if (contentText !== undefined) return contentText;
  }

  // claude content_block_delta: { delta: { type: "text_delta", text } }.
  if (obj.delta && typeof obj.delta.text === "string") return obj.delta.text;

  // Generic { content: string } envelope.
  if (typeof obj.content === "string") return obj.content;

  return undefined;
}

function textFromContent(content) {
  if (!Array.isArray(content)) return undefined;
  const parts = [];
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.type === "text" && typeof entry.text === "string") parts.push(entry.text);
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

module.exports = { extractAssistantText, stringifyAssistantText };