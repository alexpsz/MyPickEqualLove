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
must be an ancestor of the audited `HEAD`,
and every audited source, songs, C0 contract, and approval-evidence blob at that
commit must be byte-identical to both the receipt hash and current file. Reads
validate every existing component from the repository root through each fixed
receipt, source, songs, contract, or approval-evidence file with `lstat` and its
expected `realpath`. A symlink, junction, or redirected component is rejected
before reading even when it targets a same-byte file inside the repository.

All fixed inputs are captured once, then their receipt hashes and Git blobs are
verified before any repository TypeScript is transpiled or imported. The C0
baseline, publication authority, and C0 projection parser consume only this
verified in-memory byte snapshot; a failed executable-contract binding blocks
all dynamic execution and no loader performs a second filesystem read.

The generated artifact path has a stronger physical-chain rule: every existing
component from the repository root through
`apps/atlas/src/generated/public-atlas-projection.v1.json` is inspected with
`lstat` and `realpath` and must be the fixed physical component, never a
symlink, junction, or other redirecting path. Generate checks before and after
directory creation and before rename; check rejects the chain before reading.

The historical trust root is the actual exported
`ATLAS_C0_BASELINE_RECEIPT`, not the E1 receipt's copy of its totals. E1 loads
that TypeScript constant, requires its commit to be an ancestor of both the
current source commit and `HEAD`, reads the three historical source blobs from
Git, and re-derives their byte hashes, IDs, counts, and setlist order ranges.
It also canonical-deep-compares each historical source with the current source,
preserving array order and every protected fact. Only the exact
`Event.publicAtlasEvidence` and
`Performance.provenance.excludedEntries` evidence paths are removed from both
sides. Event/Performance identity, labels, dates, venue, membership/order,
setlist order/song IDs, and all fields and catalog order of referenced song
records remain protected; a first-difference path is reported on drift.
CI integration therefore needs complete Git history (`checkout` with
`fetch-depth: 0`, or an explicit fetch of every receipt commit); this E1 package
does not change the shared workflow.

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

Governance owners and signers use the canonical `principal:` grammar from the
fixed publication-authority contract; approval authorities use its canonical
`authority:` grammar. Refresh cadence is one of `on-source-change`, `daily`,
`weekly`, or `monthly`; `staleAfterDays` is in `1..365`; invalidation and
withdrawal actions are exactly `HOLD`. Approval timestamps are real canonical
UTC instants with seconds and optional three-digit milliseconds, so calendar
normalization cannot turn an invalid date into approval evidence. A claim gate
can be GO only when every Event and Performance has at least one valid HTTPS
source URL and is not `unverified`.

Setlist coverage uses structured `excludedEntries` only. Numeric source-order
gaps must be closed by unique `sourceOrder` exclusions; an unnumbered entry may
use one unique `beforeSourceOrder` that targets an included order. Each exclusion
must contain exactly one of those position fields. Source-note prose is never
parsed as coverage evidence.

A receipt GO must cite exact, resolving `repoPath#JSON-pointer` references for
every gate. Source-use approval can only point to the seed's fixed independent
approval record under `scripts/atlas/evidence/`; that versioned record binds the
fixed site and `atlas-public-seed-v1` scope, exact source and songs paths and
SHA-256 hashes, `approvalAuthorityId`, explicit `approverId`,
`maintenanceOwnerId`, approval time, and active/withdrawn status. The approver
must be a member of the coordinator-owned
`ATLAS_PUBLICATION_AUTHORITY_CONTRACT`, as decided only by its exported
`isConfiguredAtlasPublicationApprover`; it must differ from the maintenance
owner. The authority contract itself is a fixed receipt/hash/Git-blob binding,
and neither receipt nor approval can supply a substitute roster. The production
roster is intentionally empty, so production remains HOLD. An approval is also
included in the receipt evidence-file hashes and source Git commit, so an old
approval cannot authorize revised source bytes. Adding real approval or
metadata requires a reviewed repository evidence change; the projector never
infers permission from route publication or verification status.

Projection shape validation is performed by the actual pinned C0
`parsePublicAtlasProjection` implementation, loaded with the repository's
existing TypeScript runtime. E1 adds only deterministic byte and canonical
artifact-hash checks around that contract.
