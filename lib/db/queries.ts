import "server-only";

import { createHash } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import {
  type Chat,
  chat,
  type DBMessage,
  document,
  message,
  type Project,
  project,
  type Suggestion,
  stream,
  suggestion,
  type User,
  type UserMemory,
  type UserSettings,
  user,
  userMemory,
  userSettings,
  vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

export async function getUser(email: string): Promise<User[]> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create user");
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
  projectId,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
  projectId?: string | null;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
      projectId: projectId ?? null,
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    await db.delete(vote).where(inArray(vote.chatId, chatIds));
    await db.delete(message).where(inArray(message.chatId, chatIds));
    await db.delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    return { deletedCount: deletedChats.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<unknown>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id)
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await db.insert(message).values(messages);
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    return await db.update(message).set({ parts }).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  try {
    const docs = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt))
      .limit(1);

    const latest = docs[0];
    if (!latest) {
      throw new ChatbotError("not_found:database", "Document not found");
    }

    return await db
      .update(document)
      .set({ content })
      .where(and(eq(document.id, id), eq(document.createdAt, latest.createdAt)))
      .returning();
  } catch (_error) {
    if (_error instanceof ChatbotError) {
      throw _error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update document content"
    );
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await db.update(chat).set({ title }).where(eq(chat.id, chatId));
  } catch (_error) {
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const cutoffTime = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, cutoffTime),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

// ----------------------------------------------------------------------------
// Phase 0 / P1 — user settings + cross-conversation memory
// All accessors take userId mandatorily. tenantId is reserved for Phase A1.
// ----------------------------------------------------------------------------

export type MemoryCategory = "fact" | "preference" | "project" | "other";

export type MemoryHit = {
  id: string;
  content: string;
  category: MemoryCategory;
  confidence: number;
  rank: number;
};

const MEMORY_RECALL_MIN_CONFIDENCE = 0.2;
const MEMORY_AUTO_RECALL_MIN_CONFIDENCE = 0.4;
const MEMORY_DEDUP_TRIGRAM_THRESHOLD = 0.85;

function normalizeMemoryContent(content: string): string {
  return content.replace(/\s+/g, " ").trim().toLowerCase();
}

function hashMemoryContent(content: string): string {
  return createHash("sha256")
    .update(normalizeMemoryContent(content))
    .digest("hex");
}

function clampConfidence(value: number): string {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped.toFixed(2);
}

export async function getUserSettings({
  userId,
}: {
  userId: string;
}): Promise<UserSettings | null> {
  try {
    const [row] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to read user settings"
    );
  }
}

export async function getOrCreateUserSettings({
  userId,
  tenantId,
}: {
  userId: string;
  tenantId?: string | null;
}): Promise<UserSettings> {
  const existing = await getUserSettings({ userId });
  if (existing) {
    return existing;
  }
  try {
    const [created] = await db
      .insert(userSettings)
      .values({ userId, tenantId: tenantId ?? null })
      .onConflictDoNothing({ target: userSettings.userId })
      .returning();
    if (created) {
      return created;
    }
    const refreshed = await getUserSettings({ userId });
    if (!refreshed) {
      throw new Error("UserSettings row missing after upsert");
    }
    return refreshed;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to initialize user settings"
    );
  }
}

export async function updateUserSettings({
  userId,
  patch,
}: {
  userId: string;
  patch: Partial<{
    memoryEnabled: boolean;
    customInstructionsAbout: string | null;
    customInstructionsRespond: string | null;
    tonePreference: "concise" | "detailed" | "casual" | "formal" | "default";
  }>;
}): Promise<UserSettings> {
  try {
    await getOrCreateUserSettings({ userId });
    const [updated] = await db
      .update(userSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
      .returning();
    return updated;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update user settings"
    );
  }
}

