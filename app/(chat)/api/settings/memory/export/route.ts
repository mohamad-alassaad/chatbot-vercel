import { auth } from "@/app/(auth)/auth";
import { listMemories } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  const memories = await listMemories({ userId: session.user.id });
  const payload = {
    exportedAt: new Date().toISOString(),
    userId: session.user.id,
    memories: memories.map((m) => ({
      id: m.id,
      content: m.content,
      category: m.category,
      confidence: Number(m.confidence),
      createdAt: m.createdAt.toISOString(),
      lastAccessedAt: m.lastAccessedAt.toISOString(),
    })),
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="memories-${Date.now()}.json"`,
    },
  });
}
