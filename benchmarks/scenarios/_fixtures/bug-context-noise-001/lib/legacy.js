"use strict";

function legacyFormatDate(date) {
  return new Date(date).toISOString().split("T")[0];
}

function legacyParseBool(val) {
  if (val === "true" || val === "1") return true;
  if (val === "false" || val === "0") return false;
  return Boolean(val);
}

function legacyRandomId() {
  return Math.random().toString(36).slice(2);
}

module.exports = { legacyFormatDate, legacyParseBool, legacyRandomId };
