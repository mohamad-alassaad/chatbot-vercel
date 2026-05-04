"use client";

import { MCPUIResource } from "@/components/chat/mcp-ui-resource";

/**
 * Client wrapper that mounts the live `MCPUIResource` inside the print
 * page. Forces `theme="light"` so the rendered widget matches white-paper
 * print output. Uses the same sandboxed AppRenderer the chat UI uses, so
 * carousels/maps actually receive their structuredContent and render
 * correctly.
 */
export function PrintMcpUi(props: {
  toolName: string;
  html: string;
  text?: string;
  structuredContent?: unknown;
  input?: Record<string, unknown>;
}) {
  return (
    <div className="my-3">
      <MCPUIResource
        html={props.html}
        structuredContent={props.structuredContent}
        text={props.text}
        theme="light"
        toolInput={props.input}
        toolName={props.toolName}
      />
    </div>
  );
}
