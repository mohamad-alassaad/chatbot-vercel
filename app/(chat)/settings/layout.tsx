import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/guest?redirectUrl=/settings/memory");
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-6 px-4 py-8 md:py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Personalize how the assistant works for you.
          </p>
        </div>
        <Link
          className="text-muted-foreground text-sm hover:text-foreground"
          href="/"
        >
          ← Back to chat
        </Link>
      </header>
      <nav className="flex gap-1 border-border/50 border-b">
        <Link
          className="border-primary border-b-2 px-3 py-2 font-medium text-sm"
          href="/settings/memory"
        >
          Memory
        </Link>
      </nav>
      <main className="flex-1">{children}</main>
    </div>
  );
}
