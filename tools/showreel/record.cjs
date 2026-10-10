// Frame-exact capture of the carousel: the page clock only advances when we
// say so, input goes through Chromium's real input pipeline, and every frame
// is a compositor screenshot (so the DOM labels come along with the canvas).
//
//   node record.cjs --scale 1.25 --out frames [--plan plan.cjs] [--limit N] [--gpu]
//
// Playwright is not a dependency of the app; see README.md in this folder.
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const SCALE = parseFloat(arg("scale", "0.5"));
const OUT = path.resolve(arg("out", "frames"));
const PLAN = path.resolve(__dirname, arg("plan", "plan.cjs"));
const LIMIT = parseInt(arg("limit", "0"), 10);
const URL = arg("url", "http://localhost:3000/");
// Without a GPU, Chromium needs to be told it may draw WebGL in software.
const GPU = process.argv.includes("--gpu");
const VW = 1536;
const VH = 864;

const plan = require(PLAN);
const FRAMES = LIMIT || plan.frames;
const STEP = 1000 / plan.FPS;

// macOS-style arrow, tip at the origin.
const ARROW = `<svg width="13" height="20" viewBox="0 0 13 20" style="display:block;overflow:visible;filter:drop-shadow(0 1px 1.4px rgba(0,0,0,.32))">
  <path d="M0.6 0.6 L0.6 16.6 L4.4 12.9 L6.9 18.8 L9.5 17.7 L7 11.9 L12.2 11.9 Z"
    fill="#0a0a0a" stroke="#fff" stroke-width="1.3" stroke-linejoin="round" paint-order="stroke"/>
</svg>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: [
      ...(GPU
        ? []
        : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
      "--ignore-gpu-blocklist",
      "--hide-scrollbars",
      "--font-render-hinting=none",
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: SCALE,
  });
  await ctx.addInitScript({ path: path.join(__dirname, "vclock.js") });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      console.log(`[page ${m.type()}]`, m.text());
  });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.goto(URL, { waitUntil: "load" });
  // The whole atlas and the tag's arrow, so the counter is paced by the birth
  // alone, exactly as on a warm cache.
  await page.waitForFunction(
    () => window.__vt && window.__vt.images() >= 19,
    null,
    { timeout: 60000, polling: 100 },
  );
  await page.evaluate(() => document.fonts.ready);
  // Faces the labels only ask for once they first paint. Loaded up front, as
  // on a warm cache, or the counter's first frames show a fallback swap.
  await page.evaluate(() =>
    Promise.all([
      document.fonts.load('400 16px "Geist"'),
      document.fonts.load('400 16px "Satoshi"'),
      document.fonts.load('500 16px "Satoshi"'),
      document.fonts.load('400 16px "PP Neue Montreal"'),
    ]),
  );
  await page.waitForTimeout(600);

  const status = await page.evaluate(() => ({
    fonts: [...document.fonts].map(
      (f) => `${f.family}/${f.weight}:${f.status}`,
    ),
    images: window.__vt.images(),
    pending: window.__vt.pending(),
    vt: window.__vt.now(),
  }));
  console.log("ready:", JSON.stringify(status));

  await page.evaluate((svg) => {
    const el = document.createElement("div");
    el.id = "__cursor";
    el.style.cssText =
      "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;opacity:0;transform-origin:0 0;";
    el.innerHTML = svg;
    document.body.appendChild(el);
    window.__cursor = (c) => {
      if (!c || c.alpha <= 0) {
        el.style.opacity = "0";
        return;
      }
      el.style.opacity = String(c.alpha);
      // Drawn a touch larger than life: it is read on a phone.
      const s = 1.4 * (1 - 0.14 * c.press);
      el.style.transform = `translate(${c.x}px, ${c.y}px) scale(${s})`;
    };
  }, ARROW);

  const cdp = await ctx.newCDPSession(page);
  const mouse = { x: -1, y: -1, inside: false };
  const t0 = Date.now();
  let lastLog = t0;

  for (let f = 0; f < FRAMES; f++) {
    const t = f / plan.FPS;
    const c = plan.cursor(t);
    let touched = false;

    if (c) {
      const inside = c.x >= 0 && c.x < VW && c.y >= 0 && c.y < VH;
      const x = Math.min(VW - 1, Math.max(0, c.x));
      const y = Math.min(VH - 1, Math.max(0, c.y));
      if (
        inside &&
        (Math.abs(x - mouse.x) > 0.01 || Math.abs(y - mouse.y) > 0.01)
      ) {
        await page.mouse.move(x, y);
        mouse.x = x;
        mouse.y = y;
        touched = true;
      }
    }
    for (const a of plan.actions(f)) {
      if (a.type === "down") await page.mouse.down();
      else if (a.type === "up") await page.mouse.up();
      else if (a.type === "wheel") await page.mouse.wheel(a.dx || 0, a.dy || 0);
      touched = true;
    }
    if (touched) await page.evaluate(() => window.__vt.settle());

    await page.evaluate(
      ({ ms, c }) => {
        window.__vt.step(ms);
        window.__cursor(c);
      },
      { ms: STEP, c },
    );

    // A fresh CDP session does not inherit the device-scale emulation, so the
    // scale goes on the clip; this matches page.screenshot() pixel for pixel.
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      optimizeForSpeed: true,
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: VW, height: VH, scale: SCALE },
    });
    fs.writeFileSync(
      path.join(OUT, `f${String(f).padStart(5, "0")}.png`),
      Buffer.from(data, "base64"),
    );

    if (Date.now() - lastLog > 15000 || f === FRAMES - 1) {
      lastLog = Date.now();
      const ev = await page.evaluate(() => window.__vt.events);
      const per = (Date.now() - t0) / (f + 1);
      console.log(
        `frame ${f + 1}/${FRAMES}  ${per.toFixed(0)} ms/frame  eta ${(((FRAMES - f - 1) * per) / 60000).toFixed(1)} min  events ${JSON.stringify(ev)}`,
      );
    }
  }

  await browser.close();
  console.log("done in", ((Date.now() - t0) / 60000).toFixed(1), "min");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
