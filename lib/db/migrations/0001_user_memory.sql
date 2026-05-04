-- Phase 0 / P1: cross-conversation memory + per-user settings.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS "UserSettings" (
  "userId" uuid PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "tenantId" uuid,
  "memoryEnabled" boolean NOT NULL DEFAULT true,
  "customInstructionsAbout" text,
  "customInstructionsRespond" text,
  "tonePreference" varchar NOT NULL DEFAULT 'default',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "UserMemory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tenantId" uuid,
  "content" text NOT NULL,
  "contentHash" varchar(64) NOT NULL,
  "category" varchar NOT NULL DEFAULT 'other',
  "confidence" numeric(3, 2) NOT NULL DEFAULT 0.80,
  "sourceChatId" uuid REFERENCES "Chat"("id") ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "lastAccessedAt" timestamp NOT NULL DEFAULT now(),
  "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED
);

CREATE INDEX IF NOT EXISTS "user_memory_user_idx" ON "UserMemory" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "user_memory_user_hash_uniq" ON "UserMemory" ("userId", "contentHash");
CREATE INDEX IF NOT EXISTS "user_memory_tsv_idx" ON "UserMemory" USING GIN ("tsv");
CREATE INDEX IF NOT EXISTS "user_memory_trgm_idx" ON "UserMemory" USING GIN ("content" gin_trgm_ops);
