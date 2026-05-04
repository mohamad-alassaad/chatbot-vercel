import "server-only";

import { tool } from "ai";
import { z } from "zod";
import {
  forgetMemory,
  type MemoryCategory,
  type MemoryHit,
  recallMemories,
  rememberMemory,
  updateMemory,
} from "@/lib/db/queries";

const categoryEnum = z.enum(["fact", "preference", "project", "other"]);

// OpenAI's Responses API requires a tool's parameters JSON Schema to have a
// top-level `type: "object"`. `z.discriminatedUnion` would emit `anyOf` at the
// root, which OpenAI rejects with "schema must be a JSON Schema of 'type:
// object'". So we expose a flat object as the public tool schema and re-parse
// inside `execute` with a discriminated union for end-to-end type safety.
const inputSchema = z.object({
  action: z
    .enum(["remember", "recall", "forget", "update"])
    .describe(
      "Sub-action to perform on the user's durable memory. 'remember' to save, 'recall' to look up, 'forget' to delete by id, 'update' to modify by id."
    ),
  content: z
    .string()
    .min(3)
    .max(500)
    .optional()
    .describe(
      "Required for 'remember'. Optional for 'update'. Concise third-person fact, e.g. 'User is vegetarian'."
    ),
  category: categoryEnum
    .optional()
    .describe(
      "For 'remember' and 'update': category bucket. Defaults to 'other'."
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      "For 'remember' and 'update': how confident you are this is a stable fact, 0-1. Defaults to 0.8."
    ),
  query: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Required for 'recall'. The lookup query."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(
      "Optional for 'recall'. Max number of hits to return. Default 5."
    ),
  memoryId: z
    .string()
    .uuid()
    .optional()
    .describe("Required for 'forget' and 'update'. UUID of the target memory."),
});

const runtimeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("remember"),
    content: z.string().min(3).max(500),
    category: categoryEnum.default("other"),
    confidence: z.number().min(0).max(1).default(0.8),
  }),
  z.object({
    action: z.literal("recall"),
    query: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  z.object({
    action: z.literal("forget"),
    memoryId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("update"),
    memoryId: z.string().uuid(),
    content: z.string().min(3).max(500).optional(),
    category: categoryEnum.optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
]);

export type ManageMemoryInput = z.infer<typeof inputSchema>;
export type ManageMemoryRuntimeInput = z.infer<typeof runtimeSchema>;

export type ManageMemoryOutput =
  | {
      kind: "memory-saved";
      id: string;
      content: string;
      category: MemoryCategory;
      deduplicated: boolean;
    }
  | {
      kind: "memory-recalled";
      count: number;
      items: MemoryHit[];
    }
  | { kind: "memory-deleted"; id: string }
  | {
      kind: "memory-updated";
      id: string;
      content: string;
      category: MemoryCategory;
    }
  | { kind: "noop"; reason: string };

export type ManageMemoryToolDeps = {
  userId: string;
  tenantId?: string | null;
  chatId?: string | null;
  memoryEnabled: boolean;
};

const DESCRIPTION = `Manage durable cross-conversation memory about the user.

Sub-actions:
- "remember": save a stable fact/preference/project worth recalling later. Only for things explicitly stated by the user or that you're sure they want remembered. Skip transient context, secrets, or one-off chitchat.
- "recall": look up memories relevant to a query (the top-N relevant ones are already auto-injected at conversation start; call this only on explicit user questions like "what do you remember about me?").
- "forget": delete a specific memory by id (e.g., user asks "forget that I'm vegetarian").
- "update": modify an existing memory's content/category/confidence.

When you save a memory, phrase it as a concise third-person fact ("User prefers concise responses", "User is working on project X"), not a quote.`;

export function createManageMemoryTool(deps: ManageMemoryToolDeps) {
  return tool({
    description: DESCRIPTION,
    inputSchema,
    execute: async (raw): Promise<ManageMemoryOutput> => {
      if (!deps.memoryEnabled) {
        return {
          kind: "noop",
          reason: "Memory feature is disabled by the user.",
        };
      }
      const parsed = runtimeSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          kind: "noop",
          reason: `Invalid arguments for action '${(raw as { action?: string }).action ?? "?"}': ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        };
      }
      const input = parsed.data;
      switch (input.action) {
        case "remember": {
          const { memory, deduplicated } = await rememberMemory({
            userId: deps.userId,
            tenantId: deps.tenantId ?? null,
            content: input.content,
            category: input.category,
            confidence: input.confidence,
            sourceChatId: deps.chatId ?? null,
          });
          return {
            kind: "memory-saved",
            id: memory.id,
            content: memory.content,
            category: memory.category,
            deduplicated,
          };
        }
        case "recall": {
          const items = await recallMemories({
            userId: deps.userId,
            query: input.query,
            limit: input.limit,
          });
          return { kind: "memory-recalled", count: items.length, items };
        }
        case "forget": {
          const ok = await forgetMemory({
            id: input.memoryId,
            userId: deps.userId,
          });
          if (!ok) {
            return { kind: "noop", reason: "Memory not found." };
          }
          return { kind: "memory-deleted", id: input.memoryId };
        }
        case "update": {
          const updated = await updateMemory({
            id: input.memoryId,
            userId: deps.userId,
            patch: {
              content: input.content,
              category: input.category,
              confidence: input.confidence,
            },
          });
          if (!updated) {
            return { kind: "noop", reason: "Memory not found." };
          }
          return {
            kind: "memory-updated",
            id: updated.id,
            content: updated.content,
            category: updated.category,
          };
        }
        default: {
          // exhaustive — TS will scream if a new action is added without a branch.
          const _exhaustive: never = input;
          return {
            kind: "noop",
            reason: `Unknown action: ${JSON.stringify(_exhaustive)}`,
          };
        }
      }
    },
  });
}