export async function rememberMemory({
  userId,
  tenantId,
  content,
  category = "other",
  confidence = 0.8,
  sourceChatId,
}: {
  userId: string;
  tenantId?: string | null;
  content: string;
  category?: MemoryCategory;
  confidence?: number;
  sourceChatId?: string | null;
}): Promise<{ memory: UserMemory; deduplicated: boolean }> {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new ChatbotError("bad_request:api", "Memory content cannot be empty");
  }
  const hash = hashMemoryContent(trimmed);
  try {
    // Step 1 — exact-hash dedup.
    const [existingExact] = await db
      .select()
      .from(userMemory)
      .where(
        and(eq(userMemory.userId, userId), eq(userMemory.contentHash, hash))
      )
      .limit(1);
    if (existingExact) {
      const [bumped] = await db
        .update(userMemory)
        .set({
          lastAccessedAt: new Date(),
          confidence: clampConfidence(
            Math.max(Number(existingExact.confidence), confidence) + 0.05
          ),
        })
        .where(eq(userMemory.id, existingExact.id))
        .returning();
      return { memory: bumped, deduplicated: true };
    }

    // Step 2 — trigram-similar dedup (>= 0.85).
    const similarRows = await db.execute(sql`
      SELECT *, similarity("content", ${trimmed}) AS sim
      FROM "UserMemory"
      WHERE "userId" = ${userId}
        AND "content" % ${trimmed}
      ORDER BY sim DESC
      LIMIT 1
    `);
    const similar = (
      similarRows as unknown as Array<UserMemory & { sim: number }>
    )[0];
    if (similar && Number(similar.sim) >= MEMORY_DEDUP_TRIGRAM_THRESHOLD) {
      const [bumped] = await db
        .update(userMemory)
        .set({
          lastAccessedAt: new Date(),
          confidence: clampConfidence(
            Math.max(Number(similar.confidence), confidence) + 0.05
          ),
        })
        .where(eq(userMemory.id, similar.id))
        .returning();
      return { memory: bumped, deduplicated: true };
    }

    // Step 3 — fresh insert.
    const [created] = await db
      .insert(userMemory)
      .values({
        userId,
        tenantId: tenantId ?? null,
        content: trimmed,
        contentHash: hash,
        category,
        confidence: clampConfidence(confidence),
        sourceChatId: sourceChatId ?? null,
      })
      .returning();
    return { memory: created, deduplicated: false };
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", "Failed to save memory");
  }
}

export async function recallMemories({
  userId,
  query,
  limit = 8,
  forAutoInjection = false,
}: {
  userId: string;
  query: string;
  limit?: number;
  forAutoInjection?: boolean;
}): Promise<MemoryHit[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return [];
  }
  const minConfidence = forAutoInjection
    ? MEMORY_AUTO_RECALL_MIN_CONFIDENCE
    : MEMORY_RECALL_MIN_CONFIDENCE;
  try {
    const rows = await db.execute(sql`
      SELECT
        "id",
        "content",
        "category",
        "confidence",
        (
          ts_rank(tsv, plainto_tsquery('simple', ${trimmedQuery})) * 0.6 +
          similarity("content", ${trimmedQuery}) * 0.3 +
          GREATEST(
            0,
            1 - (EXTRACT(EPOCH FROM (now() - "lastAccessedAt")) / (60 * 60 * 24 * 30))
          ) * 0.1
        ) AS rank
      FROM "UserMemory"
      WHERE "userId" = ${userId}
        AND "confidence" >= ${minConfidence}
        AND (
          tsv @@ plainto_tsquery('simple', ${trimmedQuery})
          OR "content" % ${trimmedQuery}
        )
      ORDER BY rank DESC
      LIMIT ${limit}
    `);
    const hits = (
      rows as unknown as Array<{
        id: string;
        content: string;
        category: MemoryCategory;
        confidence: string;
        rank: number;
      }>
    ).map<MemoryHit>((r) => ({
      id: r.id,
      content: r.content,
      category: r.category,
      confidence: Number(r.confidence),
      rank: Number(r.rank),
    }));

    if (hits.length > 0) {
      const ids = hits.map((h) => h.id);
      await db
        .update(userMemory)
        .set({
          lastAccessedAt: new Date(),
          confidence: sql`LEAST(1.0, ${userMemory.confidence}::numeric + 0.02)`,
        })
        .where(inArray(userMemory.id, ids));
    }
    return hits;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to recall memories");
  }
}

