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
timezone/lifecycle metadata, and song references all pass in memory. The
receipt paths are fixed allowlists. Its `sourceCommit` must be a real Git commit,
and every audited source, songs, C0 contract, and approval-evidence blob at that
commit must be byte-identical to both the receipt hash and current file. Reads
also verify realpath containment so a symlink or junction cannot escape the
repository.

A HOLD, withdrawal, stale source, drift, or schema failure invalidates an
existing artifact and exits nonzero. `check` performs the same audit without
writing; it exits nonzero for HOLD/withdrawal/staleness, missing or changed
inputs, an absent artifact, a hand-edited artifact, or a C0 schema change. Both
commands accept only the exact repository-relative generated-artifact path; an
arbitrary caller path is never read, removed, or written.

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
`lifecycle`, fail-closed refresh policy, and maintenance owner. The executable
freshness rule is `asOf <= lastVerifiedAt <= auditDate`; an audit remains GO on
the `lastVerifiedAt + staleAfterDays` expiry date and becomes HOLD the next day.
That metadata covers the Event and its child Performances; each Performance date
must be an exact member of the parent Event's evidence dates.

Setlist coverage uses structured `excludedEntries` only. Numeric source-order
gaps must be closed by unique `sourceOrder` exclusions; an unnumbered entry may
use one unique `beforeSourceOrder` that targets an included order. Each exclusion
must contain exactly one of those position fields. Source-note prose is never
parsed as coverage evidence.

A receipt GO must cite exact, resolving `repoPath#JSON-pointer` references for
every gate. Source-use approval can only point to the seed's fixed independent
approval record under `scripts/atlas/evidence/`; that versioned record binds the
site, explicit Atlas public-seed approval, approval time, maintenance owner, and
active/withdrawn status. It is included in the receipt evidence-file hashes and
the source Git commit. Adding real approval or metadata requires a reviewed
repository evidence change; the projector never infers permission from route
publication or verification status.

Projection shape validation is performed by the actual pinned C0
`parsePublicAtlasProjection` implementation, loaded with the repository's
existing TypeScript runtime. E1 adds only deterministic byte and canonical
artifact-hash checks around that contract.
