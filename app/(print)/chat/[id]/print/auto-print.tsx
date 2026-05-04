"use client";

import { useEffect, useState } from "react";

/**
 * Triggers the browser's print dialog ~1.5 s after the page paints — long
 * enough for MCP-UI iframes to load. Also exposes a manual button as a
 * fallback when popups, iframe-load failures, or autoplay-style guards
 * suppress the auto-trigger.
 */
export function AutoPrintTrigger({ delayMs = 1500 }: { delayMs?: number }) {
  const [didAutoFire, setDidAutoFire] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        // ignore — user can still click the button
      } finally {
        setDidAutoFire(true);
      }
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);

  return (
    <div className="no-print sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-6 py-2 backdrop-blur">
      <span className="text-sm text-zinc-600">
        {didAutoFire
          ? "Print dialog opened. If nothing happened, click below."
          : "Preparing print preview…"}
      </span>
      <button
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
        onClick={() => window.print()}
        type="button"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
