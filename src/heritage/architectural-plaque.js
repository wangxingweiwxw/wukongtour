import * as THREE from 'three';

// Local canvas lettering avoids a font/CDN request for every scene. Chinese
// system fonts cover Windows, macOS/iOS and Android; the serif fallback also
// permits the browser to select its installed CJK font.
const FONT = '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif CJK SC", "Songti SC", "SimSun", serif';

export function addPlaqueFace(parent, {text, position, width, height, rotation = 0}) {
  let texture = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.height = 256;
    canvas.width = Math.ceil(canvas.height * width / height);
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#283c38';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#bb9958';
    ctx.lineWidth = 7;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.lineWidth = 2;
    ctx.strokeRect(17, 17, w - 34, h - 34);
    const glyphs = Array.from(text);
    const size = Math.min(h * .72, (w - 64) / (glyphs.length * 1.2));
    ctx.font = `600 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4d48b';
    const advance = Math.min(size * 1.32, (w - 64 - size) / Math.max(1, glyphs.length - 1));
    glyphs.forEach((glyph, i) => ctx.fillText(glyph,
      w / 2 + (i - (glyphs.length - 1) / 2) * advance, h * .53));
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  }
  // A separate, outward-facing plane preserves lettering on the rear facade
  // without mirroring it. Its supplied position sits just ahead of the board.
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({map:texture, color:texture ? '#ffffff' : '#283c38', toneMapped:false}));
  face.name = `plaque-${text}`;
  face.userData.plaqueText = text;
  face.position.fromArray(position);
  face.rotation.y = rotation;
  parent.add(face);
  return face;
}
