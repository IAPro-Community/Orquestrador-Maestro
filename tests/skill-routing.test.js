"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { IntentRouter } = require("../runtime/planner/intent-router.js");

const repoRoot = path.resolve(__dirname, "..");

test("native planning workflows are mirrored to every supported client", () => {
  const policy = JSON.parse(fs.readFileSync(
    path.join(repoRoot, "orquestrador", "SKILL_INSTALL_POLICY.json"),
    "utf8"
  ));
  const required = ["plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview"];

  for (const [program, target] of Object.entries(policy.nativeRoots)) {
    for (const skill of required) {
      assert.ok(
        target.allowDirectories.includes(skill),
        `${program} must allow the ${skill} workflow mirror`
      );
    }
  }
});

test("ralplan and plan are real packaged skill bodies", () => {
  for (const skill of ["plan", "ralplan"]) {
    const skillPath = path.join(repoRoot, "codex", "skills", skill, "SKILL.md");
    const body = fs.readFileSync(skillPath, "utf8");
    assert.match(body, new RegExp(`^name: ${skill}$`, "m"));
    assert.ok(body.trim().length > 100, `${skill} must not be a placeholder`);
  }
});

test("watch evidence routes observation requests without stealing media pipeline routes", () => {
  const router = new IntentRouter({ maestroRoot: path.join(repoRoot, "orquestrador") });

  const watched = router.resolve("watch-skill assistir vídeo e citar a evidência temporal");
  assert.equal(watched.primarySkill.id, "skill-watch-evidence");

  const pipeline = router.resolve("construir uma pipeline de live video com fila de video");
  assert.equal(pipeline.primarySkill.id, "skill-live-processing");

  const chained = router.resolve("watch-skill e depois fazer clip detection");
  assert.equal(chained.primarySkill.id, "skill-watch-evidence");
  assert.ok(
    chained.chainedSkills.some((skill) => skill.id === "skill-smart-clip-detection"),
    "watch evidence may chain to smart clip detection when the request asks for clips"
  );
});

test("premium web experience owns premium site intents and delegates focused UI concerns", () => {
  const router = new IntentRouter({ maestroRoot: path.join(repoRoot, "orquestrador") });
  const premiumIntents = [
    "criar um site premium para uma fintech",
    "fazer o redesign premium deste website",
    "criar uma landing page sofisticada",
    "quero um site cinematográfico com storytelling no scroll",
    "transformar esta página em uma experiência web premium",
    "make this website feel premium",
    "build a cinematic landing page",
    "create a scroll-driven website"
  ];

  for (const intent of premiumIntents) {
    const result = router.resolve(intent);
    assert.equal(
      result.primarySkill.id,
      "skill-premium-web-experience",
      `premium intent should route to the experience owner: ${intent}`
    );
  }

  const dashboard = router.resolve("criar um dashboard com tabela, formulário e estados de loading");
  assert.equal(dashboard.primarySkill.id, "skill-modern-ui-patterns");

  const guardrails = router.resolve("corrigir responsividade, overflow e foco de teclado");
  assert.equal(guardrails.primarySkill.id, "skill-frontend-ux-guardrails");

  const composed = router.resolve("site premium com visual system, tabela e responsividade");
  assert.equal(composed.primarySkill.id, "skill-premium-web-experience");
  assert.deepEqual(
    composed.chainedSkills.map((skill) => skill.id),
    [
      "skill-open-design-ui",
      "skill-modern-ui-patterns",
      "skill-frontend-ux-guardrails"
    ]
  );

  const focused = router.resolve("criar um botão de confirmar");
  assert.notEqual(focused.primarySkill?.id, "skill-premium-web-experience");
});

test("explicit invocation resolves a public library skill and ignores plugin cache", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-router-discovery-"));
  const maestroRoot = path.join(home, ".orquestrador");
  const skillPath = path.join(maestroRoot, "skill-library", "codex-skills", "skill-local-only", "SKILL.md");
  const cachedPath = path.join(home, ".codex", "plugins", "cache", "demo", "1", "skills", "skill-cached-only", "SKILL.md");
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.mkdirSync(path.dirname(cachedPath), { recursive: true });
  fs.writeFileSync(skillPath, "---\nname: skill-local-only\ndescription: Public library test skill\n---\n", "utf8");
  fs.writeFileSync(cachedPath, "---\nname: skill-cached-only\ndescription: Cache-only test skill\n---\n", "utf8");

  const router = new IntentRouter({
    maestroRoot,
    userHome: home
  });
  const result = router.resolve("/skill:skill-local-only");
  assert.equal(result.primarySkill.id, "skill-local-only");
  assert.equal(result.primarySkill.source, "library");
  assert.equal(result.primarySkill.path, path.dirname(skillPath));
  assert.equal(router.resolve("/skill:skill-cached-only").primarySkill, null);
});
