-- Phase 0 / P5: pinned conversations.

ALTER TABLE "Chat"
  ADD COLUMN IF NOT EXISTS "pinnedAt" timestamp;

CREATE INDEX IF NOT EXISTS "chat_pinned_idx"
  ON "Chat" ("userId", "pinnedAt")
  WHERE "pinnedAt" IS NOT NULL;
