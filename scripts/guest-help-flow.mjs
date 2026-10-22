// Guest view shows attached guides and links. Needs `npm run dev -- -p 3997` and playwright-core.
import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://localhost:3997";
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto(`${base}/dev-preview?role=guest&demo=1`, { waitUntil: "networkidle" });
await p.getByText("Living Room").first().click();
const t = await p.textContent("body");
for (const s of ["Guides and links", "Wi-Fi and TV guide", "Fireplace manual", "Product page"]) console.log(s, t.includes(s) ? "ok" : "MISSING");
await b.close();
