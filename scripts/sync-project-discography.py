#!/usr/bin/env python3
"""Sync project song/member metadata from public discography and lyrics sources."""

from __future__ import annotations

import argparse
import io
import json
import re
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from PIL import Image

try:
    import pykakasi
except ImportError as exc:  # pragma: no cover - environment helper
    raise SystemExit(
        "pykakasi is required for romaji generation. "
        "Install it with: python3 -m pip install --user pykakasi",
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
UTANET_BASE = "https://www.uta-net.com"
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
    ),
}

COMMON_TITLE_ALIASES = {
    "Want  you!Want  you!": "Want you!Want you!",
    "Want  you! Want  you!": "Want you!Want you!",
    "届いてLOVE YOU♡": "届いてLOVE YOU",
    "現役アイドルちゅ~": "現役アイドルちゅ～",
    "ナツマトペ": "ナツマトぺ",
    "/7": "24/7",
    "アマガミガール feat.DJ ALICE": "アマガミガール feat. DJ ALICE",
}

COMMON_RELEASE_TITLE_ALIASES = {
    "青春”サブリミナル”": "青春“サブリミナル”",
}

DEFAULT_EXCLUDED_TITLE_FRAGMENTS = (
    "Music Video",
    "MV",
    "Making",
    "メイキング",
    "off vocal",
    "Instrumental",
    "イコノイジョイ",
    "社員旅行",
    "TV ver",
)

kakasi = pykakasi.kakasi()


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
    profile_path: str = "/feature/profile"
    title_aliases: dict[str, str] = field(default_factory=dict)
    release_title_aliases: dict[str, str] = field(default_factory=dict)
    credit_overrides: dict[str, dict[str, str]] = field(default_factory=dict)
    special_tracks: list[dict] = field(default_factory=list)
    graduated_members: list[GraduatedMemberOverride] = field(default_factory=list)
    group_member_overrides: dict[str, list[str]] = field(default_factory=dict)
    member_color_overrides: dict[str, dict[str, object]] = field(default_factory=dict)
    clear_member_color_arrays: bool = False

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
        fragments = [*DEFAULT_EXCLUDED_TITLE_FRAGMENTS, *self.sister_group_markers]
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
    return re.sub(r'[\s・!！?？「」『」"“”.,，、。:：\-ー〜~♡]+', "", text).lower()


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
    response = requests.get(url, params=params, headers=UA, timeout=30)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


@dataclass
class ReleaseTrack:
    track_no: int
    title: str
    raw_title: str


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
    first = requests.get(list_url, params={"list": "1"}, headers=UA, timeout=30)
    first.raise_for_status()
    match = re.search(r"var maxpage = (\d+)", first.text)
    max_page = int(match.group(1)) if match else 1

    paths: list[str] = []
    for page in range(1, max_page + 1):
        soup = get_soup(list_url, params={"list": "1", "page": page})
        for anchor in soup.select('a[href*="/discography/detail/"]'):
            href = anchor.get("href")
            if href and href not in paths:
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

    return Release(
        url=url,
        title=release_title,
        release_date=release_date,
        release_type=release_type,
        cover_source_url=cover_source_url,
        tracks=tracks,
    )


