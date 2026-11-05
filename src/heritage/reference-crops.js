// Pixel windows in the supplied 1179 × 2556 composites. Keep the game panel,
// excluding the phone UI, carousel counter, captions and real-world photograph.
// The original files stay intact; both image views use this same clipping window.
export const REFERENCE_CROPS = {
  '/references/shisi.jpg': [2, 347, 1044, 748],
  '/references/shisi-court.jpg': [2, 347, 1044, 782],
  '/references/shisi-wall.jpg': [2, 347, 1044, 782],
  '/references/yungang.jpg': [2, 347, 1175, 782],
  '/references/niches.jpg': [2, 347, 1044, 782],
  '/references/xuankong.jpg': [2, 347, 1044, 782],
  '/references/yingxian.jpg': [2, 347, 1044, 782],
};

export function setReferenceImage(viewport, image, source, description) {
  const crop = REFERENCE_CROPS[source];
  viewport.classList.toggle('is-cropped', Boolean(crop));
  viewport.style.removeProperty('aspect-ratio');
  image.removeAttribute('style');
  if (crop) {
    const [x, y, width, height] = crop;
    viewport.style.aspectRatio = `${width} / ${height}`;
    Object.assign(image.style, {
      width: `${1179 / width * 100}%`, height: `${2556 / height * 100}%`,
      left: `${-x / width * 100}%`, top: `${-y / height * 100}%`,
    });
  }
  image.alt = description;
  image.src = source;
}
