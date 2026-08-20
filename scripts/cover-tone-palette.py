"""Deterministically derive a dark export palette from decoded local cover bytes.

This is an offline authoring/validation helper. The browser receives only the
approved, compact palette values and never samples an image through the DOM or
a canvas.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path

from PIL import Image


PALETTE_KEYS = (
    "background",
    "surface",
    "border",
    "text",
    "mutedText",
    "yearBackground",
    "yearBorder",
    "yearText",
)


def derive_cover_tone_palette(file_bytes: bytes) -> dict[str, str]:
    """Return the fixed v1 RGBA palette for one local cover file's bytes."""

    with Image.open(io.BytesIO(file_bytes)) as image:
        # A fixed 24x24 BOX resample keeps this bounded and independent of the
        # source dimensions while still using only the decoded local file bytes.
        resized = image.convert("RGB").resize((24, 24), Image.Resampling.BOX)
        pixels = list(resized.get_flattened_data())

    average = tuple(sum(pixel[index] for pixel in pixels) // len(pixels) for index in range(3))
    accent = max(
        pixels,
        key=lambda pixel: (
            (max(pixel) - min(pixel)) * 512 + max(pixel),
            pixel[0],
            pixel[1],
            pixel[2],
        ),
    )
    background = mix(average, (5, 9, 18), 2, 10)
    surface = mix(average, (12, 20, 36), 3, 10)
    border = mix(accent, (255, 255, 255), 7, 10)
    text = mix(accent, (255, 255, 255), 2, 10)
    muted_text = mix(accent, (221, 234, 255), 4, 10)
    # Keep the year label opaque and near the dark base so its intentionally
    # bright text has a deterministic, WCAG-readable contrast relationship.
    year_background = mix(background, (255, 255, 255), 9, 10)

    return {
        "background": rgba(background),
        "surface": rgba(surface),
        "border": rgba(border),
        "text": rgba(text),
        "mutedText": rgba(muted_text),
        "yearBackground": rgba(year_background),
        "yearBorder": rgba(border, "0.88"),
        "yearText": rgba(text),
    }


def mix(
    cover_color: tuple[int, int, int],
    fixed_color: tuple[int, int, int],
    cover_weight: int,
    total_weight: int,
) -> tuple[int, int, int]:
    return tuple(
        (cover_color[index] * cover_weight
        + fixed_color[index] * (total_weight - cover_weight)
        + total_weight // 2)
        // total_weight
        for index in range(3)
    )


def rgba(color: tuple[int, int, int], alpha: str = "1") -> str:
    return f"rgba({color[0]}, {color[1]}, {color[2]}, {alpha})"


def readability_checks(palette: dict[str, str]) -> dict[str, float]:
    """Return deterministic contrast ratios for the template's text surfaces."""

    return {
        "text/background": contrast_ratio(palette["text"], palette["background"]),
        "text/surface": contrast_ratio(palette["text"], palette["surface"]),
        "yearText/yearBackground": contrast_ratio(
            palette["yearText"], palette["yearBackground"]
        ),
    }


def contrast_ratio(foreground: str, background: str) -> float:
    foreground_luminance = relative_luminance(parse_rgba(foreground))
    background_luminance = relative_luminance(parse_rgba(background))
    lighter, darker = sorted((foreground_luminance, background_luminance), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def parse_rgba(value: str) -> tuple[int, int, int]:
    prefix = "rgba("
    if not value.startswith(prefix) or not value.endswith(")"):
        raise ValueError(f"Unsupported RGBA value: {value}")
    channels = [channel.strip() for channel in value[len(prefix) : -1].split(",")]
    if len(channels) != 4 or channels[3] != "1":
        raise ValueError(f"Expected opaque RGBA value: {value}")
    red, green, blue = (int(channel) for channel in channels[:3])
    if any(channel < 0 or channel > 255 for channel in (red, green, blue)):
        raise ValueError(f"Out-of-range RGB channel: {value}")
    return red, green, blue


def relative_luminance(color: tuple[int, int, int]) -> float:
    def linear(channel: int) -> float:
        normalized = channel / 255
        return normalized / 12.92 if normalized <= 0.04045 else ((normalized + 0.055) / 1.055) ** 2.4

    red, green, blue = (linear(channel) for channel in color)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def describe_file(path: Path) -> dict[str, object]:
    file_bytes = path.read_bytes()
    return {
        "sha256": hashlib.sha256(file_bytes).hexdigest(),
        "palette": derive_cover_tone_palette(file_bytes),
    }


if __name__ == "__main__":
    for raw_path in sys.argv[1:]:
        print(json.dumps(describe_file(Path(raw_path)), ensure_ascii=False, sort_keys=True))
