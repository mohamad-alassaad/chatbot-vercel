import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { setChatPin } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const patchSchema = z.object({
  pinned: z.boolean(),
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
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch (_error) {
    return new ChatbotError("bad_request:api").toResponse();
  }
  const updated = await setChatPin({
    chatId: id,
    userId: session.user.id,
    pinned: body.pinned,
  });
  return Response.json({ chat: updated });
}
