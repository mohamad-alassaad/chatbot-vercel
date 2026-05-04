import { describe, expect, it } from "vitest";
import { isPinned, partitionPinned } from "@/lib/chat/pin";

const chat = (id: string, pinnedAt: Date | null, createdAt = new Date(0)) => ({
  id,
  pinnedAt,
  createdAt,
});

describe("isPinned", () => {
  it("treats null and undefined as not pinned", () => {
    expect(isPinned({ id: "a", pinnedAt: null, createdAt: new Date() })).toBe(
      false
    );
    expect(
      isPinned({ id: "a", pinnedAt: undefined, createdAt: new Date() })
    ).toBe(false);
  });
  it("treats any Date as pinned", () => {
    expect(
      isPinned({ id: "a", pinnedAt: new Date(0), createdAt: new Date() })
    ).toBe(true);
  });
  it("treats string timestamps as pinned", () => {
    expect(
      isPinned({
        id: "a",
        pinnedAt: "2026-05-04T00:00:00Z",
        createdAt: new Date(),
      })
    ).toBe(true);
  });
});

describe("partitionPinned", () => {
  it("returns empty arrays on empty input", () => {
    const { pinned, rest } = partitionPinned([]);
    expect(pinned).toEqual([]);
    expect(rest).toEqual([]);
  });

  it("puts pinned chats first, sorted by pinnedAt desc", () => {
    const a = chat("a", new Date("2026-01-01T00:00:00Z"));
    const b = chat("b", new Date("2026-03-01T00:00:00Z"));
    const c = chat("c", new Date("2026-02-01T00:00:00Z"));
    const { pinned, rest } = partitionPinned([a, b, c]);
    expect(pinned.map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(rest).toEqual([]);
  });

  it("preserves input order for rest", () => {
    const a = chat("a", null, new Date("2026-01-01"));
    const b = chat("b", null, new Date("2026-03-01"));
    const c = chat("c", null, new Date("2026-02-01"));
    const { pinned, rest } = partitionPinned([a, b, c]);
    expect(pinned).toEqual([]);
    expect(rest.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("handles a mixed list", () => {
    const a = chat("a", null);
    const b = chat("b", new Date("2026-05-01T00:00:00Z"));
    const c = chat("c", null);
    const d = chat("d", new Date("2026-04-01T00:00:00Z"));
    const { pinned, rest } = partitionPinned([a, b, c, d]);
    expect(pinned.map((p) => p.id)).toEqual(["b", "d"]);
    expect(rest.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("treats string pinnedAt the same as Date when sorting", () => {
    const a = {
      id: "a",
      pinnedAt: "2026-05-01T00:00:00Z",
      createdAt: new Date(),
    };
    const b = {
      id: "b",
      pinnedAt: new Date("2026-05-02T00:00:00Z"),
      createdAt: new Date(),
    };
    const { pinned } = partitionPinned([a, b]);
    expect(pinned.map((p) => p.id)).toEqual(["b", "a"]);
  });
});
