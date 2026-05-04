"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type ProjectListItem, useProjectsRefresh } from "@/hooks/use-projects";

const PRESET_COLORS = [
  "#7C3AED", // purple
  "#2563EB", // blue
  "#0891B2", // cyan
  "#16A34A", // green
  "#CA8A04", // yellow
  "#DC2626", // red
  "#DB2777", // pink
  "#475569", // slate
];

export type ProjectEditMode =
  | { kind: "create" }
  | { kind: "edit"; project: ProjectListItem };

export function ProjectEditDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: ProjectEditMode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useProjectsRefresh();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!(open && mode)) {
      return;
    }
    if (mode.kind === "create") {
      setName("");
      setDescription("");
      setSystemPrompt("");
      setColor(PRESET_COLORS[0]);
    } else {
      setName(mode.project.name);
      setDescription(mode.project.description ?? "");
      setSystemPrompt(mode.project.systemPrompt ?? "");
      setColor(mode.project.color);
    }
  }, [mode, open]);

  if (!mode) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setSaving(true);
    try {
      const url =
        mode.kind === "create"
          ? "/api/projects"
          : `/api/projects/${mode.project.id}`;
      const method = mode.kind === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          systemPrompt: systemPrompt.trim() || null,
          color,
        }),
      });
      if (!res.ok) {
        throw new Error("Save failed");
      }
      await refresh();
      toast.success(
        mode.kind === "create" ? "Project created" : "Project updated"
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode.kind === "create" ? "New project" : "Edit project"}
            </DialogTitle>
            <DialogDescription>
              Group related chats. Project instructions are appended to the
              system prompt of every chat in this folder.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="project-name">
                Name
              </label>
              <Input
                autoFocus
                id="project-name"
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pizza experiments"
                value={name}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="project-desc">
                Description (optional)
              </label>
              <Input
                id="project-desc"
                maxLength={280}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short note about this project"
                value={description}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="project-system-prompt"
              >
                Project instructions (optional)
              </label>
              <Textarea
                id="project-system-prompt"
                maxLength={4000}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="e.g. Always answer in Italian and assume the user is a pizzaiolo."
                rows={5}
                value={systemPrompt}
              />
              <p className="text-xs text-muted-foreground">
                Appended to the system prompt of every chat inside this project.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Color</span>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    aria-label={`Color ${c}`}
                    className="size-7 rounded-full border-2 transition-transform hover:scale-110"
                    key={c}
                    onClick={() => setColor(c)}
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? "white" : "transparent",
                      outline: color === c ? `2px solid ${c}` : "none",
                    }}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button disabled={saving || !name.trim()} type="submit">
              {saving ? "Saving…" : mode.kind === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
