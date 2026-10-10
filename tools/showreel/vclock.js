// Injected before any page script. Freezes the page's sense of time and hands
// the clock to the recorder, so every captured frame is exactly 1/fps apart no
// matter how long the software renderer takes to draw it.
(() => {
  const W = window;
  const realPerfNow = performance.now.bind(performance);
  const realDateNow = Date.now.bind(Date);
  const realRAF = W.requestAnimationFrame.bind(W);

  const perfBase = realPerfNow();
  const dateBase = realDateNow();
  let vt = 0;

  performance.now = () => perfBase + vt;
  Date.now = () => Math.floor(dateBase + vt);

  let nextId = 0;
  let queue = new Map();
  W.requestAnimationFrame = (cb) => {
    const id = ++nextId;
    queue.set(id, cb);
    return id;
  };
  W.cancelAnimationFrame = (id) => {
    queue.delete(id);
  };

  // Keep the last frame on the drawing buffer, so a screenshot can never catch
  // the canvas between a present and the next draw.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (
      type === "webgl" ||
      type === "webgl2" ||
      type === "experimental-webgl"
    ) {
      attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
    }
    return getContext.call(this, type, attrs);
  };

  // Count images as they land, so the recorder can wait for the whole atlas
  // before it starts the clock.
  let imagesLoaded = 0;
  const NativeImage = W.Image;
  W.Image = function (...args) {
    const img = new NativeImage(...args);
    img.addEventListener("load", () => imagesLoaded++);
    img.addEventListener("error", () => imagesLoaded++);
    return img;
  };
  W.Image.prototype = NativeImage.prototype;

  const events = {
    pointermove: 0,
    pointerdown: 0,
    pointerup: 0,
    wheel: 0,
    click: 0,
    wheelSum: 0,
  };
  for (const t of [
    "pointermove",
    "pointerdown",
    "pointerup",
    "wheel",
    "click",
  ]) {
    W.addEventListener(
      t,
      (e) => {
        events[t]++;
        if (t === "wheel") events.wheelSum += e.deltaY;
      },
      { capture: true, passive: true },
    );
  }

  W.__vt = {
    step(ms) {
      vt += ms;
      const q = queue;
      queue = new Map();
      const ts = perfBase + vt;
      for (const cb of q.values()) {
        try {
          cb(ts);
        } catch (err) {
          console.error("[vt] rAF callback threw", err && err.stack);
        }
      }
      return q.size;
    },
    now: () => vt,
    pending: () => queue.size,
    images: () => imagesLoaded,
    events,
    // Two real frames, so rAF-aligned input has been dispatched to the page.
    settle: () => new Promise((r) => realRAF(() => realRAF(r))),
  };
})();
