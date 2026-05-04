"use client";

import { motion } from "framer-motion";
import { FolderIcon, SearchIcon, SparklesIcon, ZapIcon } from "lucide-react";

const EXAMPLE_PROMPTS = [
  "What's the weather in Paris right now?",
  "Show me the best pepperoni pizza spots on a map.",
  "Explain how Postgres tsvector indexing works in 5 lines.",
  "Help me draft a tight project plan for shipping a new MCP server.",
];

const TIPS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}> = [
  {
    icon: SparklesIcon,
    text: "I remember facts about you across chats — try asking later",
  },
  {
    icon: SearchIcon,
    text: "⌘K searches every conversation by content, not just titles",
  },
  {
    icon: FolderIcon,
    text: "Drag chats into projects to share a system prompt",
  },
  { icon: ZapIcon, text: "Press ? for the full keyboard-shortcut list" },
];

export function Greeting({
  onSelectPrompt,
}: {
  onSelectPrompt?: (text: string) => void;
}) {
  return (
    <div
      className="pointer-events-auto flex w-full max-w-2xl flex-col items-stretch px-4"
      key="overview"
    >
      <motion.h1
        animate={{ opacity: 1, y: 0 }}
        className="text-center font-semibold text-2xl tracking-tight text-foreground md:text-3xl"
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        What can I help with?
      </motion.h1>
      <motion.p
        animate={{ opacity: 1, y: 0 }}
        className="mt-2 text-center text-muted-foreground/80 text-sm"
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        Ask anything, or pick a starter prompt below.
      </motion.p>

      {onSelectPrompt && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2"
          initial={{ opacity: 0, y: 10 }}
          transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              className="rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left text-sm text-foreground/80 transition-colors hover:border-border hover:bg-accent hover:text-foreground"
              key={prompt}
              onClick={() => onSelectPrompt(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </motion.div>
      )}

      <motion.ul
        animate={{ opacity: 1 }}
        className="mt-6 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2"
        initial={{ opacity: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        {TIPS.map(({ icon: Icon, text }) => (
          <li className="flex items-start gap-2" key={text}>
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
            <span>{text}</span>
          </li>
        ))}
      </motion.ul>
    </div>
  );
}
