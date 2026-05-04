"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type MemoryRow = {
  id: string;
  content: string;
  category: "fact" | "preference" | "project" | "other";
  confidence: number;
  createdAt: string;
  lastAccessedAt: string;
};

type MemorySettings = {
  memoryEnabled: boolean;
};

type Props = {
  initialMemories: MemoryRow[];
  initialSettings: MemorySettings;
};

const CATEGORY_LABEL: Record<MemoryRow["category"], string> = {
  fact: "Fact",
  preference: "Preference",
  project: "Project",
  other: "Other",
};

const CATEGORY_COLOR: Record<MemoryRow["category"], string> = {
  fact: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  preference: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  project: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  other: "bg-muted text-muted-foreground",
};

function relative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return d.toLocaleDateString();
}

export function MemorySettingsClient({
  initialMemories,
  initialSettings,
}: Props) {
  const [memories, setMemories] = useState<MemoryRow[]>(initialMemories);
  const [settings, setSettings] = useState<MemorySettings>(initialSettings);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  const updateSettings = useCallback(async (patch: Partial<MemorySettings>) => {
    const res = await fetch("/api/settings/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error("Failed to update settings");
      return;
    }
    const data = (await res.json()) as MemorySettings;
    setSettings(data);
    toast.success("Settings updated");
  }, []);

  const removeMemory = useCallback(async (id: string) => {
    const res = await fetch(`/api/settings/memory/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete memory");
      return;
    }
    setMemories((prev) => prev.filter((m) => m.id !== id));
    toast.success("Memory deleted");
  }, []);

  const editMemory = useCallback(async (id: string, content: string) => {
    const res = await fetch(`/api/settings/memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      toast.error("Failed to update memory");
      return;
    }
    const data = (await res.json()) as MemoryRow;
    setMemories((prev) => prev.map((m) => (m.id === id ? data : m)));
    setEditingId(null);
    toast.success("Memory updated");
  }, []);

  const deleteAll = useCallback(async () => {
    const res = await fetch("/api/settings/memory", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete memories");
      return;
    }
    const data = (await res.json()) as { deletedCount: number };
    setMemories([]);
    toast.success(`Deleted ${data.deletedCount} memories`);
  }, []);

  const exportAll = useCallback(() => {
    window.location.href = "/api/settings/memory/export";
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg border border-border/50 bg-card/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="font-medium text-sm" htmlFor="memory-toggle">
              Cross-conversation memory
            </Label>
            <p className="mt-1 text-muted-foreground text-sm">
              When on, the assistant can save things you tell it and reference
              them in future conversations.
            </p>
          </div>
          <button
            aria-checked={settings.memoryEnabled}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              settings.memoryEnabled ? "bg-primary" : "bg-muted"
            }`}
            disabled={isPending}
            id="memory-toggle"
            onClick={() =>
              startTransition(() =>
                updateSettings({ memoryEnabled: !settings.memoryEnabled })
              )
            }
            role="switch"
            type="button"
          >
            <span
              className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform ${
                settings.memoryEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">
            Saved memories ({memories.length})
          </h2>
          <div className="flex gap-2">
            <Button onClick={exportAll} size="sm" variant="outline">
              Export all
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={memories.length === 0}
                  size="sm"
                  variant="destructive"
                >
                  Delete all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all memories?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes every memory the assistant has
                    saved about you. Your conversations stay intact.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteAll}>
                    Delete all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {memories.length === 0 ? (
          <div className="rounded-lg border border-border/50 border-dashed p-8 text-center text-muted-foreground text-sm">
            No memories yet. As you chat, the assistant will save durable facts,
            preferences, or active projects you mention.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {memories.map((m) => (
              <li
                className="group flex flex-col gap-2 rounded-lg border border-border/50 bg-card/30 p-4"
                key={m.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-1 flex-col gap-1.5">
                    {editingId === m.id ? (
                      <Textarea
                        autoFocus
                        className="min-h-[60px] text-sm"
                        onChange={(e) => setDraft(e.target.value)}
                        value={draft}
                      />
                    ) : (
                      <p className="text-sm">{m.content}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          CATEGORY_COLOR[m.category]
                        }`}
                      >
                        {CATEGORY_LABEL[m.category]}
                      </span>
                      <span>confidence {(m.confidence * 100).toFixed(0)}%</span>
                      <span>·</span>
                      <span>last used {relative(m.lastAccessedAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {editingId === m.id ? (
                      <>
                        <Button
                          onClick={() => editMemory(m.id, draft)}
                          size="sm"
                          variant="default"
                        >
                          Save
                        </Button>
                        <Button
                          onClick={() => setEditingId(null)}
                          size="sm"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() => {
                            setDraft(m.content);
                            setEditingId(m.id);
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          Edit
                        </Button>
                        <Button
                          onClick={() => removeMemory(m.id)}
                          size="sm"
                          variant="ghost"
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
