"use strict";

function createIntentQuestion(params) {
  if (typeof params.id !== "string") throw new TypeError("id must be a string");
  if (typeof params.dimension !== "string") throw new TypeError("dimension must be a string");
  if (typeof params.text !== "string") throw new TypeError("text must be a string");

  // blocking, allowFreeText, allowRecommendation should default to false if not provided, or check if bool
  const blocking = params.blocking === true;
  const allowFreeText = params.allowFreeText === true;
  const allowRecommendation = params.allowRecommendation === true;

  if (params.blocking !== undefined && typeof params.blocking !== "boolean") {
    throw new TypeError("blocking must be boolean");
  }

  const options = Array.isArray(params.options) ? [...params.options] : [];

  return Object.freeze({
    id: params.id,
    dimension: params.dimension,
    text: params.text,
    options: options,
    blocking: blocking,
    reason: params.reason || "",
    allowFreeText: allowFreeText,
    allowRecommendation: allowRecommendation
  });
}

module.exports = {
  createIntentQuestion
};
