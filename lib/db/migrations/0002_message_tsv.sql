-- Phase 0 / P3: full-text search across messages.
--
-- We index the JSON serialization of `parts` rather than maintaining a
-- separate searchText column. Snippets are extracted at read time by parsing
-- parts in the API handler, so the JSON noise stays server-side.

ALTER TABLE "Message_v2"
  ADD COLUMN IF NOT EXISTS "tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', "parts"::text)) STORED;

CREATE INDEX IF NOT EXISTS "message_tsv_idx"
  ON "Message_v2" USING GIN ("tsv");
