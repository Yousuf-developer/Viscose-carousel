# Viscose

A portfolio carousel rendered as a single WebGL shader. Project cards ride a
ring that sits mostly off-screen, so you see a tall arc of work sweeping past.
Scroll, drag or swipe to turn it; it settles with a card facing front.

_Viscose: a viscous state, and a fibre spun by drawing that state into a
thread. Which is what the cards do when they pull apart._

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Three.js](https://img.shields.io/badge/Three.js-r185-black)

![The carousel at rest in a dark room — Rosso, a red Ferrari Dino, front and
centre with its name set large over it and its red pooled behind it, the
counter, discipline and year beside it, and the index at the right
margin](docs/carousel.webp)

The cards are not images in a grid. The whole ring is one full-screen fragment
shader drawing signed distance fields, which is what lets neighbouring cards
melt into one another as they close up and string thin threads as they pull
apart. The cursor is a drop of the same stuff: it softens the surface under
itself, leans nearby cards toward it, sinks into the card it's over and
strings honey back out of it when it leaves.

**[Read the breakdown →](BREAKDOWN.md)** — where the idea came from, how
viscosity became a distance field, and the four things that only showed up
once it moved.

<!-- TODO: a screen recording would sell this far better than stills. The
     whole point is what happens between frames. -->

## Quick start

Requires **Node 20 or newer**.

```bash
git clone https://github.com/Yousuf-developer/Viscose-carousel.git
cd Viscose-carousel
npm install
npm run dev
```

Then open <http://localhost:3000>.

|                 |                  |
| --------------- | ---------------- |
| `npm run dev`   | dev server       |
| `npm run build` | production build |
| `npm start`     | serve the build  |
| `npm run lint`  | eslint           |

Built with Next.js 16 (App Router), React 19, Three.js, GSAP and Tailwind v4.

> Titles are set in **PP Neue Montreal**, a commercial face, when its file is
> present, and fall back to **Satoshi** (free, bundled) when it is not. See
> [Fonts](#fonts).

## What you can interact with

- **Scroll or drag** to turn the ring. It has momentum and snaps to the
  nearest card.
- **Hover a card** to soften the field around it, push its neighbours aside
  and string threads between them.
- **Click a card** to open it. The project's name keeps its size and moves
  to the top of the page while the card swells into a wide hero beneath it;
  the rest of the ring backs away and the threads between them stretch and
  snap. Below the hero the project reads on: discipline, year and a
  statement, the project's pictures and clips, and the next project. A
  click on a side card turns the ring first.
  Escape or the Close button plays it all backwards.
- **On touch**, swipe to turn and press-and-hold for the hover effects — a
  finger has no hover state, so it sits behind a deliberate gesture.

![Pulling out of a card: the cursor's drop has just left the front card's
edge and strings a thread of honey after it, while the ring's own threads run
thin to the neighbours above and below](docs/hover.webp)

On the ring the cursor is a drop of the same goo, drawn in the same pass. It
trails a tail when it moves, leans over to a card it comes near and melts
into its edge. Over a picture it opens into a pill of honey with VIEW cut out
of it, so the word is read in the photo underneath. Pull out and it closes
back into a drop and strings a thread out of the card that thins and snaps.

The threads are not drawn between the cards — they're part of the same
distance field, so they thin, sag and dissolve on their own as the gap opens.
The glass lip along the top and bottom edges is refracting the two neighbours
into those swept shapes, and that too is the same shader pass.

![An opened project: Alhambra at the top at the size it had over the ring,
the Close button on its line at the right, and the card become a wide hero
beneath it — the palace in late sun under the snow of the Sierra
Nevada](docs/open.webp)

Opening is the same material doing one more thing. The card swells in the
shader while the rest of the ring backs away and the threads between them
stretch and snap; a full-size copy of the image takes over from the atlas
cell as it grows, so the picture never leaves the shader. Once the frame has
landed it belongs to the page and scrolls with it. Close plays it backwards.

![The project page below the hero: the hero passing up through the glass
lip, a strip of facts under its rule and the statement beside it, then the
first of the project's pictures rising — an arch of carved stucco in the
Alhambra](docs/page.webp)

Below the hero the page is laid out as markup but drawn by the same shader:
the facts and the statement on one line, then the project's pictures and
clips — as many as the set has, up to six — in a rhythm set by their shapes:
a large picture on the right and a smaller one on the left, portraits in
pairs, a clip across the page. No captions are printed against the pictures;
after the opening pictures comes a row of three numbered insights, short
notes on the light, the place or the craft. The next project is at the foot. Every picture and every block of type is
placed by the layout loop on the box the DOM gave it, exactly — nothing
drifts against the scroll — so the whole page bends through the
glass lip at the top and bottom of the window as it scrolls, exactly as the
ring does. Each piece reveals itself as it is scrolled to.

Some cards have footage. A card that does plays it once the ring has come to
rest with it in front, starting on the very frame the card already shows, so
the still simply starts to move; it carries on into the hero when the card is
opened. On a project page, a clip plays in its box once most of it is in
view. One clip plays at a time, through the same shader, so footage bends
through the glass lip like everything else. It stays still under
`prefers-reduced-motion` or Save-Data, and wherever the browser refuses to
autoplay.

The next project at the foot carries straight on rather than going back
through the ring. The page keeps scrolling until that project's name sits
where the title was, at the title's size, while its card grows into the hero
beneath it. When it arrives the new page is the same frame, so it takes over
without a cut, and Close from there returns to the ring on the new project.

## The dev panel

In development, press **G** (or open the page with `?gui`) for a
[lil-gui](https://lil-gui.georgealways.com/) panel with every tunable in the
project — around 140 of them, grouped by what they affect. Drag a slider and
the change is live.

It never ships: the panel and lil-gui itself are both behind a dynamic import
guarded by `NODE_ENV === "development"`.

**Before you tune anything**, open the **fit** folder and check that `scale`
reads `1.000`. Every pixel measurement in the project is quoted against a
reference window (a 14" MacBook Pro, 1512 points wide). On a different screen
you'd be tuning against a scale factor that isn't 1, and the result will look
right for you and wrong for everyone else. There's a **`use this window as
ref`** button that fixes this in one click.

| Folder                   | What's in it                                                     |
| ------------------------ | ---------------------------------------------------------------- |
| `fit`                    | reference window, scale clamps, the two responsive breakpoints   |
| `shape`                  | card size, count, ring radius, corner, art crossfade             |
| `timing` / `stage`       | the entry animation                                              |
| `meta`                   | the project's name over the card, the block beside it, the morph |
| `room`                   | paper, ink, the glow behind the card and the grain               |
| `pointer` / `side cards` | how the ring reacts to a cursor                                  |
| `honey`                  | the threads between cards                                        |
| `glass`                  | the refracting lip along the top and bottom edges                |
| `open`                   | click-to-open: timing, how far the ring backs off, the page      |
| `footage`                | whether cards play their clips, how long the ring rests first    |

## Making it yours

### Projects

Everything lives in one array, `components/ring/projects.js`:

```js
{
  file: "alhambra.webp", // the card, and the frame it opens into
  name: "Alhambra",
  type: "Film",
  year: "2025",
  // video: "alhambra.mp4", // optional: the card's own loop, first frame = file
  media: [ // follows it down the page, up to six
    { src: "alhambra-1.webp", shape: "land", caption: "Court of the Myrtles" },
    { src: "alhambra-3.webp", video: "alhambra-3.mp4", shape: "wide",
      caption: "The hill, from dusk to dark" }, // the still is its poster
    { src: "alhambra-4.webp", shape: "port", caption: "Carved arches" },
  ], // each caption is the picture's accessible label, not printed
  insights: [ // three, set as a numbered row after the opening pictures
    { title: "Water", text: "The courts are built around still water…" },
  ],
  blurb: "The Nasrid palaces from first light to floodlight…",
}
```

Drop the images in `public/`, add a row, done. The array does four jobs at
once — it's the atlas packing order, the order art is dealt around the ring,
the project column top-right, and the `01`–`18` numbering. Reordering rows
moves all four together. Only `file` (and its `video`, once it is in front)
goes on the ring; the rest is asked for when the project is opened.

Any image works, but it is cover-cropped to the card's 3:2, so frame it that
way yourself rather than letting the crop decide. 1536×1024 is plenty: the
atlas never samples a card above 1024 px wide. Page media are cropped to
their `shape` — `land` 3:2, `port` 4:5, `wide` 16:9 — and the shapes in
order decide the layout, so put two portraits next to each other to get a
pair. A card's `video` should be a short seamless loop whose first frame is
the card image, so the still can start moving without a cut; a page clip's
`src` is its poster.

> **The list is in ring order.** Entry _n_ sits one slot along the ring from
> entry _n−1_, which is what lets the column count up as the carousel turns.
> Reorder these rows to change the sequence; don't reach for `imageOffset`,
> which rotates the art without moving the list with it.

All of the sample data is placeholder: the photographs are Unsplash stock, the
clips Mixkit stock, and every name, `type`, `year`, caption and `blurb` is
invented. See
[About the artwork](#about-the-artwork).

### Fonts

Three families, declared in `app/globals.css` and looked up **by name** from
`components/ring/params.js` — so if you swap one, change it in both places.

| Family           | Used for                               | Weights  | Licence                                                |
| ---------------- | -------------------------------------- | -------- | ------------------------------------------------------ |
| Satoshi          | discipline, header, index column, page | 400, 500 | [Fontshare](https://fontshare.com/fonts/satoshi), free |
| Geist            | numbers, years, counters, hint, note   | 400      | [OFL](https://github.com/vercel/geist-font)            |
| PP Neue Montreal | heading, project titles                | 400      | Pangram Pangram, **commercial**                        |

> [!IMPORTANT]
> **PP Neue Montreal is not licensed by this project.** It is a commercial
> typeface from [Pangram Pangram](https://pangrampangram.com/products/neue-montreal)
> and the file is included here **for local development and evaluation only**.
> It is **not** covered by this repo's MIT licence and **must not be used for
> commercial purposes**. If you ship anything with it, buy your own licence —
> or swap `textFont` in `params.js` for Satoshi, which is free for commercial
> work and already included.

Satoshi and Geist are both free to redistribute and use commercially.

> Fonts are served as `.otf`/`.ttf` (~340 KB total). Converting to `woff2`
> would cut that by roughly 60% — worth doing before this goes anywhere real.

## How it's put together

```
app/
  page.js            renders <Carousel />
  globals.css        Tailwind, @font-face, page background

components/
  Carousel.jsx      the component — renderer, resize, input, per-frame
                     layout, entry timeline
  ring/
    projects.js      the work
    params.js        every tunable
    utils.js         maths helpers
    atlas.js         packs all the art into one texture
    meta.js          the type either side of the ring
    splitText.js     the intro heading
    bead.js          the words the cursor's bead leaves
    gui.js           the dev panel
  shaders/
    planeShaders.js  the ring — SDFs, goo, glass
    textShaders.js   the heading's per-glyph reveal
```

Two ideas explain most of the rest.

**One shader, one draw call.** The ring, the threads between cards, the glass
lip along the screen edges and the project page are all evaluated per pixel in
`planeShaders.js`. Card positions arrive as uniform arrays, and the fragment
shader blends their distance fields with a smooth minimum — that soft blend is
the goo.

![The ring mid-entry: the cards have begun to peel off the seed and still
cling to one another, fused by thick necks of the same material, the red
Ferrari at the middle of the arc](docs/entry.webp)

The entry is the clearest look at what the smooth minimum is doing. Every card
starts merged inside the one before it and peels away in sequence, so at any
moment during the unfurl some pairs have fully separated, some are joined by a
thinning neck, and some are still one blob.

**Loading is part of the animation.** The atlas binds on the first frame and
fills in as images arrive, with the first card's art requested at high priority
so it can be shown while the rest are still downloading. The counter at the
bottom of the screen isn't a readout beside the entry — it _is_ the gate. The
seed card is born, holds at centre, and the ring launches on the frame the
number reaches 100.

For the deeper technical notes — coordinate conventions, the responsive model,
and the handful of things here that look like bugs but aren't — see
[AGENTS.md](AGENTS.md).

## Status

This is a work in progress, published because the rendering approach might be
useful to someone. Known gaps:

- **The project page is an overlay, not a route.** It has no URL and the back
  button does not know about it. Wiring it to the router means navigating
  from where `openProject` sets the copy.
- **Reduced motion is only half handled.** Footage stays still under it, but
  the entry is still six seconds of animated blur with no escape hatch.
- **No keyboard control.** Arrow keys should step the ring; the project column
  can't be clicked to jump.
- **Portrait tablets keep the tablet layout.** Phones get a composition of
  their own; a portrait tablet between 641 and 1024 px wide still gets the
  smaller card with its neighbours in full view.
- **No tests.** `npm run build` and `npm run lint` are the whole safety net,
  and GLSL only compiles at runtime — a shader typo builds green.

## Contributing

Issues and pull requests are welcome.

- Run `npm run lint` and `npx prettier --write .` before opening a PR.
- Load the page after touching anything in `components/shaders/` — GLSL is
  compiled in the browser, so a build passing proves nothing about it.
- New tunables belong in `params.js` with a matching control in `ring/gui.js`,
  not hardcoded in the layout loop.
- Please don't commit commercial font binaries or client artwork.

## Credits

- The gooey text morph — two blurred copies fused through an SVG alpha
  threshold — is a widely circulated CodePen technique, adapted here to run
  one-shot per card change instead of on a loop.
- Simplex noise in the ring shader is
  [webgl-noise](https://github.com/ashima/webgl-noise) by Ian McEwan (Ashima
  Arts) and Stefan Gustavson, MIT.
- Photographs from [Unsplash](https://unsplash.com) and clips from
  [Mixkit](https://mixkit.co), credited one by one under
  [About the artwork](#about-the-artwork).

## License

[MIT](LICENSE) for the source code. **Not** for anything in `public/`.

### About the artwork

The project images and clips are placeholders, **not my work**. Every
picture is a photograph published on [Unsplash](https://unsplash.com) under
the [Unsplash License](https://unsplash.com/license), and every clip is from
[Mixkit](https://mixkit.co) under the
[Mixkit Stock Video Free License](https://mixkit.co/license/#videoFree). Both
allow free use without attribution; they're credited here anyway. Each was
cropped to its box, given the same warm, lightly matte grade, and resized;
the clips were cut into short seamless loops. `public/sm/` holds smaller
copies of the pictures — the cards at half size, the page pictures cut for a
phone — which phones and tablets load instead.

They were picked as sets, not as a hundred good pictures: one shoot or one
place per project — classic cars, architecture, gardens and ruins in warm
southern light — so a page reads as one piece of work and the ring reads as
one body. Ordered around the ring as a colour wheel, with dark, light and mid
cards alternating, because neighbours melt into each other.

| Project   | Credits: the card, then the page in order                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rosso     | [Joost Crop](https://unsplash.com/photos/o7ceuBKduk0) · [Adrian Newell](https://unsplash.com/photos/FO7k8ixBpIo) · [Carlo D'Agnolo](https://unsplash.com/photos/dej1MKdTNW8) · [Matthieu Rochette](https://unsplash.com/photos/C4VBcCSdy3s) · [yokatan](https://unsplash.com/photos/fePmiSHK2mg) · [Matthieu Rochette](https://unsplash.com/photos/RyZdBJyNRYM) · [D Panyukov](https://unsplash.com/photos/bIcWHROkyXc)                                                                      |
| Salk      | [Adam Bignell](https://unsplash.com/photos/YIfkZfh6_Ag) · [mathilda janzon](https://unsplash.com/photos/yaEaVl0MI2s) · [Adam Bignell](https://unsplash.com/photos/t8rmbJGl3kg) · [Adam Bignell](https://unsplash.com/photos/zJU7JZTtUXU) · [Adam Bignell](https://unsplash.com/photos/PnO2bQFZ-pE)                                                                                                                                                                                           |
| Muralla   | [Lena Polishko](https://unsplash.com/photos/XrUCHZO97Ak) · [Lena Polishko](https://unsplash.com/photos/CxhvzHcMczE) · [Lena Polishko](https://unsplash.com/photos/SuVlj2sYlU0) · [Lena Polishko](https://unsplash.com/photos/M0cXO-UauBM) · [Lena Polishko](https://unsplash.com/photos/q88GBcdaozk) · [Lena Polishko](https://unsplash.com/photos/F22N6GJgqL8)                                                                                                                              |
| Petra     | [Moxin Wang](https://unsplash.com/photos/fCuLt5g_AMI) · [Brian Kairuz](https://unsplash.com/photos/eoZTnFtusDs) · [Emile Guillemot](https://unsplash.com/photos/sYMgkKkHpGI) · [Spencer Davis](https://unsplash.com/photos/Ivwyqtw3PzU) · [Spencer Davis](https://unsplash.com/photos/yYeM9Wkz5ng) · [Filippo Cesarini](https://unsplash.com/photos/c8F1hJ_UTrk)                                                                                                                             |
| Concordia | [Pier Averara](https://unsplash.com/photos/8N97bPoQrSI) · [Casey Lovegrove](https://unsplash.com/photos/QJDl3EVUz3o) · [Casey Lovegrove](https://unsplash.com/photos/uVfYfJgZdHY) · [Casey Lovegrove](https://unsplash.com/photos/JH7nEFD_s9c) · [Ricardo Gomez Angel](https://unsplash.com/photos/80AA-9ZZW0M) · [Raffaele Reccia](https://unsplash.com/photos/GRdE-kE6goA)                                                                                                                 |
| Alhambra  | [Jorge Fernández Salas](https://unsplash.com/photos/zXxkdiBgHvA) · [Austin Gardner](https://unsplash.com/photos/7fElVDKXLoQ) · [FotoFlo](https://unsplash.com/photos/_eiEesMgOxA) · [Dan Dubassy, Mixkit](https://mixkit.co/free-stock-video/medieval-castle-in-the-mountains-4013/) · [Izuddin Helmi Adnan](https://unsplash.com/photos/Avj33IMYv2g) · [Izuddin Helmi Adnan](https://unsplash.com/photos/jOJfQ-JT_qc) · [Petr Slováček](https://unsplash.com/photos/y63cZgMmeAc)            |
| Majorelle | [Riccardo Monteleone](https://unsplash.com/photos/59mmHLj0sbQ) · [mathieu gauzy](https://unsplash.com/photos/TRujcpvzgFo) · [mathieu gauzy](https://unsplash.com/photos/LkvMfSmny4c) · [mathieu gauzy](https://unsplash.com/photos/R6QKNFmN55E)                                                                                                                                                                                                                                              |
| Olive     | [Max](https://unsplash.com/photos/21Os74crDh0) · [Vasilis Caravitis](https://unsplash.com/photos/6gFxye8SVoY) · [Kostas Morfiris](https://unsplash.com/photos/v8NbNY5OSbY) · [Anastasia Zhenina](https://unsplash.com/photos/LCUX9zLIaDs) · [Don Fontijn](https://unsplash.com/photos/4k8OuBDNAW8)                                                                                                                                                                                           |
| Mesa      | [Hunter Owens](https://unsplash.com/photos/tCEHu5TJM5I) · [Hunter Owens](https://unsplash.com/photos/9Mt_7Iq5_2Q) · [Radek Skrzypczak](https://unsplash.com/photos/m7PbQ_GXlTk) · [Don Stouder](https://unsplash.com/photos/beABEWthrpk) · [grant morris](https://unsplash.com/photos/FCJktW0hR84) · [Cody Board](https://unsplash.com/photos/quuG8oNM61A)                                                                                                                                   |
| Havana    | [Dan Dubassy, Mixkit](https://mixkit.co/free-stock-video/classic-car-parked-in-the-street-of-a-town-4191/) · [Dan Dubassy, Mixkit](https://mixkit.co/free-stock-video/driving-a-classic-convertible-car-4189/) · [Dan Dubassy, Mixkit](https://mixkit.co/free-stock-video/classic-car-in-the-street-at-la-habana-4190/)                                                                                                                                                                      |
| Piscina   | [Dan Dubassy, Mixkit](https://mixkit.co/free-stock-video/luxury-swimming-pool-4045/) · [Francisco Fonseca, Mixkit](https://mixkit.co/free-stock-video/texture-of-water-waves-in-a-pool-1265/) · [Aran Mtnez](https://unsplash.com/photos/sTvu6hK3ul4) · [Dan Dubassy, Mixkit](https://mixkit.co/free-stock-video/swimming-pool-on-a-sunny-day-4434/)                                                                                                                                         |
| Riva      | [Roger Starnes Sr](https://unsplash.com/photos/uAgzFPIpX2c) · [Jon Flobrant](https://unsplash.com/photos/JJKArYKnjRE) · [Roger Starnes Sr](https://unsplash.com/photos/YRMupF6ez0o) · [Marco López, Mixkit](https://mixkit.co/free-stock-video/beautiful-coast-with-motorboats-and-a-pier-seen-from-the-5363/) · [John Cameron](https://unsplash.com/photos/e_r7oTXEGdk) · [Evan Verni](https://unsplash.com/photos/2ASsrJ7ezyA) · [Panos Tsilivis](https://unsplash.com/photos/7Wn3bO7jCc0) |
| Forum     | [Matteo del Piano](https://unsplash.com/photos/Lfo7YMVHYA8) · [Massimo Virgilio](https://unsplash.com/photos/bzItNUjmjpU) · [Massimo Virgilio](https://unsplash.com/photos/lgGP3fqFySQ) · [Torkos Akos](https://unsplash.com/photos/y818ZdbVd2M) · [Jens Peter Olesen](https://unsplash.com/photos/BmhszN5FeWM) · [Jorge Salazar](https://unsplash.com/photos/LCBYmHzcdMU)                                                                                                                   |
| Positano  | [Letizia Agosta](https://unsplash.com/photos/3TzHmifXX5k) · [Léa](https://unsplash.com/photos/i3eQftGYEWM) · [Sander Crombach](https://unsplash.com/photos/dqQPL0hMGOE) · [Dan Dubassy, Mixkit](https://mixkit.co/free-stock-video/view-of-the-marina-and-the-port-of-an-italian-4101/) · [Jordan Steranka](https://unsplash.com/photos/z0L0mo__9bg) · [Ricardo Gomez Angel](https://unsplash.com/photos/bIm4Bm4UZv0) · [Sebastian Leonhardt](https://unsplash.com/photos/PkWac9CLWVA)       |
| Hothouse  | [Samuel Hagger](https://unsplash.com/photos/XiDNzwihKjs) · [Max Letek](https://unsplash.com/photos/4dRCfIS25rw) · [Chris Boland](https://unsplash.com/photos/TQ0-SxoWtBY) · [Kristaps Grundsteins](https://unsplash.com/photos/0hvIxgaZIhs) · [Floor van Lent](https://unsplash.com/photos/96wgqD0pYos) · [Samuel Hagger](https://unsplash.com/photos/bvkvGU5GOQw)                                                                                                                           |
| Carrera   | [Valdemaras Januška](https://unsplash.com/photos/igaoYBHBDws) · [Luke Miller](https://unsplash.com/photos/4eUDt1oxfk8) · [George Bale](https://unsplash.com/photos/C-VQO3nBK60) · [Jonatan Hernandez](https://unsplash.com/photos/AWkEp5ap-vw) · [Edgar Guerra](https://unsplash.com/photos/8GKaCNL9NmI) · [Hamza Şamil Yavuz](https://unsplash.com/photos/TxZg6cO81tI) · [yokatan](https://unsplash.com/photos/AA2M2L6_xzc)                                                                 |
| Gullwing  | [Quentin Martinez](https://unsplash.com/photos/B-iVPhNPTJQ) · [Quentin Martinez](https://unsplash.com/photos/WVbkHe2t_Nc) · [Quentin Martinez](https://unsplash.com/photos/1rB0pLPItOI) · [Georg Eiermann](https://unsplash.com/photos/NoLH2QFBcqA) · [Quentin Martinez](https://unsplash.com/photos/EA_NXvQgNBY) · [Tim D](https://unsplash.com/photos/HsVjQDkSMNw) · [Quentin Martinez](https://unsplash.com/photos/daoUx38zvMA)                                                           |
| Spiral    | [Carlos Torres](https://unsplash.com/photos/hPRXeiQQ4-s) · [Nicolas Hoizey](https://unsplash.com/photos/z3v__zzp22U) · [Jean-Luc Benazet](https://unsplash.com/photos/dLpP34ADQPI) · [Dan Freeman](https://unsplash.com/photos/WHPsxhB4mWQ) · [Serhat Beyazkaya](https://unsplash.com/photos/ayWgRkCk2sQ) · [Ludde Lorentz](https://unsplash.com/photos/YfCVCPMNd38)                                                                                                                         |

The MIT licence above does not extend to them; the Unsplash License and the
Mixkit License are what cover their use. The names, disciplines and years
shown next to them are invented and are not claims about who made what. If you
fork this, replace the images with your own work.

> **If you took one of these** and would rather it wasn't here, please
> [open an issue](../../issues) and it comes straight out.

The bundled PP Neue Montreal is likewise not licensed by this project — see
[Fonts](#fonts).
