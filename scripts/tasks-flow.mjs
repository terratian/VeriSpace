// Browser test for guide + checklist on the capture screens. Needs `npm run dev -- -p 3997` running.
// Usage: node scripts/tasks-flow.mjs <screenshot-dir>
import { chromium } from "playwright-core";
const out = process.argv[2];
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ["camera"], colorScheme: "dark" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const calls = [];
let seq = 0;
await page.route("**/api/uploads", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
await page.route("**/api/ledger", async (r) => {
  const b = JSON.parse(r.request().postData() || "{}");
  calls.push(b);
  seq += 1;
  await r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: seq, seq, rowHash: "a".repeat(64) }) });
});
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

// Guest: procedures, allergen, how-to.
await page.goto("http://localhost:3997/dev-preview?role=guest", { waitUntil: "networkidle" });
check("guest sees Check-in section", await page.getByText("Check-in").first().isVisible());
await page.getByText("Kitchen").first().click();
check("guest sees allergen box", await page.getByText("Allergen and health notes").isVisible());
check("guest sees allergen text", await page.getByText("Jars in the pantry may contain peanuts.").isVisible());
await page.screenshot({ path: `${out}/guest-kitchen.png` });

// Crew: tasks gate Finish.
await page.goto("http://localhost:3997/dev-preview?role=crew", { waitUntil: "networkidle" });
await page.getByText("Kitchen").first().click();
await page.getByRole("button", { name: "Start cleaning" }).click();
await page.getByRole("button", { name: /Wipe counters/ }).waitFor();
await page.getByRole("button", { name: /Wipe counters/ }).click();
await page.waitForTimeout(400);
const tick = calls.find((c) => c.eventType === "checklist_item");
check("plain task records itemId", tick?.payload?.itemId === "t1" && !tick?.frameSha256);
check("finish gated by tasks", await page.getByRole("button", { name: "Finish room" }).isDisabled());
check("hint says tasks left", await page.getByText(/1 task left/).isVisible());

await page.getByRole("button", { name: /Empty the fridge/ }).click();
const dialog = page.getByRole("dialog");
await dialog.waitFor({ timeout: 8000 });
await page.waitForTimeout(1200);
await dialog.getByRole("button", { name: /capture|take|shutter/i }).first().click();
await page.getByRole("button", { name: "Record task" }).waitFor({ timeout: 8000 });
await page.getByRole("button", { name: "Record task" }).click();
await page.waitForTimeout(800);
const photo = calls.filter((c) => c.eventType === "checklist_item").find((c) => c.payload?.itemId === "t2");
check("photo task records itemId and fingerprint", !!photo && /^[0-9a-f]{64}$/.test(photo.frameSha256 ?? ""));
check("tasks all recorded", await page.getByText("All recorded").isVisible());
check("finish now enabled", await page.getByRole("button", { name: "Finish room" }).isEnabled());
await page.screenshot({ path: `${out}/crew-kitchen.png` });
// Guest: features with status.
await page.goto("http://localhost:3997/dev-preview?role=guest", { waitUntil: "networkidle" });
await page.getByText("Primary Bedroom").first().click();
check("guest sees an out-of-service feature", await page.getByText("Out of service").isVisible());
check("guest sees the repair note", await page.getByText("Pump replacement ordered").isVisible());

// Manager: baseline photo for a feature.
calls.length = 0;
await page.goto("http://localhost:3997/dev-preview?role=manager", { waitUntil: "networkidle" });
await page.getByText("Living Room").first().click();
await page.getByRole("button", { name: /Gas fireplace/ }).click();
const d2 = page.getByRole("dialog");
await d2.waitFor({ timeout: 8000 });
await page.waitForTimeout(1200);
await d2.getByRole("button", { name: /capture|take|shutter/i }).first().click();
await page.getByRole("button", { name: "Record baseline" }).waitFor({ timeout: 8000 });
await page.getByRole("button", { name: "Record baseline" }).click();
await page.waitForTimeout(800);
const base = calls.find((c) => c.eventType === "baseline_photo");
check("baseline photo records the feature and fingerprint", base?.payload?.itemId === "f1" && /^[0-9a-f]{64}$/.test(base?.frameSha256 ?? ""));
check("feature shows as recorded", await page.getByText("1 of 2 recorded").isVisible());
await page.screenshot({ path: `${out}/manager-room.png` });
check("no page errors", errors.length === 0);
await browser.close();
process.exit(failed ? 1 : 0);
