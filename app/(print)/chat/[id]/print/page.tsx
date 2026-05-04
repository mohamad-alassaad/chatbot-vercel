import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { renderMessageBlocks } from "@/lib/chat/export";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { PrintToolbar } from "./auto-print";
import { PrintMcpUi } from "./print-mcp-ui";

type McpUiPart = {
  toolName: string;
  html: string;
  text?: string;
  structuredContent?: unknown;
  input?: Record<string, unknown>;
};

function asMcpUiPart(part: unknown): McpUiPart | null {
  if (!part || typeof part !== "object") {
    return null;
  }
  const p = part as {
    type?: string;
    toolName?: string;
    input?: Record<string, unknown>;
    output?: {
      ui?: { html?: unknown };
      text?: unknown;
      structuredContent?: unknown;
    };
  };
  const ui = p.output?.ui;
  const html = ui && typeof ui === "object" ? ui.html : undefined;
  if (typeof html !== "string" || html.length === 0) {
    return null;
  }
  const toolName =
    p.toolName ??
    (typeof p.type === "string" && p.type.startsWith("tool-")
      ? p.type.slice("tool-".length)
      : "tool");
  return {
    toolName,
    html,
    text: typeof p.output?.text === "string" ? p.output.text : undefined,
    structuredContent: p.output?.structuredContent,
    input: p.input,
  };
}

function timestamp(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return `${d.toISOString().slice(0, 19)}Z`;
}

function roleLabel(role: string): string {
  if (role === "user") {
    return "You";
  }
  if (role === "assistant") {
    return "Assistant";
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default async function ChatPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    const { id } = await params;
    redirect(`/api/auth/guest?redirectUrl=/chat/${id}/print`);
  }
  const { id } = await params;
  const chat = await getChatById({ id });
  if (!chat) {
    notFound();
  }
  if (chat.userId !== session.user.id) {
    notFound();
  }
  const messages = await getMessagesByChatId({ id });

  return (
    <>
      <style
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static @media print stylesheet, no user input
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  .no-print { display: none !important; }
  body { background: white !important; }
  .print-message { break-inside: avoid; page-break-inside: avoid; }
  iframe { border: 1px solid #e5e7eb !important; }
  @page { margin: 16mm; }
}
          `,
        }}
      />
      <PrintToolbar />
      <main className="mx-auto max-w-3xl px-6 py-8 font-sans text-zinc-900">
        <header className="mb-6 border-b border-zinc-200 pb-4">
          <h1 className="text-2xl font-bold">
            {chat.title || "Untitled chat"}
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Created {timestamp(chat.createdAt)} · Exported{" "}
            {timestamp(new Date())}
          </p>
        </header>

        {messages.length === 0 ? (
          <p className="italic text-zinc-500">No messages.</p>
        ) : (
          messages.map((m) => {
            const blocks = renderMessageBlocks(m.parts);
            const uiParts: McpUiPart[] = Array.isArray(m.parts)
              ? (m.parts as unknown[])
                  .map((p) => asMcpUiPart(p))
                  .filter((s): s is McpUiPart => s !== null)
              : [];

            if (blocks.length === 0 && uiParts.length === 0) {
              return null;
            }
            return (
              <article className="print-message mb-6" key={m.id}>
                <div className="mb-1 flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide">
                    {roleLabel(m.role)}
                  </h2>
                  <span className="text-xs text-zinc-500">
                    {timestamp(m.createdAt)}
                  </span>
                </div>
                <div className="space-y-2 text-sm leading-relaxed">
                  {blocks.map((block, idx) => {
                    const key = `${m.id}-b-${idx}`;
                    if (block.kind === "text") {
                      return (
                        <p className="whitespace-pre-wrap" key={key}>
                          {block.body}
                        </p>
                      );
                    }
                    if (block.kind === "reasoning") {
                      return (
                        <blockquote
                          className="whitespace-pre-wrap border-l-2 border-zinc-300 pl-3 text-xs italic text-zinc-600"
                          key={key}
                        >
                          {block.body}
                        </blockquote>
                      );
                    }
                    if (block.kind === "attachment") {
                      return (
                        <a
                          className="block text-sky-700 underline"
                          href={block.url}
                          key={key}
                          rel="noreferrer"
                          target="_blank"
                        >
                          📎 {block.name}
                        </a>
                      );
                    }
                    return (
                      <div
                        className="rounded-md border-l-2 border-zinc-400 bg-zinc-50 px-3 py-2 text-xs"
                        key={key}
                      >
                        <div className="mb-1 font-semibold text-zinc-700">
                          🛠 Tool: {block.name}
                        </div>
                        {block.inputJson ? (
                          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-800">
                            {block.inputJson}
                          </pre>
                        ) : null}
                        {block.summary ? (
                          <p className="text-zinc-900">{block.summary}</p>
                        ) : null}
                      </div>
                    );
                  })}
                  {uiParts.map((part, idx) => (
                    <PrintMcpUi
                      html={part.html}
                      input={part.input}
                      key={`${m.id}-ui-${idx}`}
                      structuredContent={part.structuredContent}
                      text={part.text}
                      toolName={part.toolName}
                    />
                  ))}
                </div>
              </article>
            );
          })
        )}
      </main>
    </>
  );
}
