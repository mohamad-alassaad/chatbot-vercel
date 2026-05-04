"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.userAgent);
const MOD = isMac ? "⌘" : "Ctrl";

const SHORTCUTS: Array<{ keys: string[]; description: string }> = [
  { keys: [MOD, "K"], description: "Search across all conversations" },
  { keys: [MOD, "Shift", "O"], description: "New chat" },
  { keys: [MOD, ","], description: "Open settings" },
  { keys: ["Enter"], description: "Send message" },
  { keys: ["Shift", "Enter"], description: "New line in message" },
  { keys: ["Esc"], description: "Cancel streaming response" },
  { keys: ["?"], description: "Show this help" },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+Shift+O — new chat
      if (meta && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        router.push("/");
        return;
      }

      // Cmd+, — open settings
      if (meta && e.key === ",") {
        e.preventDefault();
        router.push("/settings/memory");
        return;
      }

      // Esc — cancel streaming (only if not typing in a field; the input
      // owns its own Esc behavior for editing/slash menus)
      if (e.key === "Escape" && !isTypingTarget(e.target)) {
        window.dispatchEvent(new CustomEvent("cancel-streaming"));
        return;
      }

      // ? — open shortcuts help (only when not typing)
      if (e.key === "?" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setHelpOpen(true);
      }
    },
    [router]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <Dialog onOpenChange={setHelpOpen} open={helpOpen}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            All shortcuts work from anywhere in the app unless noted.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 py-2">
          {SHORTCUTS.map((s) => (
            <li
              className="flex items-center justify-between gap-4 text-sm"
              key={s.description}
            >
              <span className="text-muted-foreground">{s.description}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k, idx) => (
                  <span
                    className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                    key={`${s.description}-${idx}`}
                  >
                    {k}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
