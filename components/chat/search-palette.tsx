"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type SearchHit = {
  messageId: string;
  chatId: string;
  chatTitle: string;
  role: string;
  createdAt: string;
  rank: number;
  snippet: string;
  matched: boolean;
};

type SearchResponse = {
  query: string;
  results: SearchHit[];
  latencyMs: number;
};

const DEBOUNCE_MS = 180;

export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+K (or Ctrl+K) toggles the palette; custom event opens it from elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isToggle =
        e.key === "k" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey;
      if (isToggle) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-search-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-search-palette", onOpen);
    };
  }, []);

  // Reset transient state on close so reopening starts fresh.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setLatency(null);
      inflight.current?.abort();
    }
  }, [open]);

  // Debounced fetch.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setLatency(null);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search/messages?q=${encodeURIComponent(trimmed)}&limit=30`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = (await res.json()) as SearchResponse;
        setResults(data.results);
        setLatency(data.latencyMs);
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          setResults([]);
        }
      } finally {
        if (inflight.current === controller) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const onPickResult = useCallback(
    (hit: SearchHit) => {
      setOpen(false);
      router.push(
        `/chat/${hit.chatId}?q=${encodeURIComponent(query.trim())}#m-${hit.messageId}`
      );
    },
    [router, query]
  );

  return (
    <CommandDialog
      description="Type to search across all your chats"
      onOpenChange={setOpen}
      open={open}
      title="Search conversations"
    >
      <CommandInput
        onValueChange={setQuery}
        placeholder="Search across all conversations… (⌘K)"
        value={query}
      />
      <CommandList>
        {query.trim().length === 0 ? (
          <CommandEmpty>Type to search.</CommandEmpty>
        ) : loading && results.length === 0 ? (
          <CommandEmpty>Searching…</CommandEmpty>
        ) : results.length === 0 ? (
          <CommandEmpty>No matches.</CommandEmpty>
        ) : (
          <CommandGroup
            heading={`${results.length} match${results.length === 1 ? "" : "es"}${
              latency === null ? "" : ` · ${latency}ms`
            }`}
          >
            {results.map((hit) => (
              <CommandItem
                key={hit.messageId}
                onSelect={() => onPickResult(hit)}
                value={`${hit.chatTitle} ${hit.messageId}`}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="truncate font-medium text-foreground">
                      {hit.chatTitle || "(untitled chat)"}
                    </span>
                    <span className="text-muted-foreground">
                      {hit.role === "user" ? "you" : "assistant"} ·{" "}
                      {new Date(hit.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {/* eslint-disable-next-line react/no-danger -- snippet is HTML-escaped server-side */}
                  <div
                    className="line-clamp-2 text-muted-foreground text-xs [&_mark]:bg-yellow-500/30 [&_mark]:text-foreground"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: server-side HTML-escaped, only <mark> is injected
                    dangerouslySetInnerHTML={{ __html: hit.snippet }}
                  />
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
