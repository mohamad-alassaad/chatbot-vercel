import { describe, expect, it } from "vitest";
import { buildSnippet, extractText } from "@/lib/search/snippet";

describe("extractText", () => {
  it("returns empty for non-arrays", () => {
    expect(extractText(null)).toBe("");
    expect(extractText(undefined)).toBe("");
    expect(extractText({})).toBe("");
    expect(extractText("string")).toBe("");
  });

  it("concatenates text and reasoning parts only", () => {
    const parts = [
      { type: "text", text: "hello" },
      { type: "tool-getWeather", input: { city: "NYC" } },
      { type: "reasoning", text: "thinking…" },
      { type: "text", text: "world" },
    ];
    expect(extractText(parts)).toBe("hello thinking… world");
  });

  it("collapses runs of whitespace", () => {
    const parts = [
      { type: "text", text: "hello   \n\n   world" },
      { type: "text", text: "  again  " },
    ];
    expect(extractText(parts)).toBe("hello world again");
  });

  it("ignores text parts with non-string text", () => {
    const parts = [
      { type: "text" },
      { type: "text", text: null },
      { type: "text", text: 42 },
      { type: "text", text: "real" },
    ];
    expect(extractText(parts)).toBe("real");
  });
});

describe("buildSnippet", () => {
  const longText =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. The user is vegetarian and prefers concise answers in French. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

  it("returns matched=false and a truncated snippet when query has no match", () => {
    const result = buildSnippet(longText, "elephant");
    expect(result.matched).toBe(false);
    expect(result.snippet).not.toContain("<mark>");
    expect(result.snippet.length).toBeLessThanOrEqual(180);
  });

  it("returns empty snippet for empty text", () => {
    expect(buildSnippet("", "anything")).toEqual({
      snippet: "",
      matched: false,
    });
    expect(buildSnippet("   ", "anything")).toEqual({
      snippet: "",
      matched: false,
    });
  });

  it("highlights the match with <mark> tags", () => {
    const result = buildSnippet(longText, "vegetarian");
    expect(result.matched).toBe(true);
    expect(result.snippet).toContain("<mark>vegetarian</mark>");
  });

  it("is case-insensitive on match but preserves source case", () => {
    const result = buildSnippet(longText, "VEGETARIAN");
    expect(result.matched).toBe(true);
    expect(result.snippet).toContain("<mark>vegetarian</mark>");
  });

  it("highlights every query token", () => {
    const result = buildSnippet(longText, "user French");
    expect(result.matched).toBe(true);
    // first token's first occurrence anchors the window; both tokens should
    // be highlighted within the window.
    expect(result.snippet).toContain("<mark>user</mark>");
    expect(result.snippet).toContain("<mark>French</mark>");
  });

  it("adds ellipsis prefix/suffix when the window is in the middle", () => {
    const result = buildSnippet(longText, "vegetarian");
    expect(result.snippet.startsWith("…")).toBe(true);
    expect(result.snippet.endsWith("…")).toBe(true);
  });

  it("HTML-escapes everything except the <mark> wrappers it adds itself", () => {
    const evil = 'Hello <script>alert("xss")</script> vegetarian world';
    const result = buildSnippet(evil, "vegetarian");
    expect(result.snippet).not.toContain("<script>");
    expect(result.snippet).toContain("&lt;script&gt;");
    expect(result.snippet).toContain("<mark>vegetarian</mark>");
  });

  it("treats regex metacharacters in the query as literal text", () => {
    const text = "user said: a.b matches a.b literally";
    const result = buildSnippet(text, "a.b");
    expect(result.matched).toBe(true);
    expect(result.snippet).toContain("<mark>a.b</mark>");
  });
});
