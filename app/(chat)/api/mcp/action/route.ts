import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { callPizzazTool } from "@/lib/ai/mcp/pizzaz-client";
import { ChatbotError } from "@/lib/errors";

const bodySchema = z.object({
  toolName: z.string().min(1).max(100),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

export const maxDuration = 30;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await request.json());
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const output = await callPizzazTool(payload.toolName, payload.arguments);
    return Response.json(output);
  } catch (error) {
    console.error("MCP action proxy error:", error);
    return new ChatbotError("offline:chat").toResponse();
  }
}
