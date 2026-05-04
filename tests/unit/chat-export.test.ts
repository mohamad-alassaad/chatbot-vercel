import { describe, expect, it } from "vitest";
import {
  chatToMarkdown,
  renderMessageBlocks,
  slugifyTitle,
} from "@/lib/chat/export";

const fixedDate = new Date("2026-05-04T10:00:00.000Z");

describe("slugifyTitle", () => {
  it("normalizes a typical title", () => {
    expect(slugifyTitle("Pizza Recipes! (v2)")).toBe("pizza-recipes-v2");
  });
  it("falls back to 'chat' when input is empty after cleaning", () => {
    expect(slugifyTitle("")).toBe("chat");
    expect(slugifyTitle("   !!!   ")).toBe("chat");
  });
  it("truncates absurdly long titles", () => {
    const out = slugifyTitle("a".repeat(200));
    expect(out.length).toBeLessThanOrEqual(60);
  });
  it("strips diacritics", () => {
    expect(slugifyTitle("Café résumé naïve")).toBe("cafe-resume-naive");
  });
});

describe("renderMessageBlocks", () => {
  it("returns [] for non-array parts", () => {
    expect(renderMessageBlocks(null)).toEqual([]);
    expect(renderMessageBlocks(undefined)).toEqual([]);
    expect(renderMessageBlocks("oops")).toEqual([]);
  });
  it("ignores empty/whitespace text and reasoning", () => {
    expect(
      renderMessageBlocks([
        { type: "text", text: "" },
        { type: "text", text: "   " },
        { type: "reasoning", text: "\n\t" },
      ])
    ).toEqual([]);
  });
  it("emits text, reasoning, attachment in order", () => {
    const blocks = renderMessageBlocks([
      { type: "text", text: "hello" },
      { type: "reasoning", text: "thinking..." },
      { type: "file", url: "https://x/y.png", name: "y.png" },
    ]);
    expect(blocks).toEqual([
      { kind: "text", body: "hello" },
      { kind: "reasoning", body: "thinking..." },
      { kind: "attachment", name: "y.png", url: "https://x/y.png" },
    ]);
  });
  it("uses default attachment name when missing", () => {
    const blocks = renderMessageBlocks([
      { type: "file", url: "https://x/y.bin" },
    ]);
    expect(blocks).toEqual([
      { kind: "attachment", name: "attachment", url: "https://x/y.bin" },
    ]);
  });
  it("ignores unknown part types", () => {
    expect(
      renderMessageBlocks([
        { type: "weird", payload: 1 },
        { type: "text", text: "ok" },
      ])
    ).toEqual([{ kind: "text", body: "ok" }]);
  });
});

describe("chatToMarkdown", () => {
  it("emits a no-messages skeleton for an empty chat", () => {
    const md = chatToMarkdown(
      { id: "c", title: "Empty", createdAt: fixedDate },
      []
    );
    expect(md.startsWith("# Empty\n")).toBe(true);
    expect(md).toContain("_No messages._");
  });

  it("falls back to 'Untitled chat' when title is blank", () => {
    const md = chatToMarkdown(
      { id: "c", title: "   ", createdAt: fixedDate },
      []
    );
    expect(md.startsWith("# Untitled chat\n")).toBe(true);
  });

  it("renders user → assistant with role labels and timestamps", () => {
    const md = chatToMarkdown({ id: "c", title: "Hi", createdAt: fixedDate }, [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "what is 2+2?" }],
        createdAt: new Date("2026-05-04T10:01:00Z"),
      },
      {
        id: "m2",
        role: "assistant",
        parts: [{ type: "text", text: "4." }],
        createdAt: new Date("2026-05-04T10:01:01Z"),
      },
    ]);
    expect(md).toContain("## You");
    expect(md).toContain("what is 2+2?");
    expect(md).toContain("## Assistant");
    expect(md).toContain("4.");
    expect(md).toMatch(/2026-05-04T10:01:00Z/);
    const userAt = md.indexOf("## You");
    const asstAt = md.indexOf("## Assistant");
    expect(userAt).toBeGreaterThan(-1);
    expect(asstAt).toBeGreaterThan(userAt);
  });

  it("renders reasoning as a blockquote", () => {
    const md = chatToMarkdown({ id: "c", title: "T", createdAt: fixedDate }, [
      {
        id: "m1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "step 1\nstep 2" },
          { type: "text", text: "answer" },
        ],
        createdAt: fixedDate,
      },
    ]);
    expect(md).toContain("> _Reasoning:_");
    expect(md).toContain("> step 1");
    expect(md).toContain("> step 2");
    expect(md).toContain("answer");
  });

  it("renders file attachments as markdown links", () => {
    const md = chatToMarkdown({ id: "c", title: "T", createdAt: fixedDate }, [
      {
        id: "m1",
        role: "user",
        parts: [
          { type: "file", url: "https://x/y.png", name: "y.png" },
          { type: "text", text: "what is this?" },
        ],
        createdAt: fixedDate,
      },
    ]);
    expect(md).toContain("📎 [y.png](https://x/y.png)");
    expect(md).toContain("what is this?");
  });

  it("skips messages whose blocks are all empty", () => {
    const md = chatToMarkdown({ id: "c", title: "T", createdAt: fixedDate }, [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "  " }],
        createdAt: fixedDate,
      },
      {
        id: "m2",
        role: "assistant",
        parts: [{ type: "text", text: "real reply" }],
        createdAt: fixedDate,
      },
    ]);
    expect(md).not.toContain("## You");
    expect(md).toContain("## Assistant");
    expect(md).toContain("real reply");
  });

  it("collapses runs of blank lines", () => {
    const md = chatToMarkdown({ id: "c", title: "T", createdAt: fixedDate }, [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
        createdAt: fixedDate,
      },
    ]);
    expect(md).not.toMatch(/\n{3,}/);
  });

  it("ends with a single trailing newline", () => {
    const md = chatToMarkdown({ id: "c", title: "T", createdAt: fixedDate }, [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
        createdAt: fixedDate,
      },
    ]);
    expect(md.endsWith("\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });
});
