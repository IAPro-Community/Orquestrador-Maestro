const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { Button, IconButton } = require("../src/components/Button");

describe("Button", () => {
  it("should render with label", () => {
    const html = Button({ label: "Click me" });
    assert.ok(html.includes("Click me"));
    assert.ok(html.includes("btn-primary"));
  });

  it("should render with variant", () => {
    const html = Button({ label: "Submit", variant: "danger" });
    assert.ok(html.includes("btn-danger"));
  });
});
