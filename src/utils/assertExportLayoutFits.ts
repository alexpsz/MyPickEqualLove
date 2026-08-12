const BOUNDARY_SELECTOR = "[data-export-boundary]";
const PIXEL_TOLERANCE = 1;

export function assertExportLayoutFits(exportElement: HTMLElement) {
  const rootRect = exportElement.getBoundingClientRect();
  if (rootRect.width <= 0 || rootRect.height <= 0) {
    throw new Error("Export layout has no measurable canvas bounds");
  }

  if (
    exportElement.scrollWidth > exportElement.clientWidth + PIXEL_TOLERANCE ||
    exportElement.scrollHeight > exportElement.clientHeight + PIXEL_TOLERANCE
  ) {
    throw new Error("Export layout overflows the configured canvas");
  }

  exportElement
    .querySelectorAll<HTMLElement>(BOUNDARY_SELECTOR)
    .forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (
        element.scrollWidth > element.clientWidth + PIXEL_TOLERANCE ||
        element.scrollHeight > element.clientHeight + PIXEL_TOLERANCE
      ) {
        throw new Error(
          `Export boundary ${element.dataset.exportBoundary ?? "unknown"} overflows its box: scroll ${element.scrollWidth}x${element.scrollHeight}, client ${element.clientWidth}x${element.clientHeight}`,
        );
      }
      if (
        rect.left < rootRect.left - PIXEL_TOLERANCE ||
        rect.top < rootRect.top - PIXEL_TOLERANCE ||
        rect.right > rootRect.right + PIXEL_TOLERANCE ||
        rect.bottom > rootRect.bottom + PIXEL_TOLERANCE
      ) {
        throw new Error(
          `Export boundary ${element.dataset.exportBoundary ?? "unknown"} is clipped`,
        );
      }
    });
}
