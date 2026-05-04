"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Tone = "concise" | "detailed" | "casual" | "formal" | "default";

type CustomInstructions = {
  customInstructionsAbout: string;
  customInstructionsRespond: string;
  tonePreference: Tone;
};

type Props = {
  initial: CustomInstructions;
};

const MAX_CHARS = 2000;

const TONE_LABEL: Record<Tone, string> = {
  default: "Default",
  concise: "Concise",
  detailed: "Detailed",
  casual: "Casual",
  formal: "Formal",
};

const TONE_HINT: Record<Tone, string> = {
  default: "No tone directive injected.",
  concise: "Be terse and direct. No hedging, no filler.",
  detailed: "Be thorough and explanatory; show your reasoning.",
  casual: "Be casual and conversational.",
  formal: "Be formal and professional.",
};

const ABOUT_PLACEHOLDER =
  "I'm a senior AI engineer working on an enterprise LLM platform. I prefer concrete examples over abstractions, and I read fast — don't slow down for me.";

const RESPOND_PLACEHOLDER =
  "Skip the preamble. Use bullet points for lists. When I ask for code, give me code first and prose second. If you're unsure, say so up front.";

export function CustomInstructionsClient({ initial }: Props) {
  const [about, setAbout] = useState(initial.customInstructionsAbout);
  const [respond, setRespond] = useState(initial.customInstructionsRespond);
  const [tone, setTone] = useState<Tone>(initial.tonePreference);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () =>
      about !== initial.customInstructionsAbout ||
      respond !== initial.customInstructionsRespond ||
      tone !== initial.tonePreference,
    [about, respond, tone, initial]
  );

  const aboutOver = about.length > MAX_CHARS;
  const respondOver = respond.length > MAX_CHARS;
  const canSave = dirty && !aboutOver && !respondOver && !saving;

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customInstructionsAbout: about.trim() === "" ? null : about,
          customInstructionsRespond: respond.trim() === "" ? null : respond,
          tonePreference: tone,
        }),
      });
      if (!res.ok) {
        throw new Error(`Save failed: ${res.status}`);
      }
      toast.success("Custom instructions saved");
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [about, respond, tone]);

  const reset = useCallback(() => {
    setAbout(initial.customInstructionsAbout);
    setRespond(initial.customInstructionsRespond);
    setTone(initial.tonePreference);
  }, [initial]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-8">
        <p className="text-muted-foreground text-sm">
          The assistant reads these at the start of every new conversation.
          Changes apply to <strong>future</strong> conversations only.
        </p>

        <Field
          counter={`${about.length}/${MAX_CHARS}`}
          counterClassName={aboutOver ? "text-destructive" : undefined}
          description="Background facts the assistant should always know about you (role, projects, tools you use, languages you speak)."
          label="About me"
        >
          <Textarea
            className="min-h-[140px] text-sm"
            data-testid="custom-instructions-about"
            onChange={(e) => setAbout(e.target.value)}
            placeholder={ABOUT_PLACEHOLDER}
            value={about}
          />
        </Field>

        <Field
          counter={`${respond.length}/${MAX_CHARS}`}
          counterClassName={respondOver ? "text-destructive" : undefined}
          description="How you want responses formatted, structured, and styled."
          label="How I want you to respond"
        >
          <Textarea
            className="min-h-[140px] text-sm"
            data-testid="custom-instructions-respond"
            onChange={(e) => setRespond(e.target.value)}
            placeholder={RESPOND_PLACEHOLDER}
            value={respond}
          />
        </Field>

        <Field
          description="A coarse tone bias on top of your written instructions. Hover an option to see the directive."
          label="Tone preference"
        >
          <Select onValueChange={(v) => setTone(v as Tone)} value={tone}>
            <SelectTrigger className="w-[220px]" data-testid="tone-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                <Tooltip key={t}>
                  <TooltipTrigger asChild>
                    <SelectItem value={t}>{TONE_LABEL[t]}</SelectItem>
                  </TooltipTrigger>
                  <TooltipContent side="right">{TONE_HINT[t]}</TooltipContent>
                </Tooltip>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="flex items-center gap-2 border-border/50 border-t pt-4">
          <Button
            data-testid="custom-instructions-save"
            disabled={!canSave}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button disabled={!dirty || saving} onClick={reset} variant="ghost">
            Reset
          </Button>
          {(aboutOver || respondOver) && (
            <span className="ml-2 text-destructive text-xs">
              Each field must be {MAX_CHARS} characters or fewer.
            </span>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function Field({
  label,
  description,
  counter,
  counterClassName,
  children,
}: {
  label: string;
  description: string;
  counter?: string;
  counterClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <Label className="font-medium text-sm">{label}</Label>
        {counter && (
          <span
            className={`text-muted-foreground text-xs ${
              counterClassName ?? ""
            }`}
          >
            {counter}
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
      {children}
    </div>
  );
}
