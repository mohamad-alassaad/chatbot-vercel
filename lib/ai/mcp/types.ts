export type MCPUIPayload = {
  templateUri: string;
  mimeType: string;
  html: string;
};

export type MCPToolOutput = {
  text: string;
  structuredContent?: unknown;
  ui?: MCPUIPayload;
};

export function isMCPToolOutput(value: unknown): value is MCPToolOutput {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof (value as { text: unknown }).text === "string"
  );
}

export function hasUIPayload(
  value: unknown
): value is MCPToolOutput & { ui: MCPUIPayload } {
  return (
    isMCPToolOutput(value) &&
    typeof value.ui === "object" &&
    value.ui !== null &&
    typeof value.ui.html === "string" &&
    typeof value.ui.templateUri === "string"
  );
}
