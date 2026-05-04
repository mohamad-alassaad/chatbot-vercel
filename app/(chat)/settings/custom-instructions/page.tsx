import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { CustomInstructionsClient } from "@/components/chat/settings/custom-instructions-client";
import { getOrCreateUserSettings } from "@/lib/db/queries";

export default async function CustomInstructionsSettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/guest?redirectUrl=/settings/custom-instructions");
  }

  const settings = await getOrCreateUserSettings({ userId: session.user.id });

  return (
    <CustomInstructionsClient
      initial={{
        customInstructionsAbout: settings.customInstructionsAbout ?? "",
        customInstructionsRespond: settings.customInstructionsRespond ?? "",
        tonePreference: settings.tonePreference,
      }}
    />
  );
}
