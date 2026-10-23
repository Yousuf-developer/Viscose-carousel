// Each element of every uniform array below costs a fragment uniform slot.
// The guaranteed WebGL2 minimum is 224 vec4s, so the link parameters are
// packed into one vec4 array and the image index is derived arithmetically
// rather than passed as a tenth array.
// 18 cards, up to six pictures on a project page and the next card under it.
export const MAX_PLANES = 25;
// One per pair of neighbours round a closed ring of 18; the bead's thread is
// its own.
export const MAX_LINKS = 18;
// Blocks of the project page's type, drawn in this pass so they bend through
// the lip with everything else: the title, the strip of facts, the statement,
// three insights (head and text each) and the way on — 16 in all.
export const MAX_TEXT = 17;
// And its hairlines: over the facts, over each insight, over the way on.
// 25 planes, 18 links, 17 blocks and 5 rules are 185 array rows; with the
// scalars, the cursor's bead among them, that is about 214 of the 224 vec4s
// WebGL2 guarantees. Raise one only by lowering another.
export const MAX_RULES = 5;

export const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  #define MAX_PLANES ${MAX_PLANES}
  #define MAX_LINKS ${MAX_LINKS}
  #define MAX_TEXT ${MAX_TEXT}
  #define MAX_RULES ${MAX_RULES}

  varying vec2 vUv;

  uniform vec2  uResolution;   // canvas size in px
  uniform vec2  uSize;         // resting plane size in px
  uniform float uRadius;       // resting corner radius in px

  // per-plane state, driven from JS
  uniform float uCount;
  uniform vec2  uPos[MAX_PLANES];    // centre in px, origin at screen centre
  uniform float uRot[MAX_PLANES];    // radians
  // xy = 0..1 per axis, z = brightness (1 = lit, 0 = black), w = which atlas
  // cell this plane wears. All three ride in here rather than in arrays of
  // their own because GLSL ES gives every element of a uniform array a full
  // vec4 row whatever it is declared as — zw were already being paid for and
  // thrown away. The cell is resolved on the CPU because it depends on where
  // the plane sits on the ring, not on its index, and working that out per
  // pixel in the loop below would be absurd.
  uniform vec4  uScale[MAX_PLANES];

  // honey threads between neighbours, driven from JS. The ends ride in xy;
  // the rest of each row carries what every pixel would otherwise work out
  // for itself: the midpoint (A.zw), and the cull radius squared and the
  // length (B.zw).
  uniform float uLinkCount;
  uniform vec4  uLinkA[MAX_LINKS];
  uniform vec4  uLinkB[MAX_LINKS];
  // (radius at the ends, radius at the pinch, droop, fillet)
  uniform vec4  uLinkPar[MAX_LINKS];

  uniform float uK;            // smin blend strength in px
  uniform float uWobble;       // surface tension noise amount, px
  uniform float uTime;
  uniform vec3  uColor;
  uniform vec2  uTone;         // the art's lift and gain in this room

  // All the artwork lives in one atlas: ESSL 1.00 cannot index an array of
  // samplers with a varying index, so a per-plane texture is not an option.
  uniform sampler2D uAtlas;
  uniform vec2  uGrid;         // atlas cells across, down
  uniform float uBlend;        // px over which neighbouring art crossfades
  uniform float uTextured;

  // The opened card wears a full-size copy of its art in place of its atlas
  // cell, which was never meant to be seen at that size. Always sampled, so
  // the derivatives the mip selection needs stay defined, and masked in by
  // cell; zw cover-fit the art to a frame that has left 3:2.
  uniform sampler2D uHero;
  uniform vec4  uHeroP;        // cell it stands in for (-1 = none), mix, crop

  // Footage, one clip at a time, over the still it starts from: a card's on
  // the ring and on its hero, or a clip on the project page. Read in the
  // space the plane already shows (the hero crop's 3:2, or a page box), and
  // zw cover-fit the clip into it the way the still was cut from it.
  uniform sampler2D uLive;
  uniform vec4  uLiveP;        // cell it plays on (-1 = none), mix, fit

  // The opened project's other pictures, on a sheet of their own: cells at
  // or past uMoreP.x are read from it instead of the atlas. Each cell holds
  // its picture already fitted to the box it is shown in, stretched to fill
  // the cell, so the plane's own 0..1 reads it back undistorted whatever
  // shape the box is.
  uniform sampler2D uMore;
  uniform vec4  uMoreP;        // first cell it covers, cells across, mix, rows

  // The page's type: one sheet of white-on-transparent blocks, each laid on
  // the page as an ink mask at the box the DOM gave it. Drawn in this pass
  // rather than left in the DOM so the words pass through the lip the way
  // the pictures do.
  uniform sampler2D uText;
  uniform float uTextCount;
  uniform vec4  uTextRect[MAX_TEXT];  // centre.xy, half size.zw, world px
  uniform vec4  uTextUV[MAX_TEXT];    // its place on the sheet: u, v, du, dv
  uniform float uTextA[MAX_TEXT];     // ink alpha, reveal and tone folded in

  // The page's hairlines, drawn here and not by the DOM: the DOM scrolls on
  // the compositor and the canvas a frame behind it, so a rule left to the
  // DOM slid against the type it rules off whenever the page moved. A rule
  // is 1 css px tall, hung from its top edge; alpha 0 is none.
  uniform vec4  uRule[MAX_RULES];     // x0, x1, top y (world px), ink alpha

  // --- pointer -------------------------------------------------------------
  // Nothing is ever drawn at the cursor. It only changes how the ring behaves
  // around it: the field goes soft, and a wake runs out through the surface.
  // Packed into vec4s for the same reason the link parameters are.
  uniform vec4 uMouse;  // cursor.xy px, presence 0..1, blend px added at it
  uniform vec4 uMelt;   // reach px, wake px, wake frequency, wake speed

  // --- the cursor's bead ---------------------------------------------------
  // The one exception: on the ring the cursor is a drop of the ink, in the
  // field with the cards. A capsule round the pointer — a circle while it
  // is a drop, drawn out sideways into a pill over a card — with a tail
  // that trails it, and the thread of honey it pulls out of a card it
  // leaves: the same bridge as the ring's, anchored inside that card. It
  // melts into the cards on a blend of its own (the softening above would
  // swallow something this small whole), and in the colour race the drop
  // and its thread are cell 1000, which wears the ink.
  uniform vec4 uBead;    // head.xy (the pointer), tail.xy px
  uniform vec4 uBeadR;   // half height, tail radius, blend px, colour blend px
  uniform vec4 uBeadT;   // thread: anchor.xy px, radius at the ends, at the pinch
  // And the word cut out of the pill, so it is read in the picture under
  // it, darkened a little to hold against the honey on any picture.
  uniform sampler2D uBeadTex;  // the word: g glyphs
  uniform vec4 uBeadL;   // word alpha, half width px, thread droop, thread fillet
  uniform vec4 uBeadLP;  // the word's half width, half height px, darkening, -


  vec2 atlasUV(vec2 uv, float idx) {
    float col = mod(idx, uGrid.x);
    float row = floor(idx / uGrid.x);
    return (vec2(col, row) + uv) / uGrid;
  }

  vec2 moreUV(vec2 uv, float idx) {
    float k = max(idx - uMoreP.x, 0.0);
    float col = mod(k, uMoreP.y);
    float row = floor(k / uMoreP.y);
    return (vec2(col, row) + uv) / vec2(uMoreP.y, max(uMoreP.w, 1.0));
  }


  // --- glass lip -----------------------------------------------------------
  // A band along the top and bottom of the screen behaving like the rounded
  // edge of a thick glass sheet. Because the whole scene is evaluated from p,
  // warping p here refracts the planes and the honey together, with no second
  // pass and no render target.
  uniform float uBandTop;     // px
  uniform float uBandBottom;  // px
  uniform vec4  uGlass;       // refract px, squeeze, ripple px, ripple freq
  uniform float uFringe;      // px of chromatic split inside the band
  uniform float uSheen;       // lift applied across the lip

  // Warps p in place and returns how deep into the lip this pixel sits, 0..1.
  float glassBend(inout vec2 p) {
    float band = p.y > 0.0 ? uBandTop : uBandBottom;
    if (band <= 0.5) return 0.0;

    float dy = abs(p.y) - (uResolution.y * 0.5 - band);
    if (dy <= 0.0) return 0.0;

    float t = clamp(dy / band, 0.0, 1.0);
    // Circular profile: barely bends at the inner edge, falls away sharply at
    // the very edge, which is what reads as thickness rather than a gradient.
    float bend = 1.0 - sqrt(max(0.0, 1.0 - t * t));

    float s = sign(p.y);
    // Sampling back toward centre throws content outward, so the image
    // stretches forward into the lip and swells as it reaches the edge.
    // Both terms are signed: negatives invert the lip and compress instead.
    p.y -= s * bend * (uGlass.x + sin(p.x * uGlass.w) * uGlass.z);
    p.x *= 1.0 - bend * uGlass.y;

    return bend;
  }

  // --- simplex noise -------------------------------------------------------
  // Copyright (C) 2011 Ashima Arts. All rights reserved.
  // Copyright (C) 2011-2016 by Stefan Gustavson (Classic noise and others)
  // Distributed under the MIT License. https://github.com/ashima/webgl-noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                            + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                            dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // --- sdf helpers ---------------------------------------------------------
  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  // The honey between two planes: a flat slab spanning centre to centre, as
  // wide as the edges it comes off and pinched in the middle, drooping under
  // its own weight.
  //
  // Deliberately not a capsule. A capsule has a round cross-section, so at
  // full merge it bulges out past the flat sides of the planes themselves.
  // This is swept as a box, so while the planes overlap it stays entirely
  // inside them and the silhouette reads as one flat card.
  float sdBridge(vec2 p, vec2 a, vec2 b, float len, float rEnd, float rMid, float sag) {
    if (len < 0.001) return 1e6;

    vec2 dir = (b - a) / len;
    vec2 nrm = vec2(-dir.y, dir.x);

    vec2 q = p - (a + b) * 0.5;
    float along = dot(q, dir);
    float across = dot(q, nrm);

    float h = clamp(along / len + 0.5, 0.0, 1.0);
    float bell = sin(3.14159265 * h);           // 0 at the ends, 1 in the middle

    // droop, world -Y, resolved onto the across axis
    across += sag * bell * nrm.y;

    float taper = pow(1.0 - bell, 1.7);         // 1 at the ends, 0 in the middle
    float r = mix(rMid, rEnd, taper);

    // Ends are square and buried inside the planes, so they never show.
    return max(abs(along) - len * 0.5, abs(across) - r);
  }

  // Two circles and the cone tangent to both: a drop, round at the head and
  // drawn out to the tail. Exact (Inigo Quilez's uneven capsule); collapses
  // to the head's circle while the tail is still inside it.
  float sdDrop(vec2 p, vec2 a, vec2 b, float ra, float rb) {
    vec2 ba = b - a;
    float h = dot(ba, ba);
    float dr = ra - rb;
    if (h <= dr * dr + 0.01) return length(p - a) - ra;
    p -= a;
    vec2 q = vec2(abs(dot(p, vec2(ba.y, -ba.x))), dot(p, ba)) / h;
    vec2 c = vec2(sqrt(h - dr * dr), dr);
    float k = c.x * q.y - c.y * q.x;
    if (k < 0.0) return sqrt(h * dot(q, q)) - ra;
    if (k > c.x) return sqrt(h * (dot(q, q) + 1.0 - 2.0 * q.y)) - rb;
    return dot(c, q) - ra;
  }

  // smooth minimum — this is what makes the shapes read as liquid.
  // Note it also behaves as a plain min() when a is the 1e6 sentinel.
  float smin(float a, float b, float k) {
    if (k <= 0.0001) return min(a, b);
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // One plane's picture at one point of it. The atlas by default; the full-
  // size copy for the opened card's cell, cover-fitted to a hero that has
  // left 3:2; the footage over either while it plays. Each is masked in by
  // cell, inside a branch on its mix alone — uniform, so every fragment
  // takes it together and the derivatives the mip selection needs stay
  // defined — and the ring at rest pays for the atlas only.
  vec3 artAt(vec2 uv, float cell, vec2 fr) {
    float hero = 1.0 - step(0.5, abs(cell - uHeroP.x));
    uv = mix(uv, 0.5 + (uv - 0.5) * uHeroP.zw, hero);
    vec3 c;
    // Uniform branch. The offset is scaled by bend upstream, so outside the
    // lip the three taps land on the same texel and there is no fringe.
    if (uFringe > 0.0) {
      c = vec3(
        texture2D(uAtlas, atlasUV(uv + fr, cell)).r,
        texture2D(uAtlas, atlasUV(uv, cell)).g,
        texture2D(uAtlas, atlasUV(uv - fr, cell)).b
      );
    } else {
      c = texture2D(uAtlas, atlasUV(uv, cell)).rgb;
    }
    if (uHeroP.y > 0.0) {
      c = mix(c, texture2D(uHero, uv).rgb, hero * uHeroP.y);
    }
    if (uMoreP.z > 0.0) {
      float more = step(uMoreP.x - 0.5, cell);
      c = mix(c, texture2D(uMore, moreUV(uv, cell)).rgb, more * uMoreP.z);
    }
    // Last, so a clip plays over a page picture as well as over a card.
    if (uLiveP.y > 0.0) {
      float live = 1.0 - step(0.5, abs(cell - uLiveP.x));
      vec3 lc = texture2D(uLive, 0.5 + (uv - 0.5) * uLiveP.zw).rgb;
      c = mix(c, lc, live * uLiveP.y);
    }
    // The bead wears the ink, whatever the sheets above made of its cell —
    // put through the room's tone backwards, so it comes out of it as the
    // ink the page's type wears.
    vec3 ink = (uColor - uTone.x) / max(uTone.y - uTone.x, 0.001);
    c = mix(c, ink, step(999.5, cell));
    return c;
  }

  void main() {
    // Screen position in world px, then bent by the lip.
    vec2 p = (vUv - 0.5) * uResolution;
    float bend = glassBend(p);

    // Read after the bend, so the cursor acts in the same warped space as the
    // ring: dragged into the lip, its influence is refracted with everything
    // else rather than sitting flat on top of it.
    float toMouse = length(p - uMouse.xy);

    // Blend strength is lifted in a halo around the cursor, so the ring goes
    // soft exactly where it is being touched and stays crisp everywhere else.
    // Resolved once per pixel rather than per plane: it costs one length().
    float k = uK;
    if (uMouse.z > 0.001) {
      float t = 1.0 - smoothstep(0.0, max(uMelt.x, 1.0), toMouse);
      k += uMouse.w * uMouse.z * t * t;
    }

    float d = 1e6;

    // The two planes nearest this pixel, tracked alongside the field so the
    // colour can be resolved without a second pass. In the goo between two
    // planes both are close, which is exactly where the crossfade belongs.
    float d0 = 1e6, d1 = 1e6;
    vec2 uv0 = vec2(0.5), uv1 = vec2(0.5);
    float im0 = 0.0, im1 = 0.0;
    float dm0 = 1.0, dm1 = 1.0;

    float halfSpan = length(uSize) * 0.5;

    for (int i = 0; i < MAX_PLANES; i++) {
      if (float(i) >= uCount) break;

      vec4 st = uScale[i];
      vec2 sc = st.xy;
      float grown = max(sc.x, sc.y);
      if (grown <= 0.0001) continue;

      vec2 q = p - uPos[i];
      // Anything further out than this cannot affect the surface, so it can be
      // skipped outright — this is what keeps 32 planes affordable. Scaled by
      // the plane rather than fixed, because a plane swollen under the cursor
      // reaches further than its resting size, as does the melt around it.
      float cull = halfSpan * grown + k + uWobble + 8.0;
      if (dot(q, q) > cull * cull) continue;

      // into the plane's local frame
      float a  = uRot[i];
      float ca = cos(a), sa = sin(a);
      q = vec2(q.x * ca + q.y * sa, -q.x * sa + q.y * ca);

      vec2 halfSize = max(uSize * 0.5 * sc, vec2(0.0001));

      // starts as a circle (r = half extent), relaxes into the rounded rect
      float rMax = min(halfSize.x, halfSize.y);
      float r = min(rMax, mix(rMax, uRadius, smoothstep(0.30, 1.0, min(sc.x, sc.y))));

      float di = sdRoundBox(q, halfSize, r);
      d = smin(d, di, k);

      // Local UV. Clamped, so the goo outside a plane carries that plane's
      // edge colour rather than repeating or sampling the next atlas cell.
      vec2 luv = q / (2.0 * halfSize) + 0.5;
      luv.y = 1.0 - luv.y;
      luv = clamp(luv, 0.004, 0.996);

      if (di < d0) {
        d1 = d0; uv1 = uv0; im1 = im0; dm1 = dm0;
        d0 = di; uv0 = luv; im0 = st.w; dm0 = st.z;
      } else if (di < d1) {
        d1 = di; uv1 = luv; im1 = st.w; dm1 = st.z;
      }
    }

    // Threads strung between neighbours as they pull apart.
    for (int i = 0; i < MAX_LINKS; i++) {
      if (float(i) >= uLinkCount) break;

      vec4 par = uLinkPar[i];
      // Radii are allowed to go negative: that lifts the bridge's field clear
      // of the surface so it fades out, rather than bottoming out at zero as a
      // half-covered hairline. Only cull once it is further out than the
      // antialiasing can reach.
      if (par.x <= -3.0) continue;

      vec4 la = uLinkA[i];
      vec4 lb = uLinkB[i];
      vec2 dm = p - la.zw;
      if (dot(dm, dm) > lb.z) continue;

      d = smin(d, sdBridge(p, la.xy, lb.xy, lb.w, par.x, par.y, par.z), par.w);
    }

    // Surface tension wobble, decays to zero so resting planes are dead flat.
    if (uWobble > 0.001) {
      float n = snoise(p * 0.012 + vec2(uTime * 0.22, uTime * -0.17));
      d += n * uWobble;
    }

    // A capillary wake off the cursor, amplitude driven by how fast it is
    // moving. Rings out from it and dies over the same reach the softening
    // uses, so a flick leaves a ripple in the surface that outlives the
    // movement that made it.
    if (uMelt.y > 0.001) {
      d += sin(toMouse * uMelt.z - uTime * uMelt.w)
         * uMelt.y * exp(-toMouse / max(uMelt.x, 1.0));
    }

    // The bead last, so neither the birth's wobble nor the wake ripples a
    // shape this small. db is the bead with its thread, for the field and
    // the race; dd the bead alone, which is what sits on top of a card.
    float db = 1e6;
    float dd = 1e6;
    if (uBeadR.x > 0.05) {
      float rh = uBeadR.x;
      float pill = sdRoundBox(p - uBead.xy, vec2(max(uBeadL.y, rh), rh), rh);
      dd = smin(pill, sdDrop(p, uBead.xy, uBead.zw, rh, uBeadR.y), 3.0);
      db = dd;
      if (uBeadT.z > -3.0) {
        float dh = sdBridge(p, uBeadT.xy, uBead.xy, length(uBead.xy - uBeadT.xy), uBeadT.z, uBeadT.w, uBeadL.z);
        db = smin(db, dh, uBeadL.w);
      }
      d = smin(d, db, uBeadR.z);
      // Outside itself its distance counts double in the race, so it keeps
      // its colour to its own shape and neck instead of dyeing whatever goo
      // it passes near — the web between two cards, say.
      float dr = db + max(db, 0.0);
      if (dr < d0) {
        d1 = d0; uv1 = uv0; im1 = im0; dm1 = dm0;
        d0 = dr; uv0 = vec2(0.5); im0 = 1000.0; dm0 = 1.0;
      } else if (dr < d1) {
        d1 = dr; uv1 = vec2(0.5); im1 = 1000.0; dm1 = 1.0;
      }
    }

    // Clamped, not just floored: the distance cull above leaves a step in the
    // field, and an unclamped fwidth across that step paints a half-opaque
    // outline along every cull boundary.
    float aa = clamp(fwidth(d), 0.5, 2.0);
    float alpha = 1.0 - smoothstep(-aa, aa, d);

    // The page's type, in the same warped space as the field. The sheet has
    // no mipmaps, so sampling inside a loop with early-outs is safe.
    float tA = 0.0;
    for (int t = 0; t < MAX_TEXT; t++) {
      if (float(t) >= uTextCount) break;
      float a = uTextA[t];
      if (a <= 0.001) continue;
      vec4 r = uTextRect[t];
      vec2 q = p - r.xy;
      if (abs(q.x) > r.z || abs(q.y) > r.w) continue;
      vec2 tuv = q / (2.0 * r.zw) + 0.5;
      tuv.y = 1.0 - tuv.y;
      vec4 s = uTextUV[t];
      tA = max(tA, texture2D(uText, s.xy + tuv * s.zw).a * a);
    }

    // The rules, as ink like the type.
    float hw = 0.5 * max(fwidth(p.y), 0.0001);
    for (int i = 0; i < MAX_RULES; i++) {
      vec4 r = uRule[i];
      if (r.w <= 0.001 || p.x < r.x || p.x > r.y) continue;
      float cov = 1.0 - smoothstep(0.5 - hw, 0.5 + hw, abs(p.y - (r.z - 0.5)));
      tA = max(tA, cov * r.w);
    }

    // The word cut out of the pill, in the pill's own (bent) space.
    float bA = 0.0;
    if (uBeadL.x > 0.001) {
      vec2 bq = p - uBead.xy;
      if (abs(bq.x) < uBeadLP.x && abs(bq.y) < uBeadLP.y) {
        bA = texture2D(uBeadTex, bq / (2.0 * uBeadLP.xy) + 0.5).g * uBeadL.x;
      }
    }

    if (alpha <= 0.001 && tA <= 0.001) discard;

    // Even mix where the two nearest planes are equidistant, resolving to
    // whichever is clearly nearer beyond uBlend. Both the art and the dim are
    // carried across on it, so neither can put a seam down the goo.
    // Against the bead the crossfade is its own, narrower, so the drop keeps
    // its colour up to the neck instead of staining the card it touches.
    float bl = max(im0, im1) > 999.5 ? uBeadR.w : uBlend;
    float nearest = smoothstep(-bl, bl, d1 - d0);

    vec3 col = uColor;
    if (uTextured > 0.5) {
      vec2 fr = vec2(uFringe * bend / max(uSize.x, 1.0), 0.0);
      vec3 c0 = artAt(uv0, im0, fr);
      vec3 c1 = artAt(uv1, im1, fr);
      col = mix(c1, c0, nearest);
    }

    // Cards standing off the one being pointed at are turned down, so the
    // hovered card reads as the lit one. Untextured, uColor is already almost
    // black and there is nothing here to see — which is fine, that mode exists
    // to read the goo's silhouette.
    // The room's tone on the art: blacks lifted toward the paper, then
    // gained. Identity in the dark room.
    if (uTextured > 0.5) col = col * uTone.y + uTone.x * (1.0 - col);

    col *= mix(dm1, dm0, nearest);

    // A card is deeper than the bead over most of it, so the race alone would
    // hide it there; it sits on top of whatever it is dragged across — but
    // for the word, where the picture shows through, a little darker.
    if (dd < aa) {
      float bc = 1.0 - smoothstep(-aa, aa, dd);
      col = mix(col, uColor, bc * (1.0 - bA));
      col = mix(col, col * uBeadLP.z, bc * bA);
    }

    // A touch of lift where the lip is steepest, so the band reads as a
    // surface catching light rather than only a warp.
    col += bend * uSheen;

    // Ink over whatever is under it: the plane where there is one, nothing
    // where there is not — col is the nearest plane's edge colour there, and
    // mixing toward it would tint the antialiased edge of every letter.
    if (tA > 0.001) {
      vec3 base = mix(uColor, col, clamp(alpha, 0.0, 1.0));
      col = mix(base, uColor, tA);
      alpha = max(alpha, tA);
    }

    // Written straight through. The atlas is tagged NoColorSpace so sampling
    // returns the authored sRGB values, and this shader adds no output
    // encoding of its own — decoding on read without encoding on write is
    // what darkens everything.
    gl_FragColor = vec4(col, alpha);
  }
`;
