import { MAX_PLANES } from "../shaders/planeShaders";
import { EASES, WEIGHTS } from "./params";
import { TAU } from "./utils";

/**
 * The lil-gui panel. Development only, and imported dynamically so it never
 * reaches a production bundle.
 *
 * `actions` are the things a control has to call when it changes something the
 * loop does not re-read on its own: `refit` for anything the window bands
 * depend on, `styleMeta` for anything the DOM labels are sized from,
 * `replay` for anything baked into the entry timeline when it is built.
 */
export function mountGui(GUI, { params, state, info, actions }) {
  const { replay, refit, styleMeta, setThreshold, rebuildText, rebuildTag } =
    actions;

  const gui = new GUI({ title: "ring" });

  gui.add(state, "progress", 0, 1, 0.001).listen();
  gui.add(state, "launch", 0, 1, 0.001).listen();
  gui.add(state, "spread", 0, 1, 0.001).listen();
  gui.add(state, "spin", -TAU * 10, TAU * 10, 0.001).listen();
  gui.add(state, "shift", 0, 1, 0.001).listen();
  gui.add({ replay }, "replay");

  // -- fit -----------------------------------------------------------------
  // Every px param in the folders below is quoted at the reference window.
  // Tuning at some other size and leaving it alone is what makes the ring look
  // right here and wrong everywhere else, so the live size sits next to it.
  const fit = gui.addFolder("fit");
  const onFit = (k, lo, hi, step, label) =>
    fit.add(params, k, lo, hi, step).name(label).onChange(refit);

  fit.add(info, "window").listen().disable().name("this window");
  fit.add(info, "scale").listen().disable().name("scale");
  onFit("refWidth", 320, 3840, 1, "ref width");
  onFit("refHeight", 320, 2400, 1, "ref height");
  fit
    .add(
      {
        adopt: () => {
          actions.adoptWindow();
          gui.controllersRecursive().forEach((c) => c.updateDisplay());
        },
      },
      "adopt",
    )
    .name("use this window as ref");
  onFit("fitHeight", 0, 1, 0.01, "height's say");
  onFit("minScale", 0.1, 2, 0.01, "min");
  onFit("maxScale", 0.5, 4, 0.01, "max");

  fit.add(info, "band").listen().disable().name("band");
  onFit("narrowAt", 320, 1600, 10, "narrow at (px)");
  onFit("narrowPlane", 0.5, 3, 0.01, "narrow plane x");
  onFit("narrowRadius", 0.5, 3, 0.01, "narrow radius x");
  fit
    .add(params, "narrowText", 0.5, 3, 0.01)
    .name("narrow text x")
    .onChange(() => {
      refit();
      styleMeta();
    });
  fit.add(params, "narrowPosX", -4, 4, 0.005).name("narrow move x");
  fit.add(params, "narrowEndScale", 0.05, 8, 0.01).name("narrow end scale");
  onFit("tightAt", 240, 1200, 10, "tight at (px)");
  onFit("tightRadius", 0.3, 2, 0.01, "tight radius x");
  fit.add(params, "tightPosX", -6, 6, 0.005).name("tight move x");
  onFit("tightSplit", 0.2, 2, 0.01, "tight heading x");
  const onMetaFit = (k, lo, hi, step, label) =>
    fit.add(params, k, lo, hi, step).name(label).onChange(styleMeta);
  onMetaFit("tightName", 0.3, 3, 0.01, "tight name x");
  onMetaFit("tightNameBottom", 0, 200, 1, "tight name bottom");
  onMetaFit("tightNameRight", 0, 200, 1, "tight name right");
  onMetaFit("tightMetaWidth", 10, 100, 1, "tight box (vw)");

  // -- shape ---------------------------------------------------------------
  const shape = gui.addFolder("shape");
  shape.add(params, "planeSize", 10, 900, 1).name("plane size");
  shape.add(params, "count", 2, MAX_PLANES, 1);
  shape.add(params, "ringRadius", 20, 2400, 1).name("ring radius");
  shape.add(params, "seed", -180, 180, 1).name("seed angle");
  shape.add(params, "radial");
  shape.add(params, "radius", 0, 300, 0.5).name("corner");
  shape.add(params, "textured");
  shape.add(params, "blend", 0, 120, 0.5).name("art crossfade");
  shape.add(params, "imageOffset", 0, 32, 1).name("image offset");
  shape.add(info, "restingGap").listen().disable().name("resting gap");

  // -- loader --------------------------------------------------------------
  const loader = gui.addFolder("loader");
  loader.add(params, "loaderChase", 0.02, 1, 0.01).name("count speed");
  loader.add(params, "holdAfter", 0, 3, 0.05).name("beat after 100 (s)");
  loader
    .add(params, "loaderBottom", 0, 20, 0.1)
    .name("from bottom (vh)")
    .onChange(styleMeta);
  loader.add(params, "loaderOut", 0.05, 3, 0.05).name("fade out (s)");

  // -- entry ---------------------------------------------------------------
  const timing = gui.addFolder("timing");
  timing.add(params, "stagger", 0, 1, 0.005);
  timing.add(params, "launchTime", 0.05, 12, 0.05).onChange(replay);
  timing.add(params, "spreadTime", 0.1, 30, 0.1).onChange(replay);
  timing.add(params, "spreadEase", EASES).onChange(replay);

  const stage = gui.addFolder("stage");
  const onStage = (k, lo, hi, step, label) =>
    stage.add(params, k, lo, hi, step).name(label).onChange(replay);
  onStage("stageAt", 0, 1, 0.01, "start (0=early, 1=formed)");
  onStage("spinTurns", -12, 12, 0.01, "spinTurns");
  onStage("spinTime", 0.05, 30, 0.05, "spinTime");
  onStage("spinDelay", 0, 15, 0.05, "spinDelay");
  stage.add(params, "spinEase", EASES).onChange(replay);
  stage.add(params, "posX", -4, 4, 0.005).name("move x");
  stage.add(params, "posY", -4, 4, 0.005).name("move y");
  stage.add(params, "endScale", 0.05, 8, 0.01).name("end scale");
  onStage("moveTime", 0.05, 30, 0.05, "moveTime");
  onStage("moveDelay", 0, 15, 0.05, "moveDelay");
  stage.add(params, "moveEase", EASES).onChange(replay);

  // -- the intro heading ----------------------------------------------------
  const text = gui.addFolder("text");
  text.add(params, "text").onFinishChange(rebuildText);
  text.add(params, "textSize", 8, 200, 1).onChange(rebuildText);
  text
    // Only families with an @font-face block in globals.css — anything else
    // silently falls back to system sans and looks like a bug.
    .add(params, "textFont", ["PP Neue Montreal", "Satoshi", "Geist"])
    .name("family")
    .onChange(rebuildText);
  text.add(params, "textWeight", { Light: 300, Regular: 400 }).onChange(rebuildText); // prettier-ignore
  text
    .add(params, "textTracking", -0.1, 0.4, 0.005)
    .name("tracking (em)")
    .onChange(rebuildText);
  text
    .add(params, "textAt", 0, 1, 0.01)
    .name("start (frac of spread)")
    .onChange(replay);
  text.add(params, "textTime", 0.05, 6, 0.05).onChange(replay);
  text.add(params, "textStagger", 0, 0.4, 0.005).onChange(replay);
  text.add(params, "textEase", EASES).onChange(replay);
  text.add(params, "textOut").name("leaves").onChange(replay);
  text.add(params, "textOutAt", -6, 6, 0.05).name("leaves at (s)").onChange(replay); // prettier-ignore
  text.add(params, "textOutTime", 0.05, 6, 0.05).onChange(replay);
  text.add(params, "textOutEase", EASES).onChange(replay);

  // -- the meta either side of the ring -------------------------------------
  const meta = gui.addFolder("meta");
  const onMeta = (k, lo, hi, step, label) =>
    meta.add(params, k, lo, hi, step).name(label).onChange(styleMeta);
  onMeta("metaLeft", 0, 30, 0.1, "left (vw)");
  onMeta("metaRight", 0, 30, 0.1, "right (vw)");
  onMeta("metaGapL", 0, 20, 0.1, "gap left (vw)");
  onMeta("metaGapR", 0, 20, 0.1, "gap right (vw)");
  onMeta("metaWidth", 5, 60, 0.5, "box (vw)");
  onMeta("nameSize", 0.5, 10, 0.01, "name size (vw)");
  onMeta("idxSize", 0.4, 8, 0.01, "number size (vw)");
  onMeta("listSize", 0.3, 4, 0.01, "column size (vw)");
  meta.add(params, "nameWeight", WEIGHTS).name("name weight").onChange(styleMeta); // prettier-ignore
  meta.add(params, "idxWeight", WEIGHTS).name("number weight").onChange(styleMeta); // prettier-ignore
  meta.add(params, "nameMorphTime", 0.1, 4, 0.05).name("morph time");
  meta.add(params, "nameEase", EASES).name("ease");
  // The Apple-touch fallback morph; only visible on those devices.
  meta.add(params, "nameSimpleTime", 0.1, 4, 0.05).name("simple morph time");
  meta.add(params, "nameSimpleEase", EASES).name("simple ease");
  meta.add(params, "nameSimpleScale", 0, 1, 0.01).name("simple scale");
  meta.add(params, "nameBlur", 0, 40, 0.5).name("smear");
  meta.add(params, "nameEdge", 8, 800, 1).name("threshold gain").onChange(setThreshold); // prettier-ignore
  meta.add(params, "nameCut", 0.05, 0.95, 0.01).name("threshold cut").onChange(setThreshold); // prettier-ignore
  meta.add(params, "nameSoften", 0, 3, 0.05).name("soften");
  // Re-announces whatever is already at the front, so the morph can be watched
  // without spinning to a new card each time.
  meta.add({ again: actions.replayMeta }, "again").name("play again");

  // -- glass ---------------------------------------------------------------
  const glass = gui.addFolder("glass");
  glass.add(params, "glass").name("enabled");
  glass.add(params, "bandTop", 0, 0.5, 0.005).name("top band");
  glass.add(params, "bandBottom", 0, 0.5, 0.005).name("bottom band");
  glass.add(params, "refract", -400, 400, 1);
  glass.add(params, "squeeze", -1, 1, 0.005);
  glass.add(params, "ripple", -120, 120, 0.5);
  glass.add(params, "rippleFreq", 0, 0.2, 0.0005);
  glass.add(params, "fringe", 0, 40, 0.1);
  glass.add(params, "sheen", -0.5, 0.5, 0.005);

  // -- input ---------------------------------------------------------------
  const scroll = gui.addFolder("scroll");
  scroll.add(params, "scrollSpeed", 0, 0.05, 0.0001);
  scroll.add(params, "damping", 0.5, 0.999, 0.001);
  scroll.add(params, "maxSpeed", 0.5, 60, 0.5);
  scroll.add(params, "dragSpeed", 0, 5, 0.01);
  scroll.add(params, "snap");
  scroll.add(params, "snapTime", 0.2, 3, 0.05).name("snap time (s)");
  scroll.add(params, "snapFrom", 0.1, 20, 0.1).name("settle below");
  scroll.add(params, "pickTime", 0.1, 2, 0.05).name("pick, per slot (s)");
  scroll.add(params, "pickEase", EASES).name("pick ease");

  const pointer = gui.addFolder("pointer");
  pointer.add(params, "hover").name("enabled");
  pointer.add(params, "touchHold", 0, 1, 0.01).name("touch hold (s)");
  pointer.add(params, "touchSlop", 0, 60, 1).name("touch hold slop");
  pointer.add(params, "lag", 0.02, 1, 0.01).name("cursor chase");
  pointer.add(params, "melt", 0, 200, 0.5);
  pointer.add(params, "meltReach", 0, 900, 5).name("melt reach");
  pointer.add(params, "reach", 0.2, 8, 0.05).name("hover reach");
  pointer.add(params, "swell", 0, 1, 0.005);
  pointer.add(params, "pull", 0, 300, 1).name("lean");
  pointer.add(params, "grab", 0.01, 1, 0.005);
  pointer.add(params, "release", 0.01, 1, 0.005);
  pointer.add(params, "web", 0, 1, 0.005).name("thread");
  pointer.add(params, "webReach", 0.1, 4, 0.05).name("thread reach");
  pointer.add(params, "wave", 0, 60, 0.1).name("wake");
  pointer.add(params, "waveFreq", 0, 0.5, 0.001).name("wake freq");
  pointer.add(params, "waveSpeed", 0, 40, 0.1).name("wake speed");

  // Apart from the pointer folder above: those answer to the cursor and are
  // always live, these answer to the card under it and only while there is one.
  const sides = gui.addFolder("side cards");
  sides.add(params, "sideScale", 0, 0.9, 0.005).name("scale down");
  sides.add(params, "sidePush", 0, 240, 1).name("push away");
  sides.add(params, "sideDim", 0, 1, 0.01).name("dim");
  sides.add(params, "sideReach", 0.2, 12, 0.05).name("reach (how many)");

  const tag = gui.addFolder("tag");
  tag.add(params, "tagFrom", 0, 2000, 10).name("hide at or below (px)");
  tag.add(params, "tagText").name("label").onFinishChange(rebuildTag);
  tag.add(params, "tagSize", 6, 40, 1).name("size").onChange(rebuildTag);
  tag.add(params, "tagArrow", 0, 40, 1).name("arrow").onChange(rebuildTag);
  tag.add(params, "tagGap", 0, 30, 1).name("gap").onChange(rebuildTag);
  tag.add(params, "tagX", -400, 400, 1).name("offset x");
  tag.add(params, "tagY", -400, 400, 1).name("offset y (+up)");
  tag.add(params, "tagFrost", 0, 1, 0.01).name("frost");
  tag.add(params, "tagRim", 0, 1, 0.01).name("rim");
  tag.add(params, "tagRefract", 0, 60, 0.5).name("refract");

  // -- material ------------------------------------------------------------
  const honey = gui.addFolder("honey");
  honey.add(params, "thread", 0, 6, 0.01);
  honey.add(params, "thin", 0.05, 12, 0.01);
  honey.add(params, "pinch", 0.01, 2, 0.01); // above 1 barrels instead of necks
  honey.add(params, "sag", -300, 300, 0.5); // negative arches it upward
  honey.add(params, "dissolve", 0, 100, 0.1);
  honey.add(params, "fillet", 0, 250, 0.5);

  const birth = gui.addFolder("birth");
  birth.add(params, "wobble", 0, 120, 0.1);
  birth.add(params, "goo", 0, 250, 0.5);

  return gui;
}
