const YEAR_TAG_SELECTOR = "[data-export-year-tag]";
const COLOR_DISTANCE_THRESHOLD = 24;

export function centerExportYearInk(
  canvas: HTMLCanvasElement,
  exportElement: HTMLElement,
) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const rootRect = exportElement.getBoundingClientRect();

  if (!context || rootRect.width <= 0 || rootRect.height <= 0) {
    return;
  }

  const scaleX = canvas.width / rootRect.width;
  const scaleY = canvas.height / rootRect.height;

  exportElement
    .querySelectorAll<HTMLElement>(YEAR_TAG_SELECTOR)
    .forEach((tag) => {
      const tagRect = tag.getBoundingClientRect();
      const tagX = Math.round((tagRect.left - rootRect.left) * scaleX);
      const tagY = Math.round((tagRect.top - rootRect.top) * scaleY);
      const tagWidth = Math.round(tagRect.width * scaleX);
      const tagHeight = Math.round(tagRect.height * scaleY);
      const borderX = Math.max(1, Math.round(scaleX));
      const borderY = Math.max(1, Math.round(scaleY));
      const contentX = tagX + borderX;
      const contentY = tagY + borderY;
      const contentWidth = tagWidth - borderX * 2;
      const contentHeight = tagHeight - borderY * 2;

      if (contentWidth <= 0 || contentHeight <= 0) {
        return;
      }

      const pixels = context.getImageData(
        contentX,
        contentY,
        contentWidth,
        contentHeight,
      );
      const background = findMostCommonColor(pixels.data);
      const detectionInset = Math.max(
        1,
        Math.round(Math.min(scaleX, scaleY) / 2),
      );
      let inkTop = contentHeight;
      let inkBottom = -1;

      for (let y = detectionInset; y < contentHeight - detectionInset; y += 1) {
        for (
          let x = detectionInset;
          x < contentWidth - detectionInset;
          x += 1
        ) {
          const index = (y * contentWidth + x) * 4;
          if (isForegroundPixel(pixels.data, index, background)) {
            inkTop = Math.min(inkTop, y);
            inkBottom = Math.max(inkBottom, y);
          }
        }
      }

      if (inkBottom < inkTop) {
        return;
      }

      const contentCenter = (contentHeight - 1) / 2;
      const inkCenter = (inkTop + inkBottom) / 2;
      const shiftY = Math.round(contentCenter - inkCenter);

      if (shiftY === 0) {
        return;
      }

      const scratch = document.createElement("canvas");
      scratch.width = contentWidth;
      scratch.height = contentHeight;
      scratch.getContext("2d")?.putImageData(pixels, 0, 0);

      context.save();
      // html2canvas can leave its scale transform active; all coordinates here are already in output pixels.
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.beginPath();
      context.rect(contentX, contentY, contentWidth, contentHeight);
      context.clip();
      context.fillStyle =
        window.getComputedStyle(tag).backgroundColor || "#fff";
      context.fillRect(contentX, contentY, contentWidth, contentHeight);
      context.drawImage(scratch, contentX, contentY + shiftY);
      context.restore();
    });
}

function findMostCommonColor(pixels: Uint8ClampedArray) {
  const counts = new Map<string, number>();
  let mostCommon = "255,255,255,255";
  let highestCount = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const key = `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > highestCount) {
      mostCommon = key;
      highestCount = count;
    }
  }

  return mostCommon.split(",").map(Number);
}

function isForegroundPixel(
  pixels: Uint8ClampedArray,
  index: number,
  background: number[],
) {
  return (
    Math.max(
      Math.abs(pixels[index] - background[0]),
      Math.abs(pixels[index + 1] - background[1]),
      Math.abs(pixels[index + 2] - background[2]),
      Math.abs(pixels[index + 3] - background[3]),
    ) > COLOR_DISTANCE_THRESHOLD
  );
}
