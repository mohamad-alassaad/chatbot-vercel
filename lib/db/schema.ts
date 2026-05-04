import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  json,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  name: text("name"),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  isAnonymous: boolean("isAnonymous").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;

export const project = pgTable("Project", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  tenantId: uuid("tenantId"),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("systemPrompt"),
  color: varchar("color", { length: 7 }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type Project = InferSelectModel<typeof project>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  projectId: uuid("projectId").references(() => project.id, {
    onDelete: "set null",
  }),
  pinnedAt: timestamp("pinnedAt"),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// ----------------------------------------------------------------------------
// Phase 0 — daily-use polish: cross-conversation memory + per-user settings
// New tables only; tenantId is nullable now and will be enforced in Phase A1.
// ----------------------------------------------------------------------------

export const userSettings = pgTable("UserSettings", {
  userId: uuid("userId")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  tenantId: uuid("tenantId"),
  memoryEnabled: boolean("memoryEnabled").notNull().default(true),
  customInstructionsAbout: text("customInstructionsAbout"),
  customInstructionsRespond: text("customInstructionsRespond"),
  tonePreference: varchar("tonePreference", {
    enum: ["concise", "detailed", "casual", "formal", "default"],
  })
    .notNull()
    .default("default"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type UserSettings = InferSelectModel<typeof userSettings>;

export const userMemory = pgTable(
  "UserMemory",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: uuid("tenantId"),
    content: text("content").notNull(),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    category: varchar("category", {
      enum: ["fact", "preference", "project", "other"],
    })
      .notNull()
      .default("other"),
    confidence: numeric("confidence", { precision: 3, scale: 2 })
      .notNull()
      .default("0.80"),
    sourceChatId: uuid("sourceChatId").references(() => chat.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    lastAccessedAt: timestamp("lastAccessedAt").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("user_memory_user_idx").on(table.userId),
    hashUnique: uniqueIndex("user_memory_user_hash_uniq").on(
      table.userId,
      table.contentHash
    ),
    // The `tsv` generated column + GIN/trgm indexes are added in the SQL
    // migration since drizzle-kit doesn't generate STORED generated columns.
  })
);

export type UserMemory = InferSelectModel<typeof userMemory>;
