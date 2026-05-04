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
  theme?: "light" | "dark";
};

const SANDBOX_PATH = "/mcp-sandbox.html?v=2";
const DEFAULT_HEIGHT = 520;
const MAX_HEIGHT = 1400;
const CONTAINER_MAX_WIDTH = 920;

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
  theme = "dark",
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
      // Tell the widget the real space it has so it can lay itself out
      // correctly (carousel internal scroll, solar-system canvas size, etc.).
      containerDimensions: {
        maxWidth: CONTAINER_MAX_WIDTH,
        maxHeight: MAX_HEIGHT,
      },
      theme,
      locale: typeof navigator === "undefined" ? "en-US" : navigator.language,
      platform: "web" as const,
    }),
    [theme]
  );

  // Force the AppFrame's outer iframe to fill the wrapper width and to track
  // the height the widget reports via onSizeChanged. AppFrame's defaults are
  // 100% width and a hard-coded 600px height, which we override here.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const apply = () => {
      const iframe = el.querySelector("iframe");
      if (iframe) {
        iframe.style.height = `${height}px`;
        iframe.style.width = "100%";
        iframe.style.minWidth = "0";
        iframe.style.maxWidth = "100%";
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

  return (
    <div
      className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-[var(--shadow-card)]"
      ref={containerRef}
      style={{
        width: "100%",
        maxWidth: `${CONTAINER_MAX_WIDTH}px`,
        minWidth: 0,
        minHeight: `${height}px`,
      }}
    >
      <style>{`
        /* Iframe must allow native pointer/touch events so widgets like
           Three.js OrbitControls receive mousedown/move/up uninterrupted. */
        .mcp-ui-resource-iframe iframe {
          touch-action: auto !important;
          pointer-events: auto !important;
        }
      `}</style>
      <div className="mcp-ui-resource-iframe">
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
    </div>
  );
}
