# Showreel

Records the carousel to video, frame-exact. Made for the 500-stars post on X.

The page's clock is replaced before any of its scripts run (`vclock.js`), so
`performance.now`, `Date.now` and `requestAnimationFrame` only move when the
recorder steps them, exactly 1/60 s per frame. However long a frame takes to
draw, and in software WebGL that is about a second, the motion comes out as
smooth as it is live. Input goes through Chromium's real input pipeline, so
the wheel, drag and click handlers run unmodified.

| File           | What it does                                                |
| -------------- | ----------------------------------------------------------- |
| `plan.cjs`     | the choreography: cursor path, scroll flicks, drag, click   |
| `vclock.js`    | init script: virtual clock, image counter, input counters   |
| `record.cjs`   | drives the page and writes one PNG per frame                |
| `endcard.html` | the closing card; its title melts in like the site's labels |
| `endcard.cjs`  | renders the end card frame by frame                         |
| `assemble.sh`  | crossfades the two and encodes H.264 for X                  |

## Running it

```bash
npm run build && npm start            # in one terminal

# Playwright is deliberately not a dependency of the app.
npm i --no-save playwright && npx playwright install chromium

node tools/showreel/record.cjs --scale 1.25 --out /tmp/reel/frames --gpu
node tools/showreel/endcard.cjs --scale 1.25 --out /tmp/reel/end --seconds 5
tools/showreel/assemble.sh /tmp/reel/frames 222 /tmp/reel/end reel.mp4
```

- `--scale 1.25` on the 1536 x 864 viewport gives 1920 x 1080 frames, and keeps
  the layout within 2% of the 1512 reference window.
- `--gpu` uses the machine's GPU. Leave it off on a box without one and WebGL
  falls back to SwiftShader, at roughly a second a frame.
- `--scale 0.5` is a quick low-resolution preview of the same choreography.
- The `222` passed to `assemble.sh` starts the cut at 3.7 s, as the seed
  swells into the ring. Pass `0` for the whole entry, counter included.

## Retuning the choreography

The gestures in `plan.cjs` are sized against the spin physics in
`Carousel.jsx`, which is easy to misjudge: the snap pulls back against a
scroll that is still building, so a flick either clears half a slot or comes
back to where it started. At the default params a 900 px flick moves exactly
one card and 2300 px moves four. If `scrollSpeed`, `damping` or `snapTime`
change, re-measure before trusting those numbers.

Positions are CSS px in the 1536 x 864 viewport. The card peeking in at the top
only shows a sliver; its safest point to click is around (561, 45).

The images in the recording are the placeholder art from `public/`, which is
not the author's work. See the README's _About the artwork_.
