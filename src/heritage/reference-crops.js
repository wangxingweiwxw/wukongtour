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

// Standalone references fill a window with their own aspect ratio, keeping the
// complete building in view instead of forcing wide or tall photos into 4:3.
export const REFERENCE_SIZES = {
  '/references/yungang-wall.jpg': [1200, 911],
  '/references/dule.jpg': [2000, 1333],
  '/references/kaiyuan.png': [1000, 578],
  '/references/foguang.jpg': [1024, 691],
  '/references/shuilu.jpg': [1080, 957],
  '/references/xiaoxitian.png': [756, 420],
  '/references/ai/xuankong-2.png': [1536, 1024],
  '/references/ai/xuankong-3.png': [1536, 1024],
  '/references/ai/yingxian-2.png': [1536, 1024],
  '/references/ai/yingxian-3.png': [1536, 1024],
  '/references/ai/dule-2.png': [1536, 1024],
  '/references/ai/dule-3.png': [1536, 1024],
  '/references/ai/foguang-2.png': [1536, 1024],
  '/references/ai/foguang-3.png': [1536, 1024],
  '/references/ai/xiaoxitian-2.png': [1536, 1024],
  '/references/ai/xiaoxitian-3.png': [1536, 1024],
  '/references/ai/shuilu-2.png': [1536, 1024],
  '/references/ai/shuilu-3.png': [1536, 1024],
  '/references/ai/kaiyuan-1.png': [1536, 1024],
  '/references/ai/kaiyuan-2.png': [1536, 1024],
  '/references/ai/kaiyuan-3.png': [1536, 1024],
};

export function setReferenceImage(viewport, image, source, description) {
  const crop = REFERENCE_CROPS[source];
  const size = REFERENCE_SIZES[source];
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
  } else if (size) {
    viewport.style.aspectRatio = `${size[0]} / ${size[1]}`;
  }
  image.alt = description;
  image.src = source;
}
