import gsap from "gsap";
import { PROJECTS } from "./projects";

/**
 * The project block beside the ring: the title on one row, [type . year] on
 * the row under it, and a counter over both. Two groups, kept from when they
 * sat either side of the card — the left one carries [number . name] and now
 * paints only the name, the right one [type . year]. Both read whatever card
 * is facing front.
 *
 * Changing card melts one set of words into the next. Two copies are stacked,
 * one blurred out as the other blurs in, and the pair run through an alpha
 * threshold that forces every pixel above a cut solid and drops the rest. Two
 * soft edges drifting past each other cross that cut as one shape, which is
 * what makes the words run together and pull apart instead of crossfading.
 * None of it is per-glyph.
 *
 * The threshold is built from GPU filters, not an SVG one. The melting rows
 * are painted white on black (black on white in the light room) inside a
 * mask, so their coverage is luminance; `brightness()` then `contrast()` is
 * the same gain and cut a colour matrix applied to alpha, out = edge * (in -
 * cut). A layer of the ink is multiplied onto the mask, and the box lightens
 * (darkens) onto the room, so black is the identity and nothing shows where
 * there is no word. It used to be `filter: url(#svg)` with an feColorMatrix
 * on alpha, and WebKit renders reference filters in software: on a phone at
 * 3x the melt cost 50-150 ms a frame and every swipe ended in a slideshow.
 * The CSS filters and blends are Core Animation's, and the same melt is
 * free.
 *
 * A word that is not actually changing — the same year twice running — is
 * held instead of melted. Holding it in place is not enough on its own: the
 * threshold has to span both layers for them to fuse, so anything inside it
 * gets thresholded whether it moves or not and a held word visibly thickens.
 * So each group carries a third row outside the filtered subtree and paints
 * carried-over words from there.
 *
 * All three rows always hold both words, painted or not. The row is what
 * positions the other word, and a missing one would move it.
 */

const SIDES = ["left", "right"];
const SLOTS = 2;

const slotsOf = (row) => row?.firstElementChild?.children;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// One word's share of a morph. f = 1 present, 0 gone. Opacity falls away far
// slower than the blur climbs, so the word still carries alpha well into its
// smear — without that there is nothing for the threshold to weld the other
// one to. Applied per word, not per row, so a held word can be left alone.
//
// The smear stops at three times the blur. A stroke blurred that wide peaks
// well under the cut even where two words overlap, so past it the threshold
// has nothing left to find, and the word is let go instead of blurred on: a
// blur that keeps growing is the one part of the melt that still costs
// frames once the filters run on the GPU. Let go over a stretch rather than
// cut, so with no smear at all the word is not still solid when it goes.
function fade(el, f, blur) {
  if (!el) return;
  if (f >= 1) {
    el.style.filter = "none";
    el.style.opacity = "1";
    return;
  }
  const a = f <= 0 ? 0 : Math.pow(f, 0.4) * smoothstep(0.1, 0.22, f);
  if (a <= 0.001) {
    // Cleared as well as hidden, so a spent word is not left holding a wide
    // blur the compositor has to keep around.
    el.style.filter = "none";
    el.style.opacity = "0";
    return;
  }
  const b = Math.min(blur / f - blur, blur * 3);
  el.style.filter = b > 0.01 ? `blur(${b.toFixed(2)}px)` : "none";
  el.style.opacity = a.toFixed(3);
}

// The alpha threshold, as filters the GPU runs: out = edge * (in - cut) on
// the mask's luminance, then a touch of blur standing in for antialiasing.
// In the light room the words are black on white, so the cut is mirrored:
// coverage a reads as 1 - a, and a word has to clear 1 - cut from above.
function threshold(params, dark) {
  const edge = Math.max(1, params.nameEdge);
  const cut = dark ? params.nameCut : 1 - params.nameCut;
  const c = 2 * edge * cut + 1;
  const k = edge / c;
  return `brightness(${k.toFixed(4)}) contrast(${c.toFixed(2)}) blur(${params.nameSoften}px)`;
}

