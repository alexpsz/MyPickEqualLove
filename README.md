# MyPick Sister Projects

Fan-made static web apps for creating shareable Top 10 song boards for =LOVE, ≒JOY, and ≠ME.

[MyPickEqualLove](https://mypick.kozueginko.com) · [MyPickNearlyEqualJoy](https://mypick-nearly-equal-joy.kozueginko.com) · [MyPickNotEqualMe](https://mypick-not-equal-me.kozueginko.com)

![EqualLove_MyPicks](docs/equal-love-mypicks-preview.png)

## Features

- Pick up to 10 favorite songs from the current group's catalog.
- Search and filter by song, release, year, member, and credits.
- Save picks and export options locally in the browser.
- Generate a PNG board for download or sharing to X.
- Build three sister sites from one shared codebase.

## Live Specials

- =LOVE now has event-specific six-pick pages alongside the standard Top 10 picker.
- `/live/kokuritsu-2026/` creates a Kokuritsu 2026 afterglow board with `DAY 1`, `DAY 2`, and `2 DAYS` contexts.
- `/live/tokyo-dome-2027/` creates a Tokyo Dome 2027 wishlist board.
- Live specials use their own saved picks, PNG export layout, filenames, and share text.

![EqualLove_Kokuritsu2026_Afterglow_DAY1](docs/equal-love-kokuritsu-2026-afterglow-day1.png)

## Projects

| Project ID         | Site                 | Build command                    |
| ------------------ | -------------------- | -------------------------------- |
| `equal-love`       | MyPickEqualLove      | `npm run build:equal-love`       |
| `nearly-equal-joy` | MyPickNearlyEqualJoy | `npm run build:nearly-equal-joy` |
| `not-equal-me`     | MyPickNotEqualMe     | `npm run build:not-equal-me`     |

Each build writes a static export to `out/`.

To preview the most recently built static export locally:

```bash
npm run build:equal-love
npm start
```

`npm run verify` runs the repository boundary, lint, type check, data and
contract tests, then builds and verifies all three static exports in sequence.

## Local Development

Requires Node.js 20.9 or newer; `.node-version` selects Node.js 22 for local and Cloudflare builds that support it.

```bash
npm install
npm run dev:equal-love
```

Other local targets:

```bash
npm run dev:nearly-equal-joy
npm run dev:not-equal-me
```

Open [http://localhost:3000](http://localhost:3000).

## Data

There is no runtime database. Project data is versioned in `src/projects/<project-id>/`: each project has `members.json` and `songs.json`, while cover images live in `public/covers/<project-id>/`.

```bash
python -m pip install -r requirements-discography.txt
npm run sync:data:all
npm run validate:data
```

`npm run sync:songs:all` is the catalog-only variant used by automation. It discovers releases from the three official discography sites and their release-news feeds; Uta-Net only enriches official candidates with credits. Public song data is written only after the release identity, cover, ownership, participants, and lyricist/composer/arranger are complete. Incomplete or ambiguous announcements remain review candidates instead of becoming placeholder catalog records.

`.github/workflows/daily-discography-sync.yml` runs every day at 05:17 JST. A read-only scan produces source receipts and a review artifact; only a fully closed candidate passes the data gate, lint, type-check, and all three static builds. A separate least-privilege publish job verifies the exact base commit and artifact hashes before pushing the catalog-only patch to `main`, where the connected Cloudflare Pages projects deploy it. Uta-Net access failures are reported as degraded and never create incomplete credits. Canonical `releaseDate` normally means the earliest verified commercial CD or digital release. For a verified advance-digital/primary-release campaign, it uses the advance date until the primary release occurs and then switches the entire release bundle atomically; unrelated later reissues never overwrite it. An MV, preview, news post, or live performance does not count.

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS, and `html2canvas`.

## License

This project is adapted from [rurimegu/MyPickHasunosora](https://github.com/rurimegu/MyPickHasunosora), which is licensed under the MIT License.

## Disclaimer

This is an unofficial fan-made project. Group names, song titles, images, and related marks belong to their respective rights holders.
