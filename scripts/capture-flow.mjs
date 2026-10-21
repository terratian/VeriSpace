// Browser test for the capture screen. Needs `npm run dev -- -p 3997` running and playwright-core installed
// (npm i -D playwright-core). Usage: node scripts/capture-flow.mjs <screenshot-dir> [crew|guest]
// Set CHROME_PATH to a Chromium binary if Playwright cannot find its own.
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
const mode = process.argv[4] || "ok";
let failUploads = mode === "upload-fail";
const out = process.argv[2];
const role = process.argv[3] || "crew";
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ["camera"], colorScheme: "dark" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE.ERROR", m.text().slice(0, 200)); });

const calls = [];
let seq = 0;
await page.route("**/api/uploads", async (route) => {
  const r = route.request(); const h = r.headers();
  const buf = r.postDataBuffer();
  calls.push({ api: "uploads", type: h["content-type"], room: h["x-room-id"], claimedSha: h["x-frame-sha256"]?.slice(0, 12), actualSha: buf ? createHash("sha256").update(buf).digest("hex").slice(0, 12) : null, bytes: buf?.length, result: failUploads ? 500 : 200 });
  if (failUploads) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "storage down" }) });
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
});
await page.route("**/api/ledger", async (route) => {
  const b = JSON.parse(route.request().postData() || "{}");
  calls.push({ api: "ledger", ...b });
  seq += 1;
  await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: seq, seq, rowHash: "a1b2c3d4".repeat(8) }) });
});

const list = async (label) => {
  const items = await page.locator("button:visible, a:visible").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean));
  console.log(label, JSON.stringify(items));
};
const shot = (n) => page.screenshot({ path: `${out}/${role}-${n}.png` });

await page.goto(`http://localhost:3997/dev-preview?role=${role}`, { waitUntil: "networkidle" });
await shot("1-rooms"); await list("ROOMS");
await page.getByText("Living Room").first().click();
await page.waitForTimeout(400);
await shot("2-room"); await list("ROOM");

await page.getByRole("button", { name: "Start cleaning" }).click();
await page.waitForTimeout(500);
await shot("3-started"); await list("STARTED");

await page.getByRole("button", { name: "Take verification photo" }).click();
const dialog = page.getByRole("dialog");
await dialog.waitFor({ timeout: 8000 });
await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 2 && v.videoWidth > 0; }, null, { timeout: 8000 });
await page.waitForTimeout(600);
await shot("4-camera"); await list("CAMERA");

await page.getByRole("button", { name: "Take photo" }).click();
await page.getByRole("dialog", { name: /./ }).last().waitFor();
await page.waitForSelector('img[alt="The photo you just took"]', { timeout: 8000 });
await page.waitForTimeout(800);
await shot("5-review"); await list("REVIEW");
const shownHash = await page.locator("text=/[0-9a-f]{8,}/").first().innerText().catch(() => "?");
console.log("HASH ON SCREEN:", shownHash.replace(/\s+/g, " ").slice(0, 12));

await page.getByRole("button", { name: "Record photo" }).click();
await page.waitForTimeout(1200);
await shot("6-after-record"); await list("AFTER RECORD");
const alertText = await page.getByRole("alert").allInnerTexts().catch(() => []);
console.log("ALERTS:", JSON.stringify(alertText.map((t) => t.replace(/\s+/g, " ").trim())));
console.log("LEDGER CALLS SO FAR:", calls.filter((c) => c.api === "ledger").map((c) => c.eventType).join(","));
if (failUploads) {
  failUploads = false;
  await page.getByRole("button", { name: /Record photo|Try again|Retry/ }).first().click();
  await page.waitForTimeout(1200);
  await shot("7-after-retry"); await list("AFTER RETRY");
  console.log("LEDGER CALLS AFTER RETRY:", calls.filter((c) => c.api === "ledger").map((c) => c.eventType).join(","));
}
await browser.close();
console.log("CALLS", JSON.stringify(calls));
