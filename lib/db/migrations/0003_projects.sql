-- Phase 0 / P4: projects (folders) for organizing chats.
--
-- One project per chat; deleting a project unsets `Chat.projectId` (chats
-- fall back to the "Unsorted" bucket in the sidebar).

CREATE TABLE IF NOT EXISTS "Project" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tenantId" uuid,
  "name" text NOT NULL,
  "description" text,
  "systemPrompt" text,
  "color" varchar(7),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "project_user_idx" ON "Project" ("userId");
CREATE INDEX IF NOT EXISTS "project_user_tenant_idx" ON "Project" ("userId", "tenantId");

ALTER TABLE "Chat"
  ADD COLUMN IF NOT EXISTS "projectId" uuid
  REFERENCES "Project"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "chat_project_idx" ON "Chat" ("projectId");
