#!/usr/bin/env python3
"""Sync =LOVE song metadata from public discography and lyrics sources.

Primary release/cover source:
  https://equal-love.jp/discography/

Credits source:
  https://www.uta-net.com/artist/23032/

The official discography includes some sister-group tracks on =LOVE releases, so
the final song set keeps tracks that can be matched to an Uta-Net artist of
`=LOVE` or a member artist name ending in `(=LOVE)`.
"""

from __future__ import annotations

import io
import json
import re
import time
import unicodedata
from dataclasses import dataclass
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
SONGS_PATH = ROOT / "src/data/equal-love-songs.json"
MEMBERS_PATH = ROOT / "src/data/equal-love-members.json"
COVERS_DIR = ROOT / "public/covers/equal-love"

OFFICIAL_BASE = "https://equal-love.jp"
UTANET_BASE = "https://www.uta-net.com"
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
    ),
}

TITLE_ALIASES = {
    "Want  you!Want  you!": "Want you!Want you!",
    "Want  you! Want  you!": "Want you!Want you!",
    "Sweetest girl(=LOVE)": "Sweetest girl",
    "推しのいる世界(=LOVE)": "推しのいる世界",
    "届いてLOVE YOU♡": "届いてLOVE YOU",
    "現役アイドルちゅ~": "現役アイドルちゅ～",
    "ナツマトペ": "ナツマトぺ",
    "/7": "24/7",
}

CREDIT_OVERRIDES = {
    # Uta-Net leaves the arranger cell blank for this row, while public
    # songwriter/arranger listings credit ArmySlick and YUU for YOU.
    "The 5th": {"arranger": "ArmySlick・YUU for YOU"},
}

RELEASE_TITLE_ALIASES = {
    "青春”サブリミナル”": "青春“サブリミナル”",
}

EXCLUDED_TITLE_PATTERNS = re.compile(
    r"(≠ME|≒JOY|Music Video|MV|Making|メイキング|イコノイジョイ|社員旅行|TV ver)",
    re.IGNORECASE,
)

kakasi = pykakasi.kakasi()


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


def clean_title(value: str) -> str:
    text = normalize(value).replace("！", "!").replace("？", "?")
    text = re.sub(r"\s*-?\s*Instrumental\s*-?$", "", text, flags=re.IGNORECASE)
    text = unwrap_quotes(text)
    text = TITLE_ALIASES.get(text, text)
    text = re.sub(r"\s*\(=LOVE\)\s*$", "", text).strip()
    return TITLE_ALIASES.get(text, text)


def clean_release_title(value: str) -> str:
    text = normalize(value).replace("！", "!").replace("？", "?")
    for source, replacement in RELEASE_TITLE_ALIASES.items():
        text = text.replace(source, replacement)
    return text


def title_key(value: str) -> str:
    text = clean_title(value).replace("”", '"').replace("“", '"')
    return re.sub(r'[\s・!！?？「」『」"“”.,，、。:：\-ー〜~]+', "", text).lower()


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


def slugify(value: str) -> str:
    romaji = romanize(value).lower()
    romaji = romaji.replace("=", "equal")
    slug = re.sub(r"[^a-z0-9]+", "-", romaji).strip("-")
    return slug or re.sub(r"[^a-z0-9]+", "-", title_key(value)).strip("-")


def localized(value: str) -> dict[str, str]:
    return {"ja": normalize(value), "romaji": romanize(value)}


def get_soup(url: str, *, params: dict[str, str | int] | None = None) -> BeautifulSoup:
    response = requests.get(url, params=params, headers=UA, timeout=30)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


def list_official_detail_paths(kind: int) -> list[str]:
    first = requests.get(
        f"{OFFICIAL_BASE}/discography/kind/{kind}/",
        params={"list": "1"},
        headers=UA,
        timeout=30,
    )
    first.raise_for_status()
    match = re.search(r"var maxpage = (\d+)", first.text)
    max_page = int(match.group(1)) if match else 1

    paths: list[str] = []
    for page in range(1, max_page + 1):
        soup = get_soup(
            f"{OFFICIAL_BASE}/discography/kind/{kind}/",
            params={"list": "1", "page": page},
        )
        for anchor in soup.select('a[href*="/discography/detail/"]'):
            href = anchor.get("href")
            if href and href not in paths:
                paths.append(href)
    return paths


def parse_release(path: str) -> Release:
    url = urljoin(OFFICIAL_BASE, path)
    soup = get_soup(url)

    cover_source_url = None
    for image in soup.find_all("img"):
        src = image.get("src") or ""
        if "/contents/discography/" in src:
            cover_source_url = urljoin(OFFICIAL_BASE, src)
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
    )

    text = soup.get_text("\n", strip=True)
    date_match = re.search(r"RELEASE\s*(\d{4}\.\d{2}\.\d{2})", text)
    release_date = date_match.group(1).replace(".", "-") if date_match else ""
    release_type = "single" if "SINGLE" in category else "album"

    tracks: list[ReleaseTrack] = []
    for track_list in soup.select("ol.trackList"):
        disc_type = normalize(
            (track_list.select_one(".discType") or track_list).get_text(" ", strip=True),
        )
        # Current pages use "CD"; older pages use "DISC 1" for the CD and
        # "DISC 2" for DVD content.
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
            if (
                not track_no.isdigit()
                or not raw_title
                or re.search(r"instrumental", raw_title, re.IGNORECASE)
                or EXCLUDED_TITLE_PATTERNS.search(raw_title)
            ):
                continue

            tracks.append(
                ReleaseTrack(
                    track_no=int(track_no),
                    title=clean_title(raw_title),
                    raw_title=raw_title,
                ),
            )

    return Release(
        url=url,
        title=release_title,
        release_date=release_date,
        release_type=release_type,
        cover_source_url=cover_source_url,
        tracks=tracks,
    )


