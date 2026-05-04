// Phase 0 / P6 — PDF document for a single chat, rendered server-side
// via @react-pdf/renderer. Pure presentation; data shapes come from
// `lib/chat/export.ts`.

import {
  Document,
  Font,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  type ExportableChat,
  type ExportableMessage,
  renderMessageBlocks,
} from "./export";

// Twemoji PNG fallback for emoji glyphs — Helvetica has none.
// Loaded lazily per render; cached by @react-pdf at runtime.
Font.registerEmojiSource({
  format: "png",
  url: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/",
});

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    fontSize: 10.5,
    fontFamily: "Helvetica",
    color: "#0f172a",
    lineHeight: 1.5,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  meta: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 16,
  },
  message: {
    marginBottom: 14,
  },
  role: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  timestamp: {
    fontSize: 8.5,
    color: "#64748b",
    marginBottom: 4,
  },
  text: {
    marginBottom: 4,
  },
  reasoning: {
    fontSize: 9.5,
    color: "#475569",
    fontStyle: "italic",
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: "#cbd5e1",
    borderLeftStyle: "solid",
    marginBottom: 4,
  },
  attachment: {
    fontSize: 9.5,
    color: "#0369a1",
    marginBottom: 4,
  },
  toolBlock: {
    backgroundColor: "#f8fafc",
    borderLeftWidth: 2,
    borderLeftColor: "#94a3b8",
    borderLeftStyle: "solid",
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
  },
  toolHeader: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: "#334155",
    marginBottom: 2,
  },
  toolJson: {
    fontFamily: "Courier",
    fontSize: 8.5,
    color: "#1e293b",
    marginBottom: 2,
  },
  toolSummary: {
    fontSize: 9.5,
    color: "#0f172a",
  },
  toolNote: {
    fontSize: 8.5,
    fontStyle: "italic",
    color: "#64748b",
    marginTop: 2,
  },
  empty: {
    fontStyle: "italic",
    color: "#64748b",
  },
});

function formatTimestamp(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return `${d.toISOString().slice(0, 19)}Z`;
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

export function ChatExportDocument({
  chat,
  messages,
}: {
  chat: ExportableChat;
  messages: ExportableMessage[];
}) {
  return (
    <Document title={chat.title || "Chat export"}>
      <Page size="LETTER" style={styles.page} wrap>
        <Text style={styles.title}>{chat.title || "Untitled chat"}</Text>
        <Text style={styles.meta}>
          Created {formatTimestamp(chat.createdAt)} · Exported{" "}
          {formatTimestamp(new Date())}
        </Text>

        {messages.length === 0 ? (
          <Text style={styles.empty}>No messages.</Text>
        ) : (
          messages.map((m) => {
            const blocks = renderMessageBlocks(m.parts);
            if (blocks.length === 0) {
              return null;
            }
            return (
              <View key={m.id} style={styles.message} wrap={false}>
                <Text style={styles.role}>{roleLabel(m.role)}</Text>
                <Text style={styles.timestamp}>
                  {formatTimestamp(m.createdAt)}
                </Text>
                {blocks.map((block, idx) => {
                  const key = `${m.id}-${idx}`;
                  if (block.kind === "text") {
                    return (
                      <Text key={key} style={styles.text}>
                        {block.body}
                      </Text>
                    );
                  }
                  if (block.kind === "reasoning") {
                    return (
                      <Text key={key} style={styles.reasoning}>
                        {block.body}
                      </Text>
                    );
                  }
                  if (block.kind === "attachment") {
                    return (
                      <Link key={key} src={block.url} style={styles.attachment}>
                        {`📎 ${block.name}`}
                      </Link>
                    );
                  }
                  return (
                    <View key={key} style={styles.toolBlock} wrap={false}>
                      <Text style={styles.toolHeader}>
                        🛠 Tool: {block.name}
                      </Text>
                      {block.inputJson ? (
                        <Text style={styles.toolJson}>{block.inputJson}</Text>
                      ) : null}
                      {block.summary ? (
                        <Text style={styles.toolSummary}>{block.summary}</Text>
                      ) : null}
                      {block.note ? (
                        <Text style={styles.toolNote}>{block.note}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
      </Page>
    </Document>
  );
}