function createGroup(side, groups, params, room) {
  const m = { t: 1 };
  // What is on screen, and which of it the morph in flight is moving. Both
  // rows are rewritten on every change rather than trading places: a word can
  // move between the filtered rows and the steady one from change to change,
  // and alternating would leave whichever row it left holding something stale.
  let prev = ["", ""];
  let moving = [false, false];
  // Swap the words instead of melting them (the block, on a phone).
  let instant = false;

  const draw = () => {
    const g = groups[side];
    if (!g) return;
    const out = slotsOf(g.layers[0]);
    const into = slotsOf(g.layers[1]);
    const held = slotsOf(g.plain);
    const t = m.t;

    for (let j = 0; j < SLOTS; j++) {
      if (moving[j]) {
        // Each group smears in proportion to its own size, or the big name
        // would read as a crossfade and the small rows as a smudge.
        fade(out?.[j], 1 - t, g.blur ?? params.nameBlur);
        fade(into?.[j], t, g.blur ?? params.nameBlur);
        if (held?.[j]) held[j].style.opacity = "0";
      } else {
        if (out?.[j]) out[j].style.opacity = "0";
        if (into?.[j]) into[j].style.opacity = "0";
        if (held?.[j]) held[j].style.opacity = "1";
      }
    }

    // Only worth its cost while two words are in play. At rest the threshold
    // hardens glyph edges, and at this size that is the difference between
    // type that is set and type that is stamped.
    if (g.goo) {
      g.goo.style.filter = t >= 1 ? "none" : threshold(params, room.dark);
    }
  };

  // parts[0] is the leading slot, parts[1] the trailing one. Which of those is
  // the big half depends on the side and is decided in style() below.
  // `dur` lets a caller fit the melt to a motion it is paired with; the pick
  // ends it as the card arrives, so the open starts from settled type.
  const set = (parts, dur) => {
    const g = groups[side];
    if (!g?.layers[0] || !g.layers[1] || !g.plain) return;
    gsap.killTweensOf(m);

    // A change landing mid-morph finishes the one in flight first, so the next
    // pair has something settled to melt out of. Also what makes the
    // comparison below honest: it is against what is actually on screen.
    m.t = 1;
    draw();

    const next = [parts[0] ?? "", parts[1] ?? ""];
    moving = [next[0] !== prev[0], next[1] !== prev[1]];

    const out = slotsOf(g.layers[0]);
    const into = slotsOf(g.layers[1]);
    const held = slotsOf(g.plain);
    for (let j = 0; j < SLOTS; j++) {
      if (out?.[j]) out[j].textContent = prev[j];
      if (into?.[j]) into[j].textContent = next[j];
      if (held?.[j]) held[j].textContent = next[j];
    }
    prev = next;

    // Card changed but this group did not. Nothing to melt, and no reason to
    // switch the threshold on. Or the words are swapped outright.
    if (instant || (!moving[0] && !moving[1])) {
      moving = [false, false];
      m.t = 1;
      draw();
      return;
    }

    m.t = 0;
    draw();
    gsap.to(m, {
      t: 1,
      duration: dur ?? params.nameMorphTime,
      ease: params.nameEase,
      onUpdate: draw,
    });
  };

  // Finish whatever morph is in flight, now.
  const settle = () => {
    gsap.killTweensOf(m);
    m.t = 1;
    draw();
  };

  return {
    m,
    set,
    settle,
    draw,
    instant: (v) => {
      instant = !!v;
    },
  };
}

// Which way round the room is: ink on dark paper, or on light.
const isDark = (hex) => {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  if (Number.isNaN(n)) return true;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
};

/**
 * refs: { groups, list, loader, live, count } — DOM handed over from the
 * component. `groups` is the shape the JSX populates, one entry per side:
 * the box, the mask (`goo`) with its two melting rows, the ink layer over
 * it, and the steady row — which on the right has a box of its own
 * (`plainBox`) over the ring, while the melt's box sits under it.
 */
