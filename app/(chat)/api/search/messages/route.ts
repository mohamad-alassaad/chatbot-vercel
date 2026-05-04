import { auth } from "@/app/(auth)/auth";
import { searchMessages } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { buildSnippet, extractText } from "@/lib/search/snippet";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(
    Math.max(Number.parseInt(limitParam ?? "30", 10) || 30, 1),
    100
  );
  if (query.length === 0) {
    return Response.json({ query, results: [], latencyMs: 0 });
  }

  const start = Date.now();
  const hits = await searchMessages({ userId: session.user.id, query, limit });
  const results = hits.map((hit) => {
    const text = extractText(hit.parts);
    const { snippet, matched } = buildSnippet(text, query);
    return {
      messageId: hit.messageId,
      chatId: hit.chatId,
      chatTitle: hit.chatTitle,
      role: hit.role,
      createdAt: hit.createdAt.toISOString(),
      rank: hit.rank,
      snippet,
      matched,
    };
  });
  const latencyMs = Date.now() - start;
  return Response.json({ query, results, latencyMs });
}
