import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteAllMemories,
  getOrCreateUserSettings,
  listMemories,
  updateUserSettings,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const settingsPatchSchema = z.object({
  memoryEnabled: z.boolean().optional(),
  customInstructionsAbout: z.string().max(2000).nullable().optional(),
  customInstructionsRespond: z.string().max(2000).nullable().optional(),
  tonePreference: z
    .enum(["concise", "detailed", "casual", "formal", "default"])
    .optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  const memories = await listMemories({ userId: session.user.id });
  const settings = await getOrCreateUserSettings({ userId: session.user.id });
  return Response.json({
    settings,
    memories: memories.map((m) => ({
      ...m,
      confidence: Number(m.confidence),
    })),
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  let patch: z.infer<typeof settingsPatchSchema>;
  try {
    patch = settingsPatchSchema.parse(await request.json());
  } catch (_error) {
    return new ChatbotError("bad_request:api").toResponse();
  }
  const updated = await updateUserSettings({
    userId: session.user.id,
    patch,
  });
  return Response.json({
    memoryEnabled: updated.memoryEnabled,
    customInstructionsAbout: updated.customInstructionsAbout,
    customInstructionsRespond: updated.customInstructionsRespond,
    tonePreference: updated.tonePreference,
  });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  const deletedCount = await deleteAllMemories({ userId: session.user.id });
  return Response.json({ deletedCount });
}
