import * as THREE from "three";
import { IMAGE_FILES } from "./projects";

// Cell aspect matches the plane's 1.5 : 1 so nothing is distorted.
const CELL_MIN = 512;
const CELL_MAX = 1024;
// The width of the copies in public/sm.
const SM_W = 768;

// How wide a cell has to be for the front card to be sampled at or above
// display resolution: the widest share of the viewport the front card takes
// — ~40% in a wide or tablet band, more on a phone — times the device pixel
// ratio bounds the pixels it is drawn with. A fixed 512 was being stretched 1.6x on a 2x laptop, which
// made the one picture the viewer is actually looking at the soft one. Capped
// at 1024: the sheet is uploaded whole, and 18 cells at that size is already
// ~55 MB of texture.
function cellWidth(maxSize, cols, share) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const need = Math.round(window.innerWidth * share * dpr);
  const cell = Math.min(CELL_MAX, Math.max(CELL_MIN, need));
  // Never past what the GPU will take, or the upload fails silently.
  return Math.min(cell, Math.floor(maxSize / cols));
}

export const loadImage = (src, priority) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    // Must be set before src or the request is already away.
    if (priority) img.fetchPriority = priority;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });

/**
 * Packs every image into one texture. A single atlas rather than one texture
 * per plane because ESSL 1.00 cannot index an array of samplers with a
 * non-constant index.
 *
 * Returns synchronously with the sheet blank and filling in as images arrive:
 * the caller needs something to bind on frame one, and the entry shows cell 0
 * while the rest are still coming.
 *
 * `first` settles once cell 0 is on the texture, `ready` once all of them are.
 * Neither rejects — a missing file leaves its cell blank and still counts as
 * settled, so one bad path cannot strand the entry.
 */
export function buildAtlas(
  files = IMAGE_FILES,
  onProgress,
  maxSize = 4096,
  onColor,
  share = 0.4,
) {
  const cols = Math.ceil(Math.sqrt(files.length));
  const rows = Math.ceil(files.length / cols);
  const CELL_W = cellWidth(maxSize, cols, share);
  const CELL_H = Math.round(CELL_W / 1.5);

  const canvas = document.createElement("canvas");
  canvas.width = cols * CELL_W;
  canvas.height = rows * CELL_H;
  const ctx = canvas.getContext("2d");

  const texture = new THREE.CanvasTexture(canvas);
  // The shader flips each cell itself, so leave the sheet as drawn.
  texture.flipY = false;
  // NoColorSpace deliberately: this shader writes straight to the framebuffer
  // with no encoding step, and decoding on read without encoding on write is
  // what washes everything out.
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  // The room is lit by the front card, so each picture's average colour is
  // read as it lands: an 8x8 downsample, which is sixty-four pixels of it.
  const probe = document.createElement("canvas");
  probe.width = probe.height = 8;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  const average = (img) => {
    pctx.drawImage(img, 0, 0, 8, 8);
    const d = pctx.getImageData(0, 0, 8, 8).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let k = 0; k < d.length; k += 4) {
      r += d[k];
      g += d[k + 1];
      b += d[k + 2];
    }
    const n = d.length / 4;
    return [r / n, g / n, b / n];
  };

  const paint = (img, i) => {
    const x = (i % cols) * CELL_W;
    const y = Math.floor(i / cols) * CELL_H;

    // Cover fit: fill the cell, crop the overflow, never squash.
    const scale = Math.max(CELL_W / img.width, CELL_H / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, CELL_W, CELL_H); // clip, or an oversized image bleeds
    ctx.clip();
    ctx.drawImage(img, x + (CELL_W - dw) / 2, y + (CELL_H - dh) / 2, dw, dh);
    ctx.restore();
    onColor?.(i, average(img));
  };

  let settled = 0;
  const tick = () => onProgress?.(settled / files.length);

  // Cells no wider than the half-size copies in /sm read those instead: a
  // phone or tablet draws its front card from at most ~620 px, and the full
  // set is three times the bytes for the entry to wait on.
  const dir = CELL_W <= SM_W ? "/sm/" : "/";
  const fetchInto = (i, priority) =>
    loadImage(`${dir}${files[i]}`, priority)
      .then((img) => paint(img, i))
      .catch((err) => console.warn("[atlas]", err.message))
      .finally(() => {
        settled++;
        tick();
      });

  // Cell 0 is the seed's art, the only thing on screen during the hold, so it
  // is asked for ahead of the rest and uploaded the moment it lands.
  const first = fetchInto(0, "high").then(() => {
    texture.needsUpdate = true;
  });

  // One upload at the end for everything else. Marking dirty per image would
  // re-send the whole sheet eighteen times for cells nobody is looking at yet.
  const ready = Promise.all([
    first,
    ...files.slice(1).map((_, k) => fetchInto(k + 1, "low")),
  ]).then(() => {
    texture.needsUpdate = true;
  });

  tick();
  return { texture, grid: [cols, rows], count: files.length, first, ready };
}
