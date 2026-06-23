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

- =LOVE now has event-specific five-song pick pages alongside the standard Top 10 picker.
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

Requires Node.js 20.9 or newer.

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

Project data lives in `src/projects/<project-id>/`. Each project has `members.json` and `songs.json`; cover images live in `public/covers/<project-id>/`.

```bash
npm run sync:data:all
npm run validate:data
```

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS, and `html2canvas`.

## License

This project is adapted from [rurimegu/MyPickHasunosora](https://github.com/rurimegu/MyPickHasunosora), which is licensed under the MIT License.

## Disclaimer

This is an unofficial fan-made project. Group names, song titles, images, and related marks belong to their respective rights holders.
