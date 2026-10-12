"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";

import {
  vertexShader,
  fragmentShader,
  MAX_PLANES,
  MAX_LINKS,
  MAX_TEXT,
  MAX_RULES,
} from "./shaders/planeShaders";
import { buildAtlas, loadImage } from "./ring/atlas";
import { createMeta } from "./ring/meta";
import { createSplitText } from "./ring/splitText";
import { createBeadWord } from "./ring/bead";
import { defaultParams, THEMES } from "./ring/params";
import { IMAGE_FILES, PROJECTS } from "./ring/projects";
import {
  TAU,
  HALF_PI,
  DEG,
  chase,
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  signedOffset,
  smoothstep,
} from "./ring/utils";

// The fan starts fractionally into the spread so the seed reads first.
const FAN_START = 0.06;

// The project page's small labels: the index face, tracked and set in caps.
const MICRO = {
  fontFamily: "var(--f-small)",
  fontSize: "var(--t-micro)",
  fontWeight: "var(--w-small)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ink-2)",
};

// A project page carries up to this many pictures and clips, each in a box
// of one of three proportions.
const MEDIA_MAX = 6;
const SHAPES = { land: 1.5, port: 0.8, wide: 16 / 9 };

// The page's rhythm, read off the shapes in order: landscapes alternate a
// large picture on the right with a smaller one on the left, portraits make
// pairs a short step apart (or stand alone, alternating sides), a clip runs
// across the page. Every caption sits under its own picture.
const slotsFor = (media) => {
  const out = [];
  let side = 0;
  for (let k = 0; k < media.length; k++) {
    const shape = media[k].shape;
    const prev = out[k - 1];
    if (shape === "wide") {
      out.push("wide");
    } else if (shape === "port") {
      if (prev === "pair-a") out.push("pair-b");
      else if (media[k + 1]?.shape === "port") out.push("pair-a");
      else {
        out.push(side ? "port-l" : "port-r");
        side ^= 1;
      }
    } else {
      out.push(prev === "lead" ? "offset" : "lead");
    }
  }
  return out;
};

const blankTexture = () => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
};

