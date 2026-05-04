import { auth } from "@/app/(auth)/auth";
import { chatToMarkdown, slugifyTitle } from "@/lib/chat/export";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  const { id } = await params;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "md").toLowerCase();
  if (format !== "md" && format !== "pdf") {
    return new ChatbotError("bad_request:api", "Unknown format").toResponse();
  }

  const chat = await getChatById({ id });
  if (!chat) {
    return new ChatbotError("not_found:chat").toResponse();
  }
  if (chat.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const messages = await getMessagesByChatId({ id });
  const slug = slugifyTitle(chat.title || "chat");

  if (format === "md") {
    const md = chatToMarkdown(
      { id: chat.id, title: chat.title, createdAt: chat.createdAt },
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
        createdAt: m.createdAt,
      }))
    );
    return new Response(md, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${slug}.md"`,
        "cache-control": "no-store",
      },
    });
  }

  // PDF — defer the heavy import so the markdown path stays cheap.
  const [{ renderToBuffer }, { ChatExportDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/lib/chat/export-pdf"),
  ]);
  const pdfBuffer = await renderToBuffer(
    ChatExportDocument({
      chat: { id: chat.id, title: chat.title, createdAt: chat.createdAt },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
        createdAt: m.createdAt,
      })),
    })
  );
  return new Response(pdfBuffer as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${slug}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
