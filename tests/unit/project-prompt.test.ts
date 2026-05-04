import { describe, expect, it } from "vitest";
import { systemPrompt } from "@/lib/ai/prompts";

const requestHints = {
  latitude: undefined,
  longitude: undefined,
  city: undefined,
  country: undefined,
};

describe("systemPrompt — project context rendering (P4)", () => {
  it("emits no <project_context> when project is undefined", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: { memoryEnabled: true, memories: [] },
    });
    expect(prompt).not.toContain("<project_context");
  });

  it("emits no <project_context> when project.systemPrompt is null/empty/whitespace", () => {
    for (const value of [null, "", "   \n\t"]) {
      const prompt = systemPrompt({
        requestHints,
        supportsTools: true,
        memory: { memoryEnabled: true, memories: [] },
        project: { name: "P", systemPrompt: value },
      });
      expect(prompt).not.toContain("<project_context");
    }
  });

  it("renders <project_context> with name + body when both are set", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: { memoryEnabled: true, memories: [] },
      project: { name: "Pizza", systemPrompt: "Always answer in Italian." },
    });
    expect(prompt).toContain('<project_context name="Pizza">');
    expect(prompt).toContain("Always answer in Italian.");
    expect(prompt).toContain("</project_context>");
  });

  it("escapes embedded quotes in project name to avoid attribute injection", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: { memoryEnabled: true, memories: [] },
      project: {
        name: 'Evil "name" attr',
        systemPrompt: "do thing",
      },
    });
    expect(prompt).toContain('name="Evil &quot;name&quot; attr"');
    // raw double-quote inside the name must not appear unescaped
    expect(prompt).not.toContain('name="Evil "name"');
  });

  it("places <project_context> after custom instructions and before <memories>", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: {
        memoryEnabled: true,
        memories: [
          {
            id: "m1",
            content: "user is Mohamad",
            category: "fact",
            confidence: 1,
            rank: 1,
          },
        ],
        customInstructionsAbout: "I'm a senior eng",
      },
      project: { name: "Pizza", systemPrompt: "Italian only." },
    });
    const aboutAt = prompt.indexOf("<about_user>");
    const projectAt = prompt.indexOf("<project_context");
    const memoriesAt = prompt.indexOf("<memories>");
    expect(aboutAt).toBeGreaterThan(-1);
    expect(projectAt).toBeGreaterThan(aboutAt);
    expect(memoriesAt).toBeGreaterThan(projectAt);
  });

  it("renders project even when memory is disabled", () => {
    const prompt = systemPrompt({
      requestHints,
      supportsTools: true,
      memory: { memoryEnabled: false, memories: [] },
      project: { name: "X", systemPrompt: "rule one" },
    });
    expect(prompt).toContain("<project_context");
    expect(prompt).toContain("rule one");
    expect(prompt).not.toContain("<memories>");
  });
});
