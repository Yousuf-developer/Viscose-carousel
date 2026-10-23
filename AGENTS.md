# AGENTS.md

Working notes for this repo. Read this before changing anything under
`components/` — most of the code is one WebGL machine and a lot of it is
non-obvious in ways that look like bugs.

## What this is

A single-page portfolio carousel. Eighteen project cards sit on a ring that is
mostly off-screen to the left; you see an arc of it. Scroll, drag or swipe
turns the ring, and it snaps so a card faces front. The cards are not DOM
elements or textured quads — the whole ring is **one full-screen fragment
shader** drawing signed distance fields, which is what lets neighbouring cards
melt into each other ("goo") and string honey-like threads as they separate.

Everything visible is either that one shader pass or a handful of absolutely
positioned DOM labels over the top of it.

## Commands

```bash
npm run dev      # localhost:3000
npm run build    # also the fastest correctness check
npm run lint     # eslint
npx prettier --check "components/**/*.{js,jsx}" "app/**/*.{js,jsx}"
```

There are **no tests**. `npm run build` plus `npm run lint` is the whole safety
net. GLSL is compiled at runtime, not at build time, so a shader typo builds
fine and fails in the browser console — check shader edits by loading the page.

## Layout

```
app/
  page.js              renders <Carousel />, nothing else
  layout.js            root layout + metadata
  globals.css          Tailwind v4 import, @font-face, page background

components/
  Carousel.jsx        the component. renderer, resize/fit, input, spin
                       physics, the per-frame layout loop, the entry timeline
  ring/
    projects.js        the eighteen projects, in ring order
    params.js          every tunable, as a factory
    utils.js           TAU/DEG, easings, signedOffset, chase
    atlas.js           packs all art into one texture, incrementally
    meta.js            the two type lockups and their morph
    splitText.js       the intro heading ("Works '26")
    bead.js            the words the cursor's bead leaves (the bead is GLSL)
    gui.js             lil-gui dev panel, dynamically imported
  shaders/
    planeShaders.js    the ring and page: SDFs, goo, glass lip, art, type
    textShaders.js     the per-glyph reveal for the intro heading
```

`Carousel.jsx` is ~1400 lines and deliberately so. The fit logic, pointer
handling, layout loop and timeline share about twenty closure variables. They
have been left together because threading a context object through them reads
as tidier in a file tree and is harder to follow in an editor.

## The three coordinate ideas

Get these wrong and nothing else makes sense.

**World px.** Origin at screen centre, **Y up**. This is the space the shader
evaluates in, so pointer coordinates are converted into it once, on the way in,
and never again. Page Y is down, hence sign flips whenever the two meet.

**Ring slot vs plane index.** Planes are numbered in _fan order_ — the seed
first, then alternating either side of it, so index 0,1,2,3,4 sits at slot
0,+1,−1,+2,−2. `signedOffset(i)` converts. **Consecutive indices are on
opposite sides of the ring.** Anything derived from index rather than slot will
be subtly wrong; art used to be dealt by index and made the project column step
two names per slot.

**`g`, the stage scale.** Every plane-pixel measurement is multiplied by `g`,
so the ring resizes as one piece and the goo keeps its proportions. `g` folds
in both the entry's `endScale` and the window fit. If you add a measurement in
px, decide whether it goes through `g` — most do.

## Responsive model

Params are authored against a **reference window** (`refWidth: 1512`, a 14"
MacBook Pro at default scaling) and scaled by `fit = viewW / refWidth`, clamped
to `[minScale, maxScale]`. Width alone drives it by default, which keeps the
composition exactly self-similar: the ring's centre is placed as a fraction of
the viewport, so scaling its radius by the same fraction lands the front card
on the same relative spot at any width.

On top of that are two **bands**, computed in `refit()` and applied as
multipliers, not replacements — except where a phone works its own figures
out, below:

|          | `narrowAt` ≤ 1024                     | `tightAt` ≤ 640                       |
| -------- | ------------------------------------- | ------------------------------------- |
| plane    | ×1.25                                 | worked out: `tightCard` of the width  |
| radius   | ×1.3                                  | ×0.82 as it forms; at rest, see below |
| text     | ×1.5                                  | name ×1.4 (`tightTitle`)              |
| posX     | −2.5                                  | front card on the centre line         |
| endScale | 4.22                                  | worked out                            |
| layout   | name over the card, block right of it | name over the card, block under it    |

