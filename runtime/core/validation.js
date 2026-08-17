"use strict";

const CAPABILITY_NAMES = Object.freeze([
  "headless",
  "structuredEvents",
  "streaming",
  "sessionResume",
  "toolApproval",
  "sandboxControl",
  "modelSelection",
  "mcp"
]);

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }

  return value;
}

function optionalString(value, name) {
  if (value === undefined) {
    return undefined;
  }

  return requiredString(value, name);
}

function optionalText(value, name) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  return value;
}

function optionalObject(value, name) {
  if (value === undefined) {
    return undefined;
  }

  assertObject(value, name);
  return Object.freeze({ ...value });
}

function optionalArray(value, name, mapItem = (item) => item) {
  if (value === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array`);
  }

  return Object.freeze(value.map(mapItem));
}

function enumValue(value, name, allowed, fallback) {
  const resolved = value === undefined ? fallback : value;
  if (!allowed.includes(resolved)) {
    throw new TypeError(`${name} must be one of: ${allowed.join(", ")}`);
  }

  return resolved;
}

function optionalTimestamp(value, name) {
  if (value === undefined) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${name} must be a valid date or ISO timestamp`);
  }

  return date.toISOString();
}

function capabilities(value = {}) {
  assertObject(value, "capabilities");

  for (const key of Object.keys(value)) {
    if (!CAPABILITY_NAMES.includes(key)) {
      throw new TypeError(`capabilities.${key} is not a known capability`);
    }
    if (typeof value[key] !== "boolean") {
      throw new TypeError(`capabilities.${key} must be a boolean`);
    }
  }

  return Object.freeze(Object.fromEntries(CAPABILITY_NAMES.map((name) => [name, value[name] === true])));
}

module.exports = {
  CAPABILITY_NAMES,
  assertObject,
  capabilities,
  enumValue,
  optionalArray,
  optionalObject,
  optionalString,
  optionalText,
  optionalTimestamp,
  requiredString
};
