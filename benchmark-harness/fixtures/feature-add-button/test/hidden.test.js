const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { Button, IconButton } = require("../src/components/Button");

describe("Button - Hidden Tests", () => {
  it("should support all required variants: primary, secondary, danger, ghost", () => {
    const variants = ["primary", "secondary", "danger", "ghost"];
    for (const v of variants) {
      const html = Button({ label: "Test", variant: v });
      assert.ok(html.includes(`btn-${v}`), `Missing variant class: btn-${v}`);
    }
  });

  it("should support sizes: sm, md, lg", () => {
    const sizes = ["sm", "md", "lg"];
    for (const s of sizes) {
      const html = Button({ label: "Test", size: s });
      assert.ok(html.includes(`btn-${s}`), `Missing size class: btn-${s}`);
    }
  });

  it("should render disabled state", () => {
    const html = Button({ label: "Test", disabled: true });
    assert.ok(html.includes("disabled"));
    assert.ok(html.includes("btn-disabled"));
  });

  it("IconButton should render icon span", () => {
    const html = IconButton({ icon: "★", label: "Star" });
    assert.ok(html.includes("★"));
    assert.ok(html.includes("Star"));
    assert.ok(html.includes("btn-icon"));
  });
});
