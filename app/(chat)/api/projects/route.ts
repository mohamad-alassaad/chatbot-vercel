import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createProject,
  getChatCountsByProject,
  listProjectsByUserId,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(280).nullable().optional(),
  systemPrompt: z.string().max(4000).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  const [projects, counts] = await Promise.all([
    listProjectsByUserId({ userId: session.user.id }),
    getChatCountsByProject({ userId: session.user.id }),
  ]);
  return Response.json({
    projects: projects.map((p) => ({
      ...p,
      chatCount: counts[p.id] ?? 0,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (_error) {
    return new ChatbotError("bad_request:api").toResponse();
  }
  const created = await createProject({
    userId: session.user.id,
    name: body.name,
    description: body.description ?? null,
    systemPrompt: body.systemPrompt ?? null,
    color: body.color ?? null,
  });
  return Response.json({ project: { ...created, chatCount: 0 } });
}