def parse_utanet_rows_from_soup(soup: BeautifulSoup) -> list[dict[str, str]]:
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
        title = clean_title(title_el.get_text(" ", strip=True))
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
        credit.update(CREDIT_OVERRIDES.get(title, {}))
        rows.append(credit)
    return rows


def parse_utanet_artist_rows() -> list[dict[str, str]]:
    soup = get_soup(f"{UTANET_BASE}/artist/23032/")
    return [
        row
        for row in parse_utanet_rows_from_soup(soup)
        if row["artist"] == "=LOVE"
    ]


def search_utanet_credit(title: str) -> dict[str, str] | None:
    soup = get_soup(
        f"{UTANET_BASE}/search/",
        params={"Aselect": "2", "Bselect": "3", "Keyword": clean_title(title)},
    )
    for row in parse_utanet_rows_from_soup(soup):
        if (
            title_key(row["title"]) == title_key(title)
            and "=LOVE" in row["artist"]
            and "≠ME" not in row["artist"]
            and "≒JOY" not in row["artist"]
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


def download_cover(source_url: str, song_id: str) -> str:
    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    destination = COVERS_DIR / f"{song_id}.jpg"
    if destination.exists() and destination.stat().st_size > 0:
        return f"/covers/equal-love/{destination.name}"

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

    return f"/covers/equal-love/{destination.name}"


def load_existing_romaji() -> dict[str, str]:
    if not SONGS_PATH.exists():
        return {}
    songs = json.loads(SONGS_PATH.read_text(encoding="utf-8"))
    return {
        title_key(song["title"]["ja"]): song["title"].get("romaji", "")
        for song in songs
        if song.get("title", {}).get("ja")
    }


def split_artist_members(artist: str, member_name_to_id: dict[str, str]) -> list[str]:
    artist = normalize(artist)
    artist = artist.replace("(=LOVE)", "")
    ids: list[str] = []
    for name in re.split(r"[、,/・]+", artist):
        member_id = member_name_to_id.get(normalize(name).replace(" ", ""))
        if member_id and member_id not in ids:
            ids.append(member_id)
    return ids


def build_song_data() -> tuple[list[dict], dict[str, int]]:
    members = json.loads(MEMBERS_PATH.read_text(encoding="utf-8"))
    active_member_ids = [member["id"] for member in members if member.get("active")]
    member_name_to_id = {
        normalize(member["name"]["ja"]).replace(" ", ""): member["id"]
        for member in members
    }
    existing_romaji = load_existing_romaji()

    releases: list[Release] = []
    for kind in (1, 2):
        for detail_path in list_official_detail_paths(kind):
            releases.append(parse_release(detail_path))
            time.sleep(0.08)

    official_songs: dict[str, dict] = {}
    for release in releases:
        for track in release.tracks:
            key = title_key(track.title)
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
    for row in parse_utanet_artist_rows():
        credit_rows[title_key(row["title"])] = row

    searched_credit_count = 0
    for key, song in list(official_songs.items()):
        if key in credit_rows:
            continue
        row = search_utanet_credit(song["title"]["ja"])
        if row:
            credit_rows[title_key(row["title"])] = row
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

    # Add =LOVE songs that exist in Uta-Net but not in the official single/album
    # discography page, such as digital-only/tie-up releases.
    for key, credit in credit_rows.items():
        if key in final_songs or credit["artist"] != "=LOVE":
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
        key = title_key(song["title"]["ja"])
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
        artist = credit["artist"] or "=LOVE"
        artist_member_ids = split_artist_members(artist, member_name_to_id)
        is_group_song = artist == "=LOVE"

        source_cover = song.get("coverSourceUrl")
        if not source_cover and credit.get("url"):
            _, source_cover = parse_utanet_song_detail(credit["url"])
        if not source_cover:
            raise RuntimeError(f"No cover source found for {song['title']['ja']}")

        cover_url = download_cover(source_cover, song_id)
        time.sleep(0.08)

        tags = [
            song["releaseType"],
            song["trackType"],
            song["releaseDate"][:4] if song.get("releaseDate") else "date-tbd",
        ]
        if artist != "=LOVE":
            tags.append("solo" if len(artist_member_ids) <= 1 else "unit")

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
            "memberIds": active_member_ids if is_group_song else artist_member_ids,
            "tags": sorted(set(tags)),
            "credits": {
                "lyricist": localized(credit["lyricist"]),
                "composer": localized(credit["composer"]),
                "arranger": localized(credit["arranger"]),
            },
            "officialUrl": song.get("officialUrl") or credit.get("url"),
            "creditSourceUrl": credit.get("url"),
        }

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
        "finalSongs": len(output),
    }
    return output, stats


def main() -> None:
    songs, stats = build_song_data()
    SONGS_PATH.write_text(
        json.dumps(songs, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    print(f"Wrote {len(songs)} songs to {SONGS_PATH}")


if __name__ == "__main__":
    main()
