# MyPickEqualLove

MyPickEqualLove is an unofficial ＝LOVE fan tool for choosing favorite songs and exporting a shareable Top Picks image.

This fork replaces the Hasunosora-specific `Unit × GradeClass` grid with a ＝LOVE-oriented Top Picks board:

- Top 10 configurable pick slots (`#1` through `#10`)
- Song search across Japanese titles, romaji, release metadata, members, credits, and tags
- Filters for release type, track type, year, member, and tag
- Local persistence under `equal_love_mypicks_v1`
- 1080×1350 export image using local assets to avoid cross-origin canvas issues
- Static Next.js export via `next.config.ts`
- Visual system based on the official ＝LOVE site: `Comfortaa`-style typography, white/black linework, stripe texture, and official-site category colors such as `#ea6c81`, `#f9769f`, `#f19bc2`, `#6ce0b6`, `#986ad6`, and `#0089ff`

## Data Status

The bundled `src/data/equal-love-songs.json` was synced on 2026-06-14 and contains 76 ＝LOVE songs from the public sources below:

- Official ＝LOVE discography pages for single/album release dates, CD track lists, official detail URLs, and cover images
- 歌ネット artist/song pages for lyricist, composer, arranger, solo/unit artist names, digital-only songs, and credit source URLs

The sync excludes instrumental tracks, music-video/DVD tracks, TV-size variants, and sister-group tracks credited to ≠ME or ≒JOY even when those tracks appear on ＝LOVE physical releases. Each included song has a local JPEG cover under `public/covers/equal-love/...` and complete `credits.lyricist`, `credits.composer`, and `credits.arranger` metadata.

Still needs manual completion before public use:

- Audited `centerMemberIds`, historical participation data, and former-member metadata
- Catalog metadata beyond the app's current song-level fields
- Final production domain in `src/utils/constants.ts`, `public/robots.txt`, and `public/sitemap.xml`

Current member names were checked against the official ＝LOVE profile page, and release category/date examples were checked against the official discography pages. Member colors in this project are theme colors, not claimed official colors.

The UI references the public official site styling cues available in June 2026: the site loads Google Font `Comfortaa`, uses a mostly white/black layout, pink action/category accents, fine black dividers, and small colored category labels. No official logo asset is bundled by default.

## Getting Started

Requires Node.js 20.9 or newer. The dependency stack uses Next.js 16 and Tailwind CSS 4 native bindings, so Node 16 is not supported.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app locally.

To refresh the local song dataset and covers:

```bash
python3 -m pip install --user requests beautifulsoup4 Pillow pykakasi
npm run sync:data
```

The sync command rewrites `src/data/equal-love-songs.json` and downloads optimized local covers.

## Verification

```bash
npm run validate:data
npm run lint
npm run build
```

`npm run build` uses Next.js static export and writes the static site to `out/`.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- html2canvas
- Browser `localStorage`

## Attribution

This project was adapted from [rurimegu/MyPickHasunosora](https://github.com/rurimegu/MyPickHasunosora), which is MIT licensed.

## Disclaimer

This is an unofficial fan-made tool. ＝LOVE names, song titles, images, and related marks belong to their respective rights holders. Cover images are stored locally only so the static export and html2canvas image export can work without cross-origin canvas failures.
