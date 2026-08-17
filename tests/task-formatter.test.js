const { test } = require("node:test");
const assert = require("node:assert");
const { formatTasks, wrapText } = require("../runtime/planner/task-formatter");

test("wrapText should wrap long lines based on width", () => {
  const text = "Planejamento da solução e arquitetura avançada de microserviços";
  const wrapped = wrapText(text, 20);
  assert.deepStrictEqual(wrapped, [
    "Planejamento da",
    "solução e",
    "arquitetura avançada",
    "de microserviços"
  ]);
});

test("wrapText should handle very narrow widths by forcing single words", () => {
  const text = "Planejamento estrutural";
  const wrapped = wrapText(text, 5); // word 'Planejamento' is 12 chars
  // Should put "Planejamento" on its own line despite being larger than width
  assert.deepStrictEqual(wrapped, ["Planejamento", "estrutural"]);
});

test("formatTasks should format correctly and be defensive with missing properties", () => {
  const tasks = [
    { label: "Planejamento da solução", complexity: "reasoning", provider: "claude" },
    { label: undefined, complexity: undefined, provider: undefined }
  ];

  const formatted = formatTasks(tasks, 80);

  const expected = `01  Planejamento da solução
    REASONING · Claude

02  Tarefa não nomeada
    STANDARD · Default`;

  assert.strictEqual(formatted, expected);
});

test("formatTasks should wrap label properly", () => {
  const tasks = [
    { label: "Planejamento da solução e arquitetura avançada de microserviços", complexity: "economy", provider: "opencode" }
  ];

  const formatted = formatTasks(tasks, 24); // prefix is 4 ("01  "), so available width is 20

  const expected = `01  Planejamento da
    solução e
    arquitetura avançada
    de microserviços
    ECONOMY · Opencode`;

  assert.strictEqual(formatted, expected);
});
