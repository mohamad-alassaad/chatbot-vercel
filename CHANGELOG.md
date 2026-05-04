# Changelog

All notable changes to this fork of `vercel/ai-chatbot`. Unreleased work that
has shipped to `main` is listed under each phase.

## Phase 0 — Daily-use polish

### P6 — Export conversation (Markdown + PDF) (shipped)

Download any chat as a clean `.md` or a print-ready `.pdf`.

**Added**

- `lib/chat/export.ts`: pure converter `chatToMarkdown(chat, messages)`
  walking text/reasoning/file parts. Roles get `## You` / `## Assistant`
  headers with ISO-Z timestamps; reasoning renders as a blockquote;
  file attachments render as markdown links. Empty messages are
  skipped. Includes `slugifyTitle()` for safe filenames (NFKD,
  diacritic strip, max 60 chars, falls back to `chat`).
- `lib/chat/export-pdf.tsx`: `<ChatExportDocument>` for
  `@react-pdf/renderer`. LETTER size, Helvetica, page-breakable
  messages with `wrap={false}` per message, italicized reasoning with
  a left border. PDF generation is import-deferred in the route so the
  Markdown path stays cheap.
- `GET /api/chats/:id/export?format=md|pdf`: auth + ownership-checked,
  returns the right MIME type with a `Content-Disposition: attachment`
  header (filename derived from chat title slug).
- Sidebar UX: "Download" submenu added at the top of each chat row's
  dropdown, with "Markdown (.md)" and "PDF (.pdf)" entries. The
  download is triggered via a temporary `<a download>` element fed
  with a `Blob` URL (cleaned up on click).

**Tests**

- `tests/unit/chat-export.test.ts` (17 tests): `slugifyTitle` edge
  cases (empty, diacritics, very long), `renderMessageBlocks` (non-array
  parts, empty/whitespace, attachment defaults, unknown types),
  `chatToMarkdown` (skeleton on empty, untitled fallback, role labels,
  reasoning blockquote, attachments, skipping empty messages, blank-line
  collapsing, single trailing newline).
- 65/65 unit tests pass; typecheck clean; biome clean.

**Trade-offs**

- `@react-pdf/renderer` over headless Chromium / Puppeteer: no browser
  process, runs cleanly in the Next.js server runtime, ships smaller.
- Server-side rendering for both formats so unauthenticated users
  never hit the export endpoint and there's no client-side bundle hit
  for the PDF library.

### P5 — Pinned conversations (shipped)

Pin chats to keep them at the top of their bucket — works inside both
projects and the Unsorted history.

**Added**

- Migration `0004_chat_pinned.sql`: nullable `Chat.pinnedAt` timestamp +
  partial index `(userId, pinnedAt) WHERE pinnedAt IS NOT NULL` so pin
  lookups stay cheap even when most chats are unpinned.
- `setChatPin({ chatId, userId, pinned })` in `lib/db/queries.ts` —
  auth-checked toggle that sets `pinnedAt = now()` or `null`.
- `PATCH /api/chats/:id/pin` accepting `{ pinned: boolean }`.
- `lib/chat/pin.ts`: pure helpers `isPinned()` and `partitionPinned()`
  (sorts pinned chats by `pinnedAt` desc, leaves the rest in input
  order so date-grouping stays intact).
- Sidebar UX:
  - Pin/Unpin entry at the top of each chat row's dropdown menu.
  - "Pinned" sub-group rendered at the top of Unsorted (above Today /
    Yesterday / etc.) and at the top of every project.
  - Small rotated pin glyph next to the title when a chat is pinned.
  - Optimistic SWR update with rollback on failure; success/error toast.

**Tests**

- `tests/unit/pin.test.ts` (8 tests): `isPinned` for null/undefined/Date/
  string inputs, `partitionPinned` ordering and order-preservation,
  mixed lists, and string-vs-Date sort parity.
- 48/48 unit tests pass; typecheck clean; biome clean on touched files.

### P4 — Folders / Projects (shipped)

Group related chats into projects with optional project-level instructions
that are appended to the system prompt of every chat inside.

**Added**

- Migration `0003_projects.sql`: new `Project` table (`id`, `userId`,
  `tenantId` nullable, `name`, `description`, `systemPrompt`, `color`,
  `createdAt`, `updatedAt`) and a nullable `projectId` FK on `Chat` with
  `ON DELETE SET NULL` (chats fall back to "Unsorted" when a project is
  deleted). Indexes on `Project(userId)`, `Project(userId, tenantId)`,
  and `Chat(projectId)`.
- Tenant-aware-ready query helpers in `lib/db/queries.ts`:
  `createProject`, `listProjectsByUserId`, `getProjectById`,
  `updateProject`, `deleteProject` (un-folders chats then drops the
  project), `setChatProject` (auth-checked), `getProjectByChatId`,
  `getChatCountsByProject`. Every query takes `userId` as mandatory and
  `tenantId` as optional.
