import * as THREE from "three";
import { textVertexShader, textFragmentShader } from "../shaders/textShaders";

/**
 * The intro heading, one glyph per quad. In the scene rather than the DOM so
 * the planes sweep over it as the ring spins — text draws first, planes draw
 * on top. Each quad is a mask its glyph wipes up through.
 *
 * `chars` are the reveal uniforms and `fades` the opacity ones; the entry
 * timeline tweens both as arrays.
 */
export function createSplitText(group, params) {
  let chars = [];
  let fades = [];

  const dispose = () => {
    for (const child of [...group.children]) {
      group.remove(child);
      child.geometry.dispose();
      child.material.uniforms.uTex.value?.dispose();
      child.material.dispose();
    }
    chars = [];
    fades = [];
  };

  const build = () => {
    dispose();

    const size = params.textSize;
    // Above display resolution — type is the first thing to show softness and
    // these canvases are tiny.
    const dpr = Math.min(window.devicePixelRatio, 2) * 2;
    const font = `${params.textWeight} ${size}px "${params.textFont}", "${params.textFallback}", ui-sans-serif, system-ui, sans-serif`;

    const measure = document.createElement("canvas").getContext("2d");
    measure.font = font;

    const glyphs = [...params.text];
    const advances = glyphs.map((ch) => measure.measureText(ch).width);
    const tracking = params.textTracking * size;
    const totalW =
      advances.reduce((a, b) => a + b, 0) + tracking * (glyphs.length - 1);

    // Padding gives overhanging glyphs room and lengthens the wipe a little.
    const pad = size * 0.25;
    const cellH = size * 1.3 + pad * 2;

    let x = -totalW / 2;

    glyphs.forEach((ch, i) => {
      const adv = advances[i];
      if (ch.trim()) {
        const cellW = adv + pad * 2;

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(cellW * dpr));
        canvas.height = Math.max(1, Math.ceil(cellH * dpr));
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        ctx.font = font;
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#000";
        ctx.fillText(ch, pad, pad + size); // puts cap-height centre on y = 0

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.NoColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;

        const mat = new THREE.ShaderMaterial({
          vertexShader: textVertexShader,
          fragmentShader: textFragmentShader,
          uniforms: {
            uTex: { value: tex },
            uReveal: { value: 0 },
            // As authored: the shader writes it straight through, and a
            // linearised ink drew the heading darker than the CSS's.
            uColor: {
              value: new THREE.Color().setStyle(
                params.ink,
                THREE.LinearSRGBColorSpace,
              ),
            },
            uOpacity: { value: 1 },
          },
          transparent: true,
          depthTest: false,
          depthWrite: false,
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        mesh.scale.set(cellW, cellH, 1);
        // Cell is the advance box plus symmetric padding, so centring on the
        // advance keeps the run correctly spaced.
        mesh.position.set(x + adv / 2, 0, 0);
        mesh.renderOrder = 0;
        group.add(mesh);
        chars.push(mat.uniforms.uReveal);
        fades.push(mat.uniforms.uOpacity);
      }
      x += adv + tracking;
    });
  };

  return {
    build,
    dispose,
    get chars() {
      return chars;
    },
    get fades() {
      return fades;
    },
  };
}
