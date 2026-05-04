import "server-only";

/**
 * Phase 0 / P1 — thin telemetry wrapper around AI SDK calls.
 *
 * Emits one structured JSON line per LLM call so it's grep-friendly today and
 * can be redirected to Azure Log Analytics in Phase A2 without touching call
 * sites.
 *
 * Use:
 *   const result = await withTelemetry(
 *     "chat",
 *     { userId, model: chatModel },
 *     async () => streamText({ ... })
 *   );
 *
 * For streaming calls where token usage is only known at the end of the
 * stream, pass `onResolveUsage` to the inner call (StreamText exposes
 * `onFinish`) and call `recordTelemetry` from there. See `app/(chat)/api/chat/route.ts`.
 *
 * TODO(phase-A2): swap console sink for Azure Log Analytics / Monitor exporter.
 */

export type TelemetryContext = {
  feature: string;
  userId: string;
  model: string;
  tenantId?: string | null;
};

export type TelemetryUsage = {
  tokensIn?: number;
  tokensOut?: number;
};

export type TelemetryEvent = TelemetryContext &
  TelemetryUsage & {
    latencyMs: number;
    error?: string;
  };

function emit(event: TelemetryEvent) {
  // Single JSON line per call. The wrapper deliberately stays sync to avoid
  // blocking the streaming response.
  console.log(
    JSON.stringify({
      kind: "ai_call",
      timestamp: new Date().toISOString(),
      ...event,
    })
  );
}

export function recordTelemetry(
  context: TelemetryContext,
  usage: TelemetryUsage,
  latencyMs: number,
  error?: unknown
) {
  emit({
    ...context,
    ...usage,
    latencyMs,
    error: error instanceof Error ? error.message : undefined,
  });
}

export async function withTelemetry<T>(
  context: TelemetryContext,
  fn: () => Promise<T> | T
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    emit({ ...context, latencyMs: Date.now() - start });
    return result;
  } catch (error) {
    emit({
      ...context,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
