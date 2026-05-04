import { describe, expect, it } from "vitest";
import type { MemoryHit } from "@/lib/db/queries";

const memoryFactory = (overrides: Partial<MemoryHit> = {}): MemoryHit => ({
  id: crypto.randomUUID(),
  content: "User is vegetarian",
  category: "preference",
  confidence: 0.9,
  rank: 0.42,
  ...overrides,
});

// We import lazily so this module loads without Vercel's `Geo` types at test time.
import { systemPrompt } from "@/lib/ai/prompts";

const requestHints = {
  latitude: undefined,
  longitude: undefined,
  city: undefined,
  country: undefined,
};

describe("systemPrompt — memory rendering", () => {
  it("renders no memories section when memory is disabled", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: {
        memoryEnabled: false,
        memories: [memoryFactory()],
      },
    });
    expect(prompt).not.toContain("<memories>");
  });

  it("renders no memories section when memories array is empty", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: { memoryEnabled: true, memories: [] },
    });
    expect(prompt).not.toContain("<memories>");
  });

  it("renders provided memories with category prefixes", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: {
        memoryEnabled: true,
        memories: [
          memoryFactory({ category: "fact", content: "Name is Mohamad" }),
          memoryFactory({
            category: "preference",
            content: "Prefers concise answers",
          }),
        ],
      },
    });
    expect(prompt).toContain("<memories>");
    expect(prompt).toContain("- (fact) Name is Mohamad");
    expect(prompt).toContain("- (preference) Prefers concise answers");
  });

  it("respects token budget by truncating memories that would overflow", () => {
    // Build memories whose combined length far exceeds the 3200-char budget.
    const big = "x".repeat(800);
    const memories: MemoryHit[] = Array.from({ length: 10 }, (_, i) =>
      memoryFactory({ id: String(i), content: big })
    );
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: { memoryEnabled: true, memories },
    });
    const memoriesSection = prompt
      .split("<memories>")[1]
      ?.split("</memories>")[0];
    expect(memoriesSection).toBeDefined();
    // 4 lines fit, 5th would overflow (4 * (~810) = 3240 > 3200, but accumulator adds line by line).
    const lineCount = (memoriesSection ?? "")
      .split("\n")
      .filter((l) => l.startsWith("- (")).length;
    expect(lineCount).toBeGreaterThan(0);
    expect(lineCount).toBeLessThan(memories.length);
  });

  it("renders custom-instruction sections when provided", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: {
        memoryEnabled: true,
        customInstructionsAbout: "I'm a senior AI engineer.",
        customInstructionsRespond: "Be concise. No fluff.",
        tonePreference: "concise",
        memories: [],
      },
    });
    expect(prompt).toContain("<about_user>");
    expect(prompt).toContain("I'm a senior AI engineer.");
    expect(prompt).toContain("<response_preferences>");
    expect(prompt).toContain("Be concise. No fluff.");
    expect(prompt).toContain("Tone: be terse and direct");
  });

  it("omits the artifact section when supportsTools is false", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: false,
      memory: { memoryEnabled: true, memories: [] },
    });
    expect(prompt).not.toContain("createDocument");
  });
});
