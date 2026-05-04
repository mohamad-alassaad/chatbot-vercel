// Phase 0 / P6 — pure converters that turn a chat + its messages into
// downloadable artifacts (Markdown today; PDF rendering reuses the
// same data shape via @react-pdf/renderer).
//
// Pure: no DB access, no React, no fs. Easy to unit-test.

const MAX_FILENAME_LEN = 60;

export type ExportableMessagePart =
  | { type: "text"; text?: string }
  | { type: "reasoning"; text?: string }
  | { type: "file"; mediaType?: string; name?: string; url?: string }
  | { type: string; [key: string]: unknown };

export type ExportableMessage = {
  id: string;
  role: string;
  parts: unknown;
  createdAt: Date | string;
};

export type ExportableChat = {
  id: string;
  title: string;
  createdAt: Date | string;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function formatTimestamp(value: Date | string): string {
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  // ISO without milliseconds, in UTC — predictable across machines/tests.
  return `${d.toISOString().slice(0, 19)}Z`;
}

export function slugifyTitle(title: string): string {
  const cleaned = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (cleaned.length === 0) {
    return "chat";
  }
  return cleaned.length > MAX_FILENAME_LEN
    ? cleaned.slice(0, MAX_FILENAME_LEN).replace(/-+$/g, "")
    : cleaned;
}

function roleLabel(role: string): string {
  switch (role) {
    case "user":
      return "You";
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    case "tool":
      return "Tool";
    default:
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

/**
 * Walk a message's `parts` and emit the printable text blocks.
 * Each entry is { kind, body } so the PDF renderer can style differently
 * (e.g. italicize reasoning).
 */
export type RenderedBlock =
  | { kind: "text"; body: string }
  | { kind: "reasoning"; body: string }
  | { kind: "attachment"; name: string; url: string };

export function renderMessageBlocks(parts: unknown): RenderedBlock[] {
  if (!Array.isArray(parts)) {
    return [];
  }
  const out: RenderedBlock[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const p = raw as ExportableMessagePart;
    if (p.type === "text" && typeof p.text === "string" && p.text.trim()) {
      out.push({ kind: "text", body: p.text });
    } else if (
      p.type === "reasoning" &&
      typeof p.text === "string" &&
      p.text.trim()
    ) {
      out.push({ kind: "reasoning", body: p.text });
    } else if (p.type === "file" && typeof p.url === "string") {
      out.push({
        kind: "attachment",
        name: typeof p.name === "string" && p.name ? p.name : "attachment",
        url: p.url,
      });
    }
  }
  return out;
}

export function chatToMarkdown(
  chat: ExportableChat,
  messages: ExportableMessage[]
): string {
  const lines: string[] = [];
  const titleLine = chat.title?.trim() || "Untitled chat";
  lines.push(`# ${titleLine}`);
  lines.push("");
  lines.push(`*Exported: ${formatTimestamp(new Date())}*`);
  lines.push(`*Created: ${formatTimestamp(chat.createdAt)}*`);
  lines.push("");

  if (messages.length === 0) {
    lines.push("_No messages._");
    return `${lines.join("\n")}\n`;
  }

  for (const m of messages) {
    const blocks = renderMessageBlocks(m.parts);
    if (blocks.length === 0) {
      continue;
    }
    lines.push(`## ${roleLabel(m.role)}`);
    lines.push(`*${formatTimestamp(m.createdAt)}*`);
    lines.push("");
    for (const block of blocks) {
      if (block.kind === "text") {
        lines.push(block.body.trim());
        lines.push("");
      } else if (block.kind === "reasoning") {
        lines.push("> _Reasoning:_");
        for (const ln of block.body.trim().split("\n")) {
          lines.push(`> ${ln}`);
        }
        lines.push("");
      } else if (block.kind === "attachment") {
        lines.push(`📎 [${block.name}](${block.url})`);
        lines.push("");
      }
    }
  }

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}
