// Browser check of the room scan: the viewer's directions, and the capture in manual and sensor modes.
// Needs `npm run dev -- -p 3997` and playwright-core.
import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://localhost:3997";
const shots = process.env.SHOTS ?? ".";
const b = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const ctx = await b.newContext({ viewport: { width: 900, height: 900 }, permissions: ["camera", "geolocation"], geolocation: { latitude: 35.78, longitude: -78.64 } });
const errs = [];
const p = await ctx.newPage();
p.on("pageerror", (e) => errs.push(e.message));

// Viewer: looking north should show the 0 degree photo; turning right should bring 30 and 90 into view.
await p.goto(`${base}/dev-preview/scan-view`, { waitUntil: "networkidle" });
const view = p.locator('[role="application"]');
await view.focus();
const visibleLabel = async () => {
  // The photo whose centre is nearest the middle of the view.
  return p.evaluate(() => {
    const box = document.querySelector('[role="application"]').getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    let best = null, bd = 1e9;
    for (const img of document.querySelectorAll("img[data-yaw]")) {
      const r = img.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (d < bd && r.width > 5) { bd = d; best = `${img.dataset.yaw}/${img.dataset.pitch}`; }
    }
    return best;
  });
};
console.log("facing start:", await visibleLabel());
// Directions: 30 degrees (clockwise from north) must sit to the right of 0, and the 55 degree ring above the horizon.
const centre = (sel) => p.evaluate((q) => { const i = document.querySelector(q); const r = i.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const [x0, y0] = await centre('img[data-yaw="0"][data-pitch="0"]');
const [x30] = await centre('img[data-yaw="30"][data-pitch="0"]');
const [, yUp] = await centre('img[data-yaw="0"][data-pitch="55"]');
const [, yDown] = await centre('img[data-yaw="0"][data-pitch="-55"]');
console.log("30 is right of 0:", x30 > x0, "| up ring above:", yUp < y0, "| down ring below:", yDown > y0);
await p.screenshot({ path: `${shots}/scan-view-0.png` });
// Pins sit where they were put, and tapping one in placing mode would map back to the same direction.
const pinCount = await p.locator("button[aria-label]").count();
const [px] = await centre('button[aria-label="Smart TV"]');
console.log("pins shown:", pinCount, "| TV pin (60 deg) right of the 0 deg photo:", px > x0);
await p.screenshot({ path: `${shots}/scan-pins.png` });
for (let i = 0; i < 11; i++) await p.keyboard.press("ArrowRight"); // 88 degrees
console.log("after turning right 88:", await visibleLabel());
for (let i = 0; i < 11; i++) await p.keyboard.press("ArrowUp"); // up 88
console.log("after looking up 88:", await visibleLabel());
await p.screenshot({ path: `${shots}/scan-view-1.png` });

// Measuring: four floor corners 90 degrees apart, each 32 degrees below the horizon, seen from 4.5 ft up, are 7.2 ft away.
// That is a diamond whose smallest bounding square is about 10.2 ft a side (104 sq ft).
await p.goto(`${base}/dev-preview/scan-measure`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: /Mark floor corners/ }).click();
const stage = p.locator('[role="application"]');
await stage.focus();
for (let i = 0; i < 4; i++) await p.keyboard.press("ArrowDown"); // 32 degrees down
const box = await stage.boundingBox();
for (let c = 0; c < 4; c++) {
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 11; i++) await p.keyboard.press("ArrowRight"); // 88 degrees, close to a quarter turn
}
console.log("estimate:", (await p.getByTestId("estimate").textContent())?.trim());
await p.screenshot({ path: `${shots}/scan-measure.png` });

// Capture, manual: no direction sensors in this browser, so photos are placed in order.
await p.goto(`${base}/dev-preview/scan`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Start scan" }).click();
await p.getByRole("button", { name: /Take photo/ }).waitFor({ timeout: 8000 });
for (let i = 0; i < 9; i++) { await p.getByRole("button", { name: /Take photo/ }).click(); await p.waitForTimeout(250); }
console.log("manual:", (await p.getByText(/photos taken/).textContent())?.trim());
await p.getByRole("button", { name: "Finish and seal" }).click();
await p.getByText("Scan finished (demo)").waitFor({ timeout: 8000 });
console.log("manual finish ok:", await p.getByText(/photos were taken/).textContent());

// Capture, sensor: turn the phone in steps and expect markers to be reached on their own.
await p.goto(`${base}/dev-preview/scan`, { waitUntil: "networkidle" });
await p.evaluate(() => {
  window.__alpha = 0;
  setInterval(() => window.dispatchEvent(Object.assign(new Event("deviceorientation"), { alpha: window.__alpha, beta: 90, gamma: 0, absolute: false })), 40);
});
await p.getByRole("button", { name: "Start scan" }).click();
await p.getByRole("button", { name: /Take photo/ }).waitFor({ timeout: 8000 });
for (let a = 0; a < 360; a += 30) {
  await p.evaluate((v) => (window.__alpha = v), (360 - a) % 360); // alpha is counterclockwise, so facing yaw a means alpha 360-a
  await p.waitForTimeout(900);
}
console.log("sensor:", (await p.getByText(/photos taken/).textContent())?.trim());
await p.screenshot({ path: `${shots}/scan-capture.png` });
console.log("page errors:", errs);
await b.close();
