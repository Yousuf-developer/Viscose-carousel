// The choreography. Times are seconds of video; positions are CSS px in a
// 1536 x 864 viewport (the reference window, near enough).
//
// Ring geometry at rest, for reference: front card centred near (772, 432),
// about 408 x 272. Top neighbour's visible sliver is the triangle
// (496,0)-(817,0)-(534,103); its safest point is (561, 45).

const FPS = 60;

const minJerk = (u) => u * u * u * (10 - 15 * u + 6 * u * u);
const easeIn = (u) => u * u * u;
const easeOut = (u) => 1 - Math.pow(1 - u, 3);
const lerp = (a, b, u) => a + (b - a) * u;

const segs = [];
// Straight-ish glide with a slight bow, the way a hand actually moves a mouse.
function glide(t0, t1, from, to, { arc = 0, ease = minJerk } = {}) {
  segs.push({
    t0,
    t1,
    at: (u) => {
      const e = ease(u);
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const len = Math.hypot(dx, dy) || 1;
      const bow = arc * 4 * e * (1 - e);
      return [
        lerp(from[0], to[0], e) - (dy / len) * bow,
        lerp(from[1], to[1], e) + (dx / len) * bow,
      ];
    },
  });
  return to;
}
// Idle drift: a slow Lissajous around a point, faded in and out so it joins
// the glides either side of it without a kink.
function drift(t0, t1, c, ax, ay, period = 2.4) {
  segs.push({
    t0,
    t1,
    at: (u) => {
      const t = u * (t1 - t0);
      const env = Math.min(1, u * 4, (1 - u) * 4);
      const w = (2 * Math.PI) / period;
      return [
        c[0] + Math.sin(t * w) * ax * env,
        c[1] + Math.sin(t * w * 2) * ay * env,
      ];
    },
  });
  return c;
}

const events = []; // { t, type, ... }
const flicks = []; // { t, total, n, tau, p }

/* ------------------------------------------------------------- the script */
const ENTER = 9.3;

// Hover the front card: tag pops, neighbours back off, threads string out.
let p = glide(ENTER, ENTER + 1.1, [1600, 600], [860, 468], { arc: 30 });
p = drift(ENTER + 1.1, ENTER + 2.7, p, 46, 22);
// Up into the gap above it, where the honey webs between two cards.
p = glide(ENTER + 2.7, ENTER + 3.4, p, [728, 214], { arc: -20 });
p = drift(ENTER + 3.4, ENTER + 4.2, p, 18, 10, 1.6);
p = glide(ENTER + 4.2, ENTER + 4.8, p, [800, 470], { arc: 16 });

// Two single-card scrolls.
const S1 = ENTER + 5.0;
flicks.push({ t: S1, total: 900 });
p = drift(ENTER + 4.8, S1 + 1.9, p, 10, 6, 3);
const S2 = S1 + 1.9;
flicks.push({ t: S2, total: 900 });
p = drift(S1 + 1.9, S2 + 1.8, p, 10, 6, 3);

// Grab and fling.
const D = S2 + 1.8;
p = glide(D, D + 0.35, p, [790, 622], { arc: -12 });
events.push({ t: D + 0.42, type: "down" });
p = glide(D + 0.35, D + 0.45, p, p); // hold while pressing
p = glide(D + 0.45, D + 0.87, p, [806, 232], { ease: easeIn });
events.push({ t: D + 0.87, type: "up" });
p = glide(D + 0.87, D + 1.15, p, [812, 168], { ease: easeOut });

// Back down, wait for the thrown card to land and its label to melt in, then
// a big flick through four cards.
const B = D + 3.0;
p = glide(D + 1.15, D + 2.0, p, [820, 470], { arc: 24 });
p = drift(D + 2.0, B, p, 10, 6, 3);
flicks.push({ t: B, total: 2300 });
p = drift(B, B + 2.3, p, 12, 8, 3);

// Click the card peeking in at the top: the ring turns to centre it.
const C = B + 2.3;
p = glide(C, C + 0.75, p, [561, 47], { arc: -40 });
p = drift(C + 0.75, C + 1.35, p, 6, 4, 1.2);
events.push({ t: C + 1.35, type: "down" });
events.push({ t: C + 1.43, type: "up" });
p = glide(C + 1.35, C + 1.6, p, p);

// Off to the side to let the composition rest, then fade the pointer.
const E = C + 1.6;
p = glide(E, E + 1.2, p, [1190, 640], { arc: 50 });
const FADE = [E + 1.0, E + 1.5];
const END = E + 2.4;

/* ------------------------------------------------------------- evaluation */
function cursor(t) {
  if (t < ENTER) return null;
  let pos = null;
  for (const s of segs) {
    if (t >= s.t0 && t <= s.t1) {
      pos = s.at(s.t1 > s.t0 ? (t - s.t0) / (s.t1 - s.t0) : 1);
      break;
    }
    if (t > s.t1) pos = s.at(1);
  }
  if (!pos) return null;

  // Press: quick squeeze in, softer release.
  let press = 0;
  let down = null;
  for (const e of events) {
    if (e.t > t) break;
    if (e.type === "down") down = e.t;
    if (e.type === "up") down = null;
  }
  if (down !== null) press = Math.min(1, (t - down) / 0.06);
  else {
    const lastUp = events.filter((e) => e.type === "up" && e.t <= t).pop();
    if (lastUp) press = Math.max(0, 1 - (t - lastUp.t) / 0.12);
  }

  const fadeIn = Math.min(1, (t - ENTER) / 0.2);
  const fadeOut =
    1 - Math.min(1, Math.max(0, (t - FADE[0]) / (FADE[1] - FADE[0])));
  return {
    x: pos[0],
    y: pos[1],
    alpha: fadeIn * fadeOut,
    press: minJerk(press),
  };
}

function flickDeltas(total, n = 30, tau = 5, pw = 1.5) {
  const w = [];
  for (let i = 0; i < n; i++) w.push(Math.pow(i + 1, pw) * Math.exp(-i / tau));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (x / s) * total);
}

// Input actions due on frame f.
function actions(f) {
  const out = [];
  for (const e of events)
    if (Math.round(e.t * FPS) === f) out.push({ type: e.type });
  for (const fl of flicks) {
    const f0 = Math.round(fl.t * FPS);
    const d = flickDeltas(fl.total, fl.n, fl.tau, fl.p);
    if (f >= f0 && f < f0 + d.length)
      out.push({ type: "wheel", dy: d[f - f0] });
  }
  return out;
}

module.exports = {
  FPS,
  frames: Math.ceil(END * FPS),
  cursor,
  actions,
  marks: { ENTER, S1, S2, D, B, C, E, END },
};
