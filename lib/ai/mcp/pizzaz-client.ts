import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import { dynamicTool, type JSONSchema7, jsonSchema } from "ai";
import type { MCPToolOutput, MCPUIPayload } from "./types";

const TEMPLATE_META_KEY = "openai/outputTemplate";

type ConnectedClient = {
  client: Client;
  tools: MCPTool[];
  toolByName: Map<string, MCPTool>;
  resourceCache: Map<string, MCPUIPayload>;
};

let connection: Promise<ConnectedClient> | null = null;

async function connect(): Promise<ConnectedClient> {
  const url = process.env.MCP_PIZZAZ_URL;
  if (!url) {
    throw new Error(
      "MCP_PIZZAZ_URL is not set. Point it at the Pizzaz Node server SSE endpoint, e.g. http://localhost:8000/mcp"
    );
  }

  const client = new Client(
    { name: "vercel-ai-chatbot", version: "0.1.0" },
    { capabilities: {} }
  );

  const transport = new SSEClientTransport(new URL(url));
  await client.connect(transport);

  const { tools } = await client.listTools();
  const toolByName = new Map(tools.map((t) => [t.name, t]));

  return { client, tools, toolByName, resourceCache: new Map() };
}

function getConnection(): Promise<ConnectedClient> {
  if (!connection) {
    connection = connect().catch((err) => {
      connection = null;
      throw err;
    });
  }
  return connection;
}

function getTemplateUri(tool: MCPTool): string | undefined {
  const meta = tool._meta as Record<string, unknown> | undefined;
  const value = meta?.[TEMPLATE_META_KEY];
  return typeof value === "string" ? value : undefined;
}

async function readUIResource(
  conn: ConnectedClient,
  templateUri: string
): Promise<MCPUIPayload | undefined> {
  const cached = conn.resourceCache.get(templateUri);
  if (cached) {
    return cached;
  }

  const result = await conn.client.readResource({ uri: templateUri });
  const first = result.contents?.[0];
  if (
    !first ||
    typeof first !== "object" ||
    typeof (first as { text?: unknown }).text !== "string"
  ) {
    return;
  }

  const payload: MCPUIPayload = {
    templateUri,
    mimeType: String(
      (first as { mimeType?: string }).mimeType ?? "text/html+skybridge"
    ),
    html: (first as { text: string }).text,
  };
  conn.resourceCache.set(templateUri, payload);
  return payload;
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const part of content) {
    if (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      parts.push((part as { text: string }).text);
    }
  }
  return parts.join("\n");
}

export async function callPizzazTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolOutput> {
  const conn = await getConnection();
  const descriptor = conn.toolByName.get(toolName);
  if (!descriptor) {
    throw new Error(`Unknown Pizzaz tool: ${toolName}`);
  }

  const result = await conn.client.callTool({
    name: toolName,
    arguments: args,
  });
  const text = extractText(result.content);
  const structuredContent = result.structuredContent;

  const templateUri = getTemplateUri(descriptor);
  const ui = templateUri
    ? await readUIResource(conn, templateUri).catch(() => undefined)
    : undefined;

  return { text, structuredContent, ui };
}

export async function getPizzazTools() {
  const conn = await getConnection();
  const out: Record<string, ReturnType<typeof dynamicTool>> = {};

  for (const descriptor of conn.tools) {
    const inputSchema = jsonSchema(descriptor.inputSchema as JSONSchema7);
    out[descriptor.name] = dynamicTool({
      description:
        descriptor.description ?? descriptor.title ?? descriptor.name,
      inputSchema,
      execute: async (args: unknown) =>
        callPizzazTool(
          descriptor.name,
          (args ?? {}) as Record<string, unknown>
        ),
    });
  }

  return out;
}

export async function getPizzazToolNames(): Promise<string[]> {
  const conn = await getConnection();
  return conn.tools.map((t) => t.name);
}
