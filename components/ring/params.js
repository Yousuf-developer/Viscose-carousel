import { PROJECTS } from "./projects";

export const EASES = [
  "power2.out",
  "power3.out",
  "power4.out",
  "expo.out",
  "circ.out",
  "back.out(1.1)",
  "power1.inOut",
  "power2.inOut",
  "power3.inOut",
  "expo.inOut",
  "none",
];

export const WEIGHTS = { Light: 300, Regular: 400, Medium: 500, Semibold: 600 };

// The two rooms. Applied over the defaults by `theme`; each value is still a
// param of its own afterwards, so a room can be tuned from either start.
export const THEMES = {
  dark: {
    paper: "#0e0e0d",
    ink: "#efece6",
    toneLift: 0,
    toneGain: 1,
    glow: 0.14,
    glowLight: 50,
    grain: 0.1,
    grainBlend: "soft-light",
    vignette: 0.6,
  },
  light: {
    paper: "#f2efe9",
    ink: "#16140f",
    toneLift: 0.035,
    toneGain: 1.07,
    glow: 0.16,
    glowLight: 30,
    grain: 0.08,
    grainBlend: "multiply",
    vignette: 0,
  },
};

/**
 * Every tunable in one place. A fresh object per mount so the dev panel cannot
 * leak edits from one mount into the next.
 *
 * Two conventions worth knowing before reading further:
 *
 *  - Every px figure is quoted at `refWidth` and scaled from there. Change the
 *    machine you tune on and `refWidth` wants changing with it (the fit folder
 *    has a button that reads it off the live window).
 *  - Below `narrowAt` and again below `tightAt` the ring is re-proportioned
 *    rather than just scaled down. Those bands multiply the fit, they do not
 *    replace it, and they stack.
 */
