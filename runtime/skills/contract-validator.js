"use strict";

const { projectLegacySkill } = require("./contract-v2");

function validateSkillContracts(records = []) {
  const issues = [];
  const seen = new Map();

  for (const record of records) {
    if (!record || typeof record !== "object") {
      issues.push({ code: "INVALID_SKILL_RECORD", id: null, message: "skill record must be an object" });
      continue;
    }

    let contract;
    try {
      contract = record.contract || projectLegacySkill(record);
    } catch (error) {
      issues.push({
        code: "INVALID_SKILL_CONTRACT",
        id: record.id || null,
        message: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    const previous = seen.get(contract.id);
    if (previous) {
      const previousIdentity = previous.identity || previous.namespace || "<unknown>";
      const currentIdentity = record.identity || record.namespace || "<unknown>";
      issues.push({
        code: "DUPLICATE_SKILL_ID",
        id: contract.id,
        message: `skill id ${contract.id} is exposed more than once: ${previousIdentity} and ${currentIdentity}`
      });
    } else {
      seen.set(contract.id, record);
    }

    if (contract.routing.useWhen.length === 0) {
      issues.push({
        code: "MISSING_POSITIVE_ROUTING",
        id: contract.id,
        message: `skill ${contract.id} has no useWhen routing evidence`
      });
    }

    if (["maestro-core", "maestro-domain"].includes(contract.origin)
      && contract.maturity === "stable"
      && contract.verification.level === "unknown") {
      issues.push({
        code: "MISSING_VERIFICATION_CONTRACT",
        id: contract.id,
        message: `stable Maestro skill ${contract.id} has no verification level`
      });
    }
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues.map((issue) => Object.freeze(issue)))
  });
}

module.exports = { validateSkillContracts };
