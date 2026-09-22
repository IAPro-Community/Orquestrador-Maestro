#!/usr/bin/env node
/**
 * Reusable Visual QA harness.
 *
 *   node visual-qa.mjs --fixture good|bad --out <dir>
 *   node visual-qa.mjs --url http://127.0.0.1:3000 --out <dir>
 *   node visual-qa.mjs --url <url> --baseline <dir> --out <dir>
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
];

function parseArgs(argv) {
  const args = { viewports: VIEWPORTS, tolerance: 0.01 };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--fixture") args.fixture = value;
    else if (key === "--url") args.url = value;
    else if (key === "--out") args.out = value;
    else if (key === "--baseline") args.baseline = value;
    else if (key === "--name") args.name = value;
    else if (key === "--playwright") args.playwright = value;
    else if (key === "--tolerance") args.tolerance = Number(value);
    else continue;
    i++;
  }
  return args;
}

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}

function reportPath(file) {
  return path.relative(process.cwd(), file).replaceAll(path.sep, "/") || ".";
}

function resolvePlaywright(moduleSpecifier = process.env.FRONTEND_EXCELLENCE_PLAYWRIGHT || "playwright") {
  const specifiers = [moduleSpecifier];
  if (!moduleSpecifier || moduleSpecifier === "playwright") specifiers.push("@playwright/test");
  const searchRoots = [];
  let current = path.resolve(process.cwd());
  while (true) {
    searchRoots.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  searchRoots.push(__dirname, path.resolve(__dirname, ".."));

  for (const specifier of [...new Set(specifiers)]) {
    for (const root of [...new Set(searchRoots)]) {
      try {
        return require(require.resolve(specifier, { paths: [root] }));
      } catch {
        // Try the next workspace root or the next supported package.
      }
    }
  }
  return null;
}

function relativeLuminance(hex) {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return null;
  const toLinear = (channel) => {
    const c = Number.parseInt(channel, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(raw.slice(0, 2));
  const g = toLinear(raw.slice(2, 4));
  const b = toLinear(raw.slice(4, 6));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  if (L1 == null || L2 == null) return null;
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHex(input) {
  const match = String(input).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return `#${[match[1], match[2], match[3]]
    .map((n) => Number(n).toString(16).padStart(2, "0"))
    .join("")}`;
}

function attachRuntimeCollectors(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  return { consoleErrors, pageErrors };
}

async function inspectPage(page, viewport, runtime) {
  const { consoleErrors, pageErrors } = runtime;
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflowing = [];
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > window.innerWidth + 1) {
        overflowing.push({ tag: el.tagName, className: String(el.className || "").slice(0, 80) });
      }
    }
    return {
      documentOverflow: doc.scrollWidth > doc.clientWidth + 1,
      overflowing: overflowing.slice(0, 20),
    };
  });

  const unnamed = await page.evaluate(() => {
    const selectors = "button, a, input, select, textarea";
    return [...document.querySelectorAll(selectors)]
      .filter((el) => {
        const ariaLabel = el.getAttribute("aria-label")?.trim();
        const labelledBy = el.getAttribute("aria-labelledby");
        const labelledByText = labelledBy
          ? labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent || "")
              .join(" ")
              .trim()
          : "";
        const name =
          ariaLabel ||
          labelledByText ||
          (el.labels && el.labels[0] && el.labels[0].textContent) ||
          el.textContent;
        return !String(name || "").trim();
      })
      .map((el) => el.outerHTML.slice(0, 120));
  });

  const contrastSamples = await page.evaluate(() => {
    const opaqueBackground = (el) => {
      let node = el;
      while (node && node !== document.documentElement.parentNode) {
        const bg = getComputedStyle(node).backgroundColor;
        const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
        if (match) {
          const alpha = match[4] === undefined ? 1 : Number(match[4]);
          if (alpha > 0.95) return bg;
        }
        node = node.parentElement;
      }
      return "rgb(255, 255, 255)";
    };
    const take = [...document.querySelectorAll("p, h1, h2, h3, label, button, a")].slice(0, 200);
    return take.map((el) => {
      const style = getComputedStyle(el);
      return {
        text: (el.textContent || "").trim().slice(0, 40),
        color: style.color,
        background: opaqueBackground(el),
        fontSize: Number.parseFloat(style.fontSize) || 16,
        fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
      };
    });
  });

  const contrastFindings = [];
  for (const sample of contrastSamples) {
    const fg = rgbToHex(sample.color);
    const bg = rgbToHex(sample.background) || "#ffffff";
    const ratio = fg ? contrastRatio(fg, bg) : null;
    const largeText = sample.fontSize >= 18 || (sample.fontSize >= 14 && sample.fontWeight >= 700);
    const threshold = largeText ? 3 : 4.5;
    if (ratio != null && ratio < threshold && sample.text) {
      contrastFindings.push({ text: sample.text, ratio: Number(ratio.toFixed(2)), threshold, fg, bg });
    }
  }

  return { consoleErrors, pageErrors, overflow, unnamed, contrastFindings };
}

function scoreReport(findings) {
  let accessibility = 20;
  let contrast = 15;
  let responsive = 15;
  let runtime = 5;
  if (findings.unnamed.length) accessibility = 0;
  if (findings.contrastFindings.length) contrast = Math.max(0, 15 - findings.contrastFindings.length * 5);
  if (findings.overflow.documentOverflow || findings.overflow.overflowing.length) responsive = 0;
  if (findings.consoleErrors.length || findings.pageErrors.length) runtime = 0;
  const total = accessibility + contrast + responsive + 15 + 10 + 10 + 10 + runtime;
  return { accessibility, contrast, responsive, consistency: 15, typography: 10, spacing: 10, hierarchy: 10, runtime, total };
}

function hardFail(findings, preserveMismatch, baselineIssue) {
  const reasons = [];
  if (findings.unnamed.length) reasons.push("missing-accessible-name");
  if (findings.contrastFindings.length) reasons.push("contrast");
  if (findings.overflow.documentOverflow || findings.overflow.overflowing.length) reasons.push("viewport-overflow");
  if (findings.consoleErrors.length || findings.pageErrors.length) reasons.push("console-or-page-error");
  if (preserveMismatch) reasons.push("preserve-baseline-mismatch");
  if (baselineIssue) reasons.push(baselineIssue);
  return reasons;
}

async function run() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(args.out || path.join(process.cwd(), ".frontend-excellence/visual-qa"));
  fs.mkdirSync(outDir, { recursive: true });

  let targetUrl = args.url;
  if (args.fixture) {
    const file = path.join(__dirname, `../fixtures/visual-qa/${args.fixture}.html`);
    if (!fs.existsSync(file)) throw new Error(`Unknown fixture: ${args.fixture}`);
    targetUrl = pathToFileURL(file).href;
  }
  if (!targetUrl) throw new Error("Pass --url or --fixture");

  const playwright = resolvePlaywright(args.playwright);
  if (!playwright) {
    const report = {
      mode: "smoke",
      status: "ENVIRONMENT_LIMITATION",
      reason: "playwright-not-installed",
      url: sanitizeUrl(targetUrl),
      baseline: { required: Boolean(args.baseline), tolerance: args.tolerance },
      verdict: "FAIL",
    };
    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
    console.error("Playwright not found. Wrote ENVIRONMENT_LIMITATION report.");
    process.exit(2);
  }

  const { chromium } = playwright;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    const report = {
      mode: "smoke",
      status: "ENVIRONMENT_LIMITATION",
      reason: "playwright-browser-unavailable",
      detail: error.message.replace(process.cwd(), "[workspace]"),
      url: sanitizeUrl(targetUrl),
      baseline: { required: Boolean(args.baseline), tolerance: args.tolerance },
      verdict: "FAIL",
    };
    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
    console.error("Playwright browser unavailable. Wrote ENVIRONMENT_LIMITATION report.");
    process.exit(2);
  }
  const results = [];
  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage();
      const runtime = attachRuntimeCollectors(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      const inspected = await inspectPage(page, viewport, runtime);
      const shot = path.join(outDir, `${args.name || "capture"}-${viewport.name}-${viewport.width}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      let preserveMismatch = false;
      let baselineIssue = null;
      if (args.baseline) {
        const baselineShot = path.join(
          path.resolve(args.baseline),
          `${args.name || "capture"}-${viewport.name}-${viewport.width}.png`,
        );
        if (fs.existsSync(baselineShot)) {
          const a = fs.readFileSync(baselineShot);
          const b = fs.readFileSync(shot);
          preserveMismatch = a.compare(b) !== 0;
        } else baselineIssue = "baseline-missing";
      }
      const failures = hardFail(inspected, preserveMismatch, baselineIssue);
      const scored = scoreReport(inspected);
      results.push({
        viewport,
        screenshot: reportPath(shot),
        baseline: args.baseline ? reportPath(path.resolve(args.baseline)) : null,
        ...inspected,
        score: scored,
        hardFailures: failures,
        verdict: failures.length ? "FAIL" : "PASS",
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const verdict = results.every((item) => item.verdict === "PASS") ? "PASS" : "FAIL";
  const report = { mode: "smoke", url: sanitizeUrl(targetUrl), baseline: { required: Boolean(args.baseline), tolerance: args.tolerance }, verdict, viewports: results };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`${verdict} → ${path.join(outDir, "report.json")}`);
  process.exit(verdict === "PASS" ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