export function defaultParams() {
  return {
    // -- fit ------------------------------------------------------------
    // 14" MacBook Pro at default scaling: 3024x1964 native, 1512x982 points.
    refWidth: 1512,
    refHeight: 870, // viewport, i.e. screen less menu bar and browser chrome
    fitHeight: 0, // 0 = width alone drives scale, 1 = whichever axis is tighter
    minScale: 0.5, // a phone is not a small desktop; bracket the extremes
    maxScale: 1.75,

    narrowAt: 1024, // inclusive
    narrowPlane: 1.25,
    narrowRadius: 1.3, // cards grow faster than the arc, or the gaps close up
    narrowText: 1.5, // type cannot shrink like a picture can and stay readable
    narrowPosX: -2.5,
    narrowEndScale: 4.22,

    tightAt: 640, // inclusive
    // A phone is composed in fractions of its own window, not scaled from the
    // reference one: the ring forms at its usual size, then settles with the
    // front card a share of the width on the centre line and the ring big
    // enough that its neighbours sit half in the lip.
    tightRadius: 0.82, // multiplies narrowRadius, for the ring as it forms
    tightCard: 0.8, // the front card's width at rest, of the window's
    tightSpacing: 0.54, // its neighbours' distance from it, of the window's height
    tightSplit: 0.8, // the heading, competing with the ring for centre screen

    // -- geometry, all at the reference window ---------------------------
    planeSize: 90, // long edge in px; aspect locked at 1.5 : 1
    count: PROJECTS.length, // one plane per project, so the deal comes out even
    ringRadius: 340,
    seed: 0, // where plane 0 sits, degrees (0 = 3 o'clock)
    radial: true, // long edge points outward; off = long edge along the ring
    radius: 6, // corner
    textured: true, // off = flat silhouette, useful for reading the goo
    blend: 14, // px over which neighbouring art crossfades in the goo
    imageOffset: 0, // rotates the whole deal; 0 lands the entry on PROJECTS[0]

    // -- loading ---------------------------------------------------------
    // The counter is the gate: the entry launches on the frame it reads 100.
    // holdAfter is a beat held after that and wants to stay near zero.
    holdAfter: 0,
    loaderChase: 0.18,
    loaderBottom: 1, // vh
    loaderOut: 0.45, // seconds to fade once the hold lets go

    // -- entry timing ----------------------------------------------------
    stagger: 0.34,
    launchTime: 1.95,
    spreadEase: "power2.out",
    spreadTime: 3.6,
    // Where the ring goes once formed. stageAt is a fraction of the spread, so
    // 0.5 starts the move midway through the ring drawing.
    stageAt: 0.7,
    spinTurns: 1,
    spinTime: 2.6,
    spinEase: "power2.inOut",
    spinDelay: 0,
    posX: -2, // fraction of half the viewport width
    posY: 0,
    endScale: 4.46,
    moveTime: 2.2,
    moveEase: "power2.inOut",
    moveDelay: 0.2,

    // -- scroll / drag / click, live once the entry finishes --------------
    scrollSpeed: 0.0022, // rad/s of angular velocity per px of wheel delta
    damping: 0.94, // velocity kept per 60fps frame
    maxSpeed: 12, // rad/s, so one flick cannot run away
    dragSpeed: 1,
    snap: true, // settle with a plane facing front
    snapTime: 0.8, // run-in, once the flick itself is spent
    snapFrom: 1, // rad/s under which the ring commits to a slot
    pickTime: 0.55, // click-to-centre: seconds for one slot, root-scaled
    pickEase: "power3.inOut",

    // -- the room ---------------------------------------------------------
    // Two rooms, one switch. Dark: bone ink on near-black, the front card's
    // colour glowing behind it, grain in soft light, a vignette — the tonal
    // art sits in it like film. Light: ink on warm paper, the glow turned
    // into a soft shadow under the card, the art lifted a touch so it reads
    // as prints, grain multiplied in, no vignette. `theme` applies a preset;
    // everything under it is still a param of its own.
    theme: "dark",
    paper: "#0e0e0d",
    ink: "#efece6",
    // The art's tone in this room: blacks lifted by, then gained by. Both
    // 0/1 leave the pictures as graded.
    toneLift: 0,
    toneGain: 1,

    // -- the intro heading, in the scene ---------------------------------
    text: "Works '26",
    textSize: 41,
    textFont: "PP Neue Montreal",
    // Stands in wherever the heading face is absent — PP Neue Montreal is a
    // commercial face and a fresh clone may not have it. Free, and bundled.
    textFallback: "Satoshi",
    textWeight: 400,
    textTracking: 0, // em
    textAt: 0.42, // fraction of the spread
    textTime: 0.95,
    textStagger: 0.015,
    textEase: "power4.out",
    textOut: true,
    textOutAt: -0.5, // seconds relative to the ring landing; negative = early
    textOutTime: 0.7,
    textOutEase: "power2.in",

    // -- the type around the ring ---------------------------------------
    // A site frame — name, a line and a nav along the top, a hint and a note
    // along the bottom — and the project block right of the front card: a
    // counter, the title in the heading's face, then discipline and year.
    // The ring has the left of the screen; the type keeps to the right.
    // Insets in vw so everything holds its relationship as the window changes.
    metaLeft: 5.5, // vw, the page's left margin
    metaRight: 5.5, // and its right
    // The project's name, set large over the card and behind the ring, so
    // the cards pass in front of it as the ring turns. The one big gesture.
    titleSize: 13, // vw
    narrowTitle: 1, // x below narrowAt
    tightTitle: 1.4, // x below tightAt: as large as the longest name allows
    titleGap: 2, // vh between the name's foot and the card's top edge
    titleBlur: 0.15, // em the name smears to in its morph; the small rows use nameBlur
    titleDim: 1, // 1 is ink; lower sets the name back into the room
    // The name leans with the ring's speed, the way the honey does.
    titleLean: 0.6, // degrees of skew per rad/s
    titleLeanMax: 7, // and no further
    metaSize: 1.15, // vw, the discipline beside the year
    metaMin: 14, // px, its floor, which a phone reaches
    smallMin: 13, // px, the floor under the year, the counters and the index
    metaGapR: 1.2, // vw between them
    blockGap: 5, // vw from the card's right edge to the block
    listReach: 2.2, // slots over which the index brightens toward the front
    // The room is lit by the work: the front card's own colour, lifted to a
    // light, pooled behind it. Grain and a vignette over everything.
    glow: 0.14, // strength, 0 is off
    glowSpread: 64, // vw, the falloff's horizontal radius; it is Gaussian, so most of it is quiet
    glowLight: 50, // the glow's lightness, %: above the paper it lights, below it shades
    grain: 0.1, // opacity, 0 is off
    grainBlend: "soft-light", // or "multiply", which reads on light paper
    vignette: 0.6, // strength, 0 is off; under the work, so it never darkens a card or a word
    nameSize: (24 / 1440) * 100, // vw, quoted at 1440; the project page's footer
    nameFont: "Satoshi",
    nameWeight: 500,
    idxSize: (16 / 1440) * 100, // a step lighter and smaller than the name
    idxFont: "Geist",
    idxWeight: 400,
    listSize: 1.0, // vw; the column's line height is unitless so rows follow
    listDim: 0.28, // opacity of the names not at the front

    // The morph between one card's words and the next.
    nameMorphTime: 1.2,
    nameEase: "circ.out",
    nameBlur: 8.5, // px the outgoing word smears to before it lets go
    nameEdge: 400, // alpha gain — how abruptly the threshold sets
    nameCut: 0.33, // and the alpha it sets at
    nameSoften: 0.35, // px of blur after it, standing in for antialiasing

    // -- glass lip along the top and bottom ------------------------------
    glass: true,
    bandTop: 0.08, // fraction of viewport height
    bandBottom: 0.08,
    refract: 60, // px the image is pulled in at the very edge
    squeeze: 0.05,
    ripple: 5, // px of wave along the lip
    rippleFreq: 0.02,
    fringe: 1.5, // px of chromatic split
    sheen: 0.05,

    // -- pointer ---------------------------------------------------------
    // Apart from the bead below, nothing is drawn at the cursor. It softens
    // the field around itself, leans the nearest planes toward it and strings
    // honey back between them.
    hover: true,
    touchHold: 0.16, // seconds of near-still press before a finger counts
    touchSlop: 10, // px of travel inside that window that calls it a swipe
    lag: 0.3, // cursor smoothing, per 60fps frame
    melt: 34, // px added to the ring's own blend at the cursor
    meltReach: 260, // px the softening and the wake carry
    reach: 1.7, // lean and swell falloff, in plane long edges
    swell: 0.09,
    pull: 26, // px a plane leans toward the cursor
    grab: 0.14, // how fast a plane takes up a lean, per 60fps frame
    release: 0.06, // and how slowly it lets go — asymmetric on purpose
    web: 0.2, // hovered thread width, as a fraction of the facing edge
    webReach: 1.15,
    wave: 4, // px of capillary wake at full pointer speed
    waveFreq: 0.05,
    waveSpeed: 7,

    // How the cards either side of the hovered one get out of its way. The
    // pointer block above answers to the cursor; these answer to the card.
    sideScale: 0.035,
    sidePush: 17, // px
    sideDim: 0.15,
    sideReach: 2.4, // in plane long edges, measured from the hovered card

    // -- the bead at the cursor ----------------------------------------------
    // With a mouse, the cursor on the ring is a drop of the ink drawn in the
    // field: it reaches for a card it nears and melts into its edge, opens
    // over it into a pill with the word for a click (tagText) cut out of it,
    // and pulls a thread of honey out of the card when it leaves. An open
    // page keeps the native cursor; the word is set by ring/bead.js.
    beadSize: 14, // px across at rest
    beadPillH: 15, // px, half the pill's height over a card
    beadPillPad: 15, // px of honey either side of the word
    beadKnock: 0.55, // how bright the picture shows through the word
    beadTail: 0.38, // the tail's radius, as a fraction of the head's
    beadLag: 0.3, // how fast the tail catches up, per 60fps frame
    beadStretch: 2.6, // longest the drop gets, in head radii
    beadMelt: 20, // px of blend between it and a card
    beadReach: 64, // px from a card's edge at which the drop starts reaching for it
    beadInk: 2.5, // px over which its ink meets a card's colour
    beadSnap: 240, // px a thread stretches before it lets go
    beadHold: 1.3, // s a thread lasts if it is not pulled
    tagText: "View",
    wordSize: 13, // px

    // -- opening a project -------------------------------------------------
    // The front card swells into the hero of a page while the rest of the
    // ring backs away from it and the threads between them stretch and let
    // go; the name keeps the size it had over the ring and moves to the top.
    // Closing is the same move backwards. The page under the hero is DOM: a
    // strip of facts and the statement, the project's pictures and clips,
    // and the next project. Each piece reveals itself as it is scrolled to;
    // the pictures stay on their boxes, so nothing runs into its caption.
    openTime: 1.25,
    closeTime: 0.95,
    openEase: "expo.inOut", // the swell: slow to start, quick to finish
    openPush: 320, // px the rest of the ring backs off, at the reference window; never short of leaving it
    openShrink: 0.6, // and how much of their size they give up doing it
    openWeb: 0.3, // thread width strung to the swelling card, fraction of the facing edge
    tightOpenWeb: 0.1, // and on a phone, where the card is most of the width
    openMelt: 50, // px added to the goo while those threads are in play
    openWobble: 2.5, // px of surface ripple over the same window
    openTop: 2.4, // vh, the Close label's top edge; the name sits under the lip, never above this
    openIdxGap: 0.6, // vh between a micro label and the name under it
    openGap: 2.4, // vh between the name and the hero
    openHeroAspect: 1.85, // the hero's width over its height; the card's 1.5 is the floor
    tightHeroAspect: 1.5, // and on a phone, which is tall
    openStrip: 6, // vh between the hero and the strip of facts
    openImages: 14, // vh between the statement and the pictures
    openLead: 2.0, // vw, the statement
    revealAt: 0.88, // of the window's height: a piece reveals once its top is above this line
    closeText: "Close", // the Close button's name, for screen readers

    // -- footage -------------------------------------------------------------
    // Each card's own clip plays on it once the ring has come to rest with it
    // in front, and carries on through the open. It starts on the frame the
    // card already shows, so it fades in over a picture that does not move.
    // Off under prefers-reduced-motion and Save-Data, and simply absent
    // wherever autoplay is refused.
    live: true,
    liveDelay: 0.6, // s the ring has to rest before the front card plays
    liveFade: 0.5, // s for the footage to come up over the still; it goes in about half that

    // -- honey between neighbouring planes --------------------------------
    thread: 1.0,
    thin: 0.4,
    pinch: 0.35,
    sag: 6,
    dissolve: 2.9,
    fillet: 14,

    // -- birth of the seed -------------------------------------------------
    wobble: 3,
    goo: 35,
  };
}
