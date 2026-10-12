import * as THREE from "three";

// The sheet, in css px: wide enough for a longer word.
const SHEET_W = 160;
const SHEET_H = 40;

/**
 * The word cut out of the cursor's bead when it opens into a pill over a
 * card, on a small sheet the ring's shader reads at the pointer: where a
 * glyph is, the pill shows the picture under it instead of its honey.
 *
 * Set in caps, tracked, in the heaviest cut the page has (the name face's
 * Medium), because a cut-out letter is read by the picture inside it and a
 * hairline stroke holds too little of it. Only the green channel is used.
 * `width` is the set word's width in css px, which the pill is sized from.
 */
export function createBeadWord(params, uniforms) {
  let tex = null;
  let width = 0;

  const build = () => {
    const word = String(params.tagText).toUpperCase();
    // Above display resolution: small type over busy artwork.
    const dpr = Math.min(window.devicePixelRatio, 2) * 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(SHEET_W * dpr);
    canvas.height = Math.ceil(SHEET_H * dpr);

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.font = `500 ${params.wordSize}px "${params.nameFont}", ui-sans-serif, system-ui, sans-serif`;
    const track = params.wordSize * 0.1;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${track}px`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Tracking trails the last letter too, so centring leaves the word half a
    // space left of the pointer; put it back, and leave it out of the width.
    width = ctx.measureText(word).width - track;
    ctx.fillStyle = "#0f0";
    ctx.fillText(word, SHEET_W * 0.5 + track * 0.5, SHEET_H * 0.5);

    tex?.dispose();
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    uniforms.uBeadTex.value = tex;
    const lp = uniforms.uBeadLP.value;
    lp.set(SHEET_W * 0.5, SHEET_H * 0.5, lp.z, lp.w);
  };

  const dispose = () => tex?.dispose();

  return {
    build,
    dispose,
    get width() {
      return width;
    },
  };
}