export async function listMemories({
  userId,
  limit = 200,
}: {
  userId: string;
  limit?: number;
}): Promise<UserMemory[]> {
  try {
    return await db
      .select()
      .from(userMemory)
      .where(eq(userMemory.userId, userId))
      .orderBy(desc(userMemory.lastAccessedAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to list memories");
  }
}

export async function updateMemory({
  id,
  userId,
  patch,
}: {
  id: string;
  userId: string;
  patch: Partial<{
    content: string;
    category: MemoryCategory;
    confidence: number;
  }>;
}): Promise<UserMemory | null> {
  try {
    const updates: Record<string, unknown> = { lastAccessedAt: new Date() };
    if (typeof patch.content === "string") {
      updates.content = patch.content.trim();
      updates.contentHash = hashMemoryContent(patch.content);
    }
    if (patch.category) {
      updates.category = patch.category;
    }
    if (typeof patch.confidence === "number") {
      updates.confidence = clampConfidence(patch.confidence);
    }
    const [updated] = await db
      .update(userMemory)
      .set(updates)
      .where(and(eq(userMemory.id, id), eq(userMemory.userId, userId)))
      .returning();
    return updated ?? null;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update memory");
  }
}

export async function forgetMemory({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<boolean> {
  try {
    const result = await db
      .delete(userMemory)
      .where(and(eq(userMemory.id, id), eq(userMemory.userId, userId)))
      .returning({ id: userMemory.id });
    return result.length > 0;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to delete memory");
  }
}

// ----------------------------------------------------------------------------
// Phase 0 / P3 — full-text search across messages
// ----------------------------------------------------------------------------

export type MessageSearchHit = {
  messageId: string;
  chatId: string;
  chatTitle: string;
  role: string;
  parts: unknown;
  createdAt: Date;
  rank: number;
};

export async function searchMessages({
  userId,
  query,
  limit = 50,
}: {
  userId: string;
  query: string;
  limit?: number;
}): Promise<MessageSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }
  try {
    const rows = await db.execute(sql`
      SELECT
        m."id"          AS "messageId",
        m."chatId"      AS "chatId",
        c."title"       AS "chatTitle",
        m."role"        AS "role",
        m."parts"       AS "parts",
        m."createdAt"   AS "createdAt",
        ts_rank(m."tsv", plainto_tsquery('simple', ${trimmed})) AS "rank"
      FROM "Message_v2" m
      JOIN "Chat" c ON c."id" = m."chatId"
      WHERE c."userId" = ${userId}
        AND m."tsv" @@ plainto_tsquery('simple', ${trimmed})
      ORDER BY "rank" DESC, m."createdAt" DESC
      LIMIT ${limit}
    `);
    return (
      rows as unknown as Array<{
        messageId: string;
        chatId: string;
        chatTitle: string;
        role: string;
        parts: unknown;
        createdAt: string | Date;
        rank: number;
      }>
    ).map((r) => ({
      messageId: r.messageId,
      chatId: r.chatId,
      chatTitle: r.chatTitle,
      role: r.role,
      parts: r.parts,
      createdAt:
        r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
      rank: Number(r.rank),
    }));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to search messages");
  }
}

export async function deleteAllMemories({
  userId,
}: {
  userId: string;
}): Promise<number> {
  try {
    const result = await db
      .delete(userMemory)
      .where(eq(userMemory.userId, userId))
      .returning({ id: userMemory.id });
    return result.length;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all memories"
    );
  }
}

// --- Projects (Phase 0 / P4) -------------------------------------------------

const PROJECT_NAME_MAX = 80;
const PROJECT_DESC_MAX = 280;
const PROJECT_PROMPT_MAX = 4000;
const PROJECT_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function sanitizeProjectColor(color: string | null | undefined): string | null {
  if (!color) {
    return null;
  }
  return PROJECT_COLOR_RE.test(color) ? color : null;
}

export async function createProject({
  userId,
  tenantId,
  name,
  description,
  systemPrompt,
  color,
}: {
  userId: string;
  tenantId?: string | null;
  name: string;
  description?: string | null;
  systemPrompt?: string | null;
  color?: string | null;
}): Promise<Project> {
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new ChatbotError("bad_request:api", "Project name is required");
  }
  try {
    const [created] = await db
      .insert(project)
      .values({
        userId,
        tenantId: tenantId ?? null,
        name: trimmedName.slice(0, PROJECT_NAME_MAX),
        description: description?.trim().slice(0, PROJECT_DESC_MAX) || null,
        systemPrompt: systemPrompt?.trim().slice(0, PROJECT_PROMPT_MAX) || null,
        color: sanitizeProjectColor(color),
      })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create project");
  }
}

