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

// One word's share of a morph. f = 1 present, 0 gone. Opacity falls away far
// slower than the blur climbs, so the word still carries alpha well into its
// smear — without that there is nothing for the threshold to weld the other
// one to. Applied per word, not per row, so a held word can be left alone.
function fade(el, f, blur) {
  if (!el) return;
  if (f >= 1) {
    el.style.filter = "none";
    el.style.opacity = "1";
  } else if (f <= 0) {
    // Cleared as well as hidden, so a spent word is not left holding a 100px
    // blur the compositor has to keep around.
    el.style.filter = "none";
    el.style.opacity = "0";
  } else {
    el.style.filter = `blur(${Math.min(blur / f - blur, 100)}px)`;
    el.style.opacity = `${Math.pow(f, 0.4)}`;
  }
}

function createGroup(side, groups, params) {
  const m = { t: 1 };
  // What is on screen, and which of it the morph in flight is moving. Both
  // rows are rewritten on every change rather than trading places: a word can
  // move between the filtered rows and the steady one from change to change,
  // and alternating would leave whichever row it left holding something stale.
  let prev = ["", ""];
  let moving = [false, false];

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
      g.goo.style.filter =
        t >= 1 ? "none" : `url(#name-goo) blur(${params.nameSoften}px)`;
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
    // switch the threshold on.
    if (!moving[0] && !moving[1]) {
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

  return { m, set, settle };
}

/**
 * refs: { groups, list, loader, cut, live } — DOM handed over from the
 * component. `groups` is the shape the JSX populates, one entry per side.
 */
export function createMeta(refs, params) {
  const { groups, loader, cut, live, count } = refs;
  const left = createGroup("left", groups, params);
  const right = createGroup("right", groups, params);

  // Only the alpha row does any work; colour passes straight through.
  const setThreshold = () => {
    cut?.setAttribute(
      "values",
      `1 0 0 0 0
       0 1 0 0 0
       0 0 1 0 0
       0 0 0 ${params.nameEdge} ${-params.nameEdge * params.nameCut}`,
    );
  };

  // layout: { textK, viewW, titleVw, blockX, blockW, blockY, under, cardTop }
  // — the geometry the block hangs off, passed in rather than read, so this
  // stays a pure function of the window it is told about. `under`, on a
  // phone, is the top of the space under the card, where the block goes
  // instead of beside it. The name's size comes in resolved (titleVwNow in
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
  }) => {
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

      const rowPx = isTitle ? titlePx : metaPx;
      g.blur = isTitle ? titlePx * params.titleBlur : params.nameBlur;
      // Roomy, because this box is what the filter region is measured off and
      // the blur needs somewhere to go.
      const h = rowPx * 3;
      g.box.style.height = `${h}px`;

      if (isTitle) {
        // The name: full width, centred on the card, its foot a gap above the
        // card's top edge, and behind the canvas so the ring passes in front.
        // Placed by its top rather than the class's centring transform, so
        // the open can borrow the transform to carry the word to the page.
        g.box.style.width = "100vw";
        g.box.style.left = "0";
        g.box.style.right = "auto";
        g.box.style.top = `${cardTop - gapPx - titlePx * 0.5 - h * 0.5}px`;
        g.box.style.bottom = "";
        // Both: the class centres with Tailwind's `translate` property, which
        // `transform: none` does not touch.
        g.box.style.transform = "none";
        g.box.style.translate = "none";
        g.box.style.zIndex = "-1";
      } else {
        // Discipline and year, under the counter: right of the card, or on a
        // phone under it.
        g.box.style.width = `${Math.max(160, blockW)}px`;
        g.box.style.left = `${blockX}px`;
        g.box.style.right = "auto";
        g.box.style.top = `${midY + metaPx * 0.75}px`;
        g.box.style.bottom = "";
        g.box.style.transform = "";
        g.box.style.translate = "";
        g.box.style.zIndex = "";
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
        // On the row, not the words: the morph owns the words' opacity.
        row.style.opacity = isTitle ? `${params.titleDim}` : "";
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

    setThreshold();
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

  return { show, style, setThreshold, settle, lean, dispose };
}