export function createMeta(refs, params) {
  const { groups, loader, live, count } = refs;
  // Which way round the room is, for the mask's polarity; set by retheme.
  const room = { dark: true };
  const left = createGroup("left", groups, params, room);
  const right = createGroup("right", groups, params, room);

  // The threshold is read off the params on every frame of a morph; this
  // only redraws one in flight so a change shows at once.
  const setThreshold = () => {
    left.draw();
    right.draw();
  };

  // The mask, the ink and the blend follow the room. Black is the identity
  // for lighten and white for darken, so the mask's ground vanishes and only
  // the words, thresholded and inked, reach the page. Separate from style()
  // so a change of room can redo it without re-measuring anything.
  const retheme = () => {
    const dark = isDark(params.paper);
    room.dark = dark;
    for (const side of SIDES) {
      const g = groups[side];
      if (!g?.box) continue;
      g.box.style.mixBlendMode = dark ? "lighten" : "darken";
      // The same ground on the box as on the mask: the mask is a layer of
      // its own and can snap a pixel short of the box, and the ink
      // multiplied over nothing is ink — a hairline along the edge.
      g.box.style.backgroundColor = dark ? "#000" : "#fff";
      if (g.goo) {
        g.goo.style.backgroundColor = dark ? "#000" : "#fff";
        g.goo.style.color = dark ? "#fff" : "#000";
      }
      if (g.ink) {
        g.ink.style.backgroundColor = params.ink;
        g.ink.style.mixBlendMode = dark ? "multiply" : "screen";
        g.ink.style.opacity = side === "left" ? `${params.titleDim}` : "";
      }
    }
  };

  // layout: { textK, viewW, titleVw, blockX, blockW, blockY, under, cardTop,
  // swapBlock } — the geometry the block hangs off, passed in rather than
  // read, so this stays a pure function of the window it is told about.
  // `under`, on a phone, is the top of the space under the card, where the
  // block goes instead of beside it; `swapBlock` has the block's words swap
  // rather than melt there. The name's size comes in resolved (titleVwNow in
  // the component), so the page's title can be set from the very same figure.
  const style = ({
    textK,
    viewW,
    titleVw,
    blockX,
    blockW,
    blockY,
    under,
    cardTop,
    swapBlock,
  }) => {
    right.instant(swapBlock);
    const gapPx = (params.titleGap / 100) * (viewW * 0.65);
    const titlePx = (titleVw * viewW) / 100;
    // In px with floors: in vw alone the small type fell to 6px on a phone.
    const metaPx = Math.max(
      params.metaMin,
      (params.metaSize * textK * viewW) / 100,
    );
    const smallPx = Math.max(
      params.smallMin,
      (params.idxSize * textK * viewW) / 100,
    );
    // The counter's line and the block's, centred on blockY beside the card,
    // or hung from the top of the space under it.
    const midY = under != null ? under + smallPx * 0.5 + metaPx * 0.75 : blockY;
    const titleFace = `"${params.textFont}", "${params.textFallback}", ui-sans-serif, system-ui, sans-serif`;
    const bigFace = `"${params.nameFont}", ui-sans-serif, system-ui, sans-serif`;
    const smallFace = `"${params.idxFont}", ui-sans-serif, system-ui, sans-serif`;

    for (const side of SIDES) {
      const g = groups[side];
      if (!g?.box) continue;
      // The left group is the name; the right is discipline and year.
      const isTitle = side === "left";
      g.box.style.display = "";
      if (g.plainBox) g.plainBox.style.display = "";

      const rowPx = isTitle ? titlePx : metaPx;
      g.blur = isTitle ? titlePx * params.titleBlur : params.nameBlur;
      // Roomy, because this box is what the filters are measured off and the
      // blur needs somewhere to go: three rows for the name, five for the
      // block, whose smear is wider than its type. Even and whole, like
      // every edge of the box below: the box blends onto the room, and a
      // blended box on a fraction of a pixel has its backdrop resampled,
      // which showed as a hairline round it and the paper's grain smoothed
      // inside it.
      const h = 2 * Math.round(rowPx * (isTitle ? 1.5 : 2.5));
      g.box.style.height = `${h}px`;
      // Room either side of the block's words for the same smear.
      let pad = 0;

      if (isTitle) {
        // The name: full width, centred on the card, its foot a gap above the
        // card's top edge, and behind the canvas so the ring passes in front.
        // Placed by its top rather than the class's centring transform, so
        // the open can borrow the transform to carry the word to the page.
        g.box.style.width = "100vw";
        g.box.style.left = "0";
        g.box.style.right = "auto";
        g.box.style.top = `${Math.round(cardTop - gapPx - titlePx * 0.5 - h * 0.5)}px`;
        g.box.style.bottom = "";
        // Both: the class centres with Tailwind's `translate` property, which
        // `transform: none` does not touch.
        g.box.style.transform = "none";
        g.box.style.translate = "none";
        g.box.style.zIndex = "-1";
      } else {
        // Discipline and year, under the counter: right of the card, or on a
        // phone under it. The melt's box is padded all round and clips to
        // its own ground, because a smear that spilled past the box had no
        // ground and no ink under it and read as a halo round the block (a
        // white blob, on iOS). It sits under the ring like the name's, where
        // the blend has only the room beneath it; the steady row keeps a
        // box of its own over the ring, on the same geometry, so at rest
        // nothing has moved.
        pad = Math.round(rowPx * 2);
        const left = Math.round(blockX - pad);
        const width = Math.round(Math.max(160, blockW) + 2 * pad);
        const top = Math.round(midY + metaPx * 0.75 - h * 0.5);
        for (const box of [g.box, g.plainBox]) {
          if (!box) continue;
          box.style.width = `${width}px`;
          box.style.left = `${left}px`;
          box.style.right = "auto";
          box.style.top = `${top}px`;
          box.style.bottom = "";
          box.style.height = `${h}px`;
          box.style.transform = "none";
          box.style.translate = "none";
        }
        g.box.style.zIndex = "-1";
        g.box.style.overflow = "hidden";
        if (g.plainBox) g.plainBox.style.zIndex = "";
      }

      // All three rows, the steady one included. They have to agree exactly or
      // a word would jump as it moved between them.
      for (const layer of [...g.layers, g.plain]) {
        if (!layer) continue;
        layer.style.alignItems = "";
        layer.style.justifyContent = isTitle ? "center" : "flex-start";
        const row = layer.firstElementChild;
        row.style.alignItems = "";
        row.style.flexDirection = "";
        row.style.gap = isTitle
          ? "0"
          : `${Math.max(metaPx * 0.6, (params.metaGapR * viewW) / 100)}px`;
        row.style.paddingLeft = pad ? `${pad}px` : "";
        // On the steady row, not the words: the morph owns the words'
        // opacity, and the melting rows are a mask, dimmed through the ink.
        row.style.opacity =
          isTitle && layer === g.plain ? `${params.titleDim}` : "";
        const [lead, trail] = row.children;
        // The number has a counter of its own, so the name row paints only
        // the name. Its morph carries on underneath.
        lead.style.display = isTitle ? "none" : "";
        lead.style.order = "";
        lead.style.marginTop = "";
        lead.style.marginLeft = "";
        lead.style.lineHeight = "";
        lead.style.letterSpacing = "";
        lead.style.color = "";
        lead.style.fontFamily = bigFace;
        lead.style.fontSize = `${metaPx}px`;
        lead.style.fontWeight = `${params.nameWeight}`;
        trail.style.fontFamily = isTitle ? titleFace : smallFace;
        trail.style.fontSize = isTitle ? `${titleVw}vw` : `${smallPx}px`;
        trail.style.fontWeight = isTitle
          ? `${params.textWeight}`
          : `${params.idxWeight}`;
        trail.style.letterSpacing = isTitle ? "-0.03em" : "";
        trail.style.lineHeight = isTitle ? "1" : "";
        trail.style.color = "";
      }
    }

    // The counter, over the discipline. A second voice, in the colour rather
    // than the opacity the entry and the open animate.
    if (count) {
      count.style.left = `${blockX}px`;
      count.style.top = `${midY - metaPx * 0.75}px`;
      count.style.fontFamily = smallFace;
      count.style.fontSize = `${smallPx}px`;
      count.style.fontWeight = `${params.idxWeight}`;
      count.style.color = "var(--ink-2)";
    }

    // The load counter is set from here too, so all the type moves as one
    // piece across a breakpoint instead of half of it growing.
    if (loader) {
      loader.style.bottom = `${params.loaderBottom}vh`;
      loader.style.fontFamily = smallFace;
      loader.style.fontSize = `${smallPx}px`;
      loader.style.fontWeight = `${params.idxWeight}`;
    }

    retheme();
  };

  // The name leans with the ring. On the rows, not the box: the box is what
  // the open carries to the page.
  let leaning = 0;
  const lean = (deg) => {
    if (Math.abs(deg - leaning) < 0.02) return;
    leaning = deg;
    const g = groups.left;
    if (!g) return;
    const t = Math.abs(deg) < 0.02 ? "" : `skewX(${(-deg).toFixed(2)}deg)`;
    for (const layer of [...g.layers, g.plain]) {
      const row = layer?.firstElementChild;
      if (row) row.style.transform = t;
    }
  };

  // Both groups in one call, so the number can never drift from the name it
  // is numbering.
  const show = (i, dur) => {
    const p = PROJECTS[i];
    if (!p) return;
    left.set([String(i + 1).padStart(2, "0"), p.name], dur);
    right.set([p.type, p.year], dur);
    if (count) {
      count.textContent = `${String(i + 1).padStart(2, "0")} / ${String(PROJECTS.length).padStart(2, "0")}`;
    }
    // The groups are hidden from the accessibility tree, so the card is
    // announced once, in full, from the live region instead of four times.
    if (live) live.textContent = `${p.name}. ${p.type}, ${p.year}.`;
  };

  const settle = () => {
    left.settle();
    right.settle();
  };

  const dispose = () => {
    gsap.killTweensOf(left.m);
    gsap.killTweensOf(right.m);
  };

  return { show, style, setThreshold, retheme, settle, lean, dispose };
}
