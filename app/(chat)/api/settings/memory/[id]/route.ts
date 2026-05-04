import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { forgetMemory, updateMemory } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const patchSchema = z.object({
  content: z.string().min(3).max(500).optional(),
  category: z.enum(["fact", "preference", "project", "other"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  const { id } = await params;
  let patch: z.infer<typeof patchSchema>;
  try {
    patch = patchSchema.parse(await request.json());
  } catch (_error) {
    return new ChatbotError("bad_request:api").toResponse();
  }
  const updated = await updateMemory({
    id,
    userId: session.user.id,
    patch,
  });
  if (!updated) {
    return new ChatbotError("not_found:chat").toResponse();
  }
  return Response.json({
    id: updated.id,
    content: updated.content,
    category: updated.category,
    confidence: Number(updated.confidence),
    createdAt: updated.createdAt.toISOString(),
    lastAccessedAt: updated.lastAccessedAt.toISOString(),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  const { id } = await params;
  const ok = await forgetMemory({ id, userId: session.user.id });
  if (!ok) {
    return new ChatbotError("not_found:chat").toResponse();
  }
  return Response.json({ id });
}
