# Atlas public Event projection (E1)

This directory owns the E1 source decision receipt and deterministic projector.
The three `src/projects/*/live-experiences.json` files remain the only manual
Event/Performance/venue/date/setlist authoring sources. Their matching
`songs.json` files are read only to close namespaced song references.

## Commands

Run these from the repository root:

```text
node --test scripts/atlas/public-event-projection.test.mjs
node scripts/atlas/generate-public-event-projection.mjs
node scripts/atlas/check-public-event-projection.mjs
```

`generate` writes the final artifact atomically only after the receipt, pinned
source bytes, pinned C0 contract bytes, strict source shape, counts, dates,
timezone/lifecycle metadata, and song references all pass in memory. A HOLD,
withdrawal, drift, or schema failure invalidates an existing artifact and exits
nonzero. `check` performs the same audit without writing; it exits nonzero for
HOLD/withdrawal, missing or changed inputs, an absent artifact, a hand-edited
artifact, or a C0 schema change.

The current receipt is intentionally HOLD for all three seeds. Existing
`published`, `verified`, coverage, and unresolved values do not approve Atlas
publication. No public projection is valid while any one seed is HOLD.

## Deterministic revisions and hash

`sourceRevision` is `sha256:` plus the SHA-256 of canonical UTF-8 JSON for the
versioned receipt input: source commit, historical baseline, ordered C0 contract
hashes, and ordered seed decisions/source hashes/song hashes. Canonical JSON
sorts object keys recursively and preserves array order. It contains no clock
value.

`artifactHash` is `sha256:` plus the SHA-256 of the projection's canonical UTF-8
payload after removing `artifactHash`. The stored artifact is the recursively
key-sorted projection, formatted with two spaces and one final newline, so
identical inputs produce byte-identical output.

For a future GO, every Event in a seed must carry one `publicAtlasEvidence`
object with explicit `asOf`, `lastVerifiedAt`, IANA `timezone`, public
`lifecycle`, fail-closed refresh policy, and maintenance owner. That metadata is
defined to cover the Event and its child Performances; the C0 contract requires
the projected Performance timezone to match its parent Event. A receipt GO must
also cite explicit source-use approval and claim-level evidence. Adding those
fields requires real repository evidence and a fresh reviewed receipt; this
projector never infers them from route publication or verification status.
