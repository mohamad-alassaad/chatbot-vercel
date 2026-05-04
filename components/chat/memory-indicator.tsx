"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ManageMemoryOutput } from "@/lib/ai/tools/manage-memory";

type MemoryIndicatorProps = {
  toolCallId: string;
  output: ManageMemoryOutput;
};

const PILL_ICON: Record<string, string> = {
  "memory-saved": "🧠",
  "memory-updated": "✏️",
  "memory-deleted": "🗑️",
  "memory-recalled": "🔎",
};

function shortContent(input: string, max = 60): string {
  return input.length > max ? `${input.slice(0, max - 1)}…` : input;
}

export function MemoryIndicator({ toolCallId, output }: MemoryIndicatorProps) {
  const toastedRef = useRef<string | null>(null);

  useEffect(() => {
    if (toastedRef.current === toolCallId) {
      return;
    }
    toastedRef.current = toolCallId;

    if (output.kind === "memory-saved" && !output.deduplicated) {
      toast(`🧠 Memory saved — “${shortContent(output.content)}”`, {
        description: "Future conversations will reference this.",
      });
    } else if (output.kind === "memory-saved" && output.deduplicated) {
      toast("Memory already known — bumped freshness", {
        description: shortContent(output.content),
      });
    } else if (output.kind === "memory-updated") {
      toast(`✏️ Memory updated — “${shortContent(output.content)}”`);
    } else if (output.kind === "memory-deleted") {
      toast("🗑️ Memory deleted");
    }
  }, [output, toolCallId]);

  if (output.kind === "noop") {
    return null;
  }
  if (output.kind === "memory-recalled") {
    if (output.count === 0) {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-muted-foreground text-xs">
          🔎 No memories matched
        </div>
      );
    }
    return (
      <Link
        className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted/60 hover:text-foreground"
        href="/settings/memory"
      >
        🔎 Recalled {output.count} {output.count === 1 ? "memory" : "memories"}
      </Link>
    );
  }
  if (output.kind === "memory-deleted") {
    return (
      <Link
        className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted/60 hover:text-foreground"
        href="/settings/memory"
      >
        🗑️ Memory deleted
      </Link>
    );
  }

  const label =
    output.kind === "memory-saved"
      ? output.deduplicated
        ? "Memory bumped"
        : "Memory saved"
      : "Memory updated";
  const content =
    output.kind === "memory-saved" || output.kind === "memory-updated"
      ? output.content
      : "";

  return (
    <Link
      className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted/60 hover:text-foreground"
      href="/settings/memory"
    >
      <span aria-hidden>{PILL_ICON[output.kind] ?? "🧠"}</span>
      <span className="font-medium text-foreground">{label}</span>
      {content && (
        <span className="hidden sm:inline">— “{shortContent(content)}”</span>
      )}
    </Link>
  );
}
