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

`npm run sync:songs:all` is the non-destructive catalog-only variant used by automation. It discovers releases from the three official discography sites; Uta-Net only enriches official candidates with credits and does not block official announcements. A song may enter as `announced` or `credits_pending` once its official title, release, cover, detail URL, and conservative group-ownership evidence are known.

`.github/workflows/daily-discography-sync.yml` runs this catalog sync every day at 05:17 JST. It accepts only trusted additions or narrowly scoped credits completion, validates and builds all three sites, restores Next.js's generated `next-env.d.ts`, then commits generated data to `main`; the connected Cloudflare Pages projects deploy that commit. Ambiguous ownership or a newly malformed official detail page stops for review. Heuristic catalog ownership never guesses participating `memberIds`; exact group/solo/unit participation is filled only from trusted artist or credit evidence.

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS, and `html2canvas`.

## License

This project is adapted from [rurimegu/MyPickHasunosora](https://github.com/rurimegu/MyPickHasunosora), which is licensed under the MIT License.

## Disclaimer

This is an unofficial fan-made project. Group names, song titles, images, and related marks belong to their respective rights holders.
