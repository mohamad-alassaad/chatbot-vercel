/**
 * Snippet extraction for full-text search results.
 *
 * Walks the message's `parts` array (we only index/show user-visible text:
 * text + reasoning), concatenates them, finds the best window around the
 * matched query, and returns a highlighted-with-marks snippet.
 *
 * Pure function, no DB access — easy to unit-test.
 */

const SNIPPET_RADIUS = 60; // chars on each side of the match
const MAX_SNIPPET_LEN = 180;

type MessagePart =
  | { type: "text"; text?: string }
  | { type: "reasoning"; text?: string }
  | { type: string; [key: string]: unknown };

export type SnippetResult = {
  snippet: string;
  matched: boolean;
};

export function extractText(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  const out: string[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const p = raw as MessagePart;
    if (
      (p.type === "text" || p.type === "reasoning") &&
      typeof p.text === "string"
    ) {
      out.push(p.text);
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build a snippet around the first occurrence of any query term, with each
 * matched token wrapped in <mark>…</mark> (HTML-escaped otherwise so the
 * caller can dangerouslySetInnerHTML safely).
 */
export function buildSnippet(text: string, query: string): SnippetResult {
  const cleanText = text.trim();
  if (cleanText.length === 0) {
    return { snippet: "", matched: false };
  }
  const tokens = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return {
      snippet: truncate(escapeHtml(cleanText), MAX_SNIPPET_LEN),
      matched: false,
    };
  }

  const lower = cleanText.toLowerCase();
  let firstMatch = -1;
  for (const tok of tokens) {
    const idx = lower.indexOf(tok.toLowerCase());
    if (idx !== -1 && (firstMatch === -1 || idx < firstMatch)) {
      firstMatch = idx;
    }
  }
  if (firstMatch === -1) {
    return {
      snippet: truncate(escapeHtml(cleanText), MAX_SNIPPET_LEN),
      matched: false,
    };
  }

  const start = Math.max(0, firstMatch - SNIPPET_RADIUS);
  const end = Math.min(
    cleanText.length,
    firstMatch + SNIPPET_RADIUS + Math.max(...tokens.map((t) => t.length))
  );
  let window = cleanText.slice(start, end);
  if (start > 0) {
    window = `…${window}`;
  }
  if (end < cleanText.length) {
    window = `${window}…`;
  }

  const escaped = escapeHtml(window);
  // Highlight all tokens. Word-boundary regex on each token, case-insensitive.
  const pattern = new RegExp(
    `(${tokens
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})`,
    "gi"
  );
  const highlighted = escaped.replace(pattern, "<mark>$1</mark>");
  return { snippet: highlighted, matched: true };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max - 1)}…`;
}