export default function Carousel() {
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const itemsRef = useRef([]);
  const loaderRef = useRef(null);
  // The counter beside the card, the glow behind it and the film over
  // everything. There is no site chrome: the ring is the page.
  const countRef = useRef(null);
  const glowRef = useRef(null);
  const grainRef = useRef(null);
  const liveRef = useRef(null);
  const cutRef = useRef(null);
  // The opened project's page: header and footer around the frame, then the
  // statement, the other images and the way on. Filled per open from
  // PROJECTS, never through React state.
  const openRef = useRef(null);
  const closeRef = useRef(null);
  const openTextRef = useRef({
    hero: null,
    head: null,
    title: null,
    body: null,
    type: null,
    year: null,
    index: null,
    blurb: null,
    figs: [],
    boxes: [],
    insightRow: null,
    insightHeads: [],
    insightTexts: [],
    next: null,
    nextIdx: null,
    nextName: null,
    nextImg: null,
    spacer: null,
  });
  // Per side: the box that positions the lockup, the filtered wrapper the goo
  // happens inside, the two rows that melt within it, and one more row outside
  // for words carrying over unchanged. See ring/meta.js.
  const metaRef = useRef({
    left: { box: null, goo: null, layers: [], plain: null },
    right: { box: null, goo: null, layers: [], plain: null },
  });

  useEffect(() => {
    const container = containerRef.current;
    const listEl = listRef.current;
    const loaderEl = loaderRef.current;
    // Captured once: the cleanup below must not re-read the ref.
    const openEls = openTextRef.current;
    // Async work (atlas decode, the lil-gui import) can land after cleanup
    // under StrictMode's double mount. Everything deferred checks this.
    let disposed = false;

    const params = defaultParams();
    Object.assign(params, THEMES[params.theme] ?? {});
    // progress: the seed is born at screen centre
    // launch:   the seed travels out to its place on the ring
    // spread:   the rest peel off it and the ring draws
    // spin:     whole-ring rotation, radians
    // shift:    the ring moves off centre and resizes
    const state = { progress: 0, launch: 0, spread: 0, spin: 0, shift: 0 };
    // Read-only panel readouts, so an invalid ring is visible rather than
    // silent and the reference window can be matched to the live one.
    const info = { restingGap: 0, window: "", scale: 1, band: "wide" };

    // Browsers cap the number of live WebGL contexts (~16 in Chrome). If that
    // is hit, this throws and the rest of the effect never runs — no canvas is
    // appended and the page is simply blank, which is a miserable thing to
    // debug. Fail loudly instead. See the cleanup for why it should not
    // happen: the context is released explicitly rather than left to GC.
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      console.error("[ring] could not create a WebGL context:", err);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);

    // Bound as the opened card's art until there is one.
    const heroBlank = blankTexture();
    // And the footage until a clip has a frame to show; never seen, its mix
    // is zero until then.
    const liveBlank = blankTexture();
    // And the page's other pictures until they arrive: paper, not white, so
    // a plane born before its art reads as an unlit slab rather than a flash.
    const moreBlank = new THREE.DataTexture(
      new Uint8Array([14, 14, 13, 255]),
      1,
      1,
    );
    moreBlank.needsUpdate = true;
    // And its type until there is a page: one clear texel.
    const textBlank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    textBlank.needsUpdate = true;

    const uniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uSize: { value: new THREE.Vector2(150, 100) },
      uRadius: { value: params.radius },
      uCount: { value: params.count },
      uPos: {
        value: Array.from({ length: MAX_PLANES }, () => new THREE.Vector2()),
      },
      uRot: { value: new Float32Array(MAX_PLANES) },
      // xy = birth scale, z = brightness, w = atlas cell. Packed because a
      // uniform array costs a full vec4 row per element either way.
      uScale: {
        value: Array.from(
          { length: MAX_PLANES },
          () => new THREE.Vector4(0, 0, 1, 0),
        ),
      },
      uLinkCount: { value: 0 },
      uLinkA: {
        value: Array.from({ length: MAX_LINKS }, () => new THREE.Vector2()),
      },
      uLinkB: {
        value: Array.from({ length: MAX_LINKS }, () => new THREE.Vector2()),
      },
      // (rEnd, rMid, sag, fillet), packed to stay inside the uniform budget.
      uLinkPar: {
        value: Array.from({ length: MAX_LINKS }, () => new THREE.Vector4()),
      },
      uK: { value: params.goo },
      uWobble: { value: params.wobble },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(params.ink) },
      uTone: { value: new THREE.Vector2(params.toneLift, params.toneGain) },
      uAtlas: { value: blankTexture() }, // placeholder so the sampler is bound
      uGrid: { value: new THREE.Vector2(1, 1) },
      uBlend: { value: params.blend },
      uTextured: { value: 0 },
      uBandTop: { value: 0 },
      uBandBottom: { value: 0 },
      uGlass: { value: new THREE.Vector4() },
      uFringe: { value: 0 },
      uSheen: { value: 0 },
      uMouse: { value: new THREE.Vector4() },
      uMelt: { value: new THREE.Vector4() },
      uBead: { value: new THREE.Vector4(-1e4, -1e4, -1e4, -1e4) },
      uBeadR: { value: new THREE.Vector4() },
      uBeadT: { value: new THREE.Vector4(0, 0, -100, -100) },
      uBeadTex: { value: textBlank },
      uBeadL: { value: new THREE.Vector4() },
      uBeadLP: { value: new THREE.Vector4(1, 1, 1, 0) },
      uHero: { value: heroBlank },
      uHeroP: { value: new THREE.Vector4(-1, 0, 1, 1) },
      uLive: { value: liveBlank },
      uLiveP: { value: new THREE.Vector4(-1, 0, 1, 1) },
      uMore: { value: moreBlank },
      uMoreP: { value: new THREE.Vector4(1e6, 1, 0, 0) },
      uText: { value: textBlank },
      uTextCount: { value: 0 },
      uTextRect: {
        value: Array.from({ length: MAX_TEXT }, () => new THREE.Vector4()),
      },
      uTextUV: {
        value: Array.from({ length: MAX_TEXT }, () => new THREE.Vector4()),
      },
      uTextA: { value: new Float32Array(MAX_TEXT) },
      uRule: {
        value: Array.from({ length: MAX_RULES }, () => new THREE.Vector4()),
      },
    };

    // The room, written to the root so the CSS reads the same two colours the
    // shader and the heading do. Again whenever the panel changes them.
    const rethemeHooks = [];
    const retheme = () => {
      const root = document.documentElement;
      root.style.setProperty("--paper", params.paper);
      root.style.setProperty("--ink", params.ink);
      const paper = new THREE.Color(params.paper);
      // Scrollbars and form controls follow the room.
      const lum = 0.2126 * paper.r + 0.7152 * paper.g + 0.0722 * paper.b;
      root.style.colorScheme = lum < 0.5 ? "dark" : "light";
      // As authored, not converted to linear: the shader writes colour
      // straight through, so a converted ink came out darker than the CSS's
      // — the type it draws, and the bead beside the DOM's labels.
      uniforms.uColor.value.setStyle(params.ink, THREE.LinearSRGBColorSpace);
      uniforms.uTone.value.set(params.toneLift, params.toneGain);
      // The paper in the values the shader writes straight through.
      const ps = paper.clone().convertLinearToSRGB();
      for (const glyph of textGroup.children) {
        glyph.material.uniforms.uColor.value.setStyle(
          params.ink,
          THREE.LinearSRGBColorSpace,
        );
      }
      // A plane born before its art wears the paper, whichever room, in the
      // values the shader writes straight through.
      moreBlank.image.data.set([
        Math.round(ps.r * 255),
        Math.round(ps.g * 255),
        Math.round(ps.b * 255),
        255,
      ]);
      moreBlank.needsUpdate = true;
      // The paper the room's gradients are dithered against (.room): ±1 level
      // of triangular noise, so on average it is the paper itself.
      if (glowRef.current) {
        const tile = document.createElement("canvas");
        tile.width = tile.height = 64;
        const tctx = tile.getContext("2d");
        const img = tctx.createImageData(64, 64);
        const rgb = [ps.r, ps.g, ps.b].map((v) => Math.round(v * 255));
        for (let i = 0; i < img.data.length; i += 4) {
          const n =
            (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1) - 1;
          img.data[i] = rgb[0] + n;
          img.data[i + 1] = rgb[1] + n;
          img.data[i + 2] = rgb[2] + n;
          img.data[i + 3] = 255;
        }
        tctx.putImageData(img, 0, 0);
        glowRef.current.style.setProperty(
          "--dither",
          `url(${tile.toDataURL()})`,
        );
      }
      for (const fn of rethemeHooks) fn();
    };

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
      }),
    );
    // Above the type, so the planes occlude it as the ring sweeps past.
    mesh.renderOrder = 10;
    scene.add(mesh);

    const textGroup = new THREE.Group();
    scene.add(textGroup);
    retheme();

    const splitText = createSplitText(textGroup, params);
    const wordSheet = createBeadWord(params, uniforms);
    const meta = createMeta(
      {
        groups: metaRef.current,
        list: listEl,
        loader: loaderEl,
        cut: cutRef.current,
        live: liveRef.current,
        count: countRef.current,
      },
      params,
    );

    /* ---------------------------------------------------------------- art */
    // The atlas is bound on frame one and fills in as images arrive, so the
    // seed can be born already wearing its own art while the rest are still
    // in flight. It is also what gives the counter something to count.
    let firstIn = false; // the seed's own cell is on the texture
    let loadProg = 0; // and how much of the rest has arrived, 0..1

    // Opened on the frame the counter reads 100, and by nothing else — that is
    // what makes the number landing and the ring launching the same moment.
    let launchReady = false;
    const readyWaiters = [];
    const whenReady = (fn) => (launchReady ? fn() : readyWaiters.push(fn));

    // Each picture's average colour, lifted to a light. The pictures are dark
    // and desaturated by design, and a lamp the colour of one would hardly
    // show, so the lightness is pinned and the chroma pushed. In the light
    // room the same colour is taken down instead, and reads as the card's
    // shadow on the paper.
    const tint = [];
    const tintRaw = [];
    const lift = ([r, g, b]) => {
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      let h = 0;
      let s = 0;
      if (d > 0.0001) {
        s = d / (1 - Math.abs(2 * l - 1));
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
      }
      // A tint, not a colour: past about half saturation the light reads as
      // a coloured lamp in the room rather than the room catching the work.
      const light = params.glowLight;
      const sat = light < 50 ? Math.min(45, s * 80) : Math.min(55, s * 120);
      return `hsl(${h.toFixed(0)} ${sat.toFixed(0)}% ${light}%)`;
    };

    const atlas = buildAtlas(
      IMAGE_FILES,
      (p) => {
        if (!disposed) loadProg = p;
      },
      renderer.capabilities.maxTextureSize,
      (i, rgb) => {
        if (disposed) return;
        tintRaw[i] = rgb;
        tint[i] = lift(rgb);
        if (i === shown) paintGlow();
      },
      // A phone's front card is most of the width; elsewhere ~40% of it.
      window.innerWidth <= params.tightAt
        ? Math.max(0.4, params.tightCard)
        : 0.4,
    );

    uniforms.uAtlas.value.dispose();
    atlas.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    uniforms.uAtlas.value = atlas.texture;
    uniforms.uGrid.value.set(atlas.grid[0], atlas.grid[1]);
    // Up front, not on completion: the cell each plane wears is derived from
    // this and has to be right from the first frame, blank cells or not.
    const imageCount = atlas.count;

    // Art is dealt by ring slot, not plane index. Planes are numbered in fan
    // order, so dealing by index puts every other project side by side and
    // steps the column two names per slot. Negated because turning the ring
    // forward walks the front slot backwards.
    const cellOf = (slot) => {
      const imgOff = Math.round(params.imageOffset);
      return imageCount > 0
        ? (((imgOff - slot) % imageCount) + imageCount) % imageCount
        : 0;
    };

    atlas.first.then(() => {
      if (!disposed) firstIn = true;
    });
    atlas.ready.then(() => {
      if (!disposed) loadProg = 1;
    });

    /* --------------------------------------------------------------- size */
    let viewW = 1;
    let viewH = 1;
    // Cached: the pointer is tracked on every move, and reading the rect each
    // time is a forced layout. Only a resize can invalidate it.
    const bounds = { left: 0, top: 0 };

    // How far this window is from the reference one. Every px param is
    // multiplied through by it, so it is computed on resize and never in the
    // loop. planeK / radiusK / textK are the breakpoint bumps on top.
    let fit = 1;
    let planeK = 1;
    let radiusK = 1;
    let textK = 1;
    // Kept as flags rather than resolved into values here, so anything picked
    // off them still answers to the dev panel between resizes.
    let narrowNow = false;
    let tightNow = false;
    // Except on a phone, whose resting ring is worked out from the window
    // itself (refit): its end scale and where its centre goes.
    let tightEnd = 1;
    let tightX = 0;
    // The stage's end scale in this band.
    const endNow = () =>
      tightNow ? tightEnd : narrowNow ? params.narrowEndScale : params.endScale;

    const refit = () => {
      const byW = viewW / Math.max(1, params.refWidth);
      const byH = viewH / Math.max(1, params.refHeight);
      const s =
        byW * (1 - params.fitHeight) + Math.min(byW, byH) * params.fitHeight;
      fit = Math.min(params.maxScale, Math.max(params.minScale, s));

      const narrow = viewW <= params.narrowAt;
      const tight = viewW <= params.tightAt;
      narrowNow = narrow;
      tightNow = tight;
      planeK = narrow ? params.narrowPlane : 1;
      // The bands stack: tight sits inside narrow and pulls the arc back in
      // from where narrow had pushed it out to.
      radiusK =
        (narrow ? params.narrowRadius : 1) * (tight ? params.tightRadius : 1);
      textK = narrow ? params.narrowText : 1;
      // A phone is composed in fractions of its own window rather than scaled
      // down from the reference one: below ~750px the fit is pinned at
      // minScale, so the ring stopped shrinking while the window kept
      // narrowing and the front card drifted off the edge. The ring forms at
      // the size it always did; at rest the front card is a share of the
      // width on the centre line, and the ring is sized off the height so its
      // neighbours sit half in the lip, as they do on a wide window. The card
      // is smaller as the ring forms to keep it in proportion with that ring.
      if (tight) {
        const formed = params.ringRadius * radiusK * fit;
        const atRest =
          (params.tightSpacing * viewH) /
          (2 * Math.sin(Math.PI / Math.max(3, Math.round(params.count))));
        const card = Math.min(params.tightCard * viewW, viewH * 0.5);
        tightEnd = Math.max(1, atRest / formed);
        planeK = card / tightEnd / (params.planeSize * fit);
        tightX = -atRest / (viewW * 0.5);
      }

      info.window = `${Math.round(viewW)} x ${Math.round(viewH)}`;
      info.scale = Math.round(fit * 1000) / 1000;
      info.band = tight ? "tight" : narrow ? "narrow" : "wide";

      // The heading is rasterised per glyph, so it cannot be re-sized without
      // rebuilding every texture mid-animation. Scaling the group costs
      // nothing and stays sharp — the glyphs are drawn at 2x display already.
      const k = fit * textK * (tight ? params.tightSplit : 1);
      textGroup.scale.set(k, k, 1);

      refitOpen();
    };

    // Where an opened card lands: a frame at the left margin under the
    // project's name, which keeps the size it had over the ring so the word
    // only moves. On a wide window the frame takes part of the width and the
    // discipline, year and statement sit in the column beside it; narrower
    // than the tablet band everything stacks. The page scrolls on below, so
    // the frame may run under the fold. Recomputed on resize only, like the
    // fit.
    // The name's size, in vw. By band rather than by textK: a phone has a
    // figure of its own. On a short window it also yields to the lip rather
    // than running into it. One figure for the
    // name over the ring and the name on the page, so the flight between
    // them is a pure move — they used to be worked out separately and came
    // apart on short windows, which made the flight scale.
    // The glass lip's inner edge, in CSS px from the top of the window.
    const lipPx = () => (params.glass ? params.bandTop * viewH : 0);

    const titleVwNow = () => {
      const vw =
        params.titleSize *
        (tightNow ? params.tightTitle : narrowNow ? params.narrowTitle : 1);
      const g = endNow() * fit;
      const W = params.planeSize * planeK * g;
      const cardTop = viewH * 0.5 - W / 1.5 / 2;
      const gapPx = (params.titleGap / 100) * (viewW * 0.65);
      // Nothing sits above the name but the lip, which it keeps out of: type
      // in the bend reads as a fault, not an effect.
      const room = cardTop - gapPx - lipPx();
      return Math.min(vw, Math.max(3, (room / viewW) * 100));
    };

    const openRect = { w: 1, h: 1, cx: 0, cy: 0, left: 0, top: 0 };
    const openCols = { titleVw: 1 };

    const refitOpen = () => {
      const titleVw = titleVwNow();
      const titlePx = (titleVw * viewW) / 100;
      // The name's top sits at the lip's inner edge, so at rest it is drawn
      // flat; above it there is only the bend. The hero follows, a gap below.
      const nameTop = Math.max((params.openTop / 100) * viewH, lipPx());
      const header = nameTop + titlePx + (params.openGap / 100) * viewH;
      const left = (params.metaLeft / 100) * viewW;
      const right = viewW - (params.metaRight / 100) * viewW;
      const w = Math.max(1, right - left);
      // Wider than the card: the hero is a still from a film, not a print.
      // Never squarer than the card itself, which the art is cut for. A
      // phone, being tall, takes the card's own shape and more picture.
      const h =
        w /
        Math.max(
          1.5,
          tightNow ? params.tightHeroAspect : params.openHeroAspect,
        );

      openRect.w = w;
      openRect.h = h;
      // World px, Y up.
      openRect.cx = left + w * 0.5 - viewW * 0.5;
      openRect.cy = viewH * 0.5 - (header + h * 0.5);
      // CSS px, for the type that lines up with its edges.
      openRect.left = left;
      openRect.top = header;
      openCols.titleVw = titleVw;
    };

    // The page below the hero reveals itself as it is scrolled into view.
    // Its pictures stay exactly on their boxes. Measured once per
    // open and per resize, and driven from the layout loop, where the
    // overlay's scroll is already being read — so there is no observer and
    // no listener to keep in step with it.
    // The page is laid out by the DOM and drawn by the shader. Everything
    // below the name carries `data-gl`: its box is measured once per open and
    // per resize, and from then on the layout loop places a plane (a picture)
    // or an ink mask (a block of type) on that box, offset by the overlay's
    // scroll. Nothing here is painted by the browser, which is what lets it
    // all pass through the lip with the hero. The DOM stays for layout, for
    // the accessibility tree and for selection.
    const fx = { items: [], imgs: [], texts: [], rules: [], ruleA: 0 };

    const findIt = (el) => fx.items.find((it) => it.el === el);

    // Close sits at the page's right edge on the title's line, or in the
    // band above it when the name would run into it.
    const placeClose = () => {
      const overlay = openRef.current;
      if (!overlay) return;
      const size = 44;
      const left = viewW - (params.metaRight / 100) * viewW - size;
      const title = fx.items.find((it) => it.title);
      let top = (params.openTop / 100) * viewH;
      if (title && !title.hidden && title.left + title.w + 24 < left) {
        top = title.top + title.h * 0.5 - size * 0.5;
      }
      overlay.style.setProperty("--y-close", `${top}px`);
    };

    // Re-measuring keeps what has already been revealed: a resize should not
    // put a page back behind its reveals. Callers that want a page unseen
    // follow it with resetFx.
    const measurePage = () => {
      const overlay = openRef.current;
      if (!overlay) return;
      const top0 = overlay.scrollTop;
      const was = new Map(fx.items.map((it) => [it.el, it]));
      fx.items = [...overlay.querySelectorAll("[data-gl]")].map((el) => {
        const r = el.getBoundingClientRect();
        const old = was.get(el);
        if (old) gsap.killTweensOf(old);
        return {
          el,
          kind: el.dataset.gl,
          title: "title" in el.dataset,
          cell: Number(el.dataset.cell ?? -1),
          video: el.dataset.video || "",
          left: r.left,
          top: r.top + top0,
          w: r.width,
          h: r.height,
          boxW: r.width,
          boxH: r.height,
          rev: old ? (old.shown ? 1 : old.rev) : 0,
          shown: old ? old.shown : false,
          hidden: r.width < 1,
        };
      });
      fx.imgs = fx.items
        .filter((it) => it.kind === "img" && !it.hidden)
        .slice(0, MAX_PLANES - Math.round(params.count));
      fx.texts = fx.items
        .filter((it) => it.kind === "text" && !it.hidden)
        .slice(0, MAX_TEXT);
      fx.rules = fx.items
        .filter((it) => it.kind === "rule" && !it.hidden)
        .slice(0, MAX_RULES);
      // Their ink, from the CSS the borders would have been drawn in.
      fx.ruleA =
        parseFloat(getComputedStyle(overlay).getPropertyValue("--rule-a")) || 0;
      placeClose();
    };

    // The page's type, set once per open onto one sheet: each block drawn in
    // the face, size, tracking and leading the DOM computed for it, wrapped
    // to the width the DOM gave it, white on clear. The box the shader lays
    // it on is the DOM box plus a little room for overhangs and descenders.
    const textCanvas = document.createElement("canvas");
    let textTex = null;

    const rasterText = () => {
      const blocks = fx.texts;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const SHEET_W = 2048;
      const ctx = textCanvas.getContext("2d");
      let x = 0;
      let y = 0;
      let rowH = 0;
      for (const it of blocks) {
        const cs = getComputedStyle(it.el);
        const fontPx = parseFloat(cs.fontSize) || 16;
        let lh = parseFloat(cs.lineHeight);
        if (!Number.isFinite(lh)) lh = fontPx * 1.2;
        let text = (it.el.textContent || "").replace(/\s+/g, " ").trim();
        if (cs.textTransform === "uppercase") text = text.toUpperCase();
        const font = `${cs.fontStyle} ${cs.fontWeight} ${fontPx}px ${cs.fontFamily}`;
        const ls = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
        ctx.font = font;
        if ("letterSpacing" in ctx) ctx.letterSpacing = ls;
        const lines = [];
        let line = "";
        for (const word of text.split(" ")) {
          const t = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(t).width > it.w) {
            lines.push(line);
            line = word;
          } else {
            line = t;
          }
        }
        if (line) lines.push(line);
        const pad = fontPx * 0.15;
        const below = fontPx * 0.3;
        const bw = Math.ceil((it.w + pad) * dpr);
        const bh = Math.ceil((Math.max(it.h, lines.length * lh) + below) * dpr);
        if (x + bw > SHEET_W) {
          x = 0;
          y += rowH + 2;
          rowH = 0;
        }
        it.sheet = { x, y, w: bw, h: bh, lines, font, ls, lh, fontPx };
        it.boxW = bw / dpr;
        it.boxH = bh / dpr;
        // The tone the DOM would have set it in: ink, or ink at 55%.
        const m =
          cs.color.match(/\/\s*([\d.]+)\s*\)$/) ||
          cs.color.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
        it.inkA = m ? parseFloat(m[1]) : 1;
        x += bw + 2;
        rowH = Math.max(rowH, bh);
      }
      textCanvas.width = SHEET_W;
      textCanvas.height = Math.max(1, y + rowH);
      const c2 = textCanvas.getContext("2d");
      c2.clearRect(0, 0, textCanvas.width, textCanvas.height);
      c2.fillStyle = "#fff";
      c2.textBaseline = "alphabetic";
      for (const it of blocks) {
        const s = it.sheet;
        c2.save();
        c2.translate(s.x, s.y);
        c2.scale(dpr, dpr);
        c2.font = s.font;
        if ("letterSpacing" in c2) c2.letterSpacing = s.ls;
        // The line box the way CSS builds it: half the leading above the
        // font's ascent, so a single line sits exactly where the DOM's did.
        const mt = c2.measureText("Hg");
        const asc = mt.fontBoundingBoxAscent ?? s.fontPx * 0.8;
        const desc = mt.fontBoundingBoxDescent ?? s.fontPx * 0.2;
        const half = (s.lh - (asc + desc)) / 2;
        s.lines.forEach((ln, i) => c2.fillText(ln, 0, i * s.lh + half + asc));
        c2.restore();
        it.uv = [
          s.x / SHEET_W,
          s.y / textCanvas.height,
          s.w / SHEET_W,
          s.h / textCanvas.height,
        ];
      }
      textTex?.dispose();
      const t = new THREE.CanvasTexture(textCanvas);
      t.flipY = false;
      t.colorSpace = THREE.NoColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      textTex = t;
      uniforms.uText.value = t;
    };

    // Everything back to unseen.
    const resetFx = () => {
      gsap.killTweensOf(fx.items);
      for (const it of fx.items) {
        it.rev = 0;
        it.shown = false;
      }
    };

    // The page around the hero, set from the same figures as the type on
    // the ring so the two read as one voice, and written as variables on the
    // dialog so the markup can stay declarative.
    const styleOpen = () => {
      const overlay = openRef.current;
      if (!overlay) return;
      const r = openRect;
      const g = endNow() * fit;
      const vars = {
        "--f-head": `"${params.textFont}", "${params.textFallback}", ui-sans-serif, system-ui, sans-serif`,
        "--f-name": `"${params.nameFont}", ui-sans-serif, system-ui, sans-serif`,
        "--f-small": `"${params.idxFont}", ui-sans-serif, system-ui, sans-serif`,
        "--w-head": `${params.textWeight}`,
        "--w-name": `${params.nameWeight}`,
        "--w-small": `${params.idxWeight}`,
        "--t-title": `${openCols.titleVw}vw`,
        // A reading floor: in vw alone the facts and insights were 10px on
        // a phone.
        "--t-name": `max(15px, ${params.nameSize * textK}vw)`,
        "--t-small": `${params.idxSize * textK}vw`,
        "--t-list": `${params.listSize * textK}vw`,
        // Reading sizes, with floors: on a phone the vw alone falls under them.
        "--t-lead": `max(19px, ${params.openLead * textK}vw)`,
        "--t-micro": `max(11px, ${params.idxSize * textK * 0.8}vw)`,
        "--x-ml": `${params.metaLeft}vw`,
        "--x-mr": `${params.metaRight}vw`,
        "--y-head": `${(params.openTop / 100) * viewH}px`,
        "--y-name": `${Math.max((params.openTop / 100) * viewH, lipPx())}px`,
        "--y-idx": `${params.openIdxGap}vh`,
        "--h-hero": `${r.top + r.h}px`,
        "--y-strip": `${params.openStrip}vh`,
        "--y-images": `${params.openImages}vh`,
        // The corner the shader draws, so the pictures below match the hero.
        "--radius": `${params.radius * planeK * g}px`,
      };
      for (const [k, v] of Object.entries(vars))
        overlay.style.setProperty(k, v);
      closeRef.current?.setAttribute("aria-label", params.closeText);
      measurePage();
      if (openI >= 0) rasterText();
    };

    // The site frame and the index column. Set before the block, because the
    // block runs up to the column and has to know how wide it is.
    const styleSite = () => {
      const small = `${params.listSize * textK}vw`;
      if (grainRef.current) {
        grainRef.current.style.opacity = `${params.grain}`;
        grainRef.current.dataset.blend = params.grainBlend;
      }
      if (glowRef.current) {
        const el = glowRef.current;
        el.style.setProperty("--vig", `${params.vignette}`);
        el.style.setProperty("--glow-a", `${params.glow}`);
        el.style.setProperty("--glow-w", `${params.glowSpread}vw`);
        el.style.setProperty("--glow-h", `${params.glowSpread * 0.7}vw`);
      }
      if (listEl) {
        listEl.style.right = `${params.metaRight}vw`;
        listEl.style.fontSize = small;
        listEl.style.setProperty("--list-dim", `${params.listDim}`);
        // Follows the band rather than a CSS breakpoint, so it leaves exactly
        // when the block does.
        listEl.style.display = tightNow ? "none" : "";
      }
    };

    const styleMeta = () => {
      styleSite();
      // The block starts a gap right of the front card at rest and runs to
      // the index column, or to the margin where there is none. The name
      // hangs between the header and the card's top edge.
      const g = endNow() * fit;
      const W = params.planeSize * planeK * g;
      const gap = (params.blockGap / 100) * viewW;
      const blockX = viewW * 0.5 + W * 0.5 + gap;
      const colW = listEl && !tightNow ? listEl.offsetWidth : 0;
      const right = (params.metaRight / 100) * viewW;
      const blockW = viewW - right - (colW ? colW + gap * 0.6 : 0) - blockX;
      const cardTop = viewH * 0.5 - W / 1.5 / 2;
      // A phone has no room beside the card, so the block goes under it,
      // from its left edge, a breath below.
      const phone = tightNow;
      meta.style({
        textK,
        viewW,
        titleVw: titleVwNow(),
        blockX: phone ? viewW * 0.5 - W * 0.5 : blockX,
        blockW: phone ? W : blockW,
        blockY: viewH * 0.5,
        under: phone ? viewH * 0.5 + W / 1.5 / 2 + 0.035 * viewW : null,
        cardTop,
      });
      styleOpen();
    };

    // Everything that arrives with the heading and steps aside for a project.
    // The glow arrives and steps aside with these, but by a variable in its
    // colour (--glow-on): an opacity would fade the paper and the vignette it
    // shares an element with (see .room).
    const siteEls = () => [listEl, countRef.current].filter(Boolean);

    const resize = () => {
      viewW = container.clientWidth;
      viewH = container.clientHeight;
      refit();
      renderer.setSize(viewW, viewH);
      camera.left = -viewW / 2;
      camera.right = viewW / 2;
      camera.top = viewH / 2;
      camera.bottom = -viewH / 2;
      camera.updateProjectionMatrix();
      mesh.scale.set(viewW, viewH, 1);
      uniforms.uResolution.value.set(viewW, viewH);

      const rect = renderer.domElement.getBoundingClientRect();
      bounds.left = rect.left;
      bounds.top = rect.top;
    };

    // styleMeta too, because the breakpoint bumps are steps that vw units
    // cannot express on their own.
    const onResize = () => {
      resize();
      styleMeta();
      needsRender = true;
    };

    resize();
    window.addEventListener("resize", onResize);

    /* ------------------------------------------------------- spin & input */
    const ringCentre = { x: 0, y: 0 };
    // Which way "front" is: from the ring's centre toward the middle of the
    // screen. Once the ring is off centre that is no longer 3 o'clock.
    let frontAngle = 0;
    let interactive = false;
    let spinVel = 0; // rad/s
    let dragging = false;
    let dragPrevAngle = 0;
    let dragPrevTime = 0;

    // The snap is a phase, not a force that is always on: a flick coasts
    // untouched, and once it is nearly spent the ring commits to a slot and
    // runs itself in. snapTo is that slot, snapCap the speed it came in at.
    let settling = false;
    let snapTo = 0;
    let snapCap = 0;

    // A click is turning the ring to a card. While this is up the momentum
    // above is suspended entirely, so the two cannot both drive spin.
    let picking = false;

    // A project being opened: which plane is swelling into the frame and how
    // far along it is, 0..1 on a linear clock. Everything the open does to
    // the ring is read off these in the layout loop, the way the entry reads
    // its own state, so the shader and the header cannot disagree.
    let openI = -1;
    const opening = { f: 0 };
    let openTl = null;
    // Up from the moment a close is asked for until the ring has it back, so
    // a second Escape or a click on the frame cannot start it twice.
    let closing = false;
    // Going on to the next project from the foot of this one: where the
    // scroll started and must end, which project, its full-size picture, and
    // the next card's lean under the pointer.
    let advancing = false;
    const adv = {
      s0: 0,
      s1: 1,
      cell: -1,
      img: null,
      mix: 0,
      hover: 0,
      hoverTo: 0,
    };
    // The name's flight to the page, and whether it is the page's yet. Once
    // landed, the layout loop keeps it on the page's scroll: it is never
    // handed off to a second element, so there is nothing to mismatch.
    // The page's presence, 0..1: its pictures are born and un-born and its
    // type fades on this, so closing takes the whole page with it. And the
    // name's hand-off from the DOM word that flew to the page's own setting.
    const pageA = { a: 0 };
    const titleGl = { a: 0 };
    let frontPlane = -1;
    // The opened card's art at full size, loaded per open and let go on
    // close: eighteen of these resident would be most of a phone's budget.
    const hero = { mix: 0 };
    let heroTex = null;
    let heroCell = -1;
    let heroGen = 0;

    let pointerTravel = 0; // tells a click from a drag
    let travelX = 0;
    let travelY = 0;

    const pointerAngle = (e) => {
      const dx = e.clientX - bounds.left - ringCentre.x;
      const dy = e.clientY - bounds.top - ringCentre.y;
      return Math.atan2(-dy, dx);
    };

    const stopPick = () => {
      if (!picking) return;
      gsap.killTweensOf(state);
      picking = false;
    };

    // Turn the ring until plane i faces front. A tween rather than a target
    // handed to the snap: the snap is a run-in for a throw that is nearly
    // spent and is shaped so it can only slow down, but a pick starts from a
    // standstill and has to accelerate.
    const pick = (i) => {
      const slot = TAU / Math.round(params.count);
      // Spread, plane i sits at seed + signedOffset(i) * slot + spin.
      const base = frontAngle - params.seed * DEG - signedOffset(i) * slot;
      // Nearest equivalent winding, so it takes the short way round rather
      // than unwinding whole turns. Every card is within half a ring.
      const target = base + Math.round((state.spin - base) / TAU) * TAU;

      const slots = Math.abs(target - state.spin) / slot;
      // Already facing front: the click means open it.
      if (slots < 0.01) {
        openProject(i);
        return;
      }

      // Root of the distance, not linear: a card eight slots round should
      // take longer than its neighbour but not eight times longer.
      const dur = params.pickTime * Math.sqrt(Math.max(1, slots));

      // The name goes on ahead of the card: it melts into the one being turned
      // to while the ring turns, over the same time, so the open that follows
      // flies the right word from settled type.
      const c = cellOf(signedOffset(i));
      if (announced !== c) {
        meta.show(c, Math.min(params.nameMorphTime, dur));
        announced = c;
      }

      spinVel = 0;
      settling = false;
      picking = true;
      gsap.killTweensOf(state);
      gsap.to(state, {
        spin: target,
        duration: dur,
        ease: params.pickEase,
        // The cursor said View, so a click on a side card turns the ring and
        // then opens it — one gesture, not two.
        onComplete: () => {
          picking = false;
          openProject(i);
        },
      });
    };

    /* ------------------------------------------------------------- opening */
    // Click-to-open. The front card swells into a frame on the page, the rest
    // of the ring backs away from it and the threads between them stretch and
    // let go — the same material doing one more thing. The shader carries the
    // whole move, art included: a full-size copy of the image takes over from
    // the atlas cell as the card grows, and once the frame has landed it
    // follows the page's scroll, so the project reads on below it. The DOM
    // sets everything around the frame, and its title arrives the way the
    // heading did, glyph by glyph. Closing runs the same timeline backwards,
    // so the ring reassembles exactly the way it parted.
    const closeEl = closeRef.current;
    const roomEl = glowRef.current;
    const closeDisc = closeEl?.querySelector(".close-disc") ?? null;
    const closeStrokes = closeEl
      ? [...closeEl.querySelectorAll(".close-stroke")]
      : [];
    gsap.set(closeDisc, { scale: 0, opacity: 0 });
    closeStrokes.forEach((el, k) =>
      gsap.set(el, { rotation: k ? -45 : 45, scaleX: 0 }),
    );

    // A card's full-size picture, from the half-size copies in /sm when the
    // frame it fills is drawn from no more pixels than they hold — a
    // phone's, whose atlas loaded those same copies, so this is a decode.
    const heroSrc = (file) =>
      `${openRect.w * Math.min(window.devicePixelRatio || 1, 2) <= 768 ? "/sm/" : "/"}${file}`;

    const loadHero = (cell) => {
      const gen = ++heroGen;
      const p = PROJECTS[cell];
      heroCell = -1;
      if (!p) return;
      loadImage(heroSrc(p.file), "high")
        .then((img) => {
          if (disposed || gen !== heroGen) return;
          heroSet(cell, img);
        })
        .catch((err) => console.warn("[open]", err.message));
    };

    const heroSet = (cell, img) => {
      heroTex?.dispose();
      const t = new THREE.Texture(img);
      // Same conventions as the atlas: the shader flips, nothing encodes.
      t.flipY = false;
      t.colorSpace = THREE.NoColorSpace;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      t.needsUpdate = true;
      heroTex = t;
      heroCell = cell;
      uniforms.uHero.value = t;
    };

    const dropHero = () => {
      heroGen++;
      heroCell = -1;
      uniforms.uHero.value = heroBlank;
      heroTex?.dispose();
      heroTex = null;
    };

    // The card's footage. One <video> for the whole ring: it plays whichever
    // card has come to rest in front, carries on through the open (the hero
    // is the same plane), and lets go once the ring moves. Every clip starts
    // on the frame its card already shows, so it fades in over a still that
    // does not change. Off under reduced motion and Save-Data, and absent
    // wherever autoplay is refused: the still is the same picture.
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const saveData = navigator.connection?.saveData === true;
    const liveOk = () => params.live && !motionQuery?.matches && !saveData;
    const footage = { cur: null, ready: false, mix: 0, calm: 0, gen: 0 };
    const liveRefused = new Set();
    const liveFit = new THREE.Vector2(1, 1);
    const liveEl = document.createElement("video");
    liveEl.muted = true;
    liveEl.loop = true;
    liveEl.playsInline = true;
    liveEl.preload = "auto";
    // iOS reads the attributes, not the properties, when it decides autoplay.
    liveEl.setAttribute("muted", "");
    liveEl.setAttribute("playsinline", "");
    const liveTex = new THREE.VideoTexture(liveEl);
    // Same conventions as the atlas: the shader flips, nothing encodes.
    liveTex.flipY = false;
    liveTex.colorSpace = THREE.NoColorSpace;
    liveTex.minFilter = THREE.LinearFilter;
    liveTex.magFilter = THREE.LinearFilter;
    liveTex.generateMipmaps = false;

    // A clip: the cell it plays on, its file, and the shape of the space it
    // is read in — a card's 3:2, which the hero crop maps its frame back
    // into, or a page box.
    const cardClip = (cell) => {
      const v = PROJECTS[cell]?.video;
      return v ? { key: `card:${cell}`, cell, src: v, aspect: 1.5 } : null;
    };

    const liveStart = (clip) => {
      const gen = ++footage.gen;
      footage.ready = false;
      if (!clip || liveRefused.has(clip.src)) return;
      liveEl.src = `/${clip.src}`;
      // Ready means a frame has been presented, not that play() resolved: a
      // texture bound before then has nothing to upload.
      const ready = () => {
        if (disposed || gen !== footage.gen) return;
        const va =
          liveEl.videoWidth / Math.max(1, liveEl.videoHeight) || 16 / 9;
        const a = clip.aspect;
        liveFit.set(Math.min(1, a / va), Math.min(1, va / a));
        uniforms.uLive.value = liveTex;
        footage.ready = true;
      };
      if ("requestVideoFrameCallback" in liveEl) {
        liveEl.requestVideoFrameCallback(ready);
      } else {
        liveEl.addEventListener("playing", ready, { once: true });
      }
      liveEl.play().catch(() => {
        if (gen === footage.gen) liveRefused.add(clip.src);
      });
    };

    const liveStop = () => {
      footage.gen++;
      footage.ready = false;
      liveEl.pause();
      liveEl.removeAttribute("src");
      liveEl.load(); // lets go of the decoder and the connection
    };

    // The project's other pictures on one sheet, two to a row. Each cell
    // holds its picture already cut to the shape of the box it is shown in
    // and stretched to fill the cell, so the plane's own 0..1 reads it back
    // undistorted: one sheet serves landscape, portrait and wide boxes
    // alike. Loaded per open and let go on close.
    const more = { mix: 0 };
    let moreTex = null;
    let moreGen = 0;

    const loadMore = (items) => {
      const gen = ++moreGen;
      gsap.killTweensOf(more);
      more.mix = 0;
      const n = items.length;
      const cols = n > 1 ? 2 : 1;
      const rows = Math.max(1, Math.ceil(n / cols));
      uniforms.uMoreP.value.set(imageCount, cols, 0, rows);
      if (!n) return;
      // Sized from the display, as the atlas is, and kept inside the GPU's
      // limit. 5:4 cells: between the widest box and the tallest.
      const maxTex = Math.min(
        renderer.capabilities.maxTextureSize || 4096,
        8192,
      );
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let cw = Math.round(Math.min(1280, Math.max(640, viewW * 0.5 * dpr)));
      let ch = Math.round(cw * 0.8);
      const fit = Math.min(1, maxTex / (cw * cols), maxTex / (ch * rows));
      cw = Math.floor(cw * fit);
      ch = Math.floor(ch * fit);
      // A phone's cells read the copies in /sm, cut to just cover them.
      const dir = cw <= 640 ? "/sm/" : "/";
      Promise.all(
        items.map((m) => loadImage(`${dir}${m.src}`, "high").catch(() => null)),
      ).then((imgs) => {
        if (disposed || gen !== moreGen) return;
        const canvas = document.createElement("canvas");
        canvas.width = cw * cols;
        canvas.height = ch * rows;
        const ctx = canvas.getContext("2d");
        imgs.forEach((img, k) => {
          if (!img) return;
          const a = SHAPES[items[k].shape] ?? 1.5;
          let sw = img.width;
          let sh = img.height;
          if (sw / sh > a) sw = sh * a;
          else sh = sw / a;
          ctx.drawImage(
            img,
            (img.width - sw) / 2,
            (img.height - sh) / 2,
            sw,
            sh,
            (k % cols) * cw,
            Math.floor(k / cols) * ch,
            cw,
            ch,
          );
        });
        moreTex?.dispose();
        const t = new THREE.CanvasTexture(canvas);
        t.flipY = false;
        t.colorSpace = THREE.NoColorSpace;
        t.wrapS = THREE.ClampToEdgeWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = true;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        t.needsUpdate = true;
        moreTex = t;
        uniforms.uMore.value = t;
        gsap.to(more, { mix: 1, duration: 0.6, ease: "power1.inOut" });
      });
    };

    const dropMore = () => {
      moreGen++;
      gsap.killTweensOf(more);
      more.mix = 0;
      uniforms.uMore.value = moreBlank;
      uniforms.uMoreP.value.set(1e6, 1, 0, 1);
      moreTex?.dispose();
      moreTex = null;
    };

    const setOpenCopy = (cell) => {
      const p = PROJECTS[cell];
      if (!p) return;
      const els = openTextRef.current;
      const idx = (c) => String(c + 1).padStart(2, "0");
      const total = idx(PROJECTS.length - 1);
      if (els.type) els.type.textContent = p.type;
      if (els.year) els.year.textContent = p.year;
      if (els.index) els.index.textContent = `${idx(cell)} / ${total}`;
      if (els.title) els.title.textContent = p.name;
      if (els.blurb) els.blurb.textContent = p.blurb ?? "";

      // The other pictures and clips: boxes in the DOM, planes in the shader,
      // set into the page's rhythm by their shapes. Their art is asked for
      // now and not before — the ring should not be paying for it. Each
      // caption is the picture's accessible label; none is printed.
      const media = (p.media ?? []).slice(0, MEDIA_MAX);
      const slots = slotsFor(media);
      els.figs.forEach((fig, k) => {
        if (!fig) return;
        const m = media[k];
        fig.hidden = !m;
        if (!m) return;
        fig.dataset.slot = slots[k];
        fig.dataset.shape = m.shape;
        fig.style.order = String(k * 2);
        const box = els.boxes[k];
        if (box) {
          box.dataset.cell = String(imageCount + k);
          box.dataset.video = m.video ?? "";
          box.setAttribute("aria-label", `${p.name}: ${m.caption}`);
        }
      });
      loadMore(media);

      // Three insights, as a row after the opening pictures: after the
      // second, or after the pair the second one begins, never inside it.
      const notes = (p.insights ?? []).slice(0, 3);
      let after = Math.min(1, media.length - 1);
      if (slots[after] === "pair-a") after += 1;
      if (els.insightRow) {
        els.insightRow.hidden = !notes.length;
        els.insightRow.style.order = String(after * 2 + 1);
      }
      for (let k = 0; k < 3; k++) {
        const n = notes[k];
        const head = els.insightHeads[k];
        const body = els.insightTexts[k];
        if (head?.parentElement) head.parentElement.hidden = !n;
        if (head) head.textContent = n ? `${idx(k)}\u2003${n.title}` : "";
        if (body) body.textContent = n ? n.text : "";
      }

      // The way on: the next project down the ring, which is also the next
      // name down the column.
      const n = (cell + 1) % PROJECTS.length;
      const q = PROJECTS[n];
      if (els.nextIdx) {
        els.nextIdx.textContent = `Next \u2014 ${idx(n)} / ${total}`;
      }
      if (els.nextName) els.nextName.textContent = q.name;
      if (els.nextImg) {
        els.nextImg.dataset.cell = String(n);
        els.nextImg.setAttribute("aria-label", q.name);
      }
      if (els.next) {
        els.next.dataset.cell = String(n);
        els.next.setAttribute("aria-label", `Next project: ${q.name}`);
      }
      openRef.current?.setAttribute(
        "aria-label",
        `${p.name}. ${p.type}, ${p.year}.`,
      );
      if (liveRef.current) {
        liveRef.current.textContent = `${p.name} opened. ${p.type}, ${p.year}. Escape closes.`;
      }
    };

    const metaBoxes = () =>
      [metaRef.current.left.box, metaRef.current.right.box].filter(Boolean);

    // Which plane is wearing a given cell right now. The deal moves with the
    // ring, so this is answered when asked, not stored.
    const planeOf = (cell) => {
      const count = Math.round(params.count);
      for (let i = 0; i < count; i++) {
        if (cellOf(signedOffset(i)) === cell) return i;
      }
      return -1;
    };

    const openProject = (i) => {
      const overlay = openRef.current;
      if (openI >= 0 || !interactive || !overlay) return;
      openI = i;
      closing = false;
      const cell = cellOf(signedOffset(i));
      setOpenCopy(cell);
      // Measured once the copy is in — the statement's length moves
      // everything under it — set onto the sheet, and put back to unseen.
      measurePage();
      rasterText();
      resetFx();
      // The word that flies has to be this project's. If the ring has not
      // shown it yet — the card was clicked as it arrived — it is shown now.
      // The melt carries on while it flies, and the measurement is good
      // regardless: the steady row takes the new word at once.
      if (announced !== cell) {
        meta.show(cell);
        announced = cell;
      }
      loadHero(cell);
      overlay.scrollTop = 0;
      overlay.inert = false;
      overlay.setAttribute("aria-hidden", "false");
      // From here the page, not the canvas, is what the pointer is over. It
      // forwards its moves, so the hit test and the cursor carry on regardless.
      overlay.style.pointerEvents = "auto";
      paintCursor();

      openTl?.kill();
      openTl = buildOpenTimeline();
    };

    // The open as one timeline, built for whichever plane is open — so a close
    // is always that project's own flight played backwards, even after the
    // way on has swapped one project for the next in place.
    const buildOpenTimeline = () => {
      const overlay = openRef.current;
      const T = params.openTime;
      const els = openTextRef.current;
      const tl = gsap.timeline({
        // Somewhere for focus to land, which is also what lets Escape work
        // without the canvas ever having had it.
        onComplete: () => {
          closeEl?.focus({ preventScroll: true });
        },
        onReverseComplete: () => {
          openI = -1;
          closing = false;
          dropHero();
          dropMore();
          resetFx();
          overlay.inert = true;
          overlay.setAttribute("aria-hidden", "true");
          overlay.style.pointerEvents = "none";
          overlay.scrollTop = 0;
          closeEl?.blur();
          if (liveRef.current) liveRef.current.textContent = "Closed.";
          paintCursor();
        },
      });
      // Linear here; the shaping lives in the layout loop, where the swell,
      // the flee and the threads each run on their own curve off this clock.
      tl.to(opening, { f: 1, duration: T, ease: "none" }, 0);
      // The full-size art fades in over the cell while the card is still near
      // its resting size, where the two are indistinguishable.
      tl.to(hero, { mix: 1, duration: T * 0.3, ease: "power1.inOut" }, 0);
      // The name travels. The big word over the card is carried, as the card
      // swells, to exactly where the page sets it, shrinking on the way, and
      // hands off to the page's own setting of it — the same word on the
      // sheet, at the same box — in a short crossfade once it has landed.
      // Measured here, before anything has moved. Everything else beside the
      // card fades.
      const bigBox = metaRef.current.left.box;
      // The word itself, not its row: the row also carries the index.
      const bigWord =
        metaRef.current.left.plain?.firstElementChild?.children?.[1];
      let flip = null;
      if (bigBox && bigWord && els.title) {
        const from = bigWord.getBoundingClientRect();
        const to = els.title.getBoundingClientRect();
        const boxRect = bigBox.getBoundingClientRect();
        if (from.width > 1 && to.width > 1) {
          flip = {
            ox: from.left - boxRect.left,
            oy: from.top - boxRect.top,
            dx: to.left - from.left,
            dy: to.top - from.top,
            s: to.width / from.width,
          };
        }
      }
      tl.to(
        [
          metaRef.current.right.box,
          ...(flip ? [] : [bigBox]),
          ...siteEls(),
        ].filter(Boolean),
        { opacity: 0, duration: 0.35, ease: "power2.out" },
        0,
      );
      if (glowRef.current) {
        tl.to(
          glowRef.current,
          { "--glow-on": 0, duration: 0.35, ease: "power2.out" },
          0,
        );
      }
      if (flip) {
        // Over everything while it flies, including the page.
        tl.set(
          bigBox,
          { zIndex: 30, transformOrigin: `${flip.ox}px ${flip.oy}px` },
          0,
        );
        tl.to(
          bigBox,
          {
            x: flip.dx,
            y: flip.dy,
            scale: flip.s,
            duration: T * 0.85,
            ease: params.openEase,
          },
          0,
        );
        // Landed, the page's setting of the word comes up under it first —
        // the same glyphs on the same box, so nothing visibly changes — and
        // only then does the flown word fade off it. Fading both at once
        // left each half there where they overlap, and the word dipped to
        // three-quarters strength halfway: a flicker.
        tl.to(titleGl, { a: 1, duration: 0.1, ease: "none" }, T * 0.85);
        tl.to(
          bigBox,
          { opacity: 0, duration: 0.25, ease: "none" },
          T * 0.85 + 0.1,
        );
      } else {
        tl.to(titleGl, { a: 1, duration: 0.6, ease: "power2.out" }, T * 0.5);
      }
      // The page is there by the time the swell lands: its hairlines in the
      // DOM, and in the shader its presence, on which its pieces are born as
      // they are scrolled to (tickFx).
      tl.fromTo(
        els.body,
        { opacity: 0 },
        { opacity: 1, duration: 0.5, ease: "power2.out" },
        T * 0.6,
      );
      tl.to(pageA, { a: 1, duration: 0.5, ease: "power2.out" }, T * 0.6);
      // Close comes in as the page settles: its disc opens from the centre
      // and the cross draws itself, one stroke after the other. Played
      // backwards, it is put away the same way.
      tl.fromTo(
        closeDisc,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.55, ease: "back.out(1.7)" },
        T * 0.62,
      );
      tl.fromTo(
        closeStrokes,
        { scaleX: 0 },
        { scaleX: 1, duration: 0.4, ease: "power3.out", stagger: 0.08 },
        T * 0.72,
      );
      return tl;
    };

    const closeProject = () => {
      if (openI < 0 || !openTl || closing || advancing) return;
      closing = true;
      const overlay = openRef.current;
      const dur = Math.max(0.05, params.closeTime);
      // Backwards, a touch quicker: leaving is a smaller event than arriving.
      const back = () => {
        if (openTl) openTl.timeScale(params.openTime / dur).reverse();
      };
      // From down the page, the page comes home first, so the title and the
      // frame are where the name and the card expect them before anything
      // flies back.
      if (overlay && overlay.scrollTop > 0) {
        gsap.to(overlay, {
          scrollTop: 0,
          duration: 0.3,
          ease: "power2.out",
          overwrite: true,
          onComplete: back,
        });
      } else {
        back();
      }
    };

    // Hard reset for a replay or unmount: no animation, nothing left half-open.
    const resetOpen = () => {
      openTl?.kill();
      openTl = null;
      openI = -1;
      closing = false;
      advancing = false;
      gsap.killTweensOf(adv);
      opening.f = 0;
      hero.mix = 0;
      gsap.killTweensOf([pageA, titleGl]);
      pageA.a = 0;
      titleGl.a = 0;
      dropHero();
      dropMore();
      resetFx();
      const overlay = openRef.current;
      if (openTextRef.current.spacer) {
        openTextRef.current.spacer.style.height = "0px";
      }
      if (overlay) {
        gsap.killTweensOf(overlay);
        overlay.style.overflowY = "";
        overlay.scrollTop = 0;
        overlay.inert = true;
        overlay.setAttribute("aria-hidden", "true");
        overlay.style.pointerEvents = "none";
      }
      const els = openTextRef.current;
      gsap.set([els.head, els.body].filter(Boolean), { opacity: 0 });
      gsap.set(closeDisc, { scale: 0, opacity: 0 });
      gsap.set(closeStrokes, { scaleX: 0 });
      gsap.set(metaBoxes(), { opacity: 1 });
      // The name back where style() put it, behind the ring. Values, not
      // clearProps: clearing any transform property makes GSAP strip the
      // independent `translate` too, and that is what holds the class's
      // centring off this box.
      const bigBox = metaRef.current.left.box;
      if (bigBox) {
        gsap.set(bigBox, { x: 0, y: 0, scale: 1, transformOrigin: "50% 50%" });
        bigBox.style.translate = "none";
        bigBox.style.zIndex = "-1";
      }
    };

    // The way on, from the foot of a project. The page keeps scrolling until
    // the next project's name — set at this project's title size, on the same
    // left edge — reaches the title's own place at the top, and its card
    // grows on the same scroll into the hero's rect; everything else leaves
    // through the lip with the scroll. At the end the two pages agree to the
    // pixel, the same word in the same box and the same picture in the same
    // rect, so the next project takes over in place: the ring is turned to it
    // behind the page, the page is refilled, and the scroll goes back to the
    // top. Nothing changes size and nothing cuts.
    const advanceTo = (cell) => {
      const overlay = openRef.current;
      const els = openTextRef.current;
      if (openI < 0 || closing || advancing || opening.f < 1 || !overlay) {
        return;
      }
      const nameIt = findIt(els.nextName);
      const cardIt = findIt(els.nextImg);
      const titleIt = findIt(els.title);
      if (!nameIt || !cardIt || !titleIt) return;
      advancing = true;
      adv.cell = cell;
      adv.s0 = overlay.scrollTop;
      adv.s1 = nameIt.top - titleIt.top;
      adv.img = null;
      adv.mix = 0;
      // Room to scroll that far: the page ends a little under the name.
      const max = overlay.scrollHeight - overlay.clientHeight;
      if (els.spacer && adv.s1 > max) {
        els.spacer.style.height = `${Math.ceil(adv.s1 - max) + 2}px`;
      }
      // The scroll is the transition's own; the reader's wheel waits for it.
      overlay.style.overflowY = "hidden";
      // Both pieces that travel are shown, wherever the reader was.
      for (const it of [nameIt, cardIt]) {
        gsap.killTweensOf(it);
        it.rev = 1;
        it.shown = true;
      }
      // The next picture at full size, decoded now and put on once it is the
      // only thing on screen that could be wearing it.
      const p = PROJECTS[cell];
      if (p) {
        loadImage(heroSrc(p.file), "high")
          .then((img) => {
            if (advancing && adv.cell === cell) adv.img = img;
          })
          .catch(() => {});
      }
      // The page's hairlines are DOM and cannot fold; they leave first.
      gsap.to(els.body, { opacity: 0, duration: 0.45, ease: "power1.out" });
      const d = Math.max(1, adv.s1 - adv.s0);
      gsap.to(overlay, {
        scrollTop: adv.s1,
        duration: Math.min(2.2, 1.15 + d / 2400),
        ease: "power3.inOut",
        overwrite: true,
        onComplete: () => finishAdvance(cell),
      });
    };

    const finishAdvance = (cell) => {
      const overlay = openRef.current;
      const els = openTextRef.current;
      const next = planeOf(cell);
      if (!overlay || next < 0) {
        advancing = false;
        return;
      }
      // The ring turns to it behind the page, so a close lands on it.
      const slot = TAU / Math.round(params.count);
      const base = frontAngle - params.seed * DEG - signedOffset(next) * slot;
      state.spin = base + Math.round((state.spin - base) / TAU) * TAU;
      spinVel = 0;
      settling = false;
      picking = false;
      hoverF[next] = 0;
      sideF[next] = 0;
      leanX[next] = 0;
      leanY[next] = 0;
      // Its name on the ring, settled, so the flight back is measured off it.
      meta.show(cell);
      meta.settle();
      announced = cell;
      // The old timeline goes, and everything it moved is put back where a
      // fresh one expects to find it. All of this is one task, so none of it
      // is ever painted.
      openTl?.kill();
      openTl = null;
      const bigBox = metaRef.current.left.box;
      if (bigBox) {
        gsap.set(bigBox, {
          x: 0,
          y: 0,
          scale: 1,
          opacity: 1,
          transformOrigin: "50% 50%",
        });
        bigBox.style.translate = "none";
        bigBox.style.zIndex = "-1";
      }
      gsap.set([metaRef.current.right.box, ...siteEls()].filter(Boolean), {
        opacity: 1,
      });
      if (glowRef.current) gsap.set(glowRef.current, { "--glow-on": 1 });
      gsap.killTweensOf([els.body, adv]);
      opening.f = 0;
      titleGl.a = 0;
      pageA.a = 0;
      hero.mix = 0;
      // The page, refilled for it from the top.
      if (els.spacer) els.spacer.style.height = "0px";
      overlay.style.overflowY = "";
      overlay.scrollTop = 0;
      openI = next;
      setOpenCopy(cell);
      measurePage();
      rasterText();
      resetFx();
      if (heroCell !== cell) loadHero(cell);
      advancing = false;
      // Its own timeline, run to the end at once: its close is its flight.
      openTl = buildOpenTimeline();
      openTl.progress(1);
    };

    const onNext = () => {
      const cell = Number(openTextRef.current.next?.dataset.cell ?? -1);
      if (cell >= 0) advanceTo(cell);
    };
    // The next card leans in a touch while the row is offered.
    const onNextIn = () => {
      adv.hoverTo = 1;
    };
    const onNextOut = () => {
      adv.hoverTo = 0;
    };

    const onKey = (e) => {
      if (e.key === "Escape") closeProject();
    };
    window.addEventListener("keydown", onKey);
    // Focus is drawn only for keyboard use: Tab turns it on, a pointer off.
    const root = document.documentElement;
    const onKeysOn = (e) => {
      if (e.key === "Tab") root.dataset.keys = "";
    };
    const onKeysOff = () => delete root.dataset.keys;
    window.addEventListener("keydown", onKeysOn);
    window.addEventListener("pointerdown", onKeysOff, true);
    // A hidden tab stops the loop but not a playing video.
    const onVisibility = () => {
      if (document.hidden) liveEl.pause();
      else if (footage.cur && liveEl.src) liveEl.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    closeEl?.addEventListener("click", closeProject);

    /* ------------------------------------------------------------ pointer */
    // World px, origin at screen centre, Y up — the space the shader works in,
    // so nothing is converted twice.
    //
    // `inside` means the position is worth reading, which is what the card hit
    // test needs. Whether the softening is *on* is a separate question,
    // because on touch it is not simply "is there a pointer".
    const pointer = { x: 0, y: 0, inside: false, seeded: false };
    // What the ring actually follows: the cursor, smoothed. How far this
    // trails the real pointer stands in for speed and drives the wake.
    const cursor = { x: 0, y: 0, amt: 0, wake: 0 };

    // Read off the events rather than a media query, so a laptop with a
    // touchscreen behaves as whichever is being used at the time.
    let coarse = false;
    let held = false;
    let holdTimer = 0;

    const endHold = () => {
      clearTimeout(holdTimer);
      holdTimer = 0;
      held = false;
    };

    const beginHold = () => {
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        held = true;
      }, params.touchHold * 1000);
    };

    // Mouse: being over it is the whole gesture. Touch: only a press held
    // still long enough to mean it.
    const engaged = () => (coarse ? held : pointer.inside);

    const trackPointer = (e) => {
      coarse = e.pointerType === "touch";
      pointer.x = e.clientX - bounds.left - viewW * 0.5;
      pointer.y = viewH * 0.5 - (e.clientY - bounds.top);
      pointer.inside = true;
      // Otherwise the first move sweeps the softening across the ring from
      // wherever the cursor was last left.
      if (!pointer.seeded) {
        pointer.seeded = true;
        cursor.x = pointer.x;
        cursor.y = pointer.y;
      }
    };

    const onPointerLeave = () => {
      pointer.inside = false;
    };

    const onWheel = (e) => {
      if (!interactive || openI >= 0) return;
      e.preventDefault();
      // Trackpads send horizontal deltas too; take whichever dominates.
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      // Fresh input hands the ring back to its own momentum.
      stopPick();
      settling = false;
      spinVel += d * params.scrollSpeed;
      spinVel = Math.max(-params.maxSpeed, Math.min(params.maxSpeed, spinVel));
    };

    const onPointerDown = (e) => {
      pointerTravel = 0;
      travelX = e.clientX;
      travelY = e.clientY;
      trackPointer(e);
      if (!interactive || openI >= 0) return;
      stopPick();
      if (coarse) beginHold();
      dragging = true;
      paintCursor();
      settling = false;
      spinVel = 0;
      dragPrevAngle = pointerAngle(e);
      dragPrevTime = performance.now();
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e) => {
      trackPointer(e);

      // From coordinates, not movementX/Y: those are zero for touch in Safari,
      // which would make every swipe look stationary and end in a tap.
      pointerTravel +=
        Math.abs(e.clientX - travelX) + Math.abs(e.clientY - travelY);
      travelX = e.clientX;
      travelY = e.clientY;
      // Only before the hold takes. After that, moving drags the ring and the
      // melt together, same as a drag with the cursor down.
      if (coarse && !held && pointerTravel > params.touchSlop) endHold();

      if (!dragging) return;

      const a = pointerAngle(e);
      let delta = a - dragPrevAngle;
      // Short way round, so crossing the +/-pi seam does not snap.
      if (delta > Math.PI) delta -= TAU;
      if (delta < -Math.PI) delta += TAU;

      const turn = delta * params.dragSpeed;
      state.spin += turn;

      const now = performance.now();
      spinVel = turn / (Math.max(8, now - dragPrevTime) / 1000);
      dragPrevAngle = a;
      dragPrevTime = now;
    };

    const onPointerUp = (e) => {
      // Releasing the capture fires a leave at the container even though the
      // cursor never went anywhere, so re-track before anything else.
      trackPointer(e);
      // The finger is gone; a cursor is still there.
      endHold();
      if (!dragging) return;
      dragging = false;
      paintCursor();
      renderer.domElement.releasePointerCapture?.(e.pointerId);
    };

    // A drag ends in a click too, so only a near-stationary press counts.
    // `over` comes from the same hit test that decides the cursor's word, so
    // a click only ever lands on the card the word was offering.
    const onClick = () => {
      if (!interactive || pointerTravel >= 5) return;
      // Open, closing is the Close button's and Escape's; the picture is only
      // a picture.
      if (openI >= 0 || over < 0) return;
      pick(over);
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("click", onClick);

    // Open, the page is what the pointer is over. Its moves are forwarded so
    // the hit test keeps working and a close brings the bead back where the
    // pointer is; Close aside, its Next block is the one thing on it that
    // does anything.
    const pageEl = openRef.current;
    pageEl?.addEventListener("pointermove", trackPointer);
    pageEl?.addEventListener("pointerdown", trackPointer);
    pageEl?.addEventListener("pointerleave", onPointerLeave);
    openEls.next?.addEventListener("click", onNext);
    openEls.next?.addEventListener("pointerenter", onNextIn);
    openEls.next?.addEventListener("pointerleave", onNextOut);

    const updatePointer = (dt) => {
      // Held off until the entry finishes, so the cursor cannot soften the
      // ring while the timeline is still drawing it.
      const live =
        params.hover && engaged() && pointer.seeded && interactive && openI < 0;
      cursor.amt += ((live ? 1 : 0) - cursor.amt) * chase(dt, 0.12);

      const k = chase(dt, params.lag);
      cursor.x += (pointer.x - cursor.x) * k;
      cursor.y += (pointer.y - cursor.y) * k;

      // The gap left behind the real pointer stands in for speed. Instant
      // attack, slow release, so the wake outlives the movement.
      const trail = Math.hypot(pointer.x - cursor.x, pointer.y - cursor.y);
      cursor.wake = Math.max(
        cursor.wake * Math.pow(0.94, dt * 60),
        clamp01(trail / (Math.max(dt, 0.001) * 2600)),
      );

      // Scaled by fit like the ring: a reach in raw px would cross two cards
      // on a small window and half of one on a large. Frequencies are not.
      uniforms.uMouse.value.set(
        cursor.x,
        cursor.y,
        cursor.amt,
        params.melt * fit,
      );
      uniforms.uMelt.value.set(
        params.meltReach * fit,
        params.wave * fit * cursor.wake * cursor.amt,
        params.waveFreq,
        params.waveSpeed,
      );
    };

    /* ------------------------------------------------------- load counter */
    // Reads whichever of the two is further behind: the art arriving, or the
    // seed's own birth. Both have to finish before there is anything to
    // launch, so counting bytes alone leaves the number sitting on 100 waiting
    // for a condition nobody told the viewer about.
    const loading = { shown: 0 };

    const tickLoader = (dt) => {
      const target = Math.min(loadProg, clamp01(state.progress));
      loading.shown += (target - loading.shown) * chase(dt, params.loaderChase);

      // Never 000; that reads as nothing happening.
      const n = Math.min(100, Math.max(1, Math.round(loading.shown * 100)));
      if (loaderEl) loaderEl.textContent = String(n).padStart(3, "0");

      if (!launchReady && n >= 100) {
        launchReady = true;
        for (const fn of readyWaiters) fn();
        readyWaiters.length = 0;
      }
    };

    /* ------------------------------------------------------- the carousel */
    const travel = new Float32Array(MAX_PLANES);
    const cum = new Float32Array(MAX_PLANES);
    const order = [];
    // Ring order, for the honey: made once rather than per frame.
    const bySlot = (a, b) => signedOffset(a) - signedOffset(b);
    // Where each plane would sit with no cursor near it. The honey is measured
    // off these, so hovering cannot feed back into the unfurl's geometry.
    const rest = Array.from({ length: MAX_PLANES }, () => new THREE.Vector2());

    // Per-plane response to the pointer, eased rather than recomputed from
    // where it is, so the ring trails the cursor and settles back on its own.
    const hoverF = new Float32Array(MAX_PLANES);
    const leanX = new Float32Array(MAX_PLANES);
    const leanY = new Float32Array(MAX_PLANES);
    const webF = new Float32Array(MAX_LINKS);
    // The other half of it: how much a plane is standing aside for the card
    // being pointed at. Zero on that card, zero when there isn't one.
    const sideF = new Float32Array(MAX_PLANES);
    // And the open's share of each plane's size, kept apart from the birth
    // scale and the swell so the honey can measure the ring as it was.
    const openS = new Float32Array(MAX_PLANES).fill(1);
    // Where the hovered card is, latched at the end of a frame for the next
    // one. The hit test runs inside the loop and every plane needs an answer
    // before the loop reaches that card, so this is deliberately one frame
    // behind — it is eased over ten of them anyway. Not reset when the cursor
    // leaves: the direction has to stay meaningful while the push decays.
    const focusPos = new THREE.Vector2();

    const swellOf = (i) =>
      Math.max(
        0.05,
        1 + params.swell * hoverF[i] - params.sideScale * sideF[i],
      );

    // Which card is at the front, and which is under the cursor.
    let shown = -1;
    let announced = -1;
    let over = -1;
    // The bead at the cursor. Its head is the pointer; its tail trails it,
    // and its radius is on a spring, so it overshoots a little re-forming.
    // `card` is the card it has sunk into, `from` the one it last came out
    // of, the thread's anchor on it in that card's own units, and `s` how
    // much of the thread is left. `on` is whether it is the cursor at all.
    const bead = {
      on: false,
      r: 0,
      v: 0,
      hw: 0,
      hv: 0,
      tx: 0,
      ty: 0,
      word: 0,
      card: -1,
      from: -1,
      ax: 0,
      ay: 0,
      s: 0,
      held: false,
    };
    // A thread starts where the head left the card: the nearest point to it
    // a little way inside the card's rounded edge, deep enough to bury the
    // thread's square end, kept in the card's own units so it stays on that
    // spot while the card turns and swells.
    const pullFrom = (i, W, H) => {
      const c = uniforms.uPos.value[i];
      const rot = uniforms.uRot.value[i];
      const sc = uniforms.uScale.value[i];
      const hw = W * 0.5 * sc.x;
      const hh = H * 0.5 * sc.y;
      const bury = params.beadSize * 0.5;
      if (hw <= bury || hh <= bury) return;
      const qx = pointer.x - c.x;
      const qy = pointer.y - c.y;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      let lx = qx * cr + qy * sr;
      let ly = -qx * sr + qy * cr;
      // Clamped to the core of the shrunken box, then no further from it
      // than the shrunken corner reaches.
      const rr = Math.min(uniforms.uRadius.value, hw, hh);
      const core = Math.max(rr, bury);
      const kx = Math.max(-(hw - core), Math.min(hw - core, lx));
      const ky = Math.max(-(hh - core), Math.min(hh - core, ly));
      let ox = lx - kx;
      let oy = ly - ky;
      const ol = Math.hypot(ox, oy);
      const reach = Math.max(0, rr - bury);
      if (ol > reach) {
        ox *= reach / ol;
        oy *= reach / ol;
      }
      lx = kx + ox;
      ly = ky + oy;
      bead.from = i;
      bead.ax = lx / hw;
      bead.ay = ly / hh;
      bead.s = 1;
      bead.held = true;
    };
    // Where the glow was last put, so it is only moved when the front moves.
    const glowAt = { x: -1, y: -1 };
    // And how far up the halo under Close is, so it is only written on change.
    let haloAt = -1;
    let leanNow = 0;
    // The index's brightness per name, written only when it moves.
    const listK = new Float32Array(MAX_PLANES);
    const listO = new Float32Array(MAX_PLANES).fill(-1);

    // With a mouse the bead is the cursor on the ring and the native one is
    // hidden. Otherwise the only hint that the ring can be dragged, since
    // nothing else on the page says so: an open hand anywhere, closed while
    // dragging, and a pointer over a card, where a click opens it. Cleared
    // rather than set during the entry, so a hand is not offered over
    // something that cannot be moved yet, and while a page is open, where
    // nothing on the ring does anything.
    const paintCursor = () => {
      renderer.domElement.style.cursor = bead.on
        ? "none"
        : !interactive || openI >= 0
          ? ""
          : dragging
            ? "grabbing"
            : over >= 0
              ? "pointer"
              : "grab";
    };

    // The page's reveals, from the overlay's scroll. A piece shows once its
    // top has crossed a line part way up the window. Held off until the swell has
    // mostly landed, so the strip under the hero does not rise while the
    // hero is still arriving.
    const tickFx = (scrollY) => {
      if (openI < 0 || closing || opening.f < 0.7) return;
      const line = scrollY + viewH * params.revealAt;
      for (const it of fx.items) {
        if (it.shown || it.title || it.hidden || it.top >= line) continue;
        it.shown = true;
        gsap.to(it, {
          rev: 1,
          duration: it.kind === "img" ? 1.1 : 0.9,
          ease: it.kind === "img" ? "power2.out" : "power3.out",
        });
      }
    };

    // The room takes the front card's colour.
    const paintGlow = () => {
      const el = glowRef.current;
      if (el && shown >= 0 && tint[shown]) {
        el.style.setProperty("--glow", tint[shown]);
      }
    };
    // The glow is lifted from the front card's colour, so a change of room
    // redoes it.
    rethemeHooks.push(() => {
      for (let i = 0; i < tintRaw.length; i++) {
        if (tintRaw[i]) tint[i] = lift(tintRaw[i]);
      }
      paintGlow();
    });

    const paintList = () => {
      const items = itemsRef.current;
      for (let i = 0; i < items.length; i++) {
        const el = items[i];
        if (!el) continue;
        const on = i === shown;
        if (on) el.setAttribute("aria-current", "true");
        else el.removeAttribute("aria-current");
      }
    };

    const layout = (dt) => {
      const count = Math.round(params.count);
      uniforms.uCount.value = count;

      const step = TAU / count;
      const spread = clamp01(state.spread);

      // Band values are picked per frame rather than latched on resize, so
      // dragging any of these sliders shows up straight away.
      const endScale = endNow();
      const posX = tightNow
        ? tightX
        : narrowNow
          ? params.narrowPosX
          : params.posX;

      // The stage transform. Everything in plane-pixels goes through g, which
      // is why the window fit rides in here rather than on a dozen params.
      const shift = clamp01(state.shift);
      const g = (1 + (endScale - 1) * shift) * fit;
      const cx = posX * viewW * 0.5 * shift;
      const cy = params.posY * viewH * 0.5 * shift;

      // Screen-space centre, for pointer maths. World Y is up, page Y is down.
      ringCentre.x = viewW * 0.5 + cx;
      ringCentre.y = viewH * 0.5 - cy;
      // A plane faces front when the ring centre, that plane and the middle of
      // the screen line up. Before the stage move there is no front, so 3
      // o'clock stands in.
      frontAngle = cx !== 0 || cy !== 0 ? Math.atan2(-cy, -cx) : 0;

      // Anything measured in plane long edges — hover reach, thread reach,
      // side falloff — comes off W, so the narrow bump reaches them for free.
      const W = params.planeSize * planeK * g;
      const H = W / 1.5;
      uniforms.uSize.value.set(W, H);
      // Tracks the plane, not the window: a card 25% bigger with the same
      // corner is a differently shaped card, not a bigger one.
      uniforms.uRadius.value = params.radius * planeK * g;

      // Radial: the long edge points outward, so a plane's reach toward its
      // neighbour is its short axis and the facing edges are the long ones.
      const sepExtent = params.radial ? H : W;
      const faceEdge = params.radial ? W : H;

      const R = params.ringRadius * radiusK * g;
      const restingGap = 2 * R * Math.sin(step / 2) - sepExtent;
      info.restingGap = Math.round((restingGap / g) * 10) / 10;
      // The whole stretch plays out across this, so it is the yardstick.
      const finalSep = Math.max(1, restingGap);

      // Every generation is in flight at once, offset by a small phase, so
      // this is one continuous unfurl and not a queue of separate pops.
      const maxN = Math.max(1, Math.abs(signedOffset(count - 1)));
      const dur = Math.max(0.1, 1 - FAN_START - params.stagger);

      // Cumulative, so an unborn plane sits exactly on top of its parent and
      // is peeled out of it one ring step at a time.
      cum[0] = 0;
      for (let n = 1; n <= maxN; n++) {
        const start = FAN_START + ((n - 1) / maxN) * params.stagger;
        const t = clamp01((spread - start) / dur);
        const e = t * t * (3 - 2 * t);
        travel[n] = e;
        cum[n] = cum[n - 1] + e;
      }

      const seedAngle = params.seed * DEG;
      // The seed is born flat at centre then rides out. Applied as the radius
      // rather than an offset on plane 0, so scrubbing the timeline stays
      // consistent — the unborn are stacked on the seed either way.
      const launch = easeInOutCubic(clamp01(state.launch));
      const Rnow = R * launch;

      // The glow sits on the front of the ring: screen centre on a wide
      // window, off to the left on a phone, travelling with the stage move.
      if (glowRef.current) {
        const gx = viewW * 0.5 + Math.cos(frontAngle) * Rnow + cx;
        const gy = viewH * 0.5 - (Math.sin(frontAngle) * Rnow + cy);
        if (Math.abs(gx - glowAt.x) > 0.5 || Math.abs(gy - glowAt.y) > 0.5) {
          glowAt.x = gx;
          glowAt.y = gy;
          glowRef.current.style.setProperty("--glow-x", `${gx.toFixed(1)}px`);
          glowRef.current.style.setProperty("--glow-y", `${gy.toFixed(1)}px`);
        }
      }

      order.length = 0;

      const track = cursor.amt > 0.001;
      const reach = Math.max(1, params.reach * W);
      const sideReach = Math.max(1, params.sideReach * W);
      // Asymmetric on purpose: the ring takes up a lean quickly and lets go
      // slowly. Equal rates read as a mechanism following the cursor; the gap
      // between them is what reads as something viscous.
      const kRise = chase(dt, params.grab);
      const kFall = chase(dt, params.release);

      // Nearest plane to front, in angle rather than screen distance: two
      // planes can sit equally far from the middle, but only one faces it.
      let frontI = -1;
      let frontD = 1e9;
      let frontCell = 0;

      // Which card the cursor is on. Independent of the hover falloff above:
      // turning the goo off should not take the cursor's word with it. Open,
      // only the frame answers, so the ring stands aside for it through the
      // open; nothing is offered there — closing is the Close button's.
      const probe = pointer.inside && pointer.seeded && interactive;
      let overI = -1;
      // Which card the rest are standing aside for, from last frame.
      const focusI = track ? over : -1;

      // The open, shaped off one linear clock. The swell is slow to start and
      // quick to finish; the ring backs away on its own curve, so for a beat
      // the threads are strung across a widening gap before the card gets
      // anywhere near it. Per axis, because the frame is allowed to leave
      // 3:2: the shader cover-fits the art to it rather than stretching.
      const of = openI >= 0 ? clamp01(opening.f) : 0;
      const grow =
        of > 0 ? (gsap.parseEase(params.openEase) || easeInOutCubic)(of) : 0;
      // In-out rather than out: the neighbours hang on for the first beat, so
      // the threads are strung while they are still in view, and only then go.
      const flee = easeInOutCubic(clamp01(of / 0.6));
      const pulse = Math.sin(Math.PI * clamp01(of / 0.7));
      // Once landed, the frame belongs to the page and scrolls with it.
      const scrollY =
        openI >= 0 && openRef.current ? openRef.current.scrollTop : 0;
      tickFx(scrollY);
      // Close sits over the page; once the page has moved under it, a halo of
      // the paper comes up round it so what passes under fades rather than
      // being cut at its rim — on a phone that is every line of text.
      const halo = openI >= 0 ? clamp01(scrollY / 60) : 0;
      if (closeEl && Math.abs(halo - haloAt) > 0.01) {
        haloAt = halo;
        closeEl.style.setProperty("--halo", halo.toFixed(2));
      }
      // The way on, mid-flight: how far the scroll has carried it, and the
      // next card's rect on its way to the hero's. The growth runs over the
      // last stretch of the scroll only, so from far up a page the card does
      // not start growing until everything above it has gone.
      let advQ = 0;
      let advG = 0;
      let advDx = 0;
      let advName = null;
      let advCard = null;
      const advRect = { x: 0, y: 0, w: 1, h: 1 };
      adv.hover += (adv.hoverTo - adv.hover) * chase(dt, 0.12);
      if (advancing) {
        const els = openTextRef.current;
        advName = findIt(els.nextName);
        advCard = findIt(els.nextImg);
        const titleIt = findIt(els.title);
        advQ = clamp01((scrollY - adv.s0) / Math.max(1, adv.s1 - adv.s0));
        const span = Math.max(1, Math.min(adv.s1 - adv.s0, viewH * 0.9));
        const gq = clamp01(1 - (adv.s1 - scrollY) / span);
        advG = gq * gq * (3 - 2 * gq);
        if (advName && titleIt) advDx = (titleIt.left - advName.left) * advG;
        if (advCard) {
          const y0 = advCard.top - scrollY;
          // On a phone the card sits under the name at the hero's width, so
          // the scroll alone carries it to the hero's place, and pulling it
          // there early ran it into the name above. It rides the scroll and
          // eases out only what is left at the end.
          const yEnd = tightNow ? advCard.top - adv.s1 : y0;
          advRect.x = advCard.left + (openRect.left - advCard.left) * advG;
          advRect.y = y0 + (openRect.top - yEnd) * advG;
          advRect.w = advCard.w + (openRect.w - advCard.w) * advG;
          advRect.h = advCard.h + (openRect.h - advCard.h) * advG;
        }
        // Its full-size picture goes on once it is growing, by which point
        // the open card is off the top of the window.
        if (advG > 0 && adv.img && heroCell !== adv.cell) {
          heroGen++;
          heroSet(adv.cell, adv.img);
          gsap.to(adv, { mix: 1, duration: 0.35, ease: "power1.inOut" });
        }
      }

      const growX = 1 + (openRect.w / W - 1) * grow;
      const growY = 1 + (openRect.h / H - 1) * grow;
      const openAspect = (1.5 * growX) / growY;
      // The crop follows the open card's cell whether or not its full-size
      // picture has arrived, so the atlas cell is never stretched to the
      // hero's aspect while it loads. During an advance, once the next card
      // is growing, crop and picture are its instead.
      if (advancing && advG > 0) {
        const a = advRect.w / Math.max(1, advRect.h);
        uniforms.uHeroP.value.set(
          adv.cell,
          heroCell === adv.cell ? adv.mix : 0,
          Math.min(1, a / 1.5),
          Math.min(1, 1.5 / a),
        );
      } else {
        const openCell = openI >= 0 ? cellOf(signedOffset(openI)) : -1;
        uniforms.uHeroP.value.set(
          openCell,
          heroCell === openCell ? hero.mix : 0,
          Math.min(1, openAspect / 1.5),
          Math.min(1, 1.5 / openAspect),
        );
      }

      // The footage. On the ring, the front card's clip once the ring has
      // rested with it there. Opening, closing or going on, the open card's
      // (the next one's once an advance is growing it). On a landed page,
      // whichever clip has most of itself in the window — the hero's or one
      // of the page's — once it is mostly in view. A change fades out what
      // is playing before it swaps, so the still underneath never jumps; a
      // clip already playing carries on when it is wanted again, which is
      // what lets a close hand the hero's clip back to the ring.
      let want = null;
      if (liveOk()) {
        if (openI >= 0) {
          const openCell = cellOf(signedOffset(openI));
          if (advancing) {
            want = advG > 0 ? cardClip(adv.cell) : null;
          } else if (opening.f < 1 || closing) {
            want = cardClip(openCell);
          } else {
            const seen = (top, h) =>
              Math.max(0, Math.min(viewH, top + h) - Math.max(0, top)) /
              Math.max(1, Math.min(h, viewH));
            let best = 0.5;
            const hc = cardClip(openCell);
            if (hc) {
              const v = seen(openRect.top - scrollY, openRect.h);
              if (v > best) {
                best = v;
                want = hc;
              }
            }
            for (const it of fx.imgs) {
              if (!it.video || it.rev < 0.6) continue;
              const v = seen(it.top - scrollY, it.h);
              if (v > best) {
                best = v;
                want = {
                  key: `page:${it.video}`,
                  cell: it.cell,
                  src: it.video,
                  aspect: it.w / Math.max(1, it.h),
                };
              }
            }
          }
        } else {
          const calm =
            interactive &&
            !dragging &&
            !picking &&
            spinVel === 0 &&
            shown >= 0 &&
            shown === announced;
          footage.calm = calm ? footage.calm + dt : 0;
          if (
            calm &&
            (footage.calm >= params.liveDelay ||
              footage.cur?.key === `card:${shown}`)
          ) {
            want = cardClip(shown);
          }
        }
      }
      if ((want?.key ?? "") !== (footage.cur?.key ?? "")) {
        footage.mix = Math.max(
          0,
          footage.mix - dt / Math.max(0.05, params.liveFade * 0.5),
        );
        if (footage.mix <= 0) {
          footage.cur = want;
          if (want) liveStart(want);
          else liveStop();
        }
      } else if (footage.ready) {
        footage.mix = Math.min(
          1,
          footage.mix + dt / Math.max(0.05, params.liveFade),
        );
      }
      uniforms.uLiveP.value.set(
        footage.cur ? footage.cur.cell : -1,
        footage.mix * footage.mix * (3 - 2 * footage.mix),
        liveFit.x,
        liveFit.y,
      );

      for (let i = 0; i < count; i++) {
        const sIdx = signedOffset(i);
        const n = Math.abs(sIdx);
        const u = i === 0 ? clamp01(state.progress) : travel[n];
        const cell = cellOf(sIdx);

        const angle = seedAngle + Math.sign(sIdx) * step * cum[n] + state.spin;
        const px = Math.cos(angle) * Rnow + cx;
        const py = Math.sin(angle) * Rnow + cy;
        rest[i].set(px, py);

        // atan2 of the difference wraps to +/-pi, so the seam costs nothing.
        const da = angle - frontAngle;
        const sda = Math.atan2(Math.sin(da), Math.cos(da));
        const toFront = Math.abs(sda);
        if (toFront < frontD) {
          frontD = toFront;
          frontI = i;
          frontCell = cell;
        }
        // How far this card's name is from the front, in slots, for the index.
        listK[cell] = toFront / step;

        // Lean toward the cursor. Scaled by u so the unborn keep out of it:
        // they are stacked on their parent, and without this the whole stack
        // would lean at once and drag the seed off the ring.
        let f = 0;
        let toX = 0;
        let toY = 0;
        if (track) {
          const dx = cursor.x - px;
          const dy = cursor.y - py;
          const dist = Math.hypot(dx, dy);
          f = smoothstep(reach, reach * 0.22, dist) * cursor.amt * u;
          if (f > 0.0001 && dist > 0.0001) {
            const lean = (params.pull * fit * f) / dist;
            toX = dx * lean;
            toY = dy * lean;
          }
        }

        // One rate for the whole of a plane's response, so the swell, the lean
        // and the honey it feeds move together instead of drifting apart.
        const k = f > hoverF[i] ? kRise : kFall;
        hoverF[i] += (f - hoverF[i]) * k;
        leanX[i] += (toX - leanX[i]) * k;
        leanY[i] += (toY - leanY[i]) * k;

        // Standing aside. Measured from the hovered card, not the cursor, so
        // the response holds steady while the cursor moves around inside it.
        let sf = 0;
        if (focusI >= 0 && i !== focusI) {
          const d = Math.hypot(focusPos.x - px, focusPos.y - py);
          sf = smoothstep(sideReach, sideReach * 0.2, d) * u;
        }
        // Its own rate: a card can be letting go of a lean at the same moment
        // it is asked to back away, and sharing one would make the second
        // thing sluggish.
        sideF[i] += (sf - sideF[i]) * (sf > sideF[i] ? kRise : kFall);

        // Straight off the eased factor — sideF is already smooth, and easing
        // it twice would only add lag.
        let pushX = 0;
        let pushY = 0;
        if (sideF[i] > 0.0001) {
          const dx = px - focusPos.x;
          const dy = py - focusPos.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.0001) {
            const away = (params.sidePush * fit * sideF[i]) / dist;
            pushX = dx * away;
            pushY = dy * away;
          }
        }

        let fx = px + leanX[i] + pushX;
        let fy = py + leanY[i] + pushY;
        let rot = (params.radial ? angle : angle + HALF_PI) * launch;
        // The open, on top of all of the above. The card that is opening
        // comes forward to the frame and straightens up as it grows; every
        // other card backs away from where it was and gives up most of its
        // size, so the swell reads as displacing the ring rather than
        // painting over it.
        let osx = 1;
        let osy = 1;
        if (of > 0) {
          if (i === openI) {
            fx += (openRect.cx - fx) * grow;
            fy += (openRect.cy + scrollY - fy) * grow;
            rot += Math.atan2(Math.sin(-rot), Math.cos(-rot)) * grow;
            osx = growX;
            osy = growY;
          } else {
            const dx = px - rest[openI].x;
            const dy = py - rest[openI].y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.0001) {
              const ux = dx / dist;
              const uy = dy / dist;
              // At least far enough to leave the window, goo and all. A push
              // sized at the reference window clears it there, where the
              // neighbours already sit in the lip; on a phone they sit in
              // full view, and one was left at the top edge melting into the
              // page.
              const out =
                Math.hypot(W, H) * 0.5 * (1 - params.openShrink) +
                (params.goo * planeK + params.openMelt) * fit;
              let clear = Infinity;
              if (ux > 0.001) clear = (viewW * 0.5 + out - px) / ux;
              else if (ux < -0.001) clear = (-viewW * 0.5 - out - px) / ux;
              if (uy > 0.001)
                clear = Math.min(clear, (viewH * 0.5 + out - py) / uy);
              else if (uy < -0.001)
                clear = Math.min(clear, (-viewH * 0.5 - out - py) / uy);
              const push = Math.max(params.openPush * fit, clear) * flee;
              fx += ux * push;
              fy += uy * push;
            }
            osx = osy = 1 - params.openShrink * flee;
          }
        }
        // The axis the honey measures along, so it can see the ring as it was.
        openS[i] = params.radial ? osy : osx;

        uniforms.uPos.value[i].set(fx, fy);
        uniforms.uRot.value[i] = rot;

        // The seed grows over its whole birth. The others are already there,
        // merged inside their parent, so they reach full size early and spend
        // the rest of their travel pulling away.
        const sx =
          i === 0
            ? easeOutCubic(clamp01(u / 0.7))
            : easeOutCubic(clamp01(u / 0.34));
        const sy =
          i === 0
            ? easeOutCubic(clamp01((u - 0.18) / 0.74))
            : easeOutCubic(clamp01((u - 0.06) / 0.36));
        // The swell rides on the birth scale rather than uSize, so a plane
        // under the cursor grows about its own centre.
        const sw = swellOf(i);
        uniforms.uScale.value[i].set(
          sx * sw * osx,
          sy * sw * osy,
          1 - params.sideDim * sideF[i],
          cell,
        );

        // Same box the shader draws, tested in the plane's own frame, so it
        // answers for the card as it actually is: turned, leaned and swollen.
        // Cards never overlap once formed, so the first hit is the only hit.
        if (probe && overI < 0 && (openI < 0 || i === openI)) {
          const qx = cursor.x - fx;
          const qy = cursor.y - fy;
          const cr = Math.cos(rot);
          const sr = Math.sin(rot);
          if (
            Math.abs(qx * cr + qy * sr) <= W * 0.5 * sx * sw * osx &&
            Math.abs(-qx * sr + qy * cr) <= H * 0.5 * sy * sw * osy
          ) {
            overI = i;
          }
        }

        order.push(i);
      }

      // The page's pictures: planes on the boxes the DOM laid out for them,
      // offset by the scroll, born in place with the seed's own curves as
      // they are scrolled to and un-born with the page when it closes.
      const pageN = openI >= 0 ? fx.imgs.length : 0;
      for (let k = 0; k < pageN; k++) {
        const it = fx.imgs[k];
        const i = count + k;
        const r = Math.min(it.rev, pageA.a);
        const bsx = easeOutCubic(clamp01(r / 0.7));
        const bsy = easeOutCubic(clamp01((r - 0.18) / 0.74));
        // Exactly on the box the DOM gave it: a picture that drifted against
        // the scroll ran into the captions and type laid out beside it.
        let px = it.left + it.w * 0.5 - viewW * 0.5;
        let py = viewH * 0.5 - (it.top + it.h * 0.5 - scrollY);
        let pw = it.w;
        let ph = it.h;
        if (it === advCard) {
          // On its way to being the next hero.
          pw = advRect.w;
          ph = advRect.h;
          px = advRect.x + pw * 0.5 - viewW * 0.5;
          py = viewH * 0.5 - (advRect.y + ph * 0.5);
        } else if (it.el === openTextRef.current.nextImg) {
          const lean = 1 + 0.03 * adv.hover;
          pw *= lean;
          ph *= lean;
        }
        rest[i].set(px, py);
        uniforms.uPos.value[i].set(px, py);
        uniforms.uRot.value[i] = 0;
        uniforms.uScale.value[i].set(
          (bsx * pw) / W,
          (bsy * ph) / H,
          1,
          it.cell,
        );
        openS[i] = 1;
        hoverF[i] = 0;
        leanX[i] = 0;
        leanY[i] = 0;
        sideF[i] = 0;
      }
      uniforms.uCount.value = count + pageN;
      uniforms.uMoreP.value.z = more.mix;

      for (let i = count + pageN; i < MAX_PLANES; i++) {
        uniforms.uScale.value[i].set(0, 0, 1, 0);
        hoverF[i] = 0;
        leanX[i] = 0;
        leanY[i] = 0;
        sideF[i] = 0;
        openS[i] = 1;
      }

      // And its type: each block's box, risen a line while it is still
      // arriving; the name on the page's own alpha, since it is handed the
      // word by the flight rather than scrolled to.
      let tn = 0;
      if (openI >= 0) {
        for (const it of fx.texts) {
          if (!it.uv || tn >= MAX_TEXT) continue;
          let a = (it.title ? titleGl.a : it.rev * pageA.a) * (it.inkA ?? 1);
          const rise = it.title ? 0 : (1 - it.rev) * 28;
          let cx = it.left + it.boxW * 0.5 - viewW * 0.5;
          if (advancing) {
            // The next name rides the scroll up to the title's place; the
            // label over it would end up in the lip, so it goes first.
            if (it === advName) cx += advDx;
            else if (it.el === openTextRef.current.nextIdx) {
              a *= 1 - smoothstep(0, 0.35, advQ);
            }
          }
          const cy = viewH * 0.5 - (it.top + it.boxH * 0.5 - scrollY + rise);
          uniforms.uTextRect.value[tn].set(
            cx,
            cy,
            it.boxW * 0.5,
            it.boxH * 0.5,
          );
          uniforms.uTextUV.value[tn].set(
            it.uv[0],
            it.uv[1],
            it.uv[2],
            it.uv[3],
          );
          uniforms.uTextA.value[tn] = a;
          tn++;
        }
      }
      uniforms.uTextCount.value = tn;

      // And its rules, on the same scroll as the type they rule off.
      let rn = 0;
      if (openI >= 0) {
        for (const it of fx.rules) {
          uniforms.uRule.value[rn++].set(
            it.left - viewW * 0.5,
            it.left + it.w - viewW * 0.5,
            viewH * 0.5 - (it.top - scrollY),
            fx.ruleA * pageA.a,
          );
        }
      }
      for (let i = rn; i < MAX_RULES; i++) uniforms.uRule.value[i].w = 0;

      frontPlane = frontI;

      // The index brightens toward the front and leans out to meet it, by how
      // near each card is rather than which one has arrived, so it moves with
      // the ring instead of flipping over.
      {
        const items = itemsRef.current;
        const reach = Math.max(0.1, params.listReach);
        for (let c = 0; c < count && c < items.length; c++) {
          const el = items[c];
          if (!el) continue;
          const w = clamp01(1 - listK[c] / reach);
          const o = params.listDim + (1 - params.listDim) * w * w;
          if (Math.abs(o - listO[c]) > 0.004) {
            listO[c] = o;
            el.style.opacity = `${o.toFixed(3)}`;
            el.style.transform = `translateX(${(-w * 0.45).toFixed(3)}em)`;
          }
        }
      }
      if (overI !== over) {
        over = overI;
        paintCursor();
      }
      // The bead. With a mouse it is the cursor on the ring; an open page
      // keeps the native one, and the Close button does the closing. Over a
      // card the drop opens sideways into a pill with the word for what a
      // click does cut out of it, so the word is read in the picture — not
      // while dragging, when what is under the pointer keeps changing, so
      // there it stays a drop riding on top. Coming out, it closes back into
      // a drop and pulls a thread of honey out of the card after it.
      const mouse = !coarse && openI < 0;
      if (mouse !== bead.on) {
        bead.on = mouse;
        paintCursor();
      }
      const word =
        mouse && pointer.inside && !dragging && interactive && over >= 0;
      const sunk = word ? over : -1;
      if (sunk !== bead.card) {
        if (bead.card >= 0 && openI < 0) pullFrom(bead.card, W, H);
        bead.card = sunk;
      }
      const present = mouse && pointer.inside && pointer.seeded;
      const drop = present && !word;
      // Height and width on springs of their own, the width a touch looser,
      // so a pill wobbles as it forms instead of scaling up in one piece.
      const sdt = Math.min(dt, 1 / 30);
      const rTo = !present
        ? 0
        : word
          ? params.beadPillH
          : params.beadSize * 0.5;
      const wTo = word
        ? Math.max(rTo, wordSheet.width * 0.5 + params.beadPillPad)
        : rTo;
      bead.v += (rTo - bead.r) * 320 * sdt - bead.v * 22 * sdt;
      bead.r += bead.v * sdt;
      if (bead.r <= 0) {
        bead.r = 0;
        bead.v = Math.max(0, bead.v);
      }
      bead.hv += (wTo - bead.hw) * 240 * sdt - bead.hv * 15 * sdt;
      bead.hw = Math.max(0, bead.hw + bead.hv * sdt);
      // Near a card the drop reaches for it: the tail is drawn toward the
      // nearest point of the card's edge, so the drop leans over and, close
      // enough, touches and melts into the card before the head is over it.
      let aimX = pointer.x;
      let aimY = pointer.y;
      if (drop && params.beadReach > 0) {
        let best = params.beadReach;
        for (let i = 0; i < count; i++) {
          const sc = uniforms.uScale.value[i];
          const hw = W * 0.5 * sc.x;
          const hh = H * 0.5 * sc.y;
          if (hw < 1 || hh < 1) continue;
          const c = uniforms.uPos.value[i];
          const rot = uniforms.uRot.value[i];
          const cr = Math.cos(rot);
          const sr = Math.sin(rot);
          const qx = pointer.x - c.x;
          const qy = pointer.y - c.y;
          const lx = qx * cr + qy * sr;
          const ly = -qx * sr + qy * cr;
          const rr = Math.min(uniforms.uRadius.value, hw, hh);
          const ox = Math.max(Math.abs(lx) - (hw - rr), 0);
          const oy = Math.max(Math.abs(ly) - (hh - rr), 0);
          const ol = Math.hypot(ox, oy);
          const gap = ol - rr;
          if (gap <= 0 || gap >= best) continue;
          best = gap;
          // Back along the edge's outward normal, turned into the world.
          const nx = (-Math.sign(lx) * ox) / ol;
          const ny = (-Math.sign(ly) * oy) / ol;
          const k = smoothstep(params.beadReach, params.beadReach * 0.2, gap);
          const len = Math.min(gap, bead.r * params.beadStretch) * k;
          aimX = pointer.x + (nx * cr - ny * sr) * len;
          aimY = pointer.y + (nx * sr + ny * cr) * len;
        }
      }
      // The tail trails its aim — the head, or that edge — and never further
      // than the drop stretches past its own rim; with no drop it sits on the
      // head, so one re-forms as a circle.
      const kt = chase(dt, params.beadLag);
      bead.tx += (aimX - bead.tx) * kt;
      bead.ty += (aimY - bead.ty) * kt;
      {
        const dx = bead.tx - pointer.x;
        const dy = bead.ty - pointer.y;
        const dl = Math.hypot(dx, dy);
        const most =
          Math.max(bead.r, bead.hw) + bead.r * (params.beadStretch - 1);
        if (dl > most) {
          const k = most / dl;
          bead.tx = pointer.x + dx * k;
          bead.ty = pointer.y + dy * k;
        }
      }
      uniforms.uBead.value.set(pointer.x, pointer.y, bead.tx, bead.ty);
      uniforms.uBeadR.value.set(
        bead.r,
        bead.r * params.beadTail,
        params.beadMelt,
        params.beadInk,
      );
      // The word comes through as the pill opens and closes up quicker.
      bead.word += ((word ? 1 : 0) - bead.word) * chase(dt, word ? 0.12 : 0.3);
      const wa = bead.word * bead.word * (3 - 2 * bead.word);
      const bl = uniforms.uBeadL.value;
      bl.x = wa;
      bl.y = Math.max(bead.hw, bead.r);
      uniforms.uBeadLP.value.z = params.beadKnock;

      // The thread, fixed to the spot on the card it came out of and drawn
      // out to the head. It thins with time and faster with stretch, pinches
      // in the middle as it goes, and once it is too thin to hold it lets go
      // all at once. Only on the ring; an open takes it with the bead.
      const bt = uniforms.uBeadT.value;
      bt.z = bt.w = -100;
      if (bead.s > 0 && bead.from >= 0 && bead.from < count && openI < 0) {
        const c = uniforms.uPos.value[bead.from];
        const rot = uniforms.uRot.value[bead.from];
        const sc = uniforms.uScale.value[bead.from];
        const lx = bead.ax * W * 0.5 * sc.x;
        const ly = bead.ay * H * 0.5 * sc.y;
        const cr = Math.cos(rot);
        const sr = Math.sin(rot);
        bt.x = c.x + lx * cr - ly * sr;
        bt.y = c.y + lx * sr + ly * cr;
        const len = Math.hypot(pointer.x - bt.x, pointer.y - bt.y);
        const stretch = clamp01(len / Math.max(1, params.beadSnap));
        const hold = bead.s * (1 - stretch * stretch);
        // Letting go kicks the drop, so it shivers as the tension leaves it.
        if (hold < 0.2 && bead.held) bead.v += params.beadSize * 2.5;
        bead.held = hold >= 0.2;
        bead.s = Math.max(
          0,
          bead.s - dt * (hold < 0.2 ? 6 : 1 / Math.max(0.05, params.beadHold)),
        );
        const w = bead.s * (1 - stretch * stretch);
        const r0 = Math.min(bead.r * 0.85, params.beadSize * 0.42 * w);
        bt.z = r0 - params.dissolve * (1 - w);
        bt.w = bt.z * (1 - (1 - params.pinch) * smoothstep(0, 0.6, stretch));
        bl.z = params.sag * stretch;
        bl.w = Math.min(params.beadMelt * 0.5, Math.max(r0, 0) * 1.5);
      } else {
        bead.s = 0;
      }
      // Off the resting centre, so a card being pushed cannot chase its own
      // shadow next frame.
      if (over >= 0) focusPos.copy(rest[over]);

      // The column and the meta name whatever cell the front plane is wearing,
      // read off the same deal the shader was handed rather than recomputed —
      // so the highlight cannot disagree with the art.
      if (frontI >= 0 && imageCount > 0 && frontCell !== shown) {
        shown = frontCell;
        paintList();
        paintGlow();
      }

      /* ---- honey ---- */
      // One bridge per parent/child pair, in ring order. Deliberately none
      // closing the circle while the fan is opening: those two planes were
      // never merged, so there is nothing between them to stretch.
      order.sort(bySlot);

      const edgeHalf = faceEdge * 0.5 * params.thread;
      // Once closed the seam pair are neighbours like any other, and without a
      // link the one gap the fan never opened is the only one the cursor
      // cannot web back together.
      const closed = spread > 0.995 && count > 2;
      const linkCount = Math.min(closed ? count : count - 1, MAX_LINKS);
      // How much of a plane is out of the window, 0..1, from its box as it
      // is drawn this frame.
      const outOf = (i) => {
        const c = uniforms.uPos.value[i];
        const sc = uniforms.uScale.value[i];
        const cr = Math.abs(Math.cos(uniforms.uRot.value[i]));
        const sr = Math.abs(Math.sin(uniforms.uRot.value[i]));
        const hw = W * 0.5 * sc.x;
        const hh = H * 0.5 * sc.y;
        const ex = Math.max(1, cr * hw + sr * hh);
        const ey = Math.max(1, sr * hw + cr * hh);
        return clamp01(
          Math.max(
            (Math.abs(c.x) + ex - viewW * 0.5) / (2 * ex),
            (Math.abs(c.y) + ey - viewH * 0.5) / (2 * ey),
          ),
        );
      };
      // The least of that across the open card's neighbours, eased: what the
      // open's melt is allowed, so it never fuses cards still in full view.
      let openOut = 1;

      for (let l = 0; l < linkCount; l++) {
        const ia = order[l];
        const ib = order[(l + 1) % count];

        const ca = uniforms.uPos.value[ia];
        const cb = uniforms.uPos.value[ib];
        const scA = uniforms.uScale.value[ia];
        const scB = uniforms.uScale.value[ib];

        // Measured between resting centres and birth scales, never hovered
        // ones. The unfurl's response to separation is ferociously steep — a
        // couple of percent of the gap is already a slab — so letting the lean
        // and the swell in turns a hover into a puzzle-piece join.
        const shrinkA =
          (params.radial ? scA.y : scA.x) / (swellOf(ia) * openS[ia]);
        const shrinkB =
          (params.radial ? scB.y : scB.x) / (swellOf(ib) * openS[ib]);
        const sep =
          rest[ia].distanceTo(rest[ib]) - sepExtent * 0.5 * (shrinkA + shrinkB);

        // 0 = faces still touching, 1 = landed at the resting gap.
        const v = clamp01(sep / finalSep);

        // Hover strings its own thread on its own curve, so it can be dialled
        // to a filament rather than inheriting the unfurl's slab. Taken at the
        // gap's midpoint, so the strongest pull lands between two planes.
        let fl = 0;
        if (track && params.web > 0.0001) {
          const mx = (ca.x + cb.x) * 0.5;
          const my = (ca.y + cb.y) * 0.5;
          const webReach = Math.max(1, params.webReach * W);
          const d = Math.hypot(cursor.x - mx, cursor.y - my);
          fl = smoothstep(webReach, webReach * 0.15, d) * cursor.amt;
        }
        // Eased on the same rates as the planes it hangs between, or the
        // thread would be there before the pull was.
        webF[l] += (fl - webF[l]) * (fl > webF[l] ? kRise : kFall);

        let w = Math.max(Math.pow(1 - v, params.thin), params.web * webF[l]);
        // The open strings its own threads to the swelling card, on a pulse:
        // they thicken as the ring starts to back away and have thinned to
        // nothing before the card reaches where the ring was. Each waits
        // until its card is on its way out of the window: on a wide one the
        // neighbours already sit half in the lip, so nothing changes; on a
        // phone they sit in full view, and threads to them read as the cards
        // trying to melt into the page.
        if (pulse > 0 && (ia === openI || ib === openI)) {
          const out = smoothstep(0, 0.35, outOf(ia === openI ? ib : ia));
          openOut = Math.min(openOut, out);
          // A phone's card is most of the width, and threads cut to its edge
          // were pillars a quarter of the screen across.
          const web = tightNow ? params.tightOpenWeb : params.openWeb;
          w = Math.max(w, web * pulse * out);
        }
        // dissolve carries the radius past zero and out of antialiasing range
        // so the thread fades instead of bottoming out as a half-covered
        // hairline. In screen px, so unlike edgeHalf it does not carry g.
        const rEnd = edgeHalf * w - params.dissolve;
        const rMid = rEnd * (1 - (1 - params.pinch) * smoothstep(0, 0.7, v));

        uniforms.uLinkA.value[l].copy(ca);
        uniforms.uLinkB.value[l].copy(cb);
        uniforms.uLinkPar.value[l].set(
          rEnd,
          rMid,
          params.sag * g * Math.pow(v, 1.5),
          // Per link, not global: with staggered generations these are all at
          // different stages. Never wider than the neck it rounds.
          Math.min(
            params.fillet * g * smoothstep(0, 0.35, v),
            Math.max(rMid, 0) * 1.5,
          ),
        );
      }
      for (let l = linkCount; l < MAX_LINKS; l++) {
        uniforms.uLinkPar.value[l].set(-100, -100, 0, 0);
      }
      uniforms.uLinkCount.value = linkCount;

      // Both are px into the distance field, so they scale with the ring or
      // the merge reads as a different material at a different window size.
      // The open softens the field and ripples the surface for as long as its
      // threads are in play, so the ring parts like something liquid.
      // An advance draws two pages' pictures past each other; they keep their
      // edges on the way rather than melting together.
      // A phone's card grows further than the reference window's on the way
      // to rest, so its goo grows with it, or the ring would settle stiffer
      // there than anywhere else.
      const gooK = tightNow
        ? 1 + (tightEnd / params.narrowEndScale - 1) * shift
        : 1;
      uniforms.uK.value =
        (params.goo * planeK * fit * gooK +
          params.openMelt * fit * pulse * openOut) *
        (advancing ? 1 - 0.9 * smoothstep(0, 0.15, advQ) : 1);
      uniforms.uWobble.value =
        params.wobble * fit * (1 - smoothstep(0.2, 0.95, state.progress)) +
        params.openWobble * fit * pulse;

      // Gated on the seed's own cell, not on the atlas existing: the texture
      // is bound from frame one but blank, and texturing before anything is
      // painted into it draws an empty cell.
      uniforms.uTextured.value = params.textured && firstIn ? 1 : 0;
      uniforms.uBlend.value = Math.max(0.5, params.blend * planeK * g);

      const on = params.glass;
      uniforms.uBandTop.value = on ? params.bandTop * viewH : 0;
      uniforms.uBandBottom.value = on ? params.bandBottom * viewH : 0;
      uniforms.uGlass.value.set(
        params.refract,
        params.squeeze,
        params.ripple,
        params.rippleFreq,
      );
      uniforms.uFringe.value = on ? params.fringe : 0;
      uniforms.uSheen.value = on ? params.sheen : 0;
    };

    /* ------------------------------------------------------- entry timeline */
    // Bumped per build, so a hold left waiting on a run that has since been
    // replaced cannot resume a timeline nobody is watching.
    let entryGen = 0;

    const build = () => {
      resetOpen();
      interactive = false;
      paintCursor();
      announced = -1;
      spinVel = 0;
      dragging = false;
      settling = false;
      // The timeline tweens state.spin, so a pick in flight has to be off the
      // same property before it starts.
      stopPick();

      const gen = ++entryGen;
      // Only the first run has anything to wait for; a replay should not flash
      // the counter back up.
      if (loaderEl) gsap.set(loaderEl, { opacity: launchReady ? 0 : 1 });

      const tl = gsap.timeline({
        delay: 0.25,
        onComplete: () => {
          interactive = true;
          paintCursor();
        },
      });

      tl.fromTo(
        state,
        { progress: 0, launch: 0, spread: 0, spin: 0, shift: 0 },
        { progress: 1, duration: 1.2, ease: "power2.out" },
      );

      // Formed and sitting at centre. It stays there until the counter lands,
      // so the ring can never unfurl into cards with nothing on them. Usually
      // there is nothing left to wait for by the time the playhead arrives —
      // the counter is paced against this same birth.
      tl.addPause(">", () => {
        whenReady(() => {
          gsap.delayedCall(params.holdAfter, () => {
            if (disposed || gen !== entryGen) return;
            tl.resume();
            if (loaderEl) {
              gsap.to(loaderEl, {
                opacity: 0,
                duration: params.loaderOut,
                ease: "power2.in",
              });
            }
          });
        });
      });

      tl.to(state, {
        launch: 1,
        duration: params.launchTime,
        ease: "power2.inOut",
      });

      // Absolute positions from here, so the stage can be dropped anywhere
      // inside the spread rather than only after it.
      const spreadStart = tl.duration() - 0.15;
      tl.to(
        state,
        { spread: 1, duration: params.spreadTime, ease: params.spreadEase },
        spreadStart,
      );

      const stageStart = spreadStart + params.stageAt * params.spreadTime;
      tl.to(
        state,
        {
          spin: params.spinTurns * TAU,
          duration: params.spinTime,
          ease: params.spinEase,
        },
        stageStart + params.spinDelay,
      );
      tl.to(
        state,
        { shift: 1, duration: params.moveTime, ease: params.moveEase },
        stageStart + params.moveDelay,
      );

      const textStart = spreadStart + params.textAt * params.spreadTime;

      if (splitText.chars.length) {
        tl.fromTo(
          splitText.chars,
          { value: 0 },
          {
            value: 1,
            duration: params.textTime,
            ease: params.textEase,
            stagger: params.textStagger,
          },
          textStart,
        );
      }

      // The heading has done its job by the time the ring is in place, and
      // from then on it is behind the front card. Timed off whichever staging
      // move finishes last, so it still lands with them if either is retimed.
      if (params.textOut && splitText.fades.length) {
        const landed = Math.max(
          stageStart + params.spinDelay + params.spinTime,
          stageStart + params.moveDelay + params.moveTime,
        );
        tl.fromTo(
          splitText.fades,
          { value: 1 },
          {
            value: 0,
            duration: params.textOutTime,
            ease: params.textOutEase,
            stagger: params.textStagger,
          },
          Math.max(0, landed + params.textOutAt),
        );
      }

      // The column and the site frame arrive with the heading, by which point
      // there is a front for them to be reading.
      const site = siteEls();
      if (site.length) {
        tl.fromTo(
          site,
          { opacity: 0 },
          { opacity: 1, duration: params.textTime, ease: params.textEase },
          textStart,
        );
      }
      if (glowRef.current) {
        tl.fromTo(
          glowRef.current,
          { "--glow-on": 0 },
          {
            "--glow-on": 1,
            duration: params.textTime,
            ease: params.textEase,
          },
          textStart,
        );
      }

      return tl;
    };

    styleMeta();

    let tl = null;
    const replay = () => {
      tl?.kill();
      tl = build();
    };

    // The entry is built once, and not until the faces are in. Every glyph
    // mask is sized by the glyph inside it, and the timeline holds direct
    // references to the uniforms those masks own — so rebuilding the text
    // later means rebuilding the timeline, which snaps state back to zero and
    // restarts the whole entry. On a warm cache fonts resolve in milliseconds
    // and that was invisible; on a cold one they arrive late and it reads as
    // the page going blank and starting over.
    const startEntry = () => {
      if (disposed || tl) return;
      splitText.build();
      wordSheet.build();
      styleMeta();
      replay();
    };

    // fonts.ready is reliable, but nothing here is worth a permanently blank
    // page if it ever is not.
    const fontFallback = setTimeout(startEntry, 3000);
    (document.fonts?.ready ?? Promise.resolve())
      .then(startEntry)
      .catch(startEntry);

    /* ------------------------------------------------------- dev controls */
    let gui;
    let guiOpen = false;
    // The dev panel, in development only (it exists nowhere else).
    const onGuiKey = (e) => {
      if (!gui || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea")
      )
        return;
      if (e.key === "g" || e.key === "G") {
        guiOpen = !guiOpen;
        gui.show(guiOpen);
      }
    };
    window.addEventListener("keydown", onGuiKey);

    if (process.env.NODE_ENV === "development") {
      Promise.all([import("lil-gui"), import("./ring/gui")]).then(
        ([{ default: GUI }, { mountGui }]) => {
          if (disposed) return;
          gui = mountGui(GUI, {
            params,
            state,
            info,
            actions: {
              replay,
              refit,
              styleMeta,
              setThreshold: meta.setThreshold,
              rebuildText: () => {
                splitText.build();
                replay();
              },
              rebuildTag: () => wordSheet.build(),
              replayMeta: () => {
                announced = -1;
              },
              retheme,
              openFront: () => {
                if (frontPlane >= 0) openProject(frontPlane);
              },
              closeProject,
              adoptWindow: () => {
                params.refWidth = Math.round(viewW);
                params.refHeight = Math.round(viewH);
                refit();
              },
            },
          });

          // Out of the way until asked for: ?gui in the URL opens with it, and
          // the G key toggles it, so it never sits over the work being judged.
          guiOpen = new URLSearchParams(window.location.search).has("gui");
          gui.show(guiOpen);
        },
      );
    }

    // Parked before the first frame, not on the first open: the band is page
    // coloured and would otherwise sit over the counter until the entry built.
    resetOpen();

    /* ---------------------------------------------------------------- loop */
    const start = performance.now();
    let prevT = start;

    // Render on demand. The whole scene is one shader pass, the heading's
    // glyphs and their uniforms; if none of it has moved since the frame
    // last drawn, and nothing in the shader runs on time, the canvas already
    // shows the right picture. A ring at rest and a page being read then cost
    // the GPU nothing. Compared against the last drawn frame, not the last
    // frame, so a slow ease cannot creep on unseen; the loop itself keeps
    // running, which is where lifecycle bugs are not.
    const shot = { cur: new Float64Array(4096), last: new Float64Array(4096) };
    let shotN = 0;
    let lastN = -1;
    let needsRender = true;
    const keep = (v) => {
      if (shotN < shot.cur.length) shot.cur[shotN++] = v;
    };
    const keepVal = (v) => {
      if (typeof v === "number") keep(v);
      else if (typeof v === "boolean") keep(v ? 1 : 0);
      else if (!v) keep(0);
      else if (v.isTexture) {
        keep(v.id);
        keep(v.version);
      } else if (v.isVector2) {
        keep(v.x);
        keep(v.y);
      } else if (v.isVector3) {
        keep(v.x);
        keep(v.y);
        keep(v.z);
      } else if (v.isVector4) {
        keep(v.x);
        keep(v.y);
        keep(v.z);
        keep(v.w);
      } else if (v.isColor) {
        keep(v.r);
        keep(v.g);
        keep(v.b);
      } else if (ArrayBuffer.isView(v) || Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) keepVal(v[i]);
      }
    };
    // uTime is left out: it moves every frame, and matters only while the
    // birth's wobble or the wake is running, which are tested for directly.
    const watched = Object.keys(uniforms)
      .filter((k) => k !== "uTime")
      .map((k) => uniforms[k]);
    const changed = () => {
      shotN = 0;
      for (const u of watched) keepVal(u.value);
      keep(textGroup.scale.x);
      for (const glyph of textGroup.children) {
        keep(glyph.visible ? 1 : 0);
        keep(glyph.position.x);
        keep(glyph.position.y);
        keep(glyph.scale.x);
        keep(glyph.scale.y);
        const gu = glyph.material.uniforms;
        for (const k in gu) if (k !== "uTime") keepVal(gu[k].value);
      }
      if (shotN !== lastN) return true;
      for (let i = 0; i < shotN; i++) {
        if (Math.abs(shot.cur[i] - shot.last[i]) > 1e-3) return true;
      }
      return false;
    };

    renderer.setAnimationLoop(() => {
      const now = performance.now();
      // Clamped, so a backgrounded tab does not resume with one huge step.
      const dt = Math.min(0.05, (now - prevT) / 1000);
      prevT = now;
      uniforms.uTime.value = (now - start) * 0.001;

      if (interactive && !dragging && !picking) {
        state.spin += spinVel * dt;
        spinVel *= Math.pow(params.damping, dt * 60);

        // How far off the nearest slot the ring is. Zero while snap is off,
        // which leaves the parking test below reading as it always did.
        let off = 0;

        if (params.snap) {
          const slot = TAU / Math.round(params.count);
          // Rate the damping alone bleeds velocity off at, in 1/s. What is
          // left to coast is exactly v / this.
          const decay = Math.max(0.01, -Math.log(params.damping) * 60);

          // A flick is left alone until it is nearly spent, and this is what
          // counts as nearly. Never lower than the speed that leaves half a
          // slot of coast: above that the slot it is heading for is still in
          // front of it, so the run-in can only carry on forward. Later than
          // that and it has to back up, which is the one thing that looks
          // wrong.
          const engage = Math.max(params.snapFrom, decay * slot * 0.5);
          // Half a slot down to a pixel is about 4.8 e-foldings, which is what
          // lets snapTime read back as seconds.
          const rate = 4.8 / Math.max(0.05, params.snapTime);

          if (!settling && Math.abs(spinVel) < engage) {
            // Committed from where the coast alone would have left it, so it
            // carries on to the slot it was already heading for rather than
            // pulling up short. Measured off the seed and off wherever front
            // ended up, so a plane lands facing the viewer.
            const coast = state.spin + spinVel / decay;
            const phase = params.seed * DEG - frontAngle;
            snapTo = Math.round((coast + phase) / slot) * slot - phase;
            // Never quicker than it was already going, so the run-in can only
            // slow the ring down. Floored at what the worst case it can be
            // handed needs, or committing from a standstill caps itself at
            // zero and never moves.
            snapCap = Math.max(Math.abs(spinVel), slot * 0.5 * rate);
            settling = true;
          }

          if (settling) {
            off = snapTo - state.spin;
            // Speed proportional to what is left: the ring runs in on an
            // exponential and stops dead on the slot. Tying speed to distance
            // is what makes overshoot impossible, and overshoot would read as
            // a click rather than a glide.
            const aim = Math.max(-snapCap, Math.min(snapCap, off * rate));
            spinVel += (aim - spinVel) * clamp01(rate * dt);
          }
        } else {
          settling = false;
        }

        // Parked. Left running, the last hundredth of a degree creeps on for
        // ever, so put it down exactly on the slot.
        if (Math.abs(spinVel) < 0.0015 && Math.abs(off) < 0.0008) {
          spinVel = 0;
          state.spin += off;
        }
      }

      tickLoader(dt);
      updatePointer(dt);
      layout(dt);

      // The name leans with the ring's speed, as the honey does.
      const want = Math.max(
        -params.titleLeanMax,
        Math.min(params.titleLeanMax, spinVel * params.titleLean),
      );
      leanNow += (want - leanNow) * chase(dt, 0.18);
      meta.lean(leanNow);

      // The name arrives with the card, not while one flicks past. A pick
      // drives spin by tween, so spinVel is zero throughout — without that
      // test the meta would morph as the ring passed the halfway mark.
      if (
        interactive &&
        !dragging &&
        !picking &&
        spinVel === 0 &&
        shown >= 0 &&
        shown !== announced
      ) {
        announced = shown;
        meta.show(shown);
      }

      // A glyph not yet revealed or already faded is still a draw call; the
      // heading is gone for good once the ring is in place.
      for (const glyph of textGroup.children) {
        const gu = glyph.material.uniforms;
        glyph.visible = gu.uReveal.value > 0.001 && gu.uOpacity.value > 0.001;
      }
      const timed =
        uniforms.uWobble.value > 0.001 ||
        uniforms.uMelt.value.y > 0.001 ||
        (footage.cur && footage.mix > 0);
      if (changed() || timed || needsRender) {
        renderer.render(scene, camera);
        shot.last.set(shot.cur.subarray(0, shotN));
        lastN = shotN;
        needsRender = false;
      }
    });

    return () => {
      disposed = true;
      clearTimeout(holdTimer);
      clearTimeout(fontFallback);
      renderer.setAnimationLoop(null);

      window.removeEventListener("resize", onResize);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("click", onClick);
      pageEl?.removeEventListener("pointermove", trackPointer);
      pageEl?.removeEventListener("pointerdown", trackPointer);
      pageEl?.removeEventListener("pointerleave", onPointerLeave);
      openEls.next?.removeEventListener("click", onNext);
      openEls.next?.removeEventListener("pointerenter", onNextIn);
      openEls.next?.removeEventListener("pointerleave", onNextOut);
      if (pageEl) gsap.killTweensOf(pageEl);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onGuiKey);
      window.removeEventListener("keydown", onKeysOn);
      window.removeEventListener("pointerdown", onKeysOff, true);
      delete root.dataset.keys;
      document.removeEventListener("visibilitychange", onVisibility);
      closeEl?.removeEventListener("click", closeProject);
      gsap.killTweensOf([closeDisc, ...closeStrokes].filter(Boolean));

      tl?.kill();
      openTl?.kill();
      gsap.killTweensOf(opening);
      gsap.killTweensOf(splitText.chars);
      gsap.killTweensOf(splitText.fades);
      gsap.killTweensOf([...siteEls(), roomEl].filter(Boolean));
      meta.dispose();
      wordSheet.dispose();
      splitText.dispose();
      gui?.destroy();

      mesh.geometry.dispose();
      mesh.material.dispose();
      uniforms.uAtlas.value?.dispose();
      heroTex?.dispose();
      moreTex?.dispose();
      moreBlank.dispose();
      textTex?.dispose();
      textBlank.dispose();
      heroBlank.dispose();
      liveStop();
      liveTex.dispose();
      liveBlank.dispose();

      // dispose() frees GL resources but leaves the context itself alive until
      // the canvas is collected, which is not deterministic. This effect
      // re-runs on every StrictMode double mount and every hot update, so
      // without an explicit release they pile up, and once the browser's limit
      // is reached the renderer above cannot be constructed at all.
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <>
      {/* touch-none, or the browser claims the gesture for panning and the
          pointermove stream dies mid-drag. Nothing here scrolls — the swipe
          is the carousel. */}
      <div ref={containerRef} className="fixed inset-0 touch-none" />

      {/* The room under the work, behind the name, which is behind the
          ring: the front card's own colour lifted to a light and pooled
          behind it, the falloff toward the corners, and the paper under
          both — one element so the gradients are dithered against the paper
          (see .room in globals.css). --glow is a registered property, so a
          change of card cross-fades. Nothing shows until the room has set
          its strengths: they all default to none. */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="room pointer-events-none fixed inset-0 -z-20"
        style={{ transition: "--glow 1.6s ease" }}
      />

      {/* 01 / 18, over the discipline beside the card. Placed by meta.style
          with the block, hidden from the tree because the live region says
          it. */}
      <div
        ref={countRef}
        aria-hidden="true"
        className="pointer-events-none fixed z-10 -translate-y-1/2 tracking-[-0.01em] text-(--ink) opacity-0"
      />

      {/* Film over everything: grain, pointer-transparent. It also dithers
          the glow, which would otherwise band in eight bits. Unseen until the
          room sets its strength: at the opacity it is born with, the first
          frames of a load were a screen of grey noise. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-30"
      >
        <div
          ref={grainRef}
          className="grain absolute inset-0 opacity-0 mix-blend-soft-light"
        />
      </div>

      {/* Never takes the pointer: the canvas underneath handles the wheel and
          the drag, and the column has no business interrupting a throw that
          happens to pass under it. Sized from styleMeta, not a class, so it
          takes the narrow bump with every other label. */}
      <ul
        ref={listRef}
        aria-label="Projects"
        style={{
          fontFamily: '"Satoshi", ui-sans-serif, system-ui, sans-serif',
        }}
        className="pointer-events-none fixed top-1/2 z-10 flex -translate-y-1/2 flex-col items-end text-right leading-[1.4] tracking-[0.01em] text-(--ink) opacity-0"
      >
        {PROJECTS.map((p, i) => (
          <li
            key={p.file}
            ref={(el) => {
              itemsRef.current[i] = el;
            }}
            // No transition, deliberately: the colour turns over the moment
            // the ring passes the halfway point between two slots.
            style={{ opacity: 0.2 }}
          >
            {p.name}
          </li>
        ))}
      </ul>

      {/* Three rows per side, identical in structure and all carrying both
          words: two inside the filtered wrapper that melt into each other, and
          one outside it for words carrying over unchanged. Which row paints
          what is decided per change — see ring/meta.js.

          Hidden from the accessibility tree; a card is announced once, in
          full, from the live region below. */}
      {[
        { side: "left", justify: "flex-start" },
        { side: "right", justify: "flex-end" },
      ].map(({ side, justify }) => {
        // Baseline, not centre: the halves are set at different sizes, and a
        // shared baseline is what makes them read as one lockup.
        const row = (
          <span className="flex items-baseline whitespace-nowrap">
            <span />
            <span />
          </span>
        );
        return (
          <div
            key={side}
            ref={(el) => {
              metaRef.current[side].box = el;
            }}
            aria-hidden="true"
            className="pointer-events-none fixed top-1/2 z-10 -translate-y-1/2 tracking-[-0.01em] text-(--ink)"
          >
            <span
              ref={(el) => {
                metaRef.current[side].goo = el;
              }}
              className="absolute inset-0"
              // Promoted up front, so switching the goo on and off is not also
              // a compositor layer being created and thrown away.
              style={{ willChange: "filter" }}
            >
              {[0, 1].map((i) => (
                <span
                  key={i}
                  ref={(el) => {
                    metaRef.current[side].layers[i] = el;
                  }}
                  className="absolute inset-0 flex items-center"
                  style={{ justifyContent: justify }}
                >
                  {row}
                </span>
              ))}
            </span>
            <span
              ref={(el) => {
                metaRef.current[side].plain = el;
              }}
              className="absolute inset-0 flex items-center"
              style={{ justifyContent: justify }}
            >
              {row}
            </span>
          </div>
        );
      })}

      {/* The opened project: a page that scrolls over the ring. The frame
          itself is the shader's and follows this scroll; the DOM sets the
          name and counter above it, the column beside it, then the project's
          other images and the way on to the next. Inert and transparent to
          the pointer until a card is opened, so neither a cursor nor a screen
          reader can find it before then. Faces, sizes and positions are
          variables written by styleOpen. */}
      <div
        ref={openRef}
        role="dialog"
        aria-hidden="true"
        inert
        className="pointer-events-none fixed inset-0 z-20 overflow-y-auto overscroll-contain text-(--ink) [scrollbar-width:none]"
      >
        <article
          className="relative"
          style={{ paddingLeft: "var(--x-ml)", paddingRight: "var(--x-mr)" }}
        >
          {/* Around the frame. The frame shows through from the canvas. */}
          <div
            ref={(el) => {
              openTextRef.current.hero = el;
            }}
            className="relative"
            style={{ height: "var(--h-hero)" }}
          >
            <div
              ref={(el) => {
                openTextRef.current.head = el;
              }}
              className="absolute inset-x-0 opacity-0"
              style={{ top: "var(--y-name)" }}
            >
              {/* The name, at the size it had over the ring. Laid out here,
                  drawn by the shader: the DOM word that flies in hands off to
                  it, and from then on it bends through the lip with the page. */}
              <h2
                ref={(el) => {
                  openTextRef.current.title = el;
                }}
                data-gl="text"
                data-title=""
                className="m-0 w-fit leading-none whitespace-nowrap tracking-[-0.03em] opacity-0"
                style={{
                  fontFamily: "var(--f-head)",
                  fontSize: "var(--t-title)",
                  fontWeight: "var(--w-head)",
                }}
              />
            </div>
          </div>

          {/* The page: a strip of facts and the statement under the hero,
              the project's other two pictures at different sizes, and the
              next project as the way on. Laid out here, drawn by the shader:
              every block carries data-gl and is placed on its box by the
              layout loop, so the browser paints none of it and all of it
              bends through the lip. wide: is the first width above the
              tablet band. */}
          <div
            ref={(el) => {
              openTextRef.current.body = el;
            }}
            className="opacity-0"
          >
            <section
              data-gl="rule"
              className="grid grid-cols-12 gap-x-[2vw] gap-y-[5vh] border-t border-transparent pt-[2.6vh]"
              style={{ marginTop: "var(--y-strip)" }}
            >
              <dl className="col-span-12 m-0 grid grid-cols-3 gap-x-[2vw] wide:col-span-5">
                {[
                  ["Discipline", "type"],
                  ["Year", "year"],
                  ["Index", "index"],
                ].map(([label, key]) => (
                  <div key={key}>
                    <dt data-gl="text" className="opacity-0" style={MICRO}>
                      {label}
                    </dt>
                    <dd
                      ref={(el) => {
                        openTextRef.current[key] = el;
                      }}
                      data-gl="text"
                      className="m-0 mt-[0.8vh] leading-[1.3] tracking-[-0.01em] opacity-0"
                      style={{
                        fontFamily: "var(--f-name)",
                        fontSize: "var(--t-name)",
                        fontWeight: "var(--w-name)",
                      }}
                    />
                  </div>
                ))}
              </dl>
              {/* The statement, in the heading's face: the page's second
                  display moment, pushed right onto the pictures' axis. */}
              <p
                ref={(el) => {
                  openTextRef.current.blurb = el;
                }}
                data-gl="text"
                className="col-span-12 m-0 max-w-[22em] leading-[1.22] tracking-[-0.015em] opacity-0 wide:col-span-6 wide:col-start-7"
                style={{
                  fontFamily: "var(--f-head)",
                  fontSize: "var(--t-lead)",
                  fontWeight: "var(--w-head)",
                }}
              />
            </section>

            {/* The project's pictures and clips, up to six, each a box the
                shader paints and a caption it draws. setOpenCopy fills them
                and sets each one's slot and shape; the slots are laid out on
                the page's twelve columns in globals.css. */}
            <div className="media" style={{ marginTop: "var(--y-images)" }}>
              {Array.from({ length: MEDIA_MAX }, (_, k) => (
                <figure
                  key={k}
                  ref={(el) => {
                    openTextRef.current.figs[k] = el;
                  }}
                  className="media-fig"
                  data-slot="lead"
                  data-shape="land"
                >
                  <div
                    ref={(el) => {
                      openTextRef.current.boxes[k] = el;
                    }}
                    role="img"
                    data-gl="img"
                    className="media-box"
                  />
                </figure>
              ))}
              {/* Three insights, a numbered row between the opening pictures
                  and the rest; setOpenCopy fills it and sets its place. */}
              <section
                ref={(el) => {
                  openTextRef.current.insightRow = el;
                }}
                className="insights"
              >
                {Array.from({ length: 3 }, (_, k) => (
                  <div key={k} data-gl="rule" className="insight">
                    <div
                      ref={(el) => {
                        openTextRef.current.insightHeads[k] = el;
                      }}
                      data-gl="text"
                      className="opacity-0"
                      style={MICRO}
                    />
                    <p
                      ref={(el) => {
                        openTextRef.current.insightTexts[k] = el;
                      }}
                      data-gl="text"
                      className="m-0 mt-[1.6vh] leading-[1.4] tracking-[-0.005em] opacity-0"
                      style={{
                        fontFamily: "var(--f-name)",
                        fontSize: "var(--t-name)",
                        fontWeight: "var(--w-name)",
                      }}
                    />
                  </div>
                ))}
              </section>
            </div>

            {/* The way on: the next project's name at the size of this one's,
                its card beside it, the whole row one button. */}
            <div
              data-gl="rule"
              className="mt-[18vh] mb-[10vh] border-t border-transparent pt-[3vh]"
            >
              <button
                ref={(el) => {
                  openTextRef.current.next = el;
                }}
                type="button"
                className="block w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left text-(--ink) focus-visible:outline-none"
              >
                <span
                  ref={(el) => {
                    openTextRef.current.nextIdx = el;
                  }}
                  data-gl="text"
                  className="block opacity-0"
                  style={MICRO}
                />
                {/* Beside each other from a tablet up; on a phone, where a
                    long name fills the width, the card goes under the name at
                    the hero's width, so the way on is only a scroll. */}
                <span className="mt-[2.4vh] flex flex-col items-start gap-[2.4vh] tablet:flex-row tablet:items-end tablet:justify-between tablet:gap-[3vw]">
                  <span
                    ref={(el) => {
                      openTextRef.current.nextName = el;
                    }}
                    data-gl="text"
                    className="block leading-none whitespace-nowrap tracking-[-0.03em] opacity-0"
                    style={{
                      fontFamily: "var(--f-head)",
                      fontSize: "var(--t-title)",
                      fontWeight: "var(--w-head)",
                    }}
                  />
                  <span
                    ref={(el) => {
                      openTextRef.current.nextImg = el;
                    }}
                    role="img"
                    data-gl="img"
                    className="block aspect-[3/2] w-full shrink-0 tablet:w-[26%]"
                  />
                </span>
              </button>
            </div>
          </div>

          {/* Room for the way on to scroll the next name up to the title's
              place. Sized only while it does. */}
          <div
            ref={(el) => {
              openTextRef.current.spacer = el;
            }}
            aria-hidden="true"
          />
        </article>

        {/* Close: a disc of the page's own colour with a hairline ring and a
            cross, styled in globals.css. Drawn in by the open timeline.
            Fixed, so it stays put while the page scrolls under it. */}
        <button
          ref={closeRef}
          type="button"
          aria-label="Close"
          className="close pointer-events-auto fixed"
          style={{ right: "var(--x-mr)", top: "var(--y-close)" }}
        >
          <span className="close-disc" aria-hidden="true">
            <span className="close-x">
              <span className="close-stroke" />
              <span className="close-stroke" />
            </span>
          </span>
        </button>
      </div>

      {/* 001 to 100. Holds the entry at the seed until it gets there. */}
      <div
        ref={loaderRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 z-10 -translate-x-1/2 tracking-[-0.01em] text-(--ink)"
      />

      <div ref={liveRef} aria-live="polite" className="sr-only" />

      {/* Alpha multiplied up hard and biased down, so a pixel is either fully
          opaque or gone. That is what fuses two blurred words into one
          silhouette instead of laying them over each other. Region is
          oversized because the blur bleeds well outside the text's own box. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute h-0 w-0"
        focusable="false"
      >
        <defs>
          <filter
            id="name-goo"
            x="-20%"
            y="-100%"
            width="140%"
            height="300%"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix
              ref={cutRef}
              in="SourceGraphic"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 255 -140"
            />
          </filter>
        </defs>
      </svg>
    </>
  );
}
