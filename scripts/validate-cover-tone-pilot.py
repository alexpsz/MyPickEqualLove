"""Validate the compact, deterministic cover-tone pilot manifest."""

from __future__ import annotations

import hashlib
import json
import runpy
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "src" / "data" / "cover-tone-pilot.json"
PROJECT_IDS = ("equal-love", "nearly-equal-joy", "not-equal-me")
MINIMUM_TEXT_CONTRAST = 4.5

palette_helper = runpy.run_path(str(ROOT / "scripts" / "cover-tone-palette.py"))
PALETTE_KEYS = tuple(palette_helper["PALETTE_KEYS"])
derive_cover_tone_palette = palette_helper["derive_cover_tone_palette"]
readability_checks = palette_helper["readability_checks"]


def fail(message: str) -> None:
    raise ValueError(message)


def source_entries() -> list[tuple[str, str, str]]:
    entries: list[tuple[str, str, str]] = []
    for project_id in PROJECT_IDS:
        songs_path = ROOT / "src" / "projects" / project_id / "songs.json"
        songs = json.loads(songs_path.read_text(encoding="utf-8"))
        for song in songs[:3]:
            entries.append((project_id, song["id"], song["coverUrl"]))
    return entries


def validate() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        fail("Manifest must be an object")
    if set(manifest) != {"algorithmVersion", "entries"}:
        fail("Manifest keys must be exactly algorithmVersion and entries")
    if manifest["algorithmVersion"] != 1:
        fail("Unsupported cover-tone algorithm version")

    entries = manifest["entries"]
    if not isinstance(entries, list) or len(entries) != 9:
        fail("Pilot must contain exactly nine entries")

    expected_entries = source_entries()
    if not all(isinstance(entry, dict) for entry in entries):
        fail("Every pilot entry must be an object")
    actual_entries = [
        (entry.get("projectId"), entry.get("songId"), entry.get("coverUrl"))
        for entry in entries
    ]
    if actual_entries != expected_entries:
        fail("Pilot entries must exactly match each project's first three source songs")

    for expected_project_id in PROJECT_IDS:
        if sum(entry[0] == expected_project_id for entry in actual_entries) != 3:
            fail(f"Pilot must contain exactly three entries for {expected_project_id}")

    seen = set()
    for entry in entries:
        if set(entry) != {"projectId", "songId", "coverUrl", "sha256", "palette"}:
            fail(f"Unexpected entry shape for {entry!r}")
        if not all(
            isinstance(entry[field], str)
            for field in ("projectId", "songId", "coverUrl", "sha256")
        ):
            fail(f"Expected string identifiers for {entry!r}")
        key = (entry["projectId"], entry["songId"])
        if key in seen:
            fail(f"Duplicate pilot entry {key}")
        seen.add(key)

        cover_path = ROOT / "public" / entry["coverUrl"].lstrip("/")
        if not cover_path.is_file():
            fail(f"Missing local cover {cover_path}")
        file_bytes = cover_path.read_bytes()
        actual_hash = hashlib.sha256(file_bytes).hexdigest()
        if entry["sha256"] != actual_hash:
            fail(f"SHA-256 mismatch for {entry['projectId']}/{entry['songId']}")

        palette = entry["palette"]
        if not isinstance(palette, dict):
            fail(f"Palette must be an object for {entry['projectId']}/{entry['songId']}")
        if set(palette) != set(PALETTE_KEYS):
            fail(f"Unexpected palette keys for {entry['projectId']}/{entry['songId']}")
        recomputed_palette = derive_cover_tone_palette(file_bytes)
        if palette != recomputed_palette:
            fail(f"Palette mismatch for {entry['projectId']}/{entry['songId']}")

        for label, ratio in readability_checks(palette).items():
            if ratio < MINIMUM_TEXT_CONTRAST:
                fail(
                    f"Insufficient {label} contrast for {entry['projectId']}/{entry['songId']}: "
                    f"{ratio:.2f}:1 < {MINIMUM_TEXT_CONTRAST}:1"
                )

    print("cover-tone pilot valid: 9 entries / 3 projects / text contrast >= 4.5:1")


if __name__ == "__main__":
    try:
        validate()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"cover-tone pilot invalid: {error}", file=sys.stderr)
        sys.exit(1)
