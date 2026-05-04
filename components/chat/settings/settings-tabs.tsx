"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string }[] = [
  { href: "/settings/memory", label: "Memory" },
  { href: "/settings/custom-instructions", label: "Custom instructions" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-border/50 border-b">
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <Link
            className={cn(
              "px-3 py-2 font-medium text-sm transition-colors",
              active
                ? "border-primary border-b-2 text-foreground"
                : "border-transparent border-b-2 text-muted-foreground hover:text-foreground"
            )}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
