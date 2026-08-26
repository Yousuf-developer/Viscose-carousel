import gsap from "gsap";
import { PROJECTS } from "./projects";

/**
 * The two lockups of type either side of the ring: [number . name] on the
 * left, [type . year] on the right. Both read whatever card is facing front.
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

// Same scale direction as the goo morph, minus the blur and SVG threshold
// that can push Safari on Apple touch devices into software rendering while
// the WebGL ring is running. Compositor-friendly, so it cannot stall rAF.
function safeMorph(el, opacity, scale) {
  if (!el) return;
  el.style.filter = "none";
  el.style.opacity = `${opacity}`;
  el.style.transform = `scale(${scale})`;
}

function createGroup(side, groups, params, simpleMorph, reduceMotion) {
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
        if (simpleMorph) {
          safeMorph(out?.[j], 1 - t, 1 + params.nameSimpleScale * t);
          safeMorph(into?.[j], t, 1 - params.nameSimpleScale * (1 - t));
        } else {
          fade(out?.[j], 1 - t, params.nameBlur);
          fade(into?.[j], t, params.nameBlur);
        }
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
        simpleMorph || t >= 1
          ? "none"
          : `url(#name-goo) blur(${params.nameSoften}px)`;
    }
  };

  // parts[0] is the leading slot, parts[1] the trailing one. Which of those is
  // the big half depends on the side and is decided in style() below.
  const set = (parts) => {
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
    if (reduceMotion) {
      // No animation at all: land the incoming word straight away.
      m.t = 1;
      draw();
      return;
    }
    gsap.to(m, {
      t: 1,
      duration: simpleMorph ? params.nameSimpleTime : params.nameMorphTime,
      ease: simpleMorph ? params.nameSimpleEase : params.nameEase,
      onUpdate: draw,
    });
  };

  // On the fallback path, hand the slots to the compositor explicitly and
  // drop the goo layer's own hint — it is never filtered there.
  if (simpleMorph) {
    const g = groups[side];
    if (g?.goo) g.goo.style.willChange = "auto";
    for (const layer of g?.layers ?? []) {
      for (const slot of slotsOf(layer) ?? []) {
        slot.style.transformOrigin = "center";
        slot.style.willChange = reduceMotion ? "auto" : "opacity, transform";
      }
    }
  }

  return { m, set };
}

/**
 * refs: { groups, list, loader, cut, live } — DOM handed over from the
 * component. `groups` is the shape the JSX populates, one entry per side.
 */
export function createMeta(
  refs,
  params,
  { simpleMorph = false, reduceMotion = false } = {},
) {
  const { groups, list, loader, cut, live } = refs;
  const left = createGroup("left", groups, params, simpleMorph, reduceMotion);
  const right = createGroup("right", groups, params, simpleMorph, reduceMotion);

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

  // layout: { textK, tight, viewW } — the band state, passed in rather than
  // read, so this stays a pure function of the window it is told about.
  const style = ({ textK, tight, viewW }) => {
    // Everything downstream is derived from this one figure: the box height,
    // so the filter region, so where the corner offset has to drop the box to.
    const bigVw = params.nameSize * textK * (tight ? params.tightName : 1);
    const big = `${bigVw}vw`;
    const small = `${params.idxSize * textK}vw`;
    const bigFace = `"${params.nameFont}", ui-sans-serif, system-ui, sans-serif`;
    const smallFace = `"${params.idxFont}", ui-sans-serif, system-ui, sans-serif`;
    const bigWeight = `${params.nameWeight}`;
    const smallWeight = `${params.idxWeight}`;
    // Roomy, because this box is what the filter region is measured off and
    // the blur needs somewhere to go.
    const h = bigVw * 3;

    for (const side of SIDES) {
      const g = groups[side];
      if (!g?.box) continue;
      const isRight = side === "right";

      // In the tight band the ring is most of the screen and there is nowhere
      // for two lockups to sit, so three of the four labels go and the name
      // alone moves to the bottom-right corner.
      const corner = tight && !isRight;
      if (tight && isRight) {
        g.box.style.display = "none";
        continue;
      }
      g.box.style.display = "";

      g.box.style.width = `${corner ? params.tightMetaWidth : params.metaWidth}vw`; // prettier-ignore
      g.box.style.height = `${h}vw`;

      if (corner) {
        // The box is three times the type's height, so placing it at the
        // offset asked for would sit the words half a box too high. Drop it by
        // the difference and the type lands where the number says.
        const boxPx = (h * viewW) / 100;
        const emPx = (bigVw * viewW) / 100;
        g.box.style.top = "auto";
        g.box.style.left = "auto";
        g.box.style.right = `${params.tightNameRight}px`;
        g.box.style.bottom = `${params.tightNameBottom + emPx * 0.5 - boxPx * 0.5}px`;
        g.box.style.transform = "none";
      } else {
        // Cleared rather than set, so the class on the element takes it back.
        g.box.style.top = "";
        g.box.style.bottom = "";
        g.box.style.transform = "";
        // Anchored to its own edge, so the fixed-width half of each pair — the
        // number, the year — is the one against the margin. That is also what
        // stops a morph shifting anything: rows are sized by their own words
        // but justified to the same edge, so the words line up across rows.
        g.box.style.left = isRight ? "auto" : `${params.metaLeft}vw`;
        g.box.style.right = isRight ? `${params.metaRight}vw` : "auto";
      }

      // All three rows, the steady one included. They have to agree exactly or
      // a word would jump as it moved between them.
      for (const layer of [...g.layers, g.plain]) {
        if (!layer) continue;
        layer.style.justifyContent =
          corner || isRight ? "flex-end" : "flex-start";
        const row = layer.firstElementChild;
        row.style.gap = `${isRight ? params.metaGapR : params.metaGapL}vw`;
        const [lead, trail] = row.children;
        // The number is what goes in the corner layout. Its morph carries on
        // underneath, so nothing needs resyncing on the way back out.
        lead.style.display = corner ? "none" : "";
        lead.style.fontFamily = isRight ? bigFace : smallFace;
        lead.style.fontSize = isRight ? big : small;
        lead.style.fontWeight = isRight ? bigWeight : smallWeight;
        trail.style.fontFamily = isRight ? smallFace : bigFace;
        trail.style.fontSize = isRight ? small : big;
        trail.style.fontWeight = isRight ? smallWeight : bigWeight;
      }
    }

    // The column and the counter are set from here too, so all the type moves
    // as one piece across a breakpoint instead of half of it growing.
    if (list) list.style.fontSize = `${params.listSize * textK}vw`;
    if (loader) {
      loader.style.bottom = `${params.loaderBottom}vh`;
      loader.style.fontFamily = smallFace;
      loader.style.fontSize = small;
      loader.style.fontWeight = smallWeight;
    }

    setThreshold();
  };

  // Both groups in one call, so the number can never drift from the name it
  // is numbering.
  const show = (i) => {
    const p = PROJECTS[i];
    if (!p) return;
    left.set([String(i + 1).padStart(2, "0"), p.name]);
    right.set([p.type, p.year]);
    // The groups are hidden from the accessibility tree, so the card is
    // announced once, in full, from the live region instead of four times.
    if (live) live.textContent = `${p.name}. ${p.type}, ${p.year}.`;
  };

  const dispose = () => {
    gsap.killTweensOf(left.m);
    gsap.killTweensOf(right.m);
  };

  return { show, style, setThreshold, dispose };
}