def should_keep_raw_track(config: ProjectConfig, raw_title: str) -> bool:
    if not raw_title:
        return False
    if config.excluded_title_pattern.search(raw_title):
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

            tracks.append(
                ReleaseTrack(
                    track_no=int(track_no),
                    title=clean_title(raw_title, config),
                    raw_title=raw_title,
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

            tracks.append(
                ReleaseTrack(
                    track_no=int(track_no),
                    title=clean_title(raw_title, config),
                    raw_title=raw_title,
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


def parse_utanet_song_detail(url: str) -> tuple[str, str | None]:
    if not url:
        return "", None
    soup = get_soup(url)
    release_date = ""
    text = soup.get_text("\n", strip=True)
    match = re.search(r"発売日[:：]\s*(\d{4}/\d{2}/\d{2})", text)
    if match:
        release_date = match.group(1).replace("/", "-")

    cover_source_url = None
    for image in soup.find_all("img"):
        src = image.get("src") or ""
        alt = normalize(image.get("alt"))
        if (
            src
            and alt
            and not any(
                marker in src
                for marker in (
                    "logo",
                    "header_icon",
                    "menu_icon",
                    "icon_",
                    "ranking",
                    "form_title",
                )
            )
        ):
            cover_source_url = urljoin(UTANET_BASE, src)
            break
    return release_date, cover_source_url


def should_prefer_release(candidate: dict, current: dict | None) -> bool:
    if current is None:
        return True
    if candidate["releaseDate"] < current["releaseDate"]:
        return True
    if candidate["releaseDate"] == current["releaseDate"]:
        candidate_title = candidate["releaseTitle"]["ja"]
        current_title = current["releaseTitle"]["ja"]
        return "Type-A" in candidate_title and "Type-A" not in current_title
    return False


def download_cover(config: ProjectConfig, source_url: str, song_id: str) -> str:
    config.covers_dir.mkdir(parents=True, exist_ok=True)
    destination = config.covers_dir / f"{song_id}.jpg"
    if destination.exists() and destination.stat().st_size > 0:
        return f"/covers/{config.project_id}/{destination.name}"

    response = requests.get(source_url, headers=UA, timeout=30)
    response.raise_for_status()

    try:
        image = Image.open(io.BytesIO(response.content)).convert("RGB")
        width, height = image.size
        side = min(width, height)
        left = (width - side) // 2
        top = (height - side) // 2
        image = image.crop((left, top, left + side, top + side))
        image.thumbnail((900, 900), Image.Resampling.LANCZOS)
        image.save(destination, "JPEG", quality=88, optimize=True)
    except Exception:
        destination.write_bytes(response.content)

    return f"/covers/{config.project_id}/{destination.name}"


def load_existing_romaji(config: ProjectConfig) -> dict[str, str]:
    if not config.songs_path.exists():
        return {}
    songs = json.loads(config.songs_path.read_text(encoding="utf-8"))
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


def build_song_data(config: ProjectConfig) -> tuple[list[dict], dict[str, int]]:
    members = json.loads(config.members_path.read_text(encoding="utf-8"))
    active_member_ids = [member["id"] for member in members if member.get("active")]
    member_name_to_id = {
        normalize(member["name"]["ja"]).replace(" ", ""): member["id"]
        for member in members
    }
    existing_romaji = load_existing_romaji(config)

    releases: list[Release] = []
    for kind in (1, 2):
        for detail_path in list_official_detail_paths(config, kind):
            releases.append(parse_release(config, detail_path))
            time.sleep(0.08)
    release_cover_sources = {
        release.url: release.cover_source_url
        for release in releases
        if release.cover_source_url
    }

    official_songs: dict[str, dict] = {}
    for release in releases:
        for track in release.tracks:
            key = title_key(track.title, config)
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
            }

            if key not in official_songs or should_prefer_release(
                candidate,
                official_songs.get(key),
            ):
                official_songs[key] = candidate

    credit_rows: dict[str, dict[str, str]] = {}
    for row in parse_utanet_artist_rows(config):
        credit_rows[title_key(row["title"], config)] = row

    searched_credit_count = 0
    for key, song in list(official_songs.items()):
        if key in credit_rows:
            continue
        row = search_utanet_credit(config, song["title"]["ja"])
        if row:
            credit_rows[title_key(row["title"], config)] = row
            searched_credit_count += 1
            time.sleep(0.08)

    final_songs: dict[str, dict] = {}
    excluded_official_without_credits = 0
    for key, song in official_songs.items():
        credit = credit_rows.get(key)
        if not credit:
            excluded_official_without_credits += 1
            continue
        final_songs[key] = {**song, "credit": credit}

    for key, credit in credit_rows.items():
        if key in final_songs or not is_participating_artist(config, credit["artist"]):
            continue
        release_date, cover_source_url = parse_utanet_song_detail(credit["url"])
        final_songs[key] = {
            "title": localized(credit["title"]),
            "releaseTitle": localized(credit["title"]),
            "releaseType": "digital",
            "releaseDate": release_date,
            "trackNo": 1,
            "trackType": "title",
            "coverSourceUrl": cover_source_url,
            "officialUrl": credit["url"],
            "credit": credit,
        }
        time.sleep(0.08)

    special_tracks_added = 0
    for track in config.special_tracks:
        key = title_key(track["title"], config)
        if key in final_songs:
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
        preferred_romaji = existing_romaji.get(key)
        if preferred_romaji:
            song["title"]["romaji"] = preferred_romaji

        song_id_base = slugify(song["title"]["romaji"] or song["title"]["ja"])
        song_id = song_id_base
        suffix = 2
        while song_id in used_ids:
            song_id = f"{song_id_base}-{suffix}"
            suffix += 1
        used_ids.add(song_id)

        credit = song["credit"]
        artist = credit["artist"] or config.group_artist
        artist_member_ids = split_artist_members(config, artist, member_name_to_id)
        is_group_song = is_group_artist(config, artist)

        source_cover = song.get("coverSourceUrl")
        if not source_cover and credit.get("url"):
            _, source_cover = parse_utanet_song_detail(credit["url"])
        if not source_cover:
            raise RuntimeError(f"No cover source found for {song['title']['ja']}")

        cover_url = download_cover(config, source_cover, song_id)
        time.sleep(0.08)

        tags = [
            song["releaseType"],
            song["trackType"],
            song["releaseDate"][:4] if song.get("releaseDate") else "date-tbd",
            *song.get("tags", []),
        ]
        if not is_group_song and is_participating_artist(config, artist):
            tags.append("solo" if len(artist_member_ids) <= 1 else "unit")

        member_ids = song.get("memberIds")
        if member_ids is None:
            member_ids = list(active_member_ids if is_group_song else artist_member_ids)
        else:
            member_ids = list(member_ids)
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
            "credits": {
                "lyricist": localized(credit["lyricist"]),
                "composer": localized(credit["composer"]),
                "arranger": localized(credit["arranger"]),
            },
            "officialUrl": song.get("officialUrl") or credit.get("url"),
            "creditSourceUrl": credit.get("url"),
        }

        for optional_key in ("visibility", "sourceStatus", "sourceNote"):
            if song.get(optional_key):
                output_song[optional_key] = song[optional_key]

        if not output_song["releaseDate"]:
            output_song.pop("releaseDate")
        if not output_song["memberIds"]:
            output_song.pop("memberIds")

        output.append(output_song)

    stats = {
        "officialReleases": len(releases),
        "officialSongs": len(official_songs),
        "creditRows": len(credit_rows),
        "searchedCreditRows": searched_credit_count,
        "excludedOfficialWithoutCredits": excluded_official_without_credits,
        "specialTracksAdded": special_tracks_added,
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


def sync_project(config: ProjectConfig) -> None:
    members = parse_members(config)
    config.members_path.write_text(
        json.dumps(members, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    songs, stats = build_song_data(config)
    config.songs_path.write_text(
        json.dumps(songs, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(json.dumps({"project": config.project_id, **stats}, ensure_ascii=False, indent=2))
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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    sync_project(PROJECT_CONFIGS[args.project]())


if __name__ == "__main__":
    main()
