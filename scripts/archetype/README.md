# =LOVE Archetype Offline Authoring Tool

This directory contains a one-time, offline authoring pipeline for the standard
=LOVE Top 10 experience. It is not imported by the web app and adds no runtime
AI, backend, media downloader, or media cache.

## Fixed contract

- API: Gemini Interactions API at `v1beta/interactions`, called with Node 22
  native `fetch`.
- Model: `gemini-3.6-flash`.
- State: every song is an independent request with `store: false`. The request
  never includes `previous_interaction_id` or background execution.
- Structured output: top-level `response_format` with an `application/json`
  schema.
- Queue: sequential, client-side rate limiting only. The Interactions API is not
  submitted through the provider Batch API.
- Agent boundary: the generator uses a standard Gemini model interaction only.
  Antigravity IDE may be used as a development environment to run the script,
  but no Antigravity agent is called and it is not a classifier fallback.
- Video: direct public YouTube URI only. The tool never downloads or caches
  audio/video.
- Scope: `projectId=equal-love`, `experienceId=standard-top10` only.
- Dimensions: `drive`, `care`, `rhythm`, `growth`, `drama`, `ingenuity`,
  `uplift`, `cuteness`. Every row has exactly two score-2 dominants, one distinct
  score-1 accent, and five zeroes.

The source map must pass `source-map.schema.json` and the stricter runtime
validator. Each entry declares an official canonical YouTube video URL and its
reviewed duration. `official-live` is accepted only for a `single-song` clip no
longer than 15 minutes. A full concert or other long-form source must use
`text-only`, include a non-empty source note, and carry both
`long_video_text_only` and `human_review_required`. In that mode the URL remains
provenance, but the request contains text only; the tool does not send the long
video to Gemini and does not switch to another generation API.

## Source map shape

```json
{
  "schemaVersion": 1,
  "projectId": "equal-love",
  "experienceId": "standard-top10",
  "songs": [
    {
      "songId": "example-song",
      "title": "Example Song",
      "sourceMode": "official-mv",
      "sourceUrl": "https://www.youtube.com/watch?v=EXAMPLE123",
      "durationSeconds": 240,
      "clipScope": "single-song",
      "sourceAuthority": "official",
      "sourceNotes": "",
      "qaFlags": []
    }
  ]
}
```

The source map is an audited author input: URL syntax can be checked locally,
but public visibility, channel ownership, and duration must be verified by the
author before live execution.

## Safe workflow

First run the local tests:

```powershell
node --test scripts/archetype/test-archetype-labeler.mjs
```

Then run a zero-call preflight. `--smoke` deterministically selects exactly the
first eight validated songs:

```powershell
node scripts/archetype/label-archetypes.mjs `
  --source-map C:\path\to\source-map.json `
  --dry-run `
  --smoke
```

The printed plan includes full-source-map referenced YouTube seconds, actual
full-source-map YouTube preview input seconds, remaining seconds under the
eight-hour daily preview gate, the selected queue seconds, expected request
count, frozen count, and low/default video-token estimates for the selected
queue.
The token estimates use the current documented approximations of 100 tokens per
second at low media resolution and 300 at default; they exclude text, output,
and provider pricing.

Live execution is explicit and refuses to start unless `GEMINI_API_KEY` exists
and `--confirm-calls` exactly matches the preflight request count. The value of
the key is never printed or written to requests, results, plans, or checkpoints.

```powershell
$env:GEMINI_API_KEY = "set-outside-shell-history"
node scripts/archetype/label-archetypes.mjs `
  --source-map C:\path\to\source-map.json `
  --output-dir C:\path\to\archetype-run `
  --live `
  --smoke `
  --confirm-calls 8
```

Each schema-valid song is atomically written under `results/`, then recorded in
`checkpoint.json`. A restart validates and freezes existing results and only
queues missing songs. Any source, model, prompt, result, timestamp, dimension,
or checkpoint mismatch stops the run; previously frozen rows remain intact.

The official public-YouTube preview limit is eight hours per day on the free
tier and may change. The source map is fully validated before smoke selection,
and the actual video inputs are summed before any request. If that sum exceeds
the gate, execution fails closed.
