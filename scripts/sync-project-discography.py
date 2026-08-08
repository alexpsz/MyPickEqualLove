#!/usr/bin/env python3
"""Sync project song/member metadata from public discography and lyrics sources."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
import subprocess
import sys
import time
import unicodedata
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    import pykakasi
except ImportError as exc:  # pragma: no cover - environment helper
    raise SystemExit(
        "pykakasi is required for romaji generation. "
        "Install it with: python3 -m pip install --user pykakasi",
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
UTANET_BASE = "https://www.uta-net.com"
PROJECT_IDS = ("equal-love", "nearly-equal-joy", "not-equal-me")
JAPAN_TIMEZONE = timezone(timedelta(hours=9), name="JST")
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
    ),
}

SESSION = requests.Session()
SESSION.headers.update(UA)
SESSION.mount(
    "https://",
    HTTPAdapter(
        max_retries=Retry(
            total=3,
            connect=3,
            read=3,
            status=3,
            backoff_factor=0.8,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET"}),
        ),
    ),
)

COMMON_TITLE_ALIASES = {
    "Want  you!Want  you!": "Want you!Want you!",
    "Want  you! Want  you!": "Want you!Want you!",
    "届いてLOVE YOU♡": "届いてLOVE YOU",
    "現役アイドルちゅ~": "現役アイドルちゅ～",
    "ナツマトぺ": "ナツマトペ",
    "/7": "24/7",
    "アマガミガール feat.DJ ALICE": "アマガミガール feat. DJ ALICE",
}

COMMON_RELEASE_TITLE_ALIASES = {
    "青春”サブリミナル”": "青春“サブリミナル”",
}

DEFAULT_EXCLUDED_TITLE_FRAGMENTS = (
    "Music Video",
    "Making",
    "メイキング",
    "off vocal",
    "Instrumental",
    "イコノイジョイ",
    "社員旅行",
    "TV ver",
    "タイトル未定",
    "後日発表",
)

PROJECT_GROUP_ALIASES = {
    "equal-love": ("=LOVE", "＝LOVE", "イコラブ"),
    "nearly-equal-joy": ("≒JOY", "ニアジョイ"),
    "not-equal-me": ("≠ME", "ノイミー"),
}
SHARED_GROUP_ALIASES = ("イコノイジョイ",)
PENDING_OWNERSHIP_EVIDENCE = {
    "verified-credits",
    "verified-artist",
    "explicit-current-group",
    "official-title-track",
    "official-multi-edition",
}
TRUSTED_COVER_HOSTS = {
    "s3-aop.plusmember.jp",
    "i.ytimg.com",
    "img.youtube.com",
    "m.media-amazon.com",
}

ANNOUNCED_SOURCE_NOTE = (
    "公式ディスコグラフィーで曲名・収録作品・ジャケットが公開済み。"
    "作詞・作曲・編曲クレジットは公開待ち。"
)
ANNOUNCED_CREDITS_VERIFIED_SOURCE_NOTE = (
    "公式ディスコグラフィーで曲名・収録作品・ジャケットが公開済み。"
    "作詞・作曲・編曲クレジットも確認済み。"
)
CREDITS_PENDING_SOURCE_NOTE = (
    "公式ディスコグラフィーで曲名・収録作品・ジャケットを確認済み。"
    "作詞・作曲・編曲クレジットは公開元の復旧または公開待ち。"
)
UNKNOWN_METADATA_MARKERS = ("タイトル未定", "後日発表", "TBD")

kakasi = pykakasi.kakasi()


def current_catalog_date() -> date:
    return datetime.now(JAPAN_TIMEZONE).date()


@dataclass
class GraduatedMemberOverride:
    id: str
    name: str
    romaji: str
    graduation_date: str
    color: str | None = None
    color_name: str | None = None
    profile_url: str | None = None


@dataclass
class ProjectConfig:
    project_id: str
    official_base: str
    group_artist: str
    utanet_artist_id: str
    utanet_artist_path: str
    sister_group_markers: tuple[str, ...]
    minimum_official_songs: int = 1
    profile_path: str = "/feature/profile"
    title_aliases: dict[str, str] = field(default_factory=dict)
    release_title_aliases: dict[str, str] = field(default_factory=dict)
    credit_overrides: dict[str, dict[str, str]] = field(default_factory=dict)
    special_tracks: list[dict] = field(default_factory=list)
    graduated_members: list[GraduatedMemberOverride] = field(default_factory=list)
    group_member_overrides: dict[str, list[str]] = field(default_factory=dict)
    member_color_overrides: dict[str, dict[str, object]] = field(default_factory=dict)
    clear_member_color_arrays: bool = False
    legacy_incomplete_release_paths: tuple[str, ...] = ()

    @property
    def songs_path(self) -> Path:
        return ROOT / f"src/projects/{self.project_id}/songs.json"

    @property
    def members_path(self) -> Path:
        return ROOT / f"src/projects/{self.project_id}/members.json"

    @property
    def covers_dir(self) -> Path:
        return ROOT / f"public/covers/{self.project_id}"

    @property
    def excluded_title_pattern(self) -> re.Pattern[str]:
        fragments = [*DEFAULT_EXCLUDED_TITLE_FRAGMENTS]
        return re.compile("|".join(re.escape(fragment) for fragment in fragments), re.IGNORECASE)


def normalize(value: str | None) -> str:
    return unicodedata.normalize("NFKC", value or "").replace("\xa0", " ").strip()


def unwrap_quotes(value: str) -> str:
    text = normalize(value)
    changed = True
    while changed:
        changed = False
        for left, right in (("「", "」"), ("『", "』"), ("“", "”"), ('"', '"')):
            if text.startswith(left) and text.endswith(right):
                text = text[1:-1].strip()
                changed = True
    return text


def clean_title(value: str, config: ProjectConfig) -> str:
    text = normalize(value).replace("！", "!").replace("？", "?")
    text = re.sub(r"\s*-?\s*Instrumental\s*-?$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*off vocal ver\.\s*$", "", text, flags=re.IGNORECASE)
    text = unwrap_quotes(text)
    aliases = {**COMMON_TITLE_ALIASES, **config.title_aliases}
    text = aliases.get(text, text)
    text = re.sub(rf"\s*\({re.escape(config.group_artist)}\)\s*$", "", text).strip()
    return aliases.get(text, text)


def clean_release_title(value: str, config: ProjectConfig) -> str:
    text = normalize(value).replace("！", "!").replace("？", "?")
    for source, replacement in {
        **COMMON_RELEASE_TITLE_ALIASES,
        **config.release_title_aliases,
    }.items():
        text = text.replace(source, replacement)
    return text


def title_key(value: str, config: ProjectConfig) -> str:
    text = clean_title(value, config).replace("”", '"').replace("“", '"')
    return re.sub(r'[\s・!！?？「」『』"“”.,，、。:：〜~♡]+', "", text).lower()


def project_owners_from_artist(value: str) -> set[str]:
    """Return strict group owners found in an artist/credit field."""
    text = normalize(value)
    if any(alias in text for alias in SHARED_GROUP_ALIASES):
        return {"shared"}

    owners: set[str] = set()
    for project_id, aliases in PROJECT_GROUP_ALIASES.items():
        if any(normalize(alias) in text for alias in aliases):
            owners.add(project_id)
    return owners


def is_trusted_utanet_credit_url(value: str) -> bool:
    parsed = urlparse(normalize(value))
    return (
        parsed.scheme == "https"
        and not parsed.username
        and not parsed.password
        and parsed.port is None
        and parsed.hostname == "www.uta-net.com"
        and parsed.path.startswith("/song/")
    )


def split_explicit_track_owner(raw_title: str) -> tuple[str | None, str]:
    """Extract a trailing parenthetical group marker without guessing substrings."""
    text = normalize(raw_title)
    match = re.search(r"\(\s*([^()]+?)\s*\)\s*$", text)
    if not match:
        return None, text

    marker = normalize(match.group(1))
    if marker in {normalize(alias) for alias in SHARED_GROUP_ALIASES}:
        return "shared", text[: match.start()].strip()
    for project_id, aliases in PROJECT_GROUP_ALIASES.items():
        if marker in {normalize(alias) for alias in aliases}:
            return project_id, text[: match.start()].strip()
    return None, text


def romanize(value: str) -> str:
    text = normalize(value)
    if not text:
        return ""

    pieces = [item["hepburn"] for item in kakasi.convert(text)]
    romaji = " ".join(piece for piece in pieces if piece).strip()
    romaji = re.sub(r"\s+", " ", romaji)
    if not romaji:
        return text

    words = []
    for word in romaji.split(" "):
        if word.isupper() or re.fullmatch(r"[A-Za-z0-9.!?&/+=\-]+", word):
            words.append(word)
        else:
            words.append(word[:1].upper() + word[1:])
    return " ".join(words)


def normalize_romaji(value: str) -> str:
    return " ".join(
        word if word.isupper() else word[:1].upper() + word[1:].lower()
        for word in normalize(value).replace("_", " ").split()
        if word
    )


def slugify(value: str) -> str:
    romaji = romanize(value).lower()
    romaji = (
        romaji.replace("=", "equal")
        .replace("≠", "not-equal")
        .replace("≒", "nearly-equal")
    )
    slug = re.sub(r"[^a-z0-9]+", "-", romaji).strip("-")
    return slug or re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def localized(value: str) -> dict[str, str]:
    return {"ja": normalize(value), "romaji": romanize(value)}


def get_soup(url: str, *, params: dict[str, str | int] | None = None) -> BeautifulSoup:
    response = SESSION.get(url, params=params, timeout=30)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


@dataclass
class ReleaseTrack:
    track_no: int
    title: str
    raw_title: str
    explicit_owner: str | None = None


@dataclass
class Release:
    url: str
    title: str
    release_date: str
    release_type: str
    cover_source_url: str | None
    tracks: list[ReleaseTrack]


def list_official_detail_paths(config: ProjectConfig, kind: int) -> list[str]:
    list_url = f"{config.official_base}/discography/kind/{kind}/"
    first = SESSION.get(list_url, params={"list": "1"}, timeout=30)
    first.raise_for_status()
    match = re.search(r"var maxpage = (\d+)", first.text)
    max_page = int(match.group(1)) if match else 1

    paths: list[str] = []
    for page in range(1, max_page + 1):
        soup = get_soup(list_url, params={"list": "1", "page": page})
        for anchor in soup.select('a[href*="/discography/detail/"]'):
            href = anchor.get("href")
            resolved = urljoin(config.official_base, href or "")
            if (
                href
                and is_same_https_host(resolved, config.official_base)
                and href not in paths
            ):
                paths.append(href)
    return paths


def parse_release_date(text: str) -> str:
    match = re.search(r"(?:RELEASE\s*)?(\d{4}\.\d{2}\.\d{2})(?:\s*RELEASE)?", text)
    return match.group(1).replace(".", "-") if match else ""


def parse_release_type(category: str) -> str:
    category = category.upper()
    if "ALBUM" in category:
        return "album"
    if "SINGLE" in category:
        return "single"
    return "other"


def extract_background_url(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r"url\((['\"]?)(.*?)\1\)", value)
    return match.group(2) if match else None


def parse_release(config: ProjectConfig, path: str) -> Release:
    url = urljoin(config.official_base, path)
    soup = get_soup(url)

    cover_source_url = None
    for image in soup.find_all("img"):
        src = image.get("src") or extract_background_url(image.get("style")) or ""
        if "/contents/discography/" in src:
            cover_source_url = urljoin(config.official_base, src)
            break

    category_el = (
        soup.select_one("p.category")
        or soup.select_one("p.cat1")
        or soup.select_one("p.cat2")
    )
    category = normalize(category_el.get_text(" ", strip=True) if category_el else "")
    title_el = soup.select_one("p.tit") or soup.select_one(".tit")
    release_title = clean_release_title(
        title_el.get_text(" ", strip=True) if title_el else "",
        config,
    )

    text = soup.get_text("\n", strip=True)
    release_date = parse_release_date(text)
    release_type = parse_release_type(category)

    tracks: list[ReleaseTrack] = []
    tracks.extend(parse_track_lists(config, soup))
    if not tracks:
        tracks.extend(parse_nested_track_lists(config, soup))

    release = Release(
        url=url,
        title=release_title,
        release_date=release_date,
        release_type=release_type,
        cover_source_url=cover_source_url,
        tracks=tracks,
    )
    return release


def is_explicit_placeholder_release(release: Release) -> bool:
    title = normalize(release.title).lower()
    return bool(title) and any(
        marker.lower() in title for marker in UNKNOWN_METADATA_MARKERS
    )


def validate_release_contract(
    release: Release,
    *,
    allow_empty_tracks: bool = False,
) -> None:
    """Fail closed when a real official detail page no longer parses fully."""
    if is_explicit_placeholder_release(release):
        print(
            f"Warning: official placeholder release is not ready: {release.url}",
            file=sys.stderr,
        )
        return

    missing: list[str] = []
    if not release.title:
        missing.append("release title")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", release.release_date):
        missing.append("release date")
    if not release.cover_source_url:
        missing.append("cover")
    if not release.tracks and not allow_empty_tracks:
        missing.append("CD tracks")
    if missing:
        raise RuntimeError(
            f"Incomplete official release detail {release.url}: "
            f"missing {', '.join(missing)}",
        )
    if not release.tracks:
        print(
            f"Warning: allowlisted legacy release has no CD tracks: {release.url}",
            file=sys.stderr,
        )


def should_keep_raw_track(config: ProjectConfig, raw_title: str) -> bool:
    if not raw_title:
        return False
    if config.excluded_title_pattern.search(raw_title):
        return False
    if re.search(r"(?<![A-Za-z0-9])MV(?![A-Za-z0-9])", raw_title, re.IGNORECASE):
        return False
    return True


def parse_track_lists(config: ProjectConfig, soup: BeautifulSoup) -> list[ReleaseTrack]:
    tracks: list[ReleaseTrack] = []
    for track_list in soup.select("ol.trackList"):
        disc_type = normalize(
            (track_list.select_one(".discType") or track_list).get_text(" ", strip=True),
        )
        if disc_type not in {"CD", "DISC 1"}:
            continue

        for item in track_list.find_all("li", recursive=False):
            if "discType" in (item.get("class") or []):
                continue
            number_el = item.find("span")
            title_el = item.find("a")
            if not number_el or not title_el:
                continue

            track_no = normalize(number_el.get_text(" ", strip=True))
            raw_title = normalize(title_el.get_text(" ", strip=True))
            if not track_no.isdigit() or not should_keep_raw_track(config, raw_title):
                continue
            explicit_owner, ownerless_title = split_explicit_track_owner(raw_title)

            tracks.append(
                ReleaseTrack(
                    track_no=int(track_no),
                    title=clean_title(ownerless_title, config),
                    raw_title=raw_title,
                    explicit_owner=explicit_owner,
                ),
            )
    return tracks


def parse_nested_track_lists(config: ProjectConfig, soup: BeautifulSoup) -> list[ReleaseTrack]:
    tracks: list[ReleaseTrack] = []
    detail = soup.select_one(".block--disc-detail")
    if not detail:
        return tracks

    for disc_item in detail.select(":scope > ol > li"):
        heading = normalize((disc_item.find("h2") or disc_item).get_text(" ", strip=True))
        if not heading.startswith(("CD", "DISC 1")):
            continue

        nested = disc_item.find("ol")
        if not nested:
            continue
        for item in nested.find_all("li", recursive=False):
            number_el = item.find("span")
            title_el = item.find("a")
            if not number_el or not title_el:
                continue

            track_no = normalize(number_el.get_text(" ", strip=True))
            raw_title = normalize(title_el.get_text(" ", strip=True))
            if not track_no.isdigit() or not should_keep_raw_track(config, raw_title):
                continue
            explicit_owner, ownerless_title = split_explicit_track_owner(raw_title)

            tracks.append(
                ReleaseTrack(
                    track_no=int(track_no),
                    title=clean_title(ownerless_title, config),
                    raw_title=raw_title,
                    explicit_owner=explicit_owner,
                ),
            )
    return tracks


def parse_utanet_rows_from_soup(
    config: ProjectConfig,
    soup: BeautifulSoup,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for row in soup.select("tbody.songlist-table-body tr, tr"):
        title_el = row.select_one(".songlist-title")
        if not title_el:
            continue

        cells = row.find_all("td")

        def cell(index: int) -> str:
            if index >= len(cells):
                return ""
            return normalize(cells[index].get_text(" ", strip=True))

        song_anchor = row.select_one('a[href^="/song/"]')
        title = clean_title(title_el.get_text(" ", strip=True), config)
        credit = {
            "title": title,
            "artist": cell(1),
            "lyricist": cell(2),
            "composer": cell(3),
            "arranger": cell(4),
            "url": urljoin(UTANET_BASE, song_anchor.get("href"))
            if song_anchor
            else "",
        }
        credit.update(config.credit_overrides.get(title, {}))
        rows.append(credit)
    return rows


def is_group_artist(config: ProjectConfig, artist: str) -> bool:
    artist = normalize(artist)
    if "イコノイジョイ" in artist:
        return True
    return f"({config.group_artist})" not in artist and config.group_artist in artist


def is_participating_artist(config: ProjectConfig, artist: str) -> bool:
    artist = normalize(artist)
    return is_group_artist(config, artist) or f"({config.group_artist})" in artist


def parse_utanet_artist_rows(config: ProjectConfig) -> list[dict[str, str]]:
    soup = get_soup(urljoin(UTANET_BASE, config.utanet_artist_path))
    return [
        row
        for row in parse_utanet_rows_from_soup(config, soup)
        if is_participating_artist(config, row["artist"])
    ]


def search_utanet_credit(config: ProjectConfig, title: str) -> dict[str, str] | None:
    soup = get_soup(
        f"{UTANET_BASE}/search/",
        params={"Aselect": "2", "Bselect": "3", "Keyword": clean_title(title, config)},
    )
    for row in parse_utanet_rows_from_soup(config, soup):
        if title_key(row["title"], config) == title_key(title, config) and is_participating_artist(
            config,
            row["artist"],
        ):
            return row
    return None


def release_edition_letter(release_title: str) -> str | None:
    normalized_title = normalize(release_title).upper()
    match = re.search(r"TYPE[\s\-‐‑–—]*([A-F])", normalized_title)
    return match.group(1) if match else None


def release_preference_key(candidate: dict) -> tuple[str, int, str, str]:
    edition_letter = release_edition_letter(candidate["releaseTitle"]["ja"])
    edition_rank = ord(edition_letter) - ord("A") if edition_letter else 99
    return (
        candidate.get("releaseDate") or "9999-99-99",
        edition_rank,
        normalize(candidate["releaseTitle"]["ja"]),
        normalize(candidate.get("officialUrl")),
    )


def should_prefer_release(candidate: dict, current: dict | None) -> bool:
    return current is None or release_preference_key(candidate) < release_preference_key(
        current,
    )


def is_same_https_host(candidate_url: str, base_url: str) -> bool:
    candidate = urlparse(candidate_url)
    base = urlparse(base_url)
    return (
        candidate.scheme == "https"
        and not candidate.username
        and not candidate.password
        and candidate.port is None
        and candidate.hostname == base.hostname
    )


def is_trusted_cover_url(config: ProjectConfig, source_url: str) -> bool:
    parsed = urlparse(source_url)
    official_host = urlparse(config.official_base).hostname
    allowed_hosts = {*TRUSTED_COVER_HOSTS, official_host}
    return (
        parsed.scheme == "https"
        and not parsed.username
        and not parsed.password
        and parsed.port is None
        and parsed.hostname in allowed_hosts
    )


def get_trusted_cover_response(
    config: ProjectConfig,
    source_url: str,
    *,
    max_redirects: int = 5,
) -> requests.Response:
    """Fetch a cover while validating every redirect target before requesting it."""
    current_url = source_url
    for redirect_count in range(max_redirects + 1):
        if not is_trusted_cover_url(config, current_url):
            raise RuntimeError(f"Refusing untrusted cover URL: {current_url}")

        response = SESSION.get(current_url, timeout=30, allow_redirects=False)
        if 300 <= response.status_code < 400:
            location = response.headers.get("Location")
            response.close()
            if not location:
                raise RuntimeError(
                    f"Cover redirect from {current_url} did not include Location",
                )
            if redirect_count >= max_redirects:
                raise RuntimeError(f"Too many cover redirects from {source_url}")
            current_url = urljoin(current_url, location)
            continue

        response.raise_for_status()
        return response

    raise RuntimeError(f"Too many cover redirects from {source_url}")


def download_cover(
    config: ProjectConfig,
    source_url: str,
    song_id: str,
    *,
    refresh: bool = False,
) -> str:
    config.covers_dir.mkdir(parents=True, exist_ok=True)
    destination = config.covers_dir / f"{song_id}.jpg"
    refresh_existing_destination = refresh and destination.exists()
    if (
        not refresh_existing_destination
        and destination.exists()
        and destination.stat().st_size > 0
    ):
        return f"/covers/{config.project_id}/{destination.name}"

    response = get_trusted_cover_response(config, source_url)

    try:
        image = Image.open(io.BytesIO(response.content)).convert("RGB")
        width, height = image.size
        side = min(width, height)
        left = (width - side) // 2
        top = (height - side) // 2
        image = image.crop((left, top, left + side, top + side))
        image.thumbnail((900, 900), Image.Resampling.LANCZOS)
        encoded = io.BytesIO()
        image.save(encoded, "JPEG", quality=88, optimize=True)
        cover_bytes = encoded.getvalue()
    except Exception as exc:
        raise RuntimeError(f"Invalid cover image from {source_url}") from exc

    if refresh_existing_destination:
        destination.write_bytes(cover_bytes)
        return f"/covers/{config.project_id}/{destination.name}"

    cover_hash = hashlib.sha256(cover_bytes).digest()
    for existing_cover in config.covers_dir.glob("*.jpg"):
        if existing_cover == destination or existing_cover.stat().st_size != len(cover_bytes):
            continue
        existing_bytes = existing_cover.read_bytes()
        if hashlib.sha256(existing_bytes).digest() == cover_hash:
            return f"/covers/{config.project_id}/{existing_cover.name}"

    destination.write_bytes(cover_bytes)

    return f"/covers/{config.project_id}/{destination.name}"


def load_existing_songs(config: ProjectConfig) -> list[dict]:
    if not config.songs_path.exists():
        return []
    try:
        songs = json.loads(config.songs_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return songs if isinstance(songs, list) else []


def load_head_json(relative_path: str) -> object:
    try:
        raw = subprocess.check_output(
            ["git", "show", f"HEAD:{relative_path}"],
            cwd=ROOT,
            encoding="utf-8",
            stderr=subprocess.PIPE,
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        raise RuntimeError(
            f"Cannot read the committed catalog baseline HEAD:{relative_path}",
        ) from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Committed catalog baseline is invalid JSON: HEAD:{relative_path}",
        ) from exc


def load_known_other_project_title_keys(config: ProjectConfig) -> set[str]:
    """Read sister-project titles from HEAD so results never depend on sync order."""
    keys: set[str] = set()
    for project_id in PROJECT_IDS:
        if project_id == config.project_id:
            continue
        relative_path = f"src/projects/{project_id}/songs.json"
        songs = load_head_json(relative_path)
        for song in songs if isinstance(songs, list) else []:
            title = song.get("title", {}).get("ja")
            if title:
                keys.add(title_key(title, config))
    return keys


def release_base_title(value: str) -> str:
    text = normalize(value)
    previous = None
    while text != previous:
        previous = text
        text = re.sub(r"\s*(?:\[[^\]]+\]|<[^>]+>)\s*$", "", text).strip()
    return unwrap_quotes(text)


def release_title_keys(config: ProjectConfig, value: str) -> set[str]:
    base_title = release_base_title(value)
    keys = {
        key
        for part in re.split(r"[/／]", base_title)
        for key in [title_key(unwrap_quotes(part), config)]
        if key
    }
    full_key = title_key(base_title, config)
    if full_key:
        keys.add(full_key)
    return keys


def release_family_key(config: ProjectConfig, release: Release) -> str:
    base_keys = sorted(release_title_keys(config, release.title))
    return f"{release.release_date}|{'/'.join(base_keys)}"


def is_official_title_track(config: ProjectConfig, song: dict) -> bool:
    return title_key(song["title"]["ja"], config) in release_title_keys(
        config,
        song["releaseTitle"]["ja"],
    )


def merge_release_evidence(preferred: dict, other: dict | None) -> dict:
    if other is None:
        return preferred
    result = dict(preferred)
    for field_name in (
        "_explicitOwners",
        "_editionEvidence",
        "_releaseUrls",
    ):
        result[field_name] = sorted(
            {
                *preferred.get(field_name, []),
                *other.get(field_name, []),
            },
        )
    return result


def resolve_new_song_ownership(
    config: ProjectConfig,
    song: dict,
    credit: dict[str, str] | None,
    *,
    key: str,
    committed_by_key: dict[str, dict],
    known_other_project_title_keys: set[str],
) -> tuple[str, str]:
    """Return ACCEPT/REJECT/REVIEW plus a durable evidence label or reason."""
    committed_song = committed_by_key.get(key)
    if committed_song and committed_song.get("sourceStatus") not in {
        "announced",
        "credits_pending",
    }:
        return "ACCEPT", "committed-existing"

    if credit:
        credit_owners = project_owners_from_artist(credit.get("artist", ""))
        if "shared" in credit_owners or len(credit_owners) > 1:
            return "REVIEW", "credits identify a shared or multi-group artist"
        if credit_owners == {config.project_id}:
            if not has_complete_credit_row(credit) and not is_trusted_utanet_credit_url(
                credit.get("url", ""),
            ):
                return "REVIEW", "partial artist evidence lacks a trusted Uta-Net song URL"
            return (
                "ACCEPT",
                "verified-credits"
                if has_complete_credit_row(credit)
                else "verified-artist",
            )
        if credit_owners:
            if committed_song:
                return (
                    "REVIEW",
                    "credits conflict with the committed project and identify "
                    f"{', '.join(sorted(credit_owners))}",
                )
            return "REJECT", f"credits identify {', '.join(sorted(credit_owners))}"
        return "REVIEW", "credits do not identify a supported group artist"

    if committed_song:
        return "ACCEPT", "committed-existing"

    explicit_owners = set(song.get("_explicitOwners", []))
    if explicit_owners:
        if explicit_owners == {config.project_id}:
            return "ACCEPT", "explicit-current-group"
        if config.project_id not in explicit_owners and "shared" not in explicit_owners:
            return "REJECT", f"track label identifies {', '.join(sorted(explicit_owners))}"
        return "REVIEW", "track labels identify shared or conflicting ownership"

    if key in known_other_project_title_keys:
        return "REJECT", "title already exists in a sister-group catalog"

    if is_official_title_track(config, song):
        return "ACCEPT", "official-title-track"

    editions_by_family: dict[str, set[str]] = {}
    for evidence in song.get("_editionEvidence", []):
        family, separator, letter = evidence.rpartition("|")
        if separator and family and letter:
            editions_by_family.setdefault(family, set()).add(letter)
    if any(
        "A" in letters and len(letters) >= 3
        for letters in editions_by_family.values()
    ):
        return "ACCEPT", "official-multi-edition"

    return (
        "REVIEW",
        "no credits, explicit owner, title-track match, or Type A plus at least two other same-release editions",
    )


def validate_official_catalog_coverage(
    config: ProjectConfig,
    official_songs: dict[str, dict],
    committed_songs: list[dict],
    *,
    minimum_count_ratio: float = 0.9,
    minimum_overlap_ratio: float = 0.75,
) -> None:
    committed_official_keys = {
        title_key(song.get("title", {}).get("ja", ""), config)
        for song in committed_songs
        if is_same_https_host(song.get("officialUrl", ""), config.official_base)
        and "/discography/detail/" in song.get("officialUrl", "")
    }
    committed_official_keys.discard("")
    if not committed_official_keys:
        return

    rediscovered = committed_official_keys.intersection(official_songs)
    required_count = math.ceil(len(committed_official_keys) * minimum_count_ratio)
    required_overlap = math.ceil(len(committed_official_keys) * minimum_overlap_ratio)
    if len(official_songs) < required_count or len(rediscovered) < required_overlap:
        missing_titles = sorted(committed_official_keys - rediscovered)[:8]
        raise RuntimeError(
            f"Official discography coverage for {config.project_id} fell to "
            f"{len(official_songs)} discovered and {len(rediscovered)}/"
            f"{len(committed_official_keys)} rediscovered; "
            f"missing title keys include {missing_titles}",
        )


def register_title_key_variant(
    config: ProjectConfig,
    titles_by_key: dict[str, str],
    title: str,
    *,
    source: str,
) -> str:
    key = title_key(title, config)
    normalized_title = normalize(title)
    prior_title = titles_by_key.get(key)
    if prior_title is not None and prior_title != normalized_title:
        raise RuntimeError(
            f"title-key collision in {source} for {config.project_id}: "
            f"{prior_title!r} and {normalized_title!r} both map to {key!r}",
        )
    titles_by_key[key] = normalized_title
    return key


def register_official_title_key(
    config: ProjectConfig,
    titles_by_key: dict[str, str],
    title: str,
) -> str:
    return register_title_key_variant(
        config,
        titles_by_key,
        title,
        source="official discography",
    )


def index_songs_by_title_key(
    config: ProjectConfig,
    songs: list[dict],
    *,
    source: str,
) -> dict[str, dict]:
    titles_by_key: dict[str, str] = {}
    songs_by_key: dict[str, dict] = {}
    for song in songs:
        title = song.get("title", {}).get("ja")
        if not title:
            continue
        key = register_title_key_variant(
            config,
            titles_by_key,
            title,
            source=source,
        )
        if key in songs_by_key:
            raise RuntimeError(
                f"Duplicate song title in {source} for {config.project_id}: {title}",
            )
        songs_by_key[key] = song
    return songs_by_key


def register_credit_row(
    config: ProjectConfig,
    credit_rows: dict[str, dict[str, str]],
    row: dict[str, str],
) -> str:
    key = title_key(row.get("title", ""), config)
    if not key:
        raise RuntimeError(f"Uta-Net returned a credit row without a title for {config.project_id}")

    existing = credit_rows.get(key)
    if existing:
        existing_title = normalize(existing.get("title"))
        row_title = normalize(row.get("title"))
        if existing_title != row_title:
            raise RuntimeError(
                f"title-key collision in Uta-Net credits for {config.project_id}: "
                f"{existing_title!r} and {row_title!r} both map to {key!r}",
            )
        fields = ("artist", "lyricist", "composer", "arranger")
        if any(normalize(existing.get(field)) != normalize(row.get(field)) for field in fields):
            raise RuntimeError(
                f"Conflicting Uta-Net credits for {config.project_id}: {row_title}",
            )
        row_url = normalize(row.get("url"))
        existing_url = normalize(existing.get("url"))
        if row_url and (not existing_url or row_url < existing_url):
            credit_rows[key] = row
        return key

    credit_rows[key] = row
    return key


def load_existing_romaji(
    config: ProjectConfig,
    existing_songs: list[dict] | None = None,
) -> dict[str, str]:
    songs = existing_songs if existing_songs is not None else load_existing_songs(config)
    return {
        title_key(song["title"]["ja"], config): song["title"].get("romaji", "")
        for song in songs
        if song.get("title", {}).get("ja")
    }


def split_artist_members(
    config: ProjectConfig,
    artist: str,
    member_name_to_id: dict[str, str],
) -> list[str]:
    artist = normalize(artist).replace(f"({config.group_artist})", "")
    ids: list[str] = []
    for name in re.split(r"[、,/・]+", artist):
        member_id = member_name_to_id.get(normalize(name).replace(" ", ""))
        if member_id and member_id not in ids:
            ids.append(member_id)
    return ids


def group_member_ids_for_release(members: list[dict], release_date: str | None) -> list[str]:
    ids: list[str] = []
    for member in members:
        if member.get("active"):
            ids.append(member["id"])
            continue
        graduation_date = member.get("graduationDate")
        if release_date and graduation_date and release_date <= graduation_date:
            ids.append(member["id"])
    return ids


def member_ids_for_artist(
    config: ProjectConfig,
    artist: str,
    member_name_to_id: dict[str, str],
    members: list[dict],
    release_date: str | None,
) -> list[str]:
    if is_group_artist(config, artist):
        return group_member_ids_for_release(members, release_date)

    member_ids = split_artist_members(config, artist, member_name_to_id)
    if is_participating_artist(config, artist) and not member_ids:
        raise RuntimeError(
            f"Unable to map credited artist members for {config.project_id}: {artist}",
        )
    return member_ids


def parse_members(config: ProjectConfig) -> list[dict]:
    soup = get_soup(urljoin(config.official_base, config.profile_path))
    existing_members = load_existing_members(config)
    existing_by_id = {member["id"]: member for member in existing_members}
    members: list[dict] = []
    seen_ids: set[str] = set()

    for index, item in enumerate(soup.select("ul.list--contents > li, ul.profileList > li"), 1):
        anchor = item.select_one('a[href*="/feature/"]')
        name_el = item.select_one("p.name") or item.select_one(".nameWrap > span")
        yomi_el = (
            item.select_one("p.yomi.pc")
            or item.select_one("p.yomi")
            or (name_el.select_one(".yomi") if name_el else None)
        )
        if not anchor or not name_el:
            continue

        yomi = normalize(yomi_el.get_text(" ", strip=True) if yomi_el else "")
        name = normalize(name_el.get_text(" ", strip=True))
        if yomi and name.endswith(yomi):
            name = normalize(name[: -len(yomi)])
        member_id = slugify(yomi or name)
        if not member_id or member_id in seen_ids:
            continue
        seen_ids.add(member_id)

        members.append(
            apply_member_color_override(
                config,
                merge_existing_member(
                    {
                        "id": member_id,
                        "name": {
                            "ja": name,
                            "romaji": normalize_romaji(yomi) if yomi else romanize(name),
                        },
                        "profileUrl": urljoin(config.official_base, anchor.get("href", "")),
                        "active": True,
                        "sortOrder": index,
                    },
                    existing_by_id.get(member_id),
                ),
            ),
        )

    for override in config.graduated_members:
        existing = next((member for member in members if member["id"] == override.id), None)
        data = {
            "id": override.id,
            "name": {"ja": override.name, "romaji": override.romaji},
            "active": False,
            "graduated": True,
            "status": "graduated",
            "graduationDate": override.graduation_date,
            "sortOrder": 100 + len([member for member in members if member.get("active") is False]) + 1,
        }
        if override.color:
            data["color"] = override.color
        if override.color_name:
            data["colorName"] = override.color_name
        data["profileUrl"] = override.profile_url

        data = apply_member_color_override(
            config,
            merge_existing_member(data, existing_by_id.get(override.id)),
        )
        if existing:
            existing.update(data)
        else:
            members.append(data)

    active_members = [member for member in members if member.get("active")]
    graduated_members = [member for member in members if member.get("active") is False]
    active_members.sort(key=lambda member: member["sortOrder"])
    graduated_members.sort(key=lambda member: member["sortOrder"])
    for index, member in enumerate(active_members, 1):
        member["sortOrder"] = index
    for index, member in enumerate(graduated_members, 101):
        member["sortOrder"] = index
    return active_members + graduated_members


def load_existing_members(config: ProjectConfig) -> list[dict]:
    if not config.members_path.exists():
        return []
    try:
        members = json.loads(config.members_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return members if isinstance(members, list) else []


def merge_existing_member(member: dict, existing_member: dict | None) -> dict:
    if not existing_member:
        return member
    for key in ("color", "colors", "colorName"):
        if key not in member and existing_member.get(key):
            member[key] = existing_member[key]
    if not member.get("profileUrl") and "profileUrl" in existing_member:
        member["profileUrl"] = existing_member["profileUrl"]
    return member


def apply_member_color_override(config: ProjectConfig, member: dict) -> dict:
    if config.clear_member_color_arrays:
        member.pop("colors", None)

    override = config.member_color_overrides.get(member["id"])
    if not override:
        return member
    for key, value in override.items():
        if value is not None:
            member[key] = value
    return member


def has_known_announcement_metadata(song: dict) -> bool:
    required_values = (
        song.get("title", {}).get("ja", ""),
        song.get("releaseTitle", {}).get("ja", ""),
        song.get("coverSourceUrl", ""),
        song.get("officialUrl", ""),
    )
    return all(required_values) and not any(
        marker.lower() in normalize(value).lower()
        for value in required_values[:2]
        for marker in UNKNOWN_METADATA_MARKERS
    )


def credit_from_existing_song(song: dict | None) -> dict[str, str] | None:
    if not song:
        return None
    credits = song.get("credits") or {}
    values = {
        role: normalize((credits.get(role) or {}).get("ja"))
        for role in ("lyricist", "composer", "arranger")
    }
    if not all(values.values()):
        return None
    return {
        "title": normalize(song.get("title", {}).get("ja")),
        "artist": normalize(song.get("artist", {}).get("ja")),
        **values,
        "url": normalize(song.get("creditSourceUrl")),
    }


def has_complete_credit_row(credit: dict[str, str] | None) -> bool:
    return bool(
        credit
        and all(normalize(credit.get(role)) for role in ("lyricist", "composer", "arranger"))
    )


def merge_official_songs_with_credits(
    official_songs: dict[str, dict],
    credit_rows: dict[str, dict[str, str]],
    existing_by_key: dict[str, dict],
) -> tuple[dict[str, dict], dict[str, int]]:
    final_songs: dict[str, dict] = {}
    stats = {
        "officialMetadataWithoutCredits": 0,
        "preservedExistingCredits": 0,
        "incompleteCurrentCreditsDeferred": 0,
        "excludedIncompleteOfficialAnnouncements": 0,
    }

    for key, song in official_songs.items():
        credit = credit_rows.get(key)
        if has_complete_credit_row(credit):
            credited_song = {**song, "credit": credit, "_creditOrigin": "current"}
            if song.get("releaseDate", "") > current_catalog_date().isoformat():
                credited_song.update(
                    {
                        "sourceStatus": "announced",
                        "sourceNote": ANNOUNCED_CREDITS_VERIFIED_SOURCE_NOTE,
                        "tags": ["announced"],
                    },
                )
            final_songs[key] = credited_song
            continue

        if credit:
            stats["incompleteCurrentCreditsDeferred"] += 1

        existing_credit = credit_from_existing_song(existing_by_key.get(key))
        if existing_credit:
            final_songs[key] = {
                **song,
                "credit": existing_credit,
                "_creditOrigin": "existing",
            }
            stats["preservedExistingCredits"] += 1
            continue

        if has_known_announcement_metadata(song):
            is_future_release = (
                song.get("releaseDate", "") > current_catalog_date().isoformat()
            )
            pending_status = "announced" if is_future_release else "credits_pending"
            source_note = (
                ANNOUNCED_SOURCE_NOTE
                if is_future_release
                else CREDITS_PENDING_SOURCE_NOTE
            )
            final_songs[key] = {
                **song,
                "sourceStatus": pending_status,
                "sourceNote": source_note,
                "tags": [pending_status],
            }
            stats["officialMetadataWithoutCredits"] += 1
            continue

        stats["excludedIncompleteOfficialAnnouncements"] += 1

    return final_songs, stats


def merge_existing_song_update(
    existing_song: dict,
    scraped_song: dict,
    *,
    today: date | None = None,
    config: ProjectConfig | None = None,
    members: list[dict] | None = None,
    member_name_to_id: dict[str, str] | None = None,
) -> dict:
    """Keep existing records byte-stable except for a verified announcement upgrade."""
    result = deepcopy(existing_song)
    if existing_song.get("sourceStatus") not in {"announced", "credits_pending"}:
        return result

    release_date = result.get("releaseDate")
    release_has_arrived = False
    if release_date:
        try:
            release_has_arrived = date.fromisoformat(release_date) <= (
                today or current_catalog_date()
            )
        except ValueError:
            pass

    credit = scraped_song.get("credit")
    has_current_credit = scraped_song.get("_creditOrigin") == "current" and bool(
        credit,
    )
    if has_current_credit:
        result["credits"] = {
            "lyricist": localized(credit["lyricist"]),
            "composer": localized(credit["composer"]),
            "arranger": localized(credit["arranger"]),
        }
        if credit.get("url"):
            result["creditSourceUrl"] = credit["url"]
        if config and members is not None and member_name_to_id is not None:
            artist = normalize(credit.get("artist"))
            participant_ids = member_ids_for_artist(
                config,
                artist,
                member_name_to_id,
                members,
                result.get("releaseDate"),
            )
            result["artist"] = localized(artist)
            result["memberIds"] = participant_ids
            result["ownershipEvidence"] = "verified-credits"
            result["tags"] = [
                tag
                for tag in result.get("tags", [])
                if tag not in {"solo", "unit"}
            ]
            if not is_group_artist(config, artist):
                result["tags"].append(
                    "solo" if len(participant_ids) == 1 else "unit",
                )

    has_complete_credit = credit_from_existing_song(result) is not None

    if release_has_arrived:
        if has_complete_credit:
            result["sourceStatus"] = "released"
            result.pop("sourceNote", None)
            result["tags"] = [
                tag
                for tag in result.get("tags", [])
                if tag not in {"announced", "credits_pending"}
            ]
        elif existing_song.get("sourceStatus") == "announced":
            result["sourceStatus"] = "credits_pending"
            result["sourceNote"] = CREDITS_PENDING_SOURCE_NOTE
            result["tags"] = sorted(
                {
                    *(
                        tag
                        for tag in result.get("tags", [])
                        if tag != "announced"
                    ),
                    "credits_pending",
                },
            )
    elif has_current_credit:
        result["sourceStatus"] = "announced"
        result["sourceNote"] = ANNOUNCED_CREDITS_VERIFIED_SOURCE_NOTE
        result["tags"] = sorted(
            {
                *(
                    tag
                    for tag in result.get("tags", [])
                    if tag != "credits_pending"
                ),
                "announced",
            },
        )

    return result


def build_song_data(
    config: ProjectConfig,
    members: list[dict] | None = None,
) -> tuple[list[dict], dict[str, int]]:
    if members is None:
        members = json.loads(config.members_path.read_text(encoding="utf-8"))
    member_name_to_id = {
        normalize(member["name"]["ja"]).replace(" ", ""): member["id"]
        for member in members
    }
    existing_songs = load_existing_songs(config)
    existing_by_key = index_songs_by_title_key(
        config,
        existing_songs,
        source="working catalog",
    )
    committed_songs_value = load_head_json(
        f"src/projects/{config.project_id}/songs.json",
    )
    committed_songs = (
        committed_songs_value if isinstance(committed_songs_value, list) else []
    )
    committed_by_key = index_songs_by_title_key(
        config,
        committed_songs,
        source="committed catalog",
    )
    known_other_project_title_keys = load_known_other_project_title_keys(config)
    existing_romaji = load_existing_romaji(config, existing_songs)

    releases: list[Release] = []
    release_contract_errors: list[str] = []
    for kind in (1, 2):
        for detail_path in list_official_detail_paths(config, kind):
            release = parse_release(config, detail_path)
            releases.append(release)
            try:
                validate_release_contract(
                    release,
                    allow_empty_tracks=(
                        urlparse(release.url).path
                        in config.legacy_incomplete_release_paths
                    ),
                )
            except RuntimeError as exc:
                release_contract_errors.append(str(exc))
            time.sleep(0.08)
    if release_contract_errors:
        raise RuntimeError(
            "Official release detail contracts failed:\n  - "
            + "\n  - ".join(release_contract_errors),
        )
    release_cover_sources = {
        release.url: release.cover_source_url
        for release in releases
        if release.cover_source_url
    }

    official_songs: dict[str, dict] = {}
    official_titles_by_key = {
        key: normalize(song["title"]["ja"])
        for key, song in committed_by_key.items()
    }
    excluded_known_sister_group_songs = 0
    for release in releases:
        for track in release.tracks:
            key = register_official_title_key(
                config,
                official_titles_by_key,
                track.title,
            )
            if key == "overture":
                continue
            candidate = {
                "title": localized(track.title),
                "releaseTitle": localized(release.title),
                "releaseType": release.release_type,
                "releaseDate": release.release_date,
                "trackNo": track.track_no,
                "trackType": "album"
                if release.release_type == "album"
                else ("title" if track.track_no == 1 else "coupling"),
                "coverSourceUrl": release.cover_source_url,
                "officialUrl": release.url,
                "_explicitOwners": (
                    [track.explicit_owner] if track.explicit_owner else []
                ),
                "_editionEvidence": [
                    f"{release_family_key(config, release)}|{edition_letter}"
                    for edition_letter in [release_edition_letter(release.title)]
                    if edition_letter
                ],
                "_releaseUrls": [release.url],
            }

            current_candidate = official_songs.get(key)
            if should_prefer_release(candidate, current_candidate):
                official_songs[key] = merge_release_evidence(
                    candidate,
                    current_candidate,
                )
            else:
                official_songs[key] = merge_release_evidence(
                    current_candidate,
                    candidate,
                )

    if len(official_songs) < config.minimum_official_songs:
        raise RuntimeError(
            f"Official discography for {config.project_id} returned only "
            f"{len(official_songs)} songs; expected at least "
            f"{config.minimum_official_songs}",
        )
    validate_official_catalog_coverage(config, official_songs, committed_songs)

    credit_rows: dict[str, dict[str, str]] = {}
    credit_source_available = True
    try:
        for row in parse_utanet_artist_rows(config):
            register_credit_row(config, credit_rows, row)
        if not credit_rows:
            credit_source_available = False
            print(
                f"Warning: Uta-Net artist index was empty for {config.project_id}",
                file=sys.stderr,
            )
    except requests.RequestException as exc:
        credit_source_available = False
        print(
            f"Warning: Uta-Net artist index unavailable for {config.project_id}: {exc}",
            file=sys.stderr,
        )

    searched_credit_count = 0
    if credit_source_available:
        for key, song in list(official_songs.items()):
            if key in credit_rows:
                continue
            try:
                row = search_utanet_credit(config, song["title"]["ja"])
            except requests.RequestException as exc:
                credit_source_available = False
                print(
                    f"Warning: Uta-Net search unavailable for {config.project_id}: {exc}",
                    file=sys.stderr,
                )
                break
            if row:
                register_credit_row(config, credit_rows, row)
                searched_credit_count += 1
                time.sleep(0.08)

    # A release page can contain a sister group's track without labeling the row.
    # Never default a brand-new, no-credit title to the current group. Require
    # explicit artist/track evidence or a conservative official-release signal.
    ownership_review_errors: list[str] = []
    for key in list(official_songs):
        song = official_songs[key]
        decision, evidence_or_reason = resolve_new_song_ownership(
            config,
            song,
            credit_rows.get(key),
            key=key,
            committed_by_key=committed_by_key,
            known_other_project_title_keys=known_other_project_title_keys,
        )
        if decision == "REJECT":
            del official_songs[key]
            excluded_known_sister_group_songs += 1
            continue
        if decision == "REVIEW":
            ownership_review_errors.append(
                f"{song['title']['ja']} ({song['officialUrl']}, track "
                f"{song['trackNo']}): {evidence_or_reason}",
            )
            continue
        if evidence_or_reason in PENDING_OWNERSHIP_EVIDENCE:
            song["_ownershipEvidence"] = evidence_or_reason
        if evidence_or_reason == "verified-artist":
            song["_ownershipSourceUrl"] = credit_rows[key].get("url")
            song["_ownershipArtist"] = credit_rows[key].get("artist")

    if ownership_review_errors:
        formatted_errors = "\n  - ".join(ownership_review_errors)
        raise RuntimeError(
            f"New songs need manual artist-ownership review for "
            f"{config.project_id}:\n  - {formatted_errors}",
        )

    final_songs, official_merge_stats = merge_official_songs_with_credits(
        official_songs,
        credit_rows,
        existing_by_key,
    )

    special_tracks_added = 0
    for track in config.special_tracks:
        key = title_key(track["title"], config)
        if key in final_songs and final_songs[key].get("credit"):
            continue

        cover_source_url = track.get("coverSourceUrl") or release_cover_sources.get(
            track.get("coverReleaseUrl"),
        )
        final_songs[key] = {
            "title": localized(track["title"]),
            "releaseTitle": localized(track["releaseTitle"]),
            "releaseType": track["releaseType"],
            "releaseDate": track["releaseDate"],
            "trackNo": track["trackNo"],
            "trackType": track["trackType"],
            "coverSourceUrl": cover_source_url,
            "officialUrl": track["officialUrl"],
            "visibility": track.get("visibility", "special"),
            "sourceStatus": track.get("sourceStatus", "digital"),
            "sourceNote": track.get("sourceNote"),
            "tags": track.get("tags", []),
            "memberIds": track.get("memberIds"),
            "credit": track["credit"],
        }
        special_tracks_added += 1

    used_ids: set[str] = set()
    reserved_existing_ids = {
        song["id"] for song in existing_songs if isinstance(song.get("id"), str)
    }
    generated_keys: set[str] = set()
    output: list[dict] = []
    for song in sorted(
        final_songs.values(),
        key=lambda item: (
            item.get("releaseDate") or "9999-99-99",
            item.get("trackNo", 99),
            item["title"]["ja"],
        ),
    ):
        key = title_key(song["title"]["ja"], config)
        generated_keys.add(key)
        existing_song = existing_by_key.get(key)
        preferred_romaji = existing_romaji.get(key)
        if preferred_romaji:
            song["title"]["romaji"] = preferred_romaji

        song_id_base = slugify(song["title"]["romaji"] or song["title"]["ja"])
        if existing_song and existing_song.get("id") not in used_ids:
            song_id = existing_song["id"]
        else:
            song_id = song_id_base
            suffix = 2
            while song_id in used_ids or song_id in reserved_existing_ids:
                song_id = f"{song_id_base}-{suffix}"
                suffix += 1
        used_ids.add(song_id)

        if existing_song and key in committed_by_key:
            output.append(
                merge_existing_song_update(
                    existing_song,
                    song,
                    config=config,
                    members=members,
                    member_name_to_id=member_name_to_id,
                ),
            )
            continue

        credit = song.get("credit")
        artist = (
            (credit or {}).get("artist")
            or song.get("_ownershipArtist")
            or config.group_artist
        )
        is_group_song = is_group_artist(config, artist)

        source_cover = song.get("coverSourceUrl")
        if not source_cover:
            raise RuntimeError(f"No cover source found for {song['title']['ja']}")

        cover_url = download_cover(
            config,
            source_cover,
            song_id,
            refresh=existing_song is not None and key not in committed_by_key,
        )
        time.sleep(0.08)

        tags = [
            song["releaseType"],
            song["trackType"],
            song["releaseDate"][:4] if song.get("releaseDate") else "date-tbd",
            *song.get("tags", []),
        ]
        member_ids = song.get("memberIds")
        if member_ids is None:
            if (
                song.get("sourceStatus") in {"announced", "credits_pending"}
                and song.get("_ownershipEvidence")
                not in {"verified-credits", "verified-artist"}
            ):
                member_ids = []
            else:
                member_ids = member_ids_for_artist(
                    config,
                    artist,
                    member_name_to_id,
                    members,
                    song.get("releaseDate"),
                )
        else:
            member_ids = list(member_ids)
        if not is_group_song and is_participating_artist(config, artist):
            tags.append("solo" if len(member_ids) == 1 else "unit")
        for override_member_id in config.group_member_overrides.get(song["title"]["ja"], []):
            if override_member_id not in member_ids:
                member_ids.append(override_member_id)

        output_song = {
            "id": song_id,
            "title": song["title"],
            "artist": localized(artist),
            "releaseId": slugify(
                f"{song.get('releaseDate', '')}-{song['releaseTitle']['ja']}",
            ),
            "releaseTitle": song["releaseTitle"],
            "releaseType": song["releaseType"],
            "releaseDate": song.get("releaseDate") or None,
            "trackNo": song["trackNo"],
            "trackType": song["trackType"],
            "coverUrl": cover_url,
            "coverSourceUrl": source_cover,
            "memberIds": member_ids,
            "tags": sorted(set(tags)),
            "officialUrl": song.get("officialUrl") or (credit or {}).get("url"),
        }

        if credit:
            output_song["credits"] = {
                "lyricist": localized(credit["lyricist"]),
                "composer": localized(credit["composer"]),
                "arranger": localized(credit["arranger"]),
            }
            if credit.get("url"):
                output_song["creditSourceUrl"] = credit["url"]

        for optional_key in ("visibility", "sourceStatus", "sourceNote"):
            if song.get(optional_key):
                output_song[optional_key] = song[optional_key]
        if song.get("_ownershipEvidence"):
            output_song["ownershipEvidence"] = song["_ownershipEvidence"]
        if song.get("_ownershipSourceUrl"):
            output_song["creditSourceUrl"] = song["_ownershipSourceUrl"]

        if not output_song["releaseDate"]:
            output_song.pop("releaseDate")
        if not output_song["memberIds"]:
            output_song.pop("memberIds")

        output.append(output_song)

    preserved_existing_songs = 0
    for existing_song in existing_songs:
        key = title_key(existing_song.get("title", {}).get("ja", ""), config)
        if not key or key in generated_keys:
            continue
        if existing_song.get("id") in used_ids:
            raise RuntimeError(
                f"Existing song id collision while preserving {existing_song.get('id')}",
            )
        used_ids.add(existing_song["id"])
        output.append(merge_existing_song_update(existing_song, {}))
        preserved_existing_songs += 1

    def sort_key(item: dict) -> tuple[str, int, str]:
        return (
            item.get("releaseDate") or "9999-99-99",
            item.get("trackNo", 99),
            item.get("title", {}).get("ja", ""),
        )

    output_by_id = {song["id"]: song for song in output}
    existing_ids = {song["id"] for song in existing_songs}
    stable_output = [
        output_by_id[song["id"]]
        for song in existing_songs
        if song["id"] in output_by_id
    ]
    for new_song in sorted(
        (song for song in output if song["id"] not in existing_ids),
        key=sort_key,
    ):
        insertion_index = next(
            (
                index
                for index, current_song in enumerate(stable_output)
                if sort_key(current_song) > sort_key(new_song)
            ),
            len(stable_output),
        )
        stable_output.insert(insertion_index, new_song)
    output = stable_output

    stats = {
        "officialReleases": len(releases),
        "officialSongs": len(official_songs),
        "excludedKnownSisterGroupSongs": excluded_known_sister_group_songs,
        "creditSourceAvailable": credit_source_available,
        "creditRows": len(credit_rows),
        "searchedCreditRows": searched_credit_count,
        **official_merge_stats,
        "specialTracksAdded": special_tracks_added,
        "preservedExistingSongs": preserved_existing_songs,
        "finalSongs": len(output),
    }
    return output, stats


def build_equal_love_config() -> ProjectConfig:
    official_base = "https://equal-love.jp"
    return ProjectConfig(
        project_id="equal-love",
        official_base=official_base,
        group_artist="=LOVE",
        utanet_artist_id="23032",
        utanet_artist_path="/artist/23032/",
        sister_group_markers=("≠ME", "≒JOY"),
        minimum_official_songs=70,
        # These four old pages publish title/date/cover but have an empty CD list.
        # Keep the exception URL-exact so every new detail page still fails closed.
        legacy_incomplete_release_paths=(
            "/discography/detail/3/",
            "/discography/detail/6/",
            "/discography/detail/46/",
            "/discography/detail/78/",
        ),
        graduated_members=[
            GraduatedMemberOverride(
                id="satake-nonno",
                name="佐竹 のん乃",
                romaji="Satake Nonno",
                graduation_date="2021-03-06",
                color="#3b82f6",
                color_name="Blue (青)",
                profile_url=None,
            ),
            GraduatedMemberOverride(
                id="saito-nagisa",
                name="齊藤 なぎさ",
                romaji="Saito Nagisa",
                graduation_date="2023-01-13",
                color="#ff69b4",
                color_name="Pink (ピンク)",
                profile_url=None,
            ),
        ],
        title_aliases={
            "Sweetest girl(=LOVE)": "Sweetest girl",
            "推しのいる世界(=LOVE)": "推しのいる世界",
        },
        credit_overrides={
            "The 5th": {"arranger": "ArmySlick・YUU for YOU"},
        },
        special_tracks=[
            {
                "title": "866",
                "releaseTitle": "全部、内緒。 (Special Edition)",
                "releaseType": "album",
                "releaseDate": "2021-05-12",
                "trackNo": 18,
                "trackType": "album",
                "coverReleaseUrl": f"{official_base}/discography/detail/31/",
                "officialUrl": "https://music.apple.com/jp/song/866/1564058212",
                "sourceStatus": "digital",
                "credit": {
                    "title": "866",
                    "artist": "=LOVE",
                    "lyricist": "指原莉乃",
                    "composer": "田辺望・The Answer・ONE17・Ryo Ito",
                    "arranger": "The Answer",
                    "url": "https://www.youtube.com/watch?v=8hsjYIlJbQE",
                },
            },
            {
                "title": "次に会えた時 何を話そうかな",
                "releaseTitle": "次に会えた時 何を話そうかな",
                "releaseType": "digital",
                "releaseDate": "2020-04-15",
                "trackNo": 1,
                "trackType": "title",
                "coverSourceUrl": "https://i.ytimg.com/vi/aC4CdVDFzB4/maxresdefault.jpg",
                "officialUrl": "https://www.youtube.com/watch?v=aC4CdVDFzB4",
                "sourceStatus": "digital",
                "credit": {
                    "title": "次に会えた時 何を話そうかな",
                    "artist": "=LOVE、≠ME",
                    "lyricist": "指原莉乃",
                    "composer": "田辺望・長沢知亜紀",
                    "arranger": "湯浅篤",
                    "url": "https://natalie.mu/music/news/375537",
                },
            },
            {
                "title": "トリプルデート",
                "releaseTitle": "トリプルデート",
                "releaseType": "digital",
                "releaseDate": "2022-07-20",
                "trackNo": 1,
                "trackType": "title",
                "officialUrl": "https://www.youtube.com/watch?v=gkabNNfTjX4",
                "sourceStatus": "digital",
                "credit": {
                    "title": "トリプルデート",
                    "artist": "イコノイジョイ",
                    "lyricist": "指原莉乃",
                    "composer": "本多友紀",
                    "arranger": "脇眞富",
                    "url": "https://www.uta-net.com/song/321975/",
                },
            },
        ],
    )


def build_nearly_equal_joy_config() -> ProjectConfig:
    return ProjectConfig(
        project_id="nearly-equal-joy",
        official_base="https://nearly-equal-joy.jp",
        group_artist="≒JOY",
        utanet_artist_id="32604",
        utanet_artist_path="/artist/32604/",
        sister_group_markers=("=LOVE", "＝LOVE", "≠ME"),
        minimum_official_songs=15,
        clear_member_color_arrays=True,
        graduated_members=[
            GraduatedMemberOverride(
                id="fukuyama-moeka",
                name="福山 萌叶",
                romaji="Fukuyama Moeka",
                graduation_date="2023-03-29",
                profile_url=None,
            ),
        ],
        special_tracks=[
            {
                "title": "The rock is you!",
                "releaseTitle": "The rock is you!",
                "releaseType": "digital",
                "releaseDate": "2026-02-12",
                "trackNo": 1,
                "trackType": "solo",
                "coverSourceUrl": "https://i.ytimg.com/vi/kDgadIAsQf4/maxresdefault.jpg",
                "officialUrl": "https://www.youtube.com/watch?v=kDgadIAsQf4",
                "sourceStatus": "digital",
                "credit": {
                    "title": "The rock is you!",
                    "artist": "江角 怜音(≒JOY)",
                    "lyricist": "指原莉乃",
                    "composer": "浦島健太・ふるっぺ(ケラケラ)",
                    "arranger": "ふるっぺ(ケラケラ)",
                    "url": "https://www.uta-net.com/song/388425/",
                },
            },
            {
                "title": "トリプルデート",
                "releaseTitle": "トリプルデート",
                "releaseType": "digital",
                "releaseDate": "2022-07-20",
                "trackNo": 1,
                "trackType": "title",
                "officialUrl": "https://www.youtube.com/watch?v=gkabNNfTjX4",
                "sourceStatus": "digital",
                "credit": {
                    "title": "トリプルデート",
                    "artist": "イコノイジョイ",
                    "lyricist": "指原莉乃",
                    "composer": "本多友紀",
                    "arranger": "脇眞富",
                    "url": "https://www.uta-net.com/song/321975/",
                },
            },
        ],
        group_member_overrides={
            "≒JOY": ["fukuyama-moeka"],
            "笑って フラジール": ["fukuyama-moeka"],
            "超孤独ライオン": ["fukuyama-moeka"],
        },
        member_color_overrides={
            "aida-jurii": {
                "color": "#800020",
                "colorName": "Bordeaux (ボルドー)",
            },
            "amano-konoa": {
                "color": "#f8a7c5",
                "colorName": "Light Pink (薄ピンク)",
            },
            "ichihara-ayumi": {
                "color": "#8e44ad",
                "colorName": "Purple (紫)",
            },
            "esumi-renon": {
                "color": "#1976d2",
                "colorName": "Blue (青)",
            },
            "oshida-mitsuki": {
                "color": "#73c7e8",
                "colorName": "Light Blue (水色)",
            },
            "onishi-aoi": {
                "color": "#ffffff",
                "colorName": "White (白)",
            },
            "ozawa-aimi": {
                "color": "#f6c443",
                "colorName": "Yellow (黄色)",
            },
            "takahashi-mai": {
                "color": "#f57c00",
                "colorName": "Orange (オレンジ)",
            },
            "fujisawa-riko": {
                "color": "#43a047",
                "colorName": "Green (緑)",
            },
            "murayama-yuuka": {
                "color": "#e53935",
                "colorName": "Red (赤)",
            },
            "yamada-momoka": {
                "color": "#f06292",
                "colorName": "Pink (ピンク)",
            },
            "yamano-arisu": {
                "color": "#9adfd9",
                "colorName": "Ice Green (アイスグリーン)",
            },
        },
    )


def build_not_equal_me_config() -> ProjectConfig:
    return ProjectConfig(
        project_id="not-equal-me",
        official_base="https://not-equal-me.jp",
        group_artist="≠ME",
        utanet_artist_id="27489",
        utanet_artist_path="/artist/27489/6/",
        sister_group_markers=("=LOVE", "＝LOVE", "≒JOY"),
        minimum_official_songs=45,
        # These old pages have official metadata but an empty CD track list.
        legacy_incomplete_release_paths=(
            "/discography/detail/22/",
            "/discography/detail/26/",
            "/discography/detail/40/",
            "/discography/detail/46/",
            "/discography/detail/47/",
            "/discography/detail/48/",
            "/discography/detail/49/",
        ),
        credit_overrides={
            "#おふしょるにっと": {"arranger": "yuma"},
            "誰もいない森の奥で一本の木が倒れたら音はするか?": {
                "arranger": "千葉“naotyu-”直樹",
            },
            "誰もいない森の奥で一本の木が倒れたら音はするか？": {
                "arranger": "千葉“naotyu-”直樹",
            },
            "てゆーか、みるてんって何?": {"arranger": "yuma"},
            "てゆーか、みるてんって何？": {"arranger": "yuma"},
        },
        graduated_members=[
            GraduatedMemberOverride(
                id="suganami-mirei",
                name="菅波 美玲",
                romaji="Suganami Mirei",
                graduation_date="2026-06-12",
                profile_url="https://not-equal-me.jp/feature/profile_suganami_mirei",
            ),
        ],
        member_color_overrides={
            "ogi-hana": {
                "color": "#1976d2",
                "colors": ["#1976d2", "#ffffff"],
                "colorName": "Blue x White (青×白)",
            },
            "ochiai-kirari": {
                "color": "#f6c443",
                "colors": ["#f6c443", "#f6c443"],
                "colorName": "Yellow x Yellow (黄×黄)",
            },
            "kanisawa-moeko": {
                "color": "#73c7e8",
                "colors": ["#73c7e8", "#e53935"],
                "colorName": "Light Blue x Red (水色×赤)",
            },
            "kawaguchi-natsune": {
                "color": "#f57c00",
                "colors": ["#f57c00", "#ffffff"],
                "colorName": "Orange x White (オレンジ×白)",
            },
            "kawanago-natsumi": {
                "color": "#111827",
                "colors": ["#111827", "#79d8b2"],
                "colorName": "Black x Mint Green (黒×ミントグリーン)",
            },
            "sakurai-momo": {
                "color": "#f06292",
                "colors": ["#f06292", "#f8a7c5"],
                "colorName": "Pink x Light Pink (ピンク×薄ピンク)",
            },
            "suzuki-hitomi": {
                "color": "#f8a7c5",
                "colors": ["#f8a7c5", "#f8a7c5"],
                "colorName": "Light Pink x Light Pink (薄ピンク×薄ピンク)",
            },
            "tanizaki-saya": {
                "color": "#f06292",
                "colors": ["#f06292", "#ffffff"],
                "colorName": "Pink x White (ピンク×白)",
            },
            "tomita-nanaka": {
                "color": "#f6c443",
                "colors": ["#f6c443", "#43a047"],
                "colorName": "Yellow x Green (黄×緑)",
            },
            "nagata-shiori": {
                "color": "#1976d2",
                "colors": ["#1976d2", "#1976d2"],
                "colorName": "Blue x Blue (青×青)",
            },
            "honda-miyuki": {
                "color": "#b39ddb",
                "colors": ["#b39ddb", "#73c7e8"],
                "colorName": "Light Purple x Light Blue (薄紫×水色)",
            },
            "suganami-mirei": {
                "color": "#73c7e8",
                "colors": ["#73c7e8", "#73c7e8"],
                "colorName": "Light Blue x Light Blue (水色×水色)",
            },
        },
        special_tracks=[
            {
                "title": "次に会えた時 何を話そうかな",
                "releaseTitle": "次に会えた時 何を話そうかな",
                "releaseType": "digital",
                "releaseDate": "2020-04-15",
                "trackNo": 1,
                "trackType": "title",
                "coverSourceUrl": "https://i.ytimg.com/vi/aC4CdVDFzB4/maxresdefault.jpg",
                "officialUrl": "https://www.youtube.com/watch?v=aC4CdVDFzB4",
                "sourceStatus": "digital",
                "credit": {
                    "title": "次に会えた時 何を話そうかな",
                    "artist": "=LOVE、≠ME",
                    "lyricist": "指原莉乃",
                    "composer": "田辺望・長沢知亜紀",
                    "arranger": "湯浅篤",
                    "url": "https://natalie.mu/music/news/375537",
                },
            },
            {
                "title": "トリプルデート",
                "releaseTitle": "トリプルデート",
                "releaseType": "digital",
                "releaseDate": "2022-07-20",
                "trackNo": 1,
                "trackType": "title",
                "officialUrl": "https://www.youtube.com/watch?v=gkabNNfTjX4",
                "sourceStatus": "digital",
                "credit": {
                    "title": "トリプルデート",
                    "artist": "イコノイジョイ",
                    "lyricist": "指原莉乃",
                    "composer": "本多友紀",
                    "arranger": "脇眞富",
                    "url": "https://www.uta-net.com/song/321975/",
                },
            },
            {
                "title": "ここでファーストキッス",
                "releaseTitle": "愛くださいませ/ここでファーストキッス",
                "releaseType": "single",
                "releaseDate": "2026-06-24",
                "trackNo": 2,
                "trackType": "title",
                "coverSourceUrl": "https://m.media-amazon.com/images/I/51a5RuQvqXL._SL240_.jpg",
                "officialUrl": "https://not-equal-me.jp/feature/specialsite_12thsingle",
                "visibility": "default",
                "sourceStatus": "unverified",
                "sourceNote": "12th両A面シングル収録曲として公式サイトで確認。作曲/編曲 credits は未確認。",
                "credit": {
                    "title": "ここでファーストキッス",
                    "artist": "≠ME",
                    "lyricist": "未確認",
                    "composer": "未確認",
                    "arranger": "未確認",
                    "url": "https://not-equal-me.jp/feature/specialsite_12thsingle",
                },
            },
            {
                "title": "君はもう一度タネになる",
                "releaseTitle": "君はもう一度タネになる",
                "releaseType": "digital",
                "releaseDate": "2026-06-12",
                "trackNo": 1,
                "trackType": "solo",
                "coverSourceUrl": "https://i.ytimg.com/vi/XtKPbP7bqp0/maxresdefault.jpg",
                "officialUrl": "https://www.youtube.com/watch?v=XtKPbP7bqp0",
                "sourceStatus": "youtube_public",
                "visibility": "special",
                "sourceNote": "菅波美玲卒業コンサート公開楽曲。通常の公式ディスコグラフィー/Uta-Net一覧に無い場合の補完。",
                "tags": ["graduated_member", "graduation_solo"],
                "memberIds": ["suganami-mirei"],
                "credit": {
                    "title": "君はもう一度タネになる",
                    "artist": "菅波 美玲(≠ME)",
                    "lyricist": "指原莉乃",
                    "composer": "Yu-ki Kokubo・YUU for YOU",
                    "arranger": "YUU for YOU",
                    "url": "https://www.youtube.com/watch?v=XtKPbP7bqp0",
                },
            },
        ],
    )


PROJECT_CONFIGS = {
    "equal-love": build_equal_love_config,
    "nearly-equal-joy": build_nearly_equal_joy_config,
    "not-equal-me": build_not_equal_me_config,
}


def write_json_atomically(path: Path, value: list[dict]) -> None:
    if path.exists():
        try:
            existing_value = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            existing_value = None
        if existing_value == value:
            return

    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    temporary_path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(path)


def sync_project(config: ProjectConfig, *, songs_only: bool = False) -> None:
    members = load_existing_members(config) if songs_only else parse_members(config)
    if not members:
        raise RuntimeError(f"No existing members found for {config.project_id}")
    songs, stats = build_song_data(config, members)

    if not songs_only:
        write_json_atomically(config.members_path, members)
    write_json_atomically(config.songs_path, songs)

    print(json.dumps({"project": config.project_id, **stats}, ensure_ascii=False, indent=2))
    if not songs_only:
        print(f"Wrote {len(members)} members to {config.members_path}")
    print(f"Wrote {len(songs)} songs to {config.songs_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project",
        choices=sorted(PROJECT_CONFIGS.keys()),
        required=True,
        help="Project id to sync.",
    )
    parser.add_argument(
        "--songs-only",
        action="store_true",
        help="Use the checked-in member roster and update only songs/covers.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    sync_project(PROJECT_CONFIGS[args.project](), songs_only=args.songs_only)


if __name__ == "__main__":
    main()
