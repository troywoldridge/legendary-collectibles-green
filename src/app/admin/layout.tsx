import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "24px 16px",
        background: "radial-gradient(1200px 600px at 20% 0%, rgba(120,120,255,0.18), transparent 60%), rgba(0,0,0,0.92)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {children}
      </div>
    </div>
  );
}