**A phone is composed in fractions of its own window**, not scaled down from
the reference one: below ~750px the fit sits on `minScale`, so the ring
stopped shrinking while the window kept narrowing, and the front card drifted
off the edge. `refit()` keeps the ring forming at the size it always did, and
works out the rest from the window: at rest the front card is `tightCard` of
the width on the centre line, and the ring is sized off the height
(`tightSpacing`) so its neighbours sit half in the lip, as on a wide window.
That fixes the end scale (`tightEnd`), the card's scale as the ring forms
(the `planeK` it overrides) and the centre (`tightX`). The goo grows with the
card on the way to rest (`gooK`) or the ring settles stiffer there than
anywhere else. The block (counter, discipline, year) goes under the card from
its left edge; the index column is hidden. Small type has px floors
(`metaMin`, `smallMin`, and `--t-name` on the page): in vw alone it fell to
6–10px on a phone. Other phone-only figures: the hero takes the card's 3:2
(`tightHeroAspect`), the open's threads are thinner (`tightOpenWeb`, since the
card is most of the width), the Next row stacks with the card under the name
at the hero's width (the `tablet:` breakpoint), and the art sheet's cells are
sized for the larger card (`buildAtlas`'s `share`).

Two rules when touching this:

- **`refit()` runs on resize only.** The layout loop reads `fit`/`planeK`/
  `radiusK`/`textK` thousands of times a second and must not be recomputing
  them.
- **Band _flags_ are stored, not resolved values,** so anything picked off them
  (`posX`, `endScale`) still responds to the dev panel between resizes. A
  phone's worked-out figures are the exception; their controls redo `refit()`.

If you tune on a machine that isn't 1512 wide, set `refWidth` to your window
first — the **fit** folder has a button that reads it off the live one.
Otherwise you are tuning against a scale factor that isn't 1 and everything
will be wrong everywhere else.

## Non-obvious things that will bite you

**`uScale` is a packed vec4.** `xy` is the birth scale, `z` is brightness (for
the side-card dim), `w` is which atlas cell the plane wears. They ride together
because GLSL ES allocates a full vec4 row per uniform-array element whatever
you declare, so `.zw` were already being paid for. Adding a separate `float[32]`
would cost 32 more rows against a guaranteed budget of 224.

**Art is dealt by ring slot, negated.** `cellOf(slot)` in the layout loop.
Negated because turning the ring forward walks the front slot _backwards_, and
scrolling down should read _down_ the project list.

**`PROJECTS` order is ring order.** Reordering rows moves the ring, the column
and the numbering together — that is the only place to change the sequence.
Do not use `imageOffset` for this; it rotates the art without moving the list.
The rows alternate dark / light / mid deliberately, because neighbours melt
into each other, and walk a colour wheel so any arc on screen is in one key;
keep that rhythm, and the one shared grade the set wears, in mind when
swapping one. Each project is one shoot or one place, picked as a set.

**The atlas cell is sized once, from the display.** 512–1024 px, from
`innerWidth × 0.4 × dpr` clamped to the GPU's texture limit — enough that the
front card is never upsampled. It is decided at mount: a window dragged onto a
sharper monitor keeps the sheet it was born with until reload.

**The load counter is the gate.** The entry launches on the frame the number
reads 100, and nothing else opens that gate. The counter reads
`min(load progress, birth progress)` so it cannot finish early and leave a
number sitting on 100 waiting for a condition nobody told the viewer about.

**There is no site chrome.** No header, nav or footer: the ring, its index,
the counter beside the card and the Close button are the whole page. A
wordmark and nav were tried and taken out at the author's request; do not
add them back as a courtesy. Nothing sits in the glass lip at rest either —
the big name's top is pinned at the lip's inner edge (`lipPx()`), on the
ring and on the page — because type in the bend reads as a fault.

**Two rooms, one switch.** `params.theme` picks a preset from `THEMES`
(dark or light) that is spread over the params at mount and from the dev
panel's room folder; every value under it stays a param. `retheme()` carries
the room everywhere the CSS cannot: the shader's paper and ink, the art's
tone (`uTone`, lift and gain), the colour-scheme, the blank page planes,
and the glow, which is re-lifted because in the light room it is a shadow
(`glowLight` below the paper's lightness). Grain switches blend mode with
the room (`grainBlend`) because soft light does nothing over paper. The ink
goes into the plane shader as authored (`setStyle(ink,
LinearSRGBColorSpace)`): a `THREE.Color` is linearised on the way in, the
shader writes straight through, and a linearised ink drew the page's type
and the bead visibly darker than the CSS's.

**The room is lit by the front card.** `atlas.js` reads each picture's
average colour as it lands and `Carousel.jsx` lifts it to a light (`lift`)
for a radial glow behind the card. `--glow` is a registered custom property
(`@property` in `globals.css`), which is the only way a colour in a gradient
can transition. The glow sits on the front slot itself — the layout loop
writes `--glow-x`/`--glow-y` when the slot moves — so it follows the card
wherever a band puts it. Its falloff is a Gaussian sampled in nine stops and
mixed in oklab: a two-stop radial gradient has a visible rim, and that rim is
what read as "a gradient" rather than light. Glow, vignette and paper are
**one element** (`.room`, `-z-20`, under the name and the work, so neither
ever greys a word or a card), and that is load-bearing: over dark paper a
gradient spans a handful of eight-bit levels, and as layers of their own
each was rounded on its own and showed as rings a level apart. Painted over
a 64px tile of the paper with ±1 level of triangular noise (`--dither`,
generated in `retheme`), they are rounded once against it and come out
smooth. So their strengths ride in their colours — `--glow-a` × `--glow-on`
(the arrive/step-aside fade, which GSAP tweens) and `--vig` — never in an
opacity, which would composite them apart and bring the rings back. The
film layer above everything carries only the grain, which sits on top of
the rounding and cannot dither it.

**The name's index is the row's other word.** The left meta group always
carried `[number, name]`; the number is now shown as a superscript after the
name (`order: 2`) and melts with it. The open's FLIP therefore measures the
name span, not the row.

**The project's name sits at a negative z-index** so the ring passes in front
of it. That only works while the page colour lives on `html`, not `body`: a
body background paints over everything below z-auto. `globals.css` says so;
keep it that way.

**Tailwind v4 centres with the `translate` property, not `transform`.** The
`-translate-y-1/2` on the meta boxes survives `transform: none`; anything
that positions one of those boxes itself has to set `translate: none` too.
`meta.style()` does. GSAP's `clearProps` on any transform property strips
`translate` as well, so the open's reset writes x/y/scale back to identity
instead of clearing. The symptom when either is missed is a box sitting half
its own height too high, which is where the phone's corner name was for a
while.

**The page is laid out by the DOM and drawn by the shader.** Under the
hero every block carries `data-gl` (`img` or `text`). `measurePage` reads
their boxes once per open and per resize; the layout loop places a plane on
each picture box (art from a second sheet, `uMore`, or the atlas for the
next card) and an ink mask on each text box, offset by the overlay's
`scrollTop`, so all of it passes through the lip with the hero. The type is
rasterised once per open onto one canvas sheet (`rasterText`): each block in
the face, size, tracking, leading and tone the DOM computed for it, wrapped
to the DOM's width, white on clear, with the CSS line-box rule (half-leading
above the font's ascent) so a single line lands where the DOM's would. The
DOM text is `opacity-0`, kept for layout, the accessibility tree and
selection. Pieces reveal from the loop (`tickFx`): pictures are born with
the seed's own curves, type rises a line and fades in; everything is
multiplied by `pageA`, which the open timeline tweens, so closing un-births
the page. The hairlines are drawn the same way: a `data-gl="rule"` block
keeps a transparent 1px top border for its layout, and the shader draws the
rule along that edge in the ink at `--rule-a`. Nothing visible on the page is
left to the DOM, because the DOM scrolls on the compositor a frame ahead of
the canvas — measured, a DOM rule slid 15–30px against the type it ruled off
during a flick (the DomGL skill's "one number, one frame"). Fragment uniforms
are near the 224-vec4 WebGL2 floor: `MAX_PLANES` 25, `MAX_LINKS` 18 (a closed
ring of 18; the bead's thread is its own), `MAX_TEXT` 17, `MAX_RULES` 5 —
raise one and lower another.

**The canvas renders on demand.** Each frame the loop fingerprints every
uniform value and texture version (and the heading's glyphs) and draws only
if something moved past 1e-3 since the frame last drawn — compared against
that frame, not the previous one, so a slow ease cannot creep on unseen. The
exceptions run on time and draw every frame: the birth's wobble, the wake,
and a clip on screen. A ring at rest and a page being read cost the GPU
nothing; while the pointer moves it is one draw a frame (the heading's
glyphs are hidden once spent rather than drawn at zero opacity). Anything
new that changes the picture has to go through a uniform or a texture, or
set `needsRender`, or it will not show until something else moves.

**A page has as many pictures as its set, up to six.** `media` in
`projects.js` lists them with a `shape` (`land` 3:2, `port` 4:5, `wide`
16:9) and a caption. The page has a fixed pool of `MEDIA_MAX` figures;
`setOpenCopy` fills the ones it needs, hides the rest, and gives each a slot
from `slotsFor` — a large lead on the right and a smaller offset on the
left for landscapes, pairs a short step apart for consecutive portraits, a
lone portrait alternating sides, wide for clips; one even gap between
pieces. Captions are not printed (each is its picture's `aria-label`): a
caption pressed against a picture read as a collision, so the words moved
to `insights` — three numbered notes set as a row (`.insights`) placed by
CSS `order` after the opening pictures, after the second figure or after
the pair it begins, never inside a pair. Text blocks: title, six for the
facts, the statement, six for the insights, two for the way on — 16 of 17. Planes sit exactly on their
boxes: a drift against the scroll was tried and made pictures run into the
type beside them, and pulling one picture up into another's space read as
clutter. The slots are plain CSS on the page's twelve columns
(`.media` in `globals.css`, figures as subgrids), so the shapes in order are
the layout. The pictures share one sheet (`uMore`), two cells to a row, and
each cell holds its picture already cut to its box's shape and stretched to
fill the cell, so the plane's own 0..1 reads it back undistorted whatever
the box. That is why one sheet serves every shape and the shader needs no
per-plane crop. Six pictures and the next card are 25 planes and their
captions 17 text blocks; more means lowering `MAX_LINKS`.

**Footage is one clip at a time, through the same shader.** One `<video>`
and one `VideoTexture` (`uLive`), routed each frame to whichever clip should
play: the front card's own loop (`PROJECTS[i].video`) once the ring has
rested `liveDelay` with it in front, the open card's through the open, the
close and the advance, and on a landed page whichever clip — the hero's or
a page `media` entry with `video` — has most of itself in the window. A
change fades the clip out before swapping, so the still under it never
jumps, and a clip that is wanted again keeps playing, which is how a close
hands the hero's clip back to the ring. `uLiveP.zw` cover-fits the clip into
the space it is read in: a card's 3:2 (the hero crop maps its frame back
into it) or a page box. It is mixed in after the page sheet in `artAt`, so
it plays over page pictures as well as cards. A card's loop must start on
the card's own frame, cut from the same clip and graded alike, or the
crossfade shows a jump. Off under `prefers-reduced-motion` and Save-Data,
and quietly absent wherever autoplay is refused.

**On open the name flies, then hands off in a crossfade.** `openProject`
measures the big word and the page's `h2` (`w-fit`, so the measurement is the
text, not the header) and flies the word's own box onto the `h2`'s place.
The `h2` is one of the page's text blocks, so the shader draws the same word
on the same box; at landing the shader's alpha (`titleGl`) comes up under
the DOM box over 0.1 s, and only then does the DOM box fade out over 0.25 s.
Two identical renderings are the only hand-off that does not read as a
switch — an earlier hard cut to a second DOM element, sized by a different
formula, did — but they must go in sequence: faded at once, each is half
there where they overlap and the word dips to three-quarters strength
midway, which read as a flicker. In sequence it holds, and only the
antialiased edges thicken a hair while both are up. Both sizes come from
`titleVwNow()`, which includes the short-window clamp.

**Next is one move, not a round trip.** The Next block at the foot of a
page does not close and reopen through the ring. `advanceTo` scrolls the page
itself (the reader's scroll is held with `overflowY: hidden`) until the next
project's name — set at the title's size on the title's left edge — reaches
the title's place, while over the last screen of that scroll the next card's
plane grows from its box into the hero's rect and its full-size picture is
crossfaded onto it. A spacer under the page makes that scroll position exist.
At the end the frame is identical to the next project's landed state, so
`finishAdvance` swaps everything underneath in one task: the ring is turned
so that card faces front (a close lands on it), the lockups are settled to
it, the page is refilled and measured, the scroll goes back to 0, and a fresh
open timeline is built and run to `progress(1)`, which is why closing from
the new page flies back correctly. `measurePage` carries each block's reveal
state across a re-measure so nothing reveals twice. Anything that reads
`openI` mid-advance should check `advancing` first; Close does.

**Close is plain DOM, deliberately not glass.** A disc in the page's own
colour with a hairline ring and a drawn cross (`.close` in `globals.css`),
fixed at the page's right edge on the title's line (`placeClose`, or the band
above when a long name would reach it). The open timeline opens the disc and
draws the two strokes, so a close puts it away in reverse; hover is CSS.
Once the page has moved under it, a faint halo of the paper (`.close::before`,
`--halo` from the loop) fades what passes under its rim instead of cutting
it — on a phone that is every line of text, on a wide window the last
insight's column. A
frosted pill and a docked glass tag were both tried and rejected; do not
bring the glass idiom back to controls. With Escape it is the only way out
of a page: the hero is a picture, not a close target — a click on it used
to close, with the cursor reading Close over it, and both were taken out at
the author's request. Its focus ring shows only once the
keyboard is in use
(`html[data-keys]`): the open moves focus to it by script, which some
browsers would otherwise draw as keyboard focus after a click.

**The cursor is a drop of the ink.** With a mouse, on the ring, the canvas's
own cursor is hidden (`bead.on`) and the shader draws a bead at the pointer:
a capsule (`sdRoundBox` with the half-height as its radius) smoothed into a
teardrop (`sdDrop`, Inigo Quilez's uneven capsule) whose tail trails the
pointer (`beadLag`, never past `beadStretch` beyond its rim) and, within
`beadReach` of a card's edge, reaches for it, so the drop leans over and
melts in before the head arrives. Over a card the drop opens sideways into a
pill — height and width on springs of their own, the width looser, so it
wobbles as it forms — with `tagText` cut out of it: where a glyph is, the
pill shows the picture under it at `beadKnock` brightness, so the word is
read in the photo on any picture. `ring/bead.js` sets the word in the name
face's Medium (a cut-out letter needs weight to hold a picture) and reports
its width, which sizes the pill (`beadPillH`, `beadPillPad`). It is not a
plane. It joins the field after the planes, the wobble and the wake, on a
blend of its own (`beadMelt`) — the cursor's softening would swallow
something that small — and enters the colour race as cell 1000, which wears
the ink (divided back through the room's tone so it comes out as the type's
ink). Outside itself its distance counts double in the race, or it dyes the
web between two cards it passes near. Leaving a card, it closes into a drop
and pulls a thread out of the card — an `sdBridge` from an anchor latched in
the card's own units (`pullFrom`, buried inside the rounded edge so the
bridge's square end never shows) to the head, thinning with stretch
(`beadSnap`) and time (`beadHold`) and letting go with a kick to the drop.
It is part of the bead in the shader, so it wears the ink and needs no link
slot. While dragging it stays a drop riding on top of the cards. Off on
touch and on an open page, which keeps the native cursor. Being in the
canvas it passes under the DOM labels, as the cards do. A glass tag, a badge
of turning words, a plain disc, a melting label and a drop that sank into the
card leaving a small caption were tried before it; the last read as a plain
dot most of the time, below the carousel it sits in.

**The meta morph needs three rows per side, not two.** Two stacked copies melt
into each other through an alpha threshold. The threshold must span both layers
for them to fuse, so anything inside it gets thresholded whether it is moving
or not — a word carried over unchanged (the same year twice running) would
visibly thicken for the length of the morph. Hence a third row outside the
filtered subtree. All three rows always carry all the words, painted or not,
because the row is what positions the others.

**The threshold is CSS filters and blends, never an SVG filter.** The two
melting rows sit in a mask painted white on black (black on white in the
light room), thresholded with `brightness()` then `contrast()` — the same
gain and cut, on luminance instead of alpha — then a layer of the ink is
multiplied on and the box lightens (darkens) the lot onto the room, so the
mask's black ground never shows. `meta.retheme()` sets the three with the
room. It used to be `filter: url(#svg)` with an feColorMatrix on alpha, and
WebKit renders reference filters in software, at device resolution, over the
blur's whole outset: on a phone the melt cost 50–150 ms a frame and every
swipe ended in a slideshow, the one thing the Mac in Chrome never showed. The
CSS path is Core Animation's and costs nothing measurable; the word blur is
capped at three smears for the same reason (past that the threshold finds
nothing anyway). Because the blend is on the box, the box must carry nothing
but the rows — anything else in it would be blended too. Two details are
load-bearing: the box wears the mask's ground as well (the mask is a layer
of its own and can snap a pixel short of the box, and ink multiplied over
nothing is ink, a hairline round the block), and `meta.style()` rounds every
edge of the box to a whole, even pixel, because a blended box on a fraction
of a pixel has its backdrop resampled, which showed as the same hairline.

**The side-card focus is one frame stale, deliberately.** The hit test that
decides which card is hovered runs _inside_ the layout loop, but every plane
needs an answer before the loop reaches that card. `focusPos` is latched at the
end of a frame for the next one. It is eased over ~10 frames, so the lag is not
perceptible.

**The snap can only decelerate.** It is a run-in for a throw that is nearly
spent. Click-to-centre (`pick`) therefore cannot reuse it — a pick starts from
a standstill and has to accelerate, so it tweens `state.spin` directly with the
momentum suspended (`picking`).

**The open is one linear clock, shaped three ways.** `opening.f` runs 0..1
with no ease. The layout loop derives the swell (`openEase`), the flee and the
thread pulse from it on their own curves, and the DOM side keys off the same
clock in one GSAP timeline, so closing is that timeline reversed and nothing
is choreographed twice. The opened card's art is a full-size texture
(`uHero`) masked in by cell, and the frame may leave 3:2 — `uHeroP.zw`
cover-fits the art so it never stretches. Once landed the frame is offset by
the page's `scrollTop` every frame, which is what lets a shader rectangle
scroll with DOM. The honey measures the ring through `openS[]` so the
swelling card does not read as touching everything at once. The flee is
`openPush`, but never less than what takes each card out of the window, goo
and all; and each pulse thread, and the open's extra melt, waits until its
neighbour is a third out of view (`outOf`). On a wide window both are no-ops,
since the neighbours already sit half in the lip. On a phone or a portrait
tablet the neighbours sit in full view, and without them the threads tied
whole cards to the swelling one and a shrunken neighbour stayed in the top
edge of the landed page, melting into it.

**A pick melts the name over the turn, not after it.** Clicking a side card
shows its project at the start of the turn, with the melt fitted to the
turn's own duration (`meta.show(cell, dur)`), so the open that follows
measures and flies the right word from settled type. The open used to start
the melt itself; the flight then measured the old word and the morph swapped
the text mid-air, which read as a jump in size and a cut at landing.
`openProject` still shows the cell if nothing has, for a click that lands as
a card arrives.

**Touch is not a mouse with one finger.** `pointer.inside` (is the position
worth reading — what the hit test needs) is separate from `engaged()` (should
the softening be on). On touch the latter requires a deliberate press-and-hold,
because a finger has no hover state. Also: **Safari reports `movementX` as 0
for touch**, so drag distance is measured from `clientX`/`clientY`; using
`movementX` makes every swipe look stationary and end in a tap.

**`touch-action: none`** on the canvas is load-bearing. Without it the browser
claims the gesture and the `pointermove` stream dies mid-drag.

**The WebGL context must be released explicitly.** `renderer.dispose()` frees
GL resources but leaves the context alive until the canvas is collected, which
is not deterministic. The effect re-runs on every StrictMode double mount and
every hot update, so contexts pile up; past the browser's limit (~16 in
Chrome) `new THREE.WebGLRenderer()` throws before the canvas is ever appended
and the page is blank with no canvas in the DOM at all. Cleanup calls
`forceContextLoss()` for this reason — do not remove it. Symptom if it
regresses: blank after a long dev session, fine after a hard reload.

## Conventions

- **All tuning lives in `params.js`.** If you are about to hardcode a number in
  the layout loop, it probably wants to be a param with a dev-panel control.
- **Add a control when you add a param.** `ring/gui.js`, in the matching
  folder. Wire the right `onChange`: `refit` for anything the bands depend on,
  `styleMeta` for anything the DOM labels are sized from, `replay` for anything
  baked into the entry timeline at build time.
- **Comments explain why, not what.** The code says what it does. Keep them
  short; the one long doc block in the repo is on `meta.js` because that
  technique genuinely does not read off the code.
- Prettier defaults, no config file. Run it before committing.
- The dev panel is `process.env.NODE_ENV === "development"` only and both it
  and lil-gui are dynamically imported, so neither reaches production. It
  starts hidden so it never sits over the work being judged: **G** toggles it,
  `?gui` opens with it.

## Known gaps

Listed roughly by how much they matter, so an agent picking up work knows what
is missing versus what is deliberate.

1. **The project page is an overlay, not a route.** `openProject()` swells
   the card into a frame and fills a scrolling page around it from
   `PROJECTS`; nothing changes the URL. A router belongs where it sets the
   copy, once the open has landed.
2. **Fonts are `.otf`/`.ttf`, ~340 KB.** Converting to `woff2` would cut that
   by roughly 60%. PP Neue Montreal is also gitignored, so the heading falls
   back on a fresh clone — see below.
3. **Only the clips ship at one size.** Every picture has a smaller copy in
   `public/sm/`: the cards at half size (1.1 MB for the eighteen, against
   ~3.5 MB), read by the atlas wherever its cells are 768px or less (phones,
   tablets, 1x laptops); the 87 page pictures cut to just cover a phone's
   640×512 sheet cell (5.3 MB against ~16 MB), read by `loadMore` when its
   cells are that small; and the opened card's full-size picture comes from
   whichever copy covers the frame it fills (`heroSrc`). The clips (~18 MB)
   are fetched only when a card plays or a project is opened, at one size.
4. **`prefers-reduced-motion` is only half handled.** Footage stays still
   under it, but the entry is still six seconds of animated blur with no
   escape hatch.
5. **No keyboard control.** Arrow keys should step the ring; the project column
   is `pointer-events-none` and cannot be clicked to jump.
6. **All the sample data is placeholder.** Every name, `type`, `year`,
   caption and blurb in `projects.js` is invented. The photographs are
   Unsplash-licensed stock and the clips Mixkit stock, cropped, graded alike
   and credited one by one in the README and LICENSE — fine to ship, but not
   the author's work. Do not present them as portfolio pieces, and carry the
   credits with any you keep. Mixkit's terms do not allow redistributing its
   clips on their own, so they live here only as part of the page.
7. **Portrait tablets keep the tablet composition.** Between 641 and 1024
   wide a portrait window gets the narrow band: a smaller card with its
   neighbours in full view. The phone's composition could extend to them on
   orientation as well as width.

## This is a public repo

Two things to respect when adding files.

**PP Neue Montreal is bundled but not licensed.** `public/ppneuemontreal-book.otf`
is a commercial Pangram Pangram face, kept in the repo so the design renders
during development. It is called out in the README and LICENSE as development
only, not for commercial use. Do not quietly widen its use, do not remove the
notices, and if you swap the heading to a free face, take the file out with it.
Satoshi (ITF Free Font Licence) and Geist (OFL) have no such restriction.

**Keep third-party attribution intact.** The simplex noise in
`planeShaders.js` carries an MIT notice that has to travel with the code. If
you pull in more shader snippets, credit them the same way and add a line to
the LICENSE and the README's Credits section.

Source is MIT. The contents of `public/` are explicitly _not_ covered — see
`LICENSE`.

Font families are looked up **by name**: the strings in `params.js`
(`nameFont`, `idxFont`, `textFont`) have to match a `@font-face` family in
`app/globals.css`, and the `textFont` dropdown in `gui.js` lists them a third
time. A name with no matching block falls back to system sans silently, which
looks like a rendering bug rather than a missing file. The heading's stacks
carry `textFallback` (Satoshi) after `textFont` — in the CSS (`--f-head`),
the meta lockup and the canvas heading alike — so wherever the commercial
PP Neue Montreal file is absent the titles are set in Satoshi, not in system
sans.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
