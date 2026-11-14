#!/usr/bin/env node
/**
 * Capture README screenshots from a running standalone stack (after migrate + seed).
 * Usage: node scripts/capture-screenshots.mjs
 * Env: BASE_URL (default http://localhost:3000), DEMO_USERNAME, DEMO_PASSWORD
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const imagesDir = path.join(repoRoot, "docs", "images");

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const USERNAME = process.env.DEMO_USERNAME ?? "sandi.molefe@example.com";
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-local-only";

const VIEWPORT = { width: 1440, height: 900 };

const SHOTS = [
  { file: "hero.png", path: "/", waitMs: 1500 },
  { file: "feature-01.png", path: "/budget", waitMs: 1200 },
  { file: "feature-02.png", path: "/investments", waitMs: 1500 },
];

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input#username, input[name="username"]', USERNAME);
  await page.fill('input#password, input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

async function main() {
  await mkdir(imagesDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await login(page);

  for (const shot of SHOTS) {
    await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(shot.waitMs);
    if (shot.file === "feature-02.png") {
      const leaked = page.getByText(/Sheets read failed|googleapis|spreadsheet/i);
      if (await leaked.count()) {
        throw new Error("Investments screenshot still includes a live Sheets error");
      }
    }
    const outPath = path.join(imagesDir, shot.file);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`Wrote ${outPath}`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});