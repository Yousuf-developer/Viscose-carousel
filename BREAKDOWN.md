# Breakdown

Where this came from and how it got built.

## The idea

I wanted to make something that didn't look like every other portfolio site.
Not a better grid. Something you couldn't place straight away.

I started with the word morphing. One thing turning into another. Most
morphing on the web is really just a crossfade in disguise though, and I
didn't want a transition. I wanted a material.

Morphing got me thinking about honey, and honey got me onto viscosity. That's
where it clicked, because viscosity does something you can actually picture.

Pull two blobs of honey apart and they don't just separate. They cling. A
bridge forms, narrows in the middle, sags under its own weight, stretches
thinner and thinner, then snaps. Right before it goes, the two blobs are still
technically one object.

That's the whole thing. Everything else here exists to make that happen as
often as possible.

## Why a ring

If the effect is about things coming apart, they have to start together.

So nothing fades in. One card is born in the middle of the screen and every
other card is already inside it. They peel off one at a time, alternating left
and right, each one dragging a thread behind it until the ring closes.

![The ring mid-entry: the cards have begun to peel off the seed and still
cling to one another, fused by thick necks of the same material, the red
Ferrari at the middle of the arc](docs/entry.webp)

This frame is basically the whole pitch. The right side has finished
separating. The left side is still mid-pull. One pair is joined by a thick
neck, another by a thin one, and two are still fused into a single blob. Same
moment, every stage of the separation happening at once.

After that the ring slides off to the left and scales up, so what you're left
with is an arc of a much bigger wheel. You never see all of it. That was on
purpose. A whole circle looks like a diagram. A piece of one looks like
something big going past.

## Making it real

You can't do this with elements. Two `<img>` tags will never merge, and no
amount of `filter: blur()` makes them behave like a fluid once you look
closely.

So there are no cards. There's one full-screen rectangle running one fragment
shader, and every pixel asks the same question: how far am I from the nearest
card?

That's a signed distance field. Once every shape is a distance function
instead of an object, merging turns into arithmetic. Take the minimum of two
distances and you get their union with a hard edge. Take a _smooth_ minimum
and the join swells into a fillet, and two shapes near each other fuse into
one continuous surface.

```glsl
float smin(float a, float b, float k) { ... }
```

One number, `k`, sets how gooey the whole world is. That's the honey.

## Modelling the thread

Smooth minimum gets you merging. It doesn't get you the snap. Two cards
drifting apart under `smin` alone just quietly stop touching.

So the thread is its own shape, a swept box between each pair of neighbours,
with four properties tracking how far apart they've got. Call that distance
`v`, where 0 means the faces are touching and 1 means fully separated:

|          | as `v` goes 0 to 1                                         |
| -------- | ---------------------------------------------------------- |
| width    | falls off on a curve, so it thins fast then lingers        |
| pinch    | the middle narrows faster than the ends, which is the neck |
| sag      | droop grows with distance, so a long thread hangs          |
| dissolve | pushes the radius past zero near the end                   |

That last one matters more than it sounds. Without it a thread thins down to a
half-covered pixel and then just stops existing, which reads as a hairline
flickering off. Driving the radius negative carries it out of antialiasing
range so it fades out of the field properly. The thread doesn't vanish. It
breaks.

## The cursor is a force, and a drop

Mostly the cursor is a disturbance in the field.

![Pulling out of a card: the cursor's drop has just left the front card's
edge and strings a thread of honey after it, while the ring's own threads run
thin to the neighbours above and below](docs/hover.webp)

Move over a card and it raises `k` locally, so the surface goes soft right
there and stays stiff further out. The nearest cards lean toward it and swell
a bit. Their neighbours back off and dim, which is what makes the hovered one
read as picked up rather than just highlighted. Threads string themselves
between the cards you're _between_, not the one you're on. Move fast and you
leave a capillary ripple that outlives the movement.

The rates are lopsided on purpose. Cards take up a lean quickly and let go of
it slowly. Equal rates read as a mechanism following your cursor. The gap
between them reads as something thick being dragged through.

The pointer itself is a drop of the ink, evaluated in the same pass. It isn't
one of the planes: the softening around the cursor would swallow something
that small whole, so it joins the field last, on a blend of its own. It drags
a tail when it moves, leans over to a card it comes near and melts into the
edge before you're over it. Over a picture it opens into a pill with VIEW
cut out of it, so you read the word in the photo. Pull out and it closes up
and strings a thread out of the card — the same bridge the ring strings
between neighbours, anchored to the spot it came out of — which thins as it
stretches and then lets go.

## The same trick, twice

![The carousel at rest: the front card centred, its number and name to the
left, discipline and year to the right, and the full index top
right](docs/carousel.webp)

The type either side of the ring changes as the carousel turns, and it doesn't
crossfade. It melts, same as the cards do.

It can't use the shader though, because it's DOM text. So it does the same
thing in a completely different medium. Two copies of the words are stacked,
one blurred out as the other blurs in, and the pair get run through an alpha
threshold that forces everything above a cut fully opaque and drops the rest.
(The threshold is brightness and contrast on a white-on-black mask of the
words, with the ink multiplied on and the box blended onto the room. An SVG
filter did it on alpha directly, and WebKit runs those in software: on a
phone it was most of a second of dropped frames after every swipe.)

Two soft edges drifting past each other cross that cut as one shape.

Which is the same idea as the smooth minimum wearing different clothes.
Soften, then re-harden. Blur is the softening, the threshold is the
re-hardening. In the shader it's `smin` and an antialiased edge. Same
principle in two unrelated technologies, and I only noticed they were the same
thing after I'd built both.

## Stuff that only showed up once it moved

Four things I didn't see coming. All of them needed rethinking rather than
tweaking.

**Hover fed back into the goo.** Threads are measured from how far apart two
cards are, but hovering _moves_ cards. Leaning one toward the cursor made the
gap look smaller, which fattened the thread, which changed the shape. The
unfurl reacts brutally steeply to separation. A couple of percent of the gap
is already a slab. The fix was to measure threads from where each card would
be with no cursor near it. Hover moves what you see, never what the goo is
computed from.

**Cards are numbered in fan order, not ring order.** They're born alternating
either side of the seed, so card 0, 1, 2, 3 sits at ring position 0, +1, -1,
+2. I was dealing the artwork by card number, which quietly put every other
project side by side. Turning the wheel one slot stepped the project list two
names. Fix was to deal by ring position instead.

**The loading counter had to become the gate.** At first it just reported
bytes. On a warm cache it hit 100 instantly and then sat there while the entry
animation played, which reads as a hang. Now it counts `min(assets loaded,
animation progress)`, and the ring launches on the exact frame it reads 100.
The number landing and the ring moving are the same event.

**A word that isn't changing shouldn't melt.** Two projects from the same year
shouldn't have "2025" dissolve into itself. Holding it still isn't enough
though. The alpha threshold has to span both layers to fuse them, so anything
inside it gets thresholded whether it's moving or not, and a held word
visibly thickens for the length of the morph. It needed a third copy living
outside the filter entirely.

## Where it stops

The idea works but it isn't finished.

- Clicking a card opens it: the card swells into a frame and a page builds
  itself around it, with two more images and the next project. It's an
  overlay with no URL, so the back button doesn't know it happened.
- No reduced-motion path and no keyboard control.
- The images are placeholders and they aren't mine. See
  [About the artwork](README.md#about-the-artwork).

How the code is arranged is in [AGENTS.md](AGENTS.md). Setup and tuning are in
[README.md](README.md).
