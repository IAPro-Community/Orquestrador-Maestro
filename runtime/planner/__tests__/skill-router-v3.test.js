"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SkillRouterV3, routingSignalSummary } = require("../skill-router-v3");

function writeJson(root, name, value) {
  fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2), "utf8");
}

function writeSkill(root, id, description) {
  const directory = path.join(root, "skills", id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "SKILL.md"), "---\nname: " + id + "\ndescription: " + description + "\n---\n", "utf8");
}

function entry(description, useWhen, doNotUseWhen) {
  return {
    schemaVersion: 2,
    contractVersion: "1.0.0",
    origin: "maestro-core",
    maturity: "stable",
    description,
    category: "frontend",
    risk: "low",
    capabilities: ["frontend"],
    routing: { useWhen, doNotUseWhen: doNotUseWhen || [] },
    context: { required: [], useful: [], avoid: ["unrelated-domains"] },
    outputs: ["verified-result"],
    verification: { level: "standard", requirements: ["verified"] },
    costProfile: { context: "low" }
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-router-v3-"));
  writeJson(root, "SKILL_ALIASES.json", { aliases: {
    "frontend-design": "skill-open-design-ui",
    "impeccable": "skill-impeccable"
  }});
  writeJson(root, "SKILL_CHAINS.json", { chains: {
    "skill-open-design-ui": { mayInvoke: ["skill-impeccable"] }
  }});
  writeJson(root, "SKILLS_ROUTER.json", {
    skills: {
      "skill-open-design-ui": { priority: 5, safety: "standard" },
      "skill-impeccable": { priority: 0, safety: "standard" },
      "skill-multiagent-orchestration": { priority: 10, safety: "standard" }
    },
    librarySkills: {},
    capabilityRoutes: {
      "frontend-excellence": {
        triggers: ["modernize esta tela"],
        skills: ["skill-open-design-ui"]
      },
      "security": {
        triggers: ["security review"],
        skills: ["skill-open-design-ui"]
      }
    }
  });
  writeJson(root, "SKILLS_MANIFEST.json", { version: 3, skills: {
    "skill-open-design-ui": entry("Design direction", ["art direction", "tirar cara de template"], ["Auditoria final de acessibilidade sem nova direção visual."]),
    "skill-impeccable": entry("Polish", ["impeccable", "auditar hierarquia"], ["Redesign completo de produto."]),
    "skill-multiagent-orchestration": {
      ...entry(
        "Provider-level multiagent orchestration",
        ["multiagent", "multi-agent"],
        ["Tarefa mecânica que não exige paralelismo."]
      ),
      category: "orchestration",
      capabilities: ["orchestration"]
    }
  }});
  writeSkill(root, "skill-open-design-ui", "Design direction");
  writeSkill(root, "skill-impeccable", "Polish");
  writeSkill(root, "skill-multiagent-orchestration", "Provider-level multiagent orchestration");
  return root;
}

test("exact alias selects canonical V2 skill", () => {
  const root = fixture();
  const router = new SkillRouterV3({ maestroRoot: root, userHome: fs.mkdtempSync(path.join(os.tmpdir(), "home-")) });
  const result = router.resolve("frontend-design");
  assert.equal(result.routingVersion, 3);
  assert.equal(result.primarySkill.id, "skill-open-design-ui");
  assert.equal(result.confidence, "high");
});

test("canonical useWhen routing is used instead of Router v2 triggers", () => {
  const root = fixture();
  const router = new SkillRouterV3({ maestroRoot: root });
  const result = router.resolve("quero tirar cara de template deste app");
  assert.equal(result.primarySkill.id, "skill-open-design-ui");
  assert.ok(result.matchedEvidence.some((item) => item.kind === "trigger-contained"));
});

test("negative routing rejects a candidate", () => {
  const root = fixture();
  const router = new SkillRouterV3({ maestroRoot: root });
  const result = router.resolve("auditoria final de acessibilidade sem nova direção visual");
  assert.notEqual(result.primarySkill?.id, "skill-open-design-ui");
  assert.ok(result.rejected.some((item) => item.id === "skill-open-design-ui" && item.reason === "negative-routing"));
});

test("complexity budget prevents eager chain loading", () => {
  const root = fixture();
  const router = new SkillRouterV3({ maestroRoot: root });
  const result = router.resolve("frontend-design impeccable");
  assert.ok(result.allSkills.length <= result.complexity.budget.maxSkills);
});

test("MICRO tasks can select at most one skill", () => {
  const root = fixture();
  const router = new SkillRouterV3({ maestroRoot: root });
  const result = router.resolve("faça um git commit dessas alterações");
  assert.equal(result.complexity.level, "MICRO");
  assert.ok(result.allSkills.length <= 1);
  assert.equal(result.complexity.budget.allowSubagents, false);
});

test("route explanation includes selection and context budget", () => {
  const root = fixture();
  const router = new SkillRouterV3({ maestroRoot: root });
  const explained = router.explain("frontend-design");
  assert.match(explained.text, /Complexity:/u);
  assert.match(explained.text, /Selected: skill-open-design-ui/u);
  assert.match(explained.text, /Estimated context:/u);
});

test("capability routes require compatibility with the Skill Contract V2", () => {
  const root = fixture();
  const router = new SkillRouterV3({ maestroRoot: root });
  const accepted = router.resolve("modernize esta tela");
  assert.equal(accepted.primarySkill?.id, "skill-open-design-ui");

  const rejected = router.resolve("security review");
  assert.equal(rejected.primarySkill, null);
  assert.ok(rejected.rejected.some((item) =>
    item.id === "skill-open-design-ui" && item.reason === "capability-mismatch"
  ));
});

test("fan-out orchestration skill is rejected when Complexity Gate does not allow subagents", () => {
  const root = fixture();
  const router = new SkillRouterV3({ maestroRoot: root });
  const result = router.resolve("multiagent para fazer um git commit");
  assert.equal(result.complexity.budget.allowSubagents, false);
  assert.notEqual(result.primarySkill?.id, "skill-multiagent-orchestration");
  assert.ok(result.rejected.some((item) =>
    item.id === "skill-multiagent-orchestration" && item.reason === "complexity-no-fanout"
  ));
});

test("stack, changed files and verified memory only refine an existing candidate", () => {
  const record = {
    id: "skill-open-design-ui",
    contract: {
      capabilities: ["frontend"],
      context: { required: ["design-system"] }
    }
  };
  const signals = routingSignalSummary(record, {
    stackCapabilities: ["frontend"],
    scopeCapabilities: ["frontend"],
    memorySkillHints: ["skill-open-design-ui"],
    availableContext: []
  });

  assert.deepEqual(signals.stackMatches, ["frontend"]);
  assert.deepEqual(signals.scopeMatches, ["frontend"]);
  assert.equal(signals.memoryHint, true);
  assert.deepEqual(signals.missingContext, ["design-system"]);
  assert.ok(signals.bonus > 0);
});

test("negative routing does not reject positive intent from incidental token overlap", () => {
  assert.equal(
    require("../skill-router-v3").negativeRouteMatches(
      "pesquisar e sintetizar fontes atuais",
      "Pesquisa que não exige fontes atuais ou síntese comparativa."
    ),
    false
  );
  assert.equal(
    require("../skill-router-v3").negativeRouteMatches(
      "criar uma skill nova para o Maestro",
      "Uso de uma skill existente para resolver a tarefa final."
    ),
    false
  );
});
