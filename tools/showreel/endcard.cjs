// Renders the end card frame by frame. Served from the app's own origin so
// the fonts and the arrow load from /public without any CORS trouble.
//   node endcard.cjs --scale 1.25 --out end --seconds 4.6
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const SCALE = parseFloat(arg("scale", "0.5"));
const OUT = path.resolve(arg("out", "end"));
const SECONDS = parseFloat(arg("seconds", "4.6"));
const ONLY = arg("only", null); // comma list of seconds, for stills
const FPS = 60;
const VW = 1536;
const VH = 864;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--hide-scrollbars", "--font-render-hinting=none"],
  });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: SCALE,
  });
  const page = await ctx.newPage();
  const html = fs.readFileSync(path.join(__dirname, "endcard.html"), "utf8");
  await page.route("http://localhost:3000/__endcard", (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  await page.goto("http://localhost:3000/__endcard", { waitUntil: "load" });
  await page.evaluate(() =>
    Promise.all([
      document.fonts.load('400 16px "Geist"'),
      document.fonts.load('400 16px "Satoshi"'),
      document.fonts.load('500 16px "Satoshi"'),
    ]),
  );
  await page.evaluate(() => document.fonts.ready);
  const cdp = await ctx.newCDPSession(page);

  const times = ONLY
    ? ONLY.split(",").map(Number)
    : Array.from({ length: Math.round(SECONDS * FPS) }, (_, f) => f / FPS);
  for (let i = 0; i < times.length; i++) {
    await page.evaluate((t) => window.renderAt(t), times[i]);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: VW, height: VH, scale: SCALE },
    });
    const name = ONLY
      ? `still_${times[i]}.png`
      : `e${String(i).padStart(5, "0")}.png`;
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, "base64"));
  }
  await browser.close();
  console.log("end card frames:", times.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
