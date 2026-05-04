import { describe, expect, it } from "vitest";
import { systemPrompt } from "@/lib/ai/prompts";

const requestHints = {
  latitude: undefined,
  longitude: undefined,
  city: undefined,
  country: undefined,
};

describe("systemPrompt — custom instructions rendering", () => {
  it("emits no instruction sections when nothing is set", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: { memoryEnabled: true, memories: [] },
    });
    expect(prompt).not.toContain("<about_user>");
    expect(prompt).not.toContain("<response_preferences>");
    expect(prompt).not.toContain("Tone:");
  });

  it("renders <about_user> only when only that field is set", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: {
        memoryEnabled: true,
        memories: [],
        customInstructionsAbout: "I'm a senior AI engineer",
      },
    });
    expect(prompt).toContain("<about_user>");
    expect(prompt).toContain("I'm a senior AI engineer");
    expect(prompt).toContain("</about_user>");
    expect(prompt).not.toContain("<response_preferences>");
    expect(prompt).not.toContain("Tone:");
  });

  it("renders <response_preferences> only when only that field is set", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: {
        memoryEnabled: true,
        memories: [],
        customInstructionsRespond: "Skip the preamble",
      },
    });
    expect(prompt).toContain("<response_preferences>");
    expect(prompt).toContain("Skip the preamble");
    expect(prompt).not.toContain("<about_user>");
  });

  it("renders the right tone directive for each non-default tone", () => {
    const cases: ["concise" | "detailed" | "casual" | "formal", string][] = [
      ["concise", "Tone: be terse and direct"],
      ["detailed", "Tone: be thorough and explanatory"],
      ["casual", "Tone: be casual and conversational"],
      ["formal", "Tone: be formal and professional"],
    ];
    for (const [tone, expected] of cases) {
      const prompt = systemPrompt({
        requestHints,
        supportsTools: true,
        memory: {
          memoryEnabled: true,
          memories: [],
          tonePreference: tone,
        },
      });
      expect(prompt).toContain(expected);
    }
  });

  it("emits no tone directive for tonePreference: 'default'", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: {
        memoryEnabled: true,
        memories: [],
        tonePreference: "default",
      },
    });
    expect(prompt).not.toContain("Tone:");
  });

  it("composes about + respond + tone in order with blank-line separators", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: {
        memoryEnabled: true,
        memories: [],
        customInstructionsAbout: "About line",
        customInstructionsRespond: "Respond line",
        tonePreference: "concise",
      },
    });
    const aboutAt = prompt.indexOf("<about_user>");
    const respondAt = prompt.indexOf("<response_preferences>");
    const toneAt = prompt.indexOf("Tone: be terse");
    expect(aboutAt).toBeGreaterThan(-1);
    expect(respondAt).toBeGreaterThan(aboutAt);
    expect(toneAt).toBeGreaterThan(respondAt);
  });

  it("ignores whitespace-only instructions", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: {
        memoryEnabled: true,
        memories: [],
        customInstructionsAbout: "   \n\t  ",
        customInstructionsRespond: "",
      },
    });
    expect(prompt).not.toContain("<about_user>");
    expect(prompt).not.toContain("<response_preferences>");
  });

  it("renders custom instructions even when memoryEnabled is false (they are user-level prefs, not memories)", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: {
        memoryEnabled: false,
        memories: [
          {
            id: "x",
            content: "secret",
            category: "fact",
            confidence: 1,
            rank: 1,
          },
        ],
        customInstructionsAbout: "I exist",
      },
    });
    expect(prompt).toContain("<about_user>");
    expect(prompt).toContain("I exist");
    // memories should NOT be injected when disabled
    expect(prompt).not.toContain("<memories>");
    expect(prompt).not.toContain("secret");
  });
});