- `saveChat` accepts an optional `projectId` so a chat can be born inside
  a project (used when the request body includes one).
- API routes:
  - `GET/POST /api/projects` — list (with chat counts) + create.
  - `PATCH/DELETE /api/projects/:id` — update fields / delete + un-folder.
  - `PATCH /api/chats/:id/project` — move a chat in/out of a project.
- System-prompt composition: `systemPrompt()` now accepts an optional
  `project: { name, systemPrompt }`. When set, it renders a
  `<project_context name="…">…</project_context>` section between custom
  instructions and memories. The chat route looks up the project for the
  active chat and threads it through.
- Sidebar UX (`components/chat/sidebar-projects.tsx`,
  `components/chat/app-sidebar.tsx`):
  - Projects group above the unsorted history, each row collapsible with
    a colored dot, chat count, and edit/delete dropdown.
  - Drag-and-drop via `@dnd-kit/core` (`PointerSensor`,
    `activationConstraint: { distance: 8 }` so clicks still work). Drag
    a chat onto any project row or onto the "Unsorted" group to re-folder.
    Optimistic SWR update with rollback on failure.
  - "Unsorted" replaces the old "History" header for chats with
    `projectId IS NULL`.
- `<ProjectEditDialog>` for create/edit with name, description,
  system-prompt textarea (max 4000 chars), and an 8-color preset picker.

**Tests**

- `tests/unit/project-prompt.test.ts` (6 tests): no-render conditions,
  attribute-quote escaping, ordering vs custom instructions and memories,
  project-renders-when-memory-disabled.
- All 40 unit tests pass; `pnpm exec tsc --noEmit` clean; ultracite clean.

**Trade-offs**

- DnD via `@dnd-kit/core` (~12 KB) over native HTML5 DnD: better UX with
  sidebar overflow, accessible, React 19 friendly.
- Project deletion un-folders chats rather than cascading — destructive
  click should not nuke conversations.
- One project per chat (no many-to-many) until a UX requirement appears.
- `tenantId` is in the schema but not enforced; queries already accept
  it so Phase A1 is a one-line tightening.

### P3 — Full-text search across conversations (shipped)

Replaces the title-only search with content-based search across every
message the user has ever sent or received.

**Added**

- Migration `0002_message_tsv.sql`: a `tsvector` generated column on
  `Message_v2(parts::text)` plus a GIN index. Indexing the JSON
  serialization keeps the schema simple — snippet rendering happens at
  read time.
- `searchMessages({ userId, query, limit })` ([lib/db/queries.ts](lib/db/queries.ts)):
  ranked by `ts_rank` desc, tie-broken by `createdAt` desc, joined on
  `Chat` for auth scoping (`Chat.userId = session.user.id`).
- `lib/search/snippet.ts`: pure function that walks `parts`, extracts
  text/reasoning content, finds the best window around the first match,
  and returns an HTML-escaped snippet with `<mark>…</mark>` tags around
  every matched token. Regex-meta safe.
- `GET /api/search/messages?q=…&limit=…`: auth-checked, returns
  `{ query, results, latencyMs }`. Logs latency for the <300 ms gate.
- `<SearchPalette>` ([components/chat/search-palette.tsx](components/chat/search-palette.tsx)) — global
  Cmd+K (or Ctrl+K) command palette using `cmdk`. Debounced fetch
  (180 ms), abort-on-keystroke, snippet rendering with highlighted
  matches, keyboard nav. Picking a result navigates to
  `/chat/<chatId>?q=<term>#m-<messageId>` (deep-link anchor reserved for
  future scroll-to-message).
- Wired into the chat layout, so the palette is available everywhere.

**Tests**

- 12 new Vitest cases covering `extractText` + `buildSnippet`: empty
  inputs, multi-token highlighting, case-insensitive match with preserved
  source case, regex-meta literals, ellipsis prefixing, and XSS escape
  (a `<script>` payload is rendered as `&lt;script&gt;` while the
  injected `<mark>` survives). Total Vitest: **34 / 34**.

**Notes / trade-offs**

- We index `parts::text` (the JSON serialization), which is noisier than
  a clean `searchText` column would be — it can match on JSON keys like
  `"text"` themselves. In practice the snippet extractor produces clean
  output, and search ranking still surfaces relevant hits first.
- Snippet uses `dangerouslySetInnerHTML` to render the `<mark>` tags;
  the input is HTML-escaped server-side first, so only the host-injected
  `<mark>` markup survives. Verified by a unit test.
- Auto-scroll-to-message at the destination chat is **deferred**: the
  URL hash `#m-<messageId>` is in place for it. A small client effect
  reading the hash + `scrollIntoView` would close the loop — Phase 0
  follow-up.
- Cmd+K binding lands here so P7 (keyboard shortcuts) only needs to
  cover the rest (Cmd+Shift+O, Cmd+,, Esc, ?).

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