export async function listProjectsByUserId({
  userId,
  tenantId,
}: {
  userId: string;
  tenantId?: string | null;
}): Promise<Project[]> {
  try {
    const tenantClause =
      tenantId === undefined
        ? null
        : tenantId === null
          ? isNull(project.tenantId)
          : eq(project.tenantId, tenantId);
    const where = tenantClause
      ? and(eq(project.userId, userId), tenantClause)
      : eq(project.userId, userId);
    return await db
      .select()
      .from(project)
      .where(where)
      .orderBy(asc(project.name));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to list projects");
  }
}

export async function getProjectById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<Project | null> {
  try {
    const [row] = await db
      .select()
      .from(project)
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to load project");
  }
}

export async function updateProject({
  id,
  userId,
  patch,
}: {
  id: string;
  userId: string;
  patch: {
    name?: string;
    description?: string | null;
    systemPrompt?: string | null;
    color?: string | null;
  };
}): Promise<Project> {
  const updates: Partial<typeof project.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (trimmed.length === 0) {
      throw new ChatbotError("bad_request:api", "Project name is required");
    }
    updates.name = trimmed.slice(0, PROJECT_NAME_MAX);
  }
  if (patch.description !== undefined) {
    updates.description =
      patch.description?.trim().slice(0, PROJECT_DESC_MAX) || null;
  }
  if (patch.systemPrompt !== undefined) {
    updates.systemPrompt =
      patch.systemPrompt?.trim().slice(0, PROJECT_PROMPT_MAX) || null;
  }
  if (patch.color !== undefined) {
    updates.color = sanitizeProjectColor(patch.color);
  }
  try {
    const [updated] = await db
      .update(project)
      .set(updates)
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .returning();
    if (!updated) {
      throw new ChatbotError("not_found:database", "Project not found");
    }
    return updated;
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", "Failed to update project");
  }
}

export async function deleteProject({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<{ deleted: boolean; unfolderedChatIds: string[] }> {
  try {
    const owned = await getProjectById({ id, userId });
    if (!owned) {
      return { deleted: false, unfolderedChatIds: [] };
    }
    const unfoldered = await db
      .update(chat)
      .set({ projectId: null })
      .where(and(eq(chat.projectId, id), eq(chat.userId, userId)))
      .returning({ id: chat.id });
    await db.delete(project).where(eq(project.id, id));
    return {
      deleted: true,
      unfolderedChatIds: unfoldered.map((c) => c.id),
    };
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to delete project");
  }
}

export async function setChatPin({
  chatId,
  userId,
  pinned,
}: {
  chatId: string;
  userId: string;
  pinned: boolean;
}): Promise<Chat> {
  try {
    const [updated] = await db
      .update(chat)
      .set({ pinnedAt: pinned ? new Date() : null })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
      .returning();
    if (!updated) {
      throw new ChatbotError("not_found:database", "Chat not found");
    }
    return updated;
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", "Failed to update pin");
  }
}

export async function setChatProject({
  chatId,
  userId,
  projectId,
}: {
  chatId: string;
  userId: string;
  projectId: string | null;
}): Promise<Chat> {
  try {
    if (projectId !== null) {
      const owned = await getProjectById({ id: projectId, userId });
      if (!owned) {
        throw new ChatbotError("forbidden:api", "Project not found");
      }
    }
    const [updated] = await db
      .update(chat)
      .set({ projectId })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
      .returning();
    if (!updated) {
      throw new ChatbotError("not_found:database", "Chat not found");
    }
    return updated;
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to move chat to project"
    );
  }
}

export async function getProjectByChatId({
  chatId,
  userId,
}: {
  chatId: string;
  userId: string;
}): Promise<Project | null> {
  try {
    const [row] = await db
      .select({ project })
      .from(chat)
      .innerJoin(project, eq(chat.projectId, project.id))
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
      .limit(1);
    return row?.project ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to load project for chat"
    );
  }
}

export async function getChatCountsByProject({
  userId,
}: {
  userId: string;
}): Promise<Record<string, number>> {
  try {
    const rows = await db
      .select({
        projectId: chat.projectId,
        n: count(chat.id),
      })
      .from(chat)
      .where(eq(chat.userId, userId))
      .groupBy(chat.projectId);
    const out: Record<string, number> = {};
    for (const r of rows) {
      if (r.projectId) {
        out[r.projectId] = Number(r.n);
      }
    }
    return out;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to count chats per project"
    );
  }
}
