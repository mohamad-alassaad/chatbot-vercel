import { describe, expect, it } from "vitest";
import { z } from "zod";

// Re-derive the schema in the test to assert input shape contracts.
// If the tool's schema drifts, this test will need to be updated alongside it.
const categoryEnum = z.enum(["fact", "preference", "project", "other"]);
const inputSchema = z.discriminatedUnion("action", [
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

describe("manage_memory input schema", () => {
  it("accepts a remember call with defaults", () => {
    const parsed = inputSchema.parse({
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

  it("rejects a remember call with too-short content", () => {
    expect(() =>
      inputSchema.parse({ action: "remember", content: "no" })
    ).toThrow();
  });

  it("rejects a recall call without query", () => {
    expect(() => inputSchema.parse({ action: "recall" })).toThrow();
  });

  it("rejects forget without uuid", () => {
    expect(() =>
      inputSchema.parse({ action: "forget", memoryId: "not-a-uuid" })
    ).toThrow();
  });

  it("accepts update with partial fields", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const parsed = inputSchema.parse({
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

  it("rejects unknown action", () => {
    expect(() =>
      inputSchema.parse({ action: "delete-the-database" })
    ).toThrow();
  });
});
