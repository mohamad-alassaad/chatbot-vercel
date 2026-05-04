import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { MemorySettingsClient } from "@/components/chat/settings/memory-settings-client";
import { getOrCreateUserSettings, listMemories } from "@/lib/db/queries";

export default async function MemorySettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/guest?redirectUrl=/settings/memory");
  }

  const [settings, memories] = await Promise.all([
    getOrCreateUserSettings({ userId: session.user.id }),
    listMemories({ userId: session.user.id }),
  ]);

  return (
    <MemorySettingsClient
      initialMemories={memories.map((m) => ({
        id: m.id,
        content: m.content,
        category: m.category,
        confidence: Number(m.confidence),
        createdAt: m.createdAt.toISOString(),
        lastAccessedAt: m.lastAccessedAt.toISOString(),
      }))}
      initialSettings={{
        memoryEnabled: settings.memoryEnabled,
      }}
    />
  );
}
