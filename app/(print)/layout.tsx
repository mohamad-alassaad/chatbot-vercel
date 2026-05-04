// Phase 0 / P6 — minimal layout for the high-fidelity print path.
// Deliberately bypasses the chat sidebar so the print preview is clean.

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-white text-black">{children}</div>;
}
