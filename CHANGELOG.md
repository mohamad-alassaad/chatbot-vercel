# Changelog

All notable changes to this fork of `vercel/ai-chatbot`. Unreleased work that
has shipped to `main` is listed under each phase.

## Phase 0 — Daily-use polish

### P2 — Custom Instructions (shipped)

The schema fields and `systemPrompt` rendering already landed during P1. P2
adds the UI to set them.

**Added**

- `/settings/custom-instructions` route with a server-component shell that
  hydrates a client form ([components/chat/settings/custom-instructions-client.tsx](components/chat/settings/custom-instructions-client.tsx)).
- Two textareas — "About me" and "How I want you to respond" — each capped
  at 2000 characters with a live counter and over-cap validation.
- Tone preference `<Select>` with five options
  (Default / Concise / Detailed / Casual / Formal). Each option shows the
  exact directive that gets injected into the system prompt via tooltip.
- Save flow uses the existing `PUT /api/settings/memory` (already accepted
  these fields). Whitespace-only inputs are stored as `null` so they don't
  inject empty sections into the prompt.
- Reset button reverts unsaved changes.
- Multi-tab settings layout: extracted `<SettingsTabs>` (client component
  reading `usePathname`) so the active tab highlights correctly. Tabs:
  "Memory", "Custom instructions". Scales for P3+.

**Tests**

- 8 new Vitest cases covering each instruction-section combination, tone
  directives, whitespace handling, and the interaction with the
  memory-disabled path. Total Vitest: 22 passing.

**Notes / trade-offs**

- No project-level overrides yet; that lands in P4. Custom instructions are
  user-level only.
- No instruction history or version timeline. If you wipe a field by
  mistake it's gone — Phase 0 scope.
- Tone is intentionally coarse (5 buckets, not free-form). Anything finer
  goes in `customInstructionsRespond`.

### P1 — Cross-conversation memory (shipped)

**Added**

- New tables `UserSettings` and `UserMemory` (Drizzle schema +
  `0001_user_memory.sql`). Both carry a nullable `tenantId` reserved for
  Phase A1.
- Postgres `pg_trgm` extension and a `tsvector` generated column on
  `UserMemory.content`, with GIN indexes for full-text + trigram lookup.
- First-party `manage_memory` tool exposed to the LLM. Discriminated-union
  Zod schema with `remember` / `recall` / `forget` / `update` actions.
  ([lib/ai/tools/manage-memory.ts](lib/ai/tools/manage-memory.ts))
- Auto-recall at conversation start: top-N relevant memories injected into
  the system prompt under a `<memories>` section, with a hard ~800-token
  budget. ([lib/ai/prompts.ts](lib/ai/prompts.ts), [app/(chat)/api/chat/route.ts](app/%28chat%29/api/chat/route.ts))
- Write-time dedup combining a content-hash equality check with a `pg_trgm`
  similarity threshold of 0.85. Duplicate writes bump
  `lastAccessedAt` + `confidence` instead of inserting a new row.
- Settings page at `/settings/memory` with view, edit, delete-single,
  delete-all, export-as-JSON, and a master "memory enabled" toggle.
  Settings link added to the sidebar user menu.
- Inline pill + sonner toast on the assistant message whenever the model
  saves, updates, deletes, or recalls a memory. Pill links back to the
  settings page.
- Telemetry wrapper at [lib/ai/telemetry.ts](lib/ai/telemetry.ts) that emits
  one structured JSON line per LLM call (`feature_id`, `user_id`, `model`,
  `tokens_in`, `tokens_out`, `latency_ms`, `error?`). Wired into the chat
  route and title generation. Console sink now; Azure Log Analytics in
  Phase A2.

**Tests**

- Vitest unit tests for system-prompt memory rendering (token-budget
  truncation, custom-instructions composition, supportsTools gating) and
  for the `manage_memory` Zod schema (discriminated-union shape, validation
  errors). Run with `pnpm test:unit`.
- Playwright E2E for the memory flow is **deferred** to a follow-up: it
  needs a DB seed harness + auth bypass we don't have set up yet.
  Tracked as `// TODO(phase-0/p1-followup)`.

**Notes**

- Memory disabled → tool is not registered for that turn AND no auto-recall
  happens AND no `<memories>` section is rendered.
- Confidence decay is intentionally lazy: each recall hit bumps confidence
  by +0.02 (clamped to 1.0). Memories that never get hit slowly fall below
  the 0.40 auto-recall threshold and stop surfacing automatically (still
  visible in settings). A nightly batch decay is a Phase A1 candidate.
- Tenant scoping is **not enforced** in queries yet. `tenantId` columns +
  parameter slots exist so Phase A1 can flip this on without touching call
  sites.

### Already shipped before P1

- MCP-UI rendering integrated via `@mcp-ui/client`, validated against the
  Pizzaz Apps SDK server. Round-trip widget action proxy at
  `/api/mcp/action`. See [1-modif.md](1-modif.md) for setup.
- Direct OpenAI provider (`openai-direct/*` model ids) so the chat works
  without a Vercel AI Gateway key.
