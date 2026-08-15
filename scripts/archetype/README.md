# =LOVE Archetype Offline Authoring Tool

This directory contains a one-time, offline authoring pipeline for the standard
=LOVE Top 10 experience. It is not imported by the web app and adds no runtime
AI, backend, media downloader, or media cache.

## Fixed contract

- API: Gemini Interactions API at `v1beta/interactions`, called with Node 22
  native `fetch`.
- Model: exact standard model ID `gemini-3.7-flash`; aliases such as
  `gemini-flash-latest` and specialized EAP video models are not allowed.
- REST schema revision: every request includes
  `Api-Revision: 2026-05-20`.
- Generation: every request fixes `thinking_level: "medium"` and
  `max_output_tokens: 2048` for the 85-song production balance. `minimal` is
  invalid for this model, `low` is not used for authoring, and `high` is reserved
  for possible manual exception review rather than an automatic retry pipeline.
  Sampling parameters (`temperature`, `top_p`, `top_k`) are never sent.
- State: every song is an independent request with `store: false`. The request
  never includes `previous_interaction_id` or background execution.
- Structured output: one top-level `response_format` object with
  `type: "text"`, `mime_type: "application/json"`, and the assessment schema.
- Queue: sequential, client-side rate limiting only. The Interactions API is not
  submitted through the provider Batch API.
- Agent boundary: the generator uses a standard Gemini model interaction only.
  Antigravity IDE may be used as a development environment to run the script,
  but no Antigravity agent is called and it is not a classifier fallback.
- Video: direct public YouTube URI only. The tool never downloads or caches
  audio/video.
- Scope: `projectId=equal-love`, `experienceId=standard-top10` only.
- Rubric: `rubricVersion=gemini-video-v1`. Frozen model rows are always
  `status=draft` with `confidence=low|medium|high`; only a later deterministic
  consolidation/QA stage may create an approved matcher record.
- Dimensions: `drive`, `care`, `rhythm`, `growth`, `drama`, `ingenuity`,
  `uplift`, `cuteness`. Every row has exactly two score-2 dominants, one distinct
  score-1 accent, and five zeroes.

The source map must pass `source-map.schema.json` and the stricter runtime
validator. Each entry declares an official canonical YouTube video URL, its
reviewed duration, and frozen provider identity (`videoId`, video title,
`channelId`, and channel title). The URL video ID must match `videoId` exactly.
Supported video modes are `official-mv`, `official-art-track`,
`official-dance`, and `official-live`; the last is accepted only for a
`single-song` clip no longer than 15 minutes. A full concert or other long-form source must use
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
      "videoId": "EXAMPLE123",
      "videoTitle": "Example Song (Official Video)",
      "channelId": "UCEXAMPLE123",
      "channelTitle": "=LOVE Official YouTube Channel",
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
queues missing songs. The plan, checkpoint, and result envelope pin `modelId`,
`apiRevision`, `thinkingLevel`, and `maxOutputTokens`. Any source, model, API
revision, generation setting, prompt, result, timestamp, dimension, or
checkpoint mismatch stops the run; previously frozen rows remain intact.

The official public-YouTube preview limit is eight hours per day on the free
tier and may change. The source map is fully validated before smoke selection,
and the actual video inputs are summed before any request. If that sum exceeds
the gate, execution fails closed.

## Contract audit and official references

After changes, scan the contract for forbidden model drift and legacy API
shapes:

```powershell
rg -n "gemini-3\.6|gemini-flash-latest|generateContent|response_mime_type|minimal|temperature|top_p|top_k|Api-Revision" scripts/archetype
```

The implementation follows Google's current [latest model
guide](https://ai.google.dev/gemini-api/docs/latest-model), [Interactions API
reference](https://ai.google.dev/static/api/interactions.md.txt), and [May 2026
breaking-changes
guide](https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026).
The latest-model guide identifies the standard `gemini-3.7-flash` model as GA;
the breaking-changes guide defines the `2026-05-20` revision, `steps` response,
and polymorphic `response_format` contract used here.
