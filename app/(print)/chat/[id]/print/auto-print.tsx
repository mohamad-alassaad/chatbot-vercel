"use client";

/**
 * Print toolbar. We deliberately do NOT auto-fire `window.print()` —
 * MCP-UI iframes load asynchronously (sandbox + postMessage handshake +
 * structured-content rendering), and racing the print dialog against
 * that produces blank carousels in the saved PDF.
 *
 * The user clicks Print when the page looks right.
 */
export function PrintToolbar() {
  return (
    <div className="no-print sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-6 py-2 backdrop-blur">
      <span className="text-sm text-zinc-600">
        Wait for any interactive widgets (maps, carousels) to finish loading,
        then click Print.
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
