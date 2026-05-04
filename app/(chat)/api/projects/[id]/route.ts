import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { deleteProject, updateProject } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(280).nullable().optional(),
  systemPrompt: z.string().max(4000).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
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
  const updated = await updateProject({
    id,
    userId: session.user.id,
    patch,
  });
  return Response.json({ project: updated });
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
  const result = await deleteProject({ id, userId: session.user.id });
  return Response.json(result);
}
