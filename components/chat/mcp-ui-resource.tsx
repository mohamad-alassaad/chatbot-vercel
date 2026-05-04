"use client";

import { AppRenderer } from "@mcp-ui/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MCPUIResourceProps = {
  toolName: string;
  html: string;
  toolInput?: Record<string, unknown>;
  structuredContent?: unknown;
  text?: string;
};

const SANDBOX_PATH = "/mcp-sandbox.html?v=2";
const DEFAULT_HEIGHT = 520;
const MAX_HEIGHT = 1400;
const CONTAINER_MAX_WIDTH = 920;
const IFRAME_CONTENT_WIDTH = 1280;

async function callMcpProxy(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const res = await fetch("/api/mcp/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName, arguments: args }),
  });
  if (!res.ok) {
    throw new Error(`MCP action proxy failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    text?: string;
    structuredContent?: unknown;
  };
  return {
    content: data.text ? [{ type: "text", text: data.text }] : [],
    structuredContent: (data.structuredContent ?? undefined) as
      | Record<string, unknown>
      | undefined,
  };
}

export function MCPUIResource({
  toolName,
  html,
  toolInput,
  structuredContent,
  text,
}: MCPUIResourceProps) {
  const sandbox = useMemo(
    () => ({ url: new URL(SANDBOX_PATH, window.location.origin) }),
    []
  );

  const toolResult = useMemo<CallToolResult>(
    () => ({
      content: text ? [{ type: "text", text }] : [],
      structuredContent: (structuredContent ?? undefined) as
        | Record<string, unknown>
        | undefined,
    }),
    [text, structuredContent]
  );

  const onCallTool = useCallback(
    (params: { name: string; arguments?: Record<string, unknown> }) =>
      callMcpProxy(
        params.name,
        (params.arguments ?? {}) as Record<string, unknown>
      ),
    []
  );

  const onOpenLink = useCallback(({ url }: { url: string }) => {
    window.open(url, "_blank", "noopener,noreferrer");
    return Promise.resolve({});
  }, []);

  const onError = useCallback((error: Error) => {
    if (error.message.includes("Timed out waiting for sandbox proxy")) {
      // Dev-only artifact from React strict-mode double-mount; the live iframe
      // works. Swallow to avoid noisy unhandledRejection in the console.
      return;
    }
    console.error("[MCPUIResource]", error);
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number>(DEFAULT_HEIGHT);

  const onSizeChanged = useCallback(
    (params: { width?: number; height?: number }) => {
      if (typeof params.height === "number") {
        setHeight(Math.min(MAX_HEIGHT, Math.max(200, params.height)));
      }
    },
    []
  );

  const hostContext = useMemo(
    () => ({
      displayMode: "inline" as const,
      availableDisplayModes: ["inline", "fullscreen"] as Array<
        "inline" | "fullscreen" | "pip"
      >,
      containerDimensions: {
        maxWidth: IFRAME_CONTENT_WIDTH,
        maxHeight: MAX_HEIGHT,
      },
      theme: "dark" as const,
      locale: typeof navigator === "undefined" ? "en-US" : navigator.language,
      platform: "web" as const,
    }),
    []
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const apply = () => {
      const iframe = el.querySelector("iframe");
      if (iframe) {
        iframe.style.height = `${height}px`;
        iframe.style.width = `${IFRAME_CONTENT_WIDTH}px`;
        iframe.style.minWidth = `${IFRAME_CONTENT_WIDTH}px`;
        iframe.style.maxWidth = "none";
        iframe.style.flex = "0 0 auto";
        return true;
      }
      return false;
    };

    if (apply()) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (apply()) {
        observer.disconnect();
      }
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [height]);

  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (
        reason instanceof Error &&
        reason.message.includes("Timed out waiting for sandbox proxy")
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  const scrollByPx = useCallback((dx: number) => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    el.scrollBy({ left: dx, behavior: "smooth" });
  }, []);

  return (
    <div
      className="relative"
      style={{
        width: "100%",
        maxWidth: `${CONTAINER_MAX_WIDTH}px`,
        minWidth: 0,
      }}
    >
      <div
        className="mcp-ui-scroll overflow-x-auto overflow-y-hidden rounded-xl border border-border/50 bg-card shadow-[var(--shadow-card)]"
        ref={containerRef}
        style={{
          minHeight: `${height}px`,
          touchAction: "pan-x pan-y",
          overscrollBehaviorX: "contain",
        }}
      >
        <style>{`
        .mcp-ui-scroll { scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.45) rgba(0,0,0,0.15); }
        .mcp-ui-scroll::-webkit-scrollbar { height: 12px; -webkit-appearance: none; display: block; }
        .mcp-ui-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.15); border-radius: 6px; }
        .mcp-ui-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.45); border-radius: 6px; }
        .mcp-ui-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.7); }
        .mcp-ui-scroll iframe { width: ${IFRAME_CONTENT_WIDTH}px !important; min-width: ${IFRAME_CONTENT_WIDTH}px !important; max-width: none !important; }
      `}</style>
        <AppRenderer
          hostContext={hostContext}
          html={html}
          onCallTool={onCallTool}
          onError={onError}
          onOpenLink={onOpenLink}
          onSizeChanged={onSizeChanged}
          sandbox={sandbox}
          toolInput={toolInput}
          toolName={toolName}
          toolResult={toolResult}
        />
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-1">
        <button
          aria-label="Scroll left"
          className="pointer-events-auto flex size-8 items-center justify-center rounded-full bg-black/60 text-white shadow-[var(--shadow-float)] backdrop-blur-sm transition-colors hover:bg-black/80"
          onClick={() => scrollByPx(-400)}
          type="button"
        >
          ◀
        </button>
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1">
        <button
          aria-label="Scroll right"
          className="pointer-events-auto flex size-8 items-center justify-center rounded-full bg-black/60 text-white shadow-[var(--shadow-float)] backdrop-blur-sm transition-colors hover:bg-black/80"
          onClick={() => scrollByPx(400)}
          type="button"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
