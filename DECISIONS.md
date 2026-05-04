# Architecture Decisions

Architectural decisions worth remembering. Each entry: context, choice,
trade-offs, and the trigger that should make us revisit.

---

## D-001 — Postgres FTS for memory recall, not pgvector

**Date**: Phase 0 / P1.

**Context.** The cross-conversation memory feature needs ranked retrieval of
memories given a user query. Two realistic options:

1. **Postgres `tsvector` + `pg_trgm`** — built into Postgres 16, no extra
   infra, works on the host the chat already uses.
2. **pgvector** — embeds memories at write time, semantic match at query
   time. More accurate for paraphrased queries, costs an embedding API call
   per remember/update.

**Choice.** Postgres FTS, with a hybrid rank that combines `ts_rank`,
`pg_trgm` similarity, and a recency boost. No embeddings.

**Why.**

- Phase 0 is daily-use polish, not enterprise. Adding embedding calls
  multiplies LLM provider dependency surface and per-write latency.
- The dedup path already uses `pg_trgm`; reusing it for recall keeps the
  dependency footprint identical.
- Memories are short and the user vocabulary stays consistent across
  conversations, so lexical matching catches most of the relevant cases.

**Revisit when.**

- We measure auto-recall miss rate ≥ 30% on a representative trace (the
  telemetry wrapper logs make this measurable).
- We need cross-language recall (a query in English finding a memory the
  user wrote in French) — embeddings basically required there.

A pgvector path can land behind a feature flag without changing the
public API of `recallMemories({ userId, query })`.

---

## D-002 — One `manage_memory` tool, not four separate tools

**Choice.** Single tool with a Zod discriminated union over `action:
"remember" | "recall" | "forget" | "update"`.

**Why.** Four tools would clutter the tool list shown to the model and
duplicate the boilerplate around description text. The discriminated union
is exactly the shape AI SDK 6 likes — `tool({ inputSchema })` infers per-
branch types and the `execute` switch is exhaustive (TS catches missing
branches via `_exhaustive: never`).

**Trade-off.** A larger schema means more tokens in the tool list. Small,
acceptable. Reviewed.

---

## D-003 — Auto-recall at conversation start, explicit recall via tool

**Choice.** When memory is enabled and the user sent a text message, run
`recallMemories(...)` server-side before `streamText`, and inject the top-N
hits into the system prompt under `<memories>`. The LLM still has the
`recall` tool action for explicit user questions ("what do you remember
about me?").

**Why.** A purely tool-driven recall would force one extra round-trip on
every turn. Auto-injection keeps the latency profile flat at the cost of
some "wasted" memories on turns where they aren't needed. Explicit `recall`
covers the case where the user wants the full list.

**Trade-off.** Auto-recall fires even for "hi" — wasteful but cheap (FTS
query takes <5ms on local Postgres in the smoke test). The auto-recall
threshold (`confidence >= 0.40`) prevents stale memories from leaking in.

---

## D-004 — Dedup combines content hash + trigram similarity

**Choice.** At write time:

1. Compute SHA-256 of the normalized content. If a row with same
   `(userId, contentHash)` exists, treat it as a hit, bump `confidence` and
   `lastAccessedAt`.
2. If no exact hit, query for any existing memory with `pg_trgm` similarity
   ≥ 0.85. If found, treat it as a hit (same bump behavior).
3. Otherwise insert.

**Why.** Hash alone misses paraphrased duplicates ("user is vegetarian" vs
"user is a vegetarian"). Trigram alone is more expensive and less
deterministic. The hash check is O(1) and catches most duplicates;
trigram is the safety net.

**Tunable.** The 0.85 threshold is per-feel. Below 0.7 is too aggressive
(merges genuinely-different memories); above 0.95 lets paraphrases
through. Revisit if user feedback shows duplicates or wrongful merges.

---

## D-005 — `tenantId` on new tables only for Phase 0

**Context.** Phase 0 is single-tenant. Phase A1 adds enforced
multi-tenancy. The architectural commitment is that Phase 0 doesn't get
refactored later.

**Choice.** All NEW tables (`UserSettings`, `UserMemory`) carry a nullable
`tenantId` column. All NEW data-access functions accept `tenantId` as an
optional argument. Existing tables (`Chat`, `Message_v2`, `User`, `Vote_v2`,
`Document`, `Suggestion`, `Stream`) are **not** touched.

**Why.** Adding `tenantId` to existing tables means a backfill migration
across the chat path that's already working. We'd need to coordinate that
with the auth provider switch (Phase A1). Decoupling lets Phase A1 do both
in a single focused PR.

**Trade-off.** Phase 0 ships memory fully usable in single-tenant mode;
Phase A1 will need to add `tenantId` to existing tables AND start
enforcing the column in queries. Both changes happen together so there's
one focused diff to review.

---

## D-006 — Telemetry sink is `console.log` for now

**Choice.** [lib/ai/telemetry.ts](lib/ai/telemetry.ts) emits one JSON line
per LLM call, written to stdout via `console.log`. Wraps `streamText`
(via `onFinish` to read `usage`) and `generateText` (synchronous wrap).

**Why.** AI Act-ready logging is a Phase A2 deliverable, but the wrapper
needs to exist now so call sites don't have to be touched again later.
Console JSON is the simplest possible sink and ships logs to Vercel/Azure
log streams unchanged when we add a real exporter.

**Revisit when.** Phase A2 — replace the `emit` body with the Azure Log
Analytics SDK or an OTel exporter. Call sites stay unchanged.

---

## D-007 — Memory disable switch lives in `UserSettings`, not a column on `User`

**Choice.** New `UserSettings` table keyed by `userId`. Columns:
`memoryEnabled`, plus P2 fields (`customInstructionsAbout`,
`customInstructionsRespond`, `tonePreference`).

**Why.** `User` is owned by next-auth's adapter — adding columns there
risks fighting the auth lib's migrations. A separate settings table is
the canonical pattern, scales to dozens of preferences without polluting
the auth schema, and lets us extend (custom instructions, theme override,
etc.) without touching `User`.

**Trade-off.** One extra read per chat turn. Mitigated via
`getOrCreateUserSettings` which caches nothing yet but is a single primary-
key lookup. If it shows up in the telemetry as a hot path, add an LRU.
