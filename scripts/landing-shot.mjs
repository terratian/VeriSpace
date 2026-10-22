// Screenshot the landing page. Needs `npm run dev -- -p 3997` and playwright-core.
import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
await p.goto(`${process.env.BASE ?? "http://localhost:3997"}/`, { waitUntil: "networkidle" });
await p.screenshot({ path: process.env.SHOT ?? "landing.png" });
await b.close();
