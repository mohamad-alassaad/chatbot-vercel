import { describe, expect, it } from "vitest";
import { z } from "zod";

// Mirror of the schemas exported by `lib/ai/tools/manage-memory.ts`. Kept
// duplicated to avoid pulling the `server-only` module into a unit test.
const categoryEnum = z.enum(["fact", "preference", "project", "other"]);

const publicSchema = z.object({
  action: z.enum(["remember", "recall", "forget", "update"]),
  content: z.string().min(3).max(500).optional(),
  category: categoryEnum.optional(),
  confidence: z.number().min(0).max(1).optional(),
  query: z.string().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  memoryId: z.string().uuid().optional(),
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

describe("manage_memory public schema (what OpenAI sees)", () => {
  it("is a ZodObject at the root (so the JSON schema OpenAI sees has type: object, not anyOf)", () => {
    // The bug we are guarding against: z.discriminatedUnion produces anyOf
    // and OpenAI rejects it with "schema must be a JSON Schema of type
    // 'object'". The public schema MUST be a flat ZodObject.
    expect(publicSchema._def.typeName).toBe("ZodObject");
  });

  it("accepts every action with only the discriminator", () => {
    for (const action of ["remember", "recall", "forget", "update"] as const) {
      expect(() => publicSchema.parse({ action })).not.toThrow();
    }
  });

  it("rejects an unknown action", () => {
    expect(() =>
      publicSchema.parse({ action: "delete-the-database" })
    ).toThrow();
  });
});

describe("manage_memory runtime narrowing (validated inside execute)", () => {
  it("accepts a remember call with content + defaults", () => {
    const parsed = runtimeSchema.parse({
      action: "remember",
      content: "User is vegetarian",
    });
    expect(parsed).toMatchObject({
      action: "remember",
      content: "User is vegetarian",
      category: "other",
      confidence: 0.8,
    });
  });

  it("rejects a remember call without content", () => {
    expect(() => runtimeSchema.parse({ action: "remember" })).toThrow();
  });

  it("rejects a recall call without query", () => {
    expect(() => runtimeSchema.parse({ action: "recall" })).toThrow();
  });

  it("rejects forget without uuid", () => {
    expect(() =>
      runtimeSchema.parse({ action: "forget", memoryId: "not-a-uuid" })
    ).toThrow();
  });

  it("accepts update with partial fields", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const parsed = runtimeSchema.parse({
      action: "update",
      memoryId: id,
      confidence: 0.5,
    });
    expect(parsed).toMatchObject({
      action: "update",
      memoryId: id,
      confidence: 0.5,
    });
  });
});
