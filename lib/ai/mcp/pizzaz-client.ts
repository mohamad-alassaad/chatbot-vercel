import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import { dynamicTool, type JSONSchema7, jsonSchema } from "ai";
import type { MCPToolOutput, MCPUIPayload } from "./types";

const TEMPLATE_META_KEY = "openai/outputTemplate";

type ServerConfig = {
  name: string;
  url: string;
};

type ConnectedServer = {
  name: string;
  client: Client;
  tools: MCPTool[];
  toolByName: Map<string, MCPTool>;
};

type Registry = {
  servers: ConnectedServer[];
  toolToServer: Map<string, ConnectedServer>;
  resourceCache: Map<string, MCPUIPayload>;
};

let registry: Promise<Registry> | null = null;

function parseServerConfigs(): ServerConfig[] {
  // MCP_SERVERS preferred. Format:
  //   MCP_SERVERS=name1=url1,name2=url2          (named)
  //   MCP_SERVERS=url1,url2                      (auto-named from host:port)
  // MCP_PIZZAZ_URL kept as a fallback so older .env.local files keep working.
  const raw = process.env.MCP_SERVERS ?? process.env.MCP_PIZZAZ_URL;
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const eq = entry.indexOf("=");
      if (eq > 0) {
        const name = entry.slice(0, eq).trim();
        const url = entry.slice(eq + 1).trim();
        return { name, url };
      }
      try {
        const parsed = new URL(entry);
        const name = `${parsed.hostname}_${parsed.port || "default"}`;
        return { name, url: entry };
      } catch {
        return { name: `mcp_${index}`, url: entry };
      }
    });
}

async function tryConnect(
  url: URL,
  transportKind: "streamable-http" | "sse"
): Promise<Client> {
  const client = new Client(
    { name: "vercel-ai-chatbot", version: "0.1.0" },
    { capabilities: {} }
  );
  const transport =
    transportKind === "streamable-http"
      ? new StreamableHTTPClientTransport(url)
      : new SSEClientTransport(url);
  await client.connect(transport);
  return client;
}

async function connectServer(config: ServerConfig): Promise<ConnectedServer> {
  const url = new URL(config.url);
  let client: Client;
  let transportUsed: "streamable-http" | "sse";
  try {
    client = await tryConnect(url, "streamable-http");
    transportUsed = "streamable-http";
  } catch (httpErr) {
    try {
      client = await tryConnect(url, "sse");
      transportUsed = "sse";
    } catch (sseErr) {
      console.warn(
        `[mcp:${config.name}] both transports failed for ${config.url}:`,
        { httpErr, sseErr }
      );
      throw sseErr;
    }
  }
  const { tools } = await client.listTools();
  console.log(
    `[mcp:${config.name}] connected via ${transportUsed} (${tools.length} tools)`
  );
  return {
    name: config.name,
    client,
    tools,
    toolByName: new Map(tools.map((t) => [t.name, t])),
  };
}

async function buildRegistry(): Promise<Registry> {
  const configs = parseServerConfigs();
  if (configs.length === 0) {
    return {
      servers: [],
      toolToServer: new Map(),
      resourceCache: new Map(),
    };
  }
  const settled = await Promise.allSettled(configs.map(connectServer));
  const servers: ConnectedServer[] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      servers.push(result.value);
    } else {
      console.warn(
        `[mcp] failed to connect to ${configs[i].name} (${configs[i].url}):`,
        result.reason
      );
    }
  }

  const toolToServer = new Map<string, ConnectedServer>();
  for (const server of servers) {
    for (const tool of server.tools) {
      const existing = toolToServer.get(tool.name);
      if (existing) {
        console.warn(
          `[mcp] tool name collision: '${tool.name}' is exposed by both '${existing.name}' and '${server.name}'. Keeping the first.`
        );
        continue;
      }
      toolToServer.set(tool.name, server);
    }
  }
  return { servers, toolToServer, resourceCache: new Map() };
}

function getRegistry(): Promise<Registry> {
  if (!registry) {
    registry = buildRegistry().catch((err) => {
      registry = null;
      throw err;
    });
  }
  return registry;
}

function getTemplateUri(tool: MCPTool): string | undefined {
  const meta = tool._meta as Record<string, unknown> | undefined;
  const value = meta?.[TEMPLATE_META_KEY];
  return typeof value === "string" ? value : undefined;
}

async function readUIResource(
  reg: Registry,
  server: ConnectedServer,
  templateUri: string
): Promise<MCPUIPayload | undefined> {
  const cacheKey = `${server.name}::${templateUri}`;
  const cached = reg.resourceCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const result = await server.client.readResource({ uri: templateUri });
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
  reg.resourceCache.set(cacheKey, payload);
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
  const reg = await getRegistry();
  const server = reg.toolToServer.get(toolName);
  if (!server) {
    throw new Error(`Unknown MCP tool: ${toolName}`);
  }
  const descriptor = server.toolByName.get(toolName);
  if (!descriptor) {
    throw new Error(`Tool ${toolName} not found on server ${server.name}`);
  }
  const result = await server.client.callTool({
    name: toolName,
    arguments: args,
  });
  const text = extractText(result.content);
  const structuredContent = result.structuredContent;
  const templateUri = getTemplateUri(descriptor);
  const ui = templateUri
    ? await readUIResource(reg, server, templateUri).catch(() => undefined)
    : undefined;
  return { text, structuredContent, ui };
}

export async function getPizzazTools() {
  const reg = await getRegistry();
  const out: Record<string, ReturnType<typeof dynamicTool>> = {};
  for (const [toolName, server] of reg.toolToServer.entries()) {
    const descriptor = server.toolByName.get(toolName);
    if (!descriptor) {
      continue;
    }
    const inputSchemaJson = jsonSchema(descriptor.inputSchema as JSONSchema7);
    out[toolName] = dynamicTool({
      description: descriptor.description ?? descriptor.title ?? toolName,
      inputSchema: inputSchemaJson,
      execute: async (args: unknown) =>
        callPizzazTool(toolName, (args ?? {}) as Record<string, unknown>),
    });
  }
  return out;
}

export async function getPizzazToolNames(): Promise<string[]> {
  const reg = await getRegistry();
  return Array.from(reg.toolToServer.keys());
}
