// src/app/not-found.tsx
export const dynamic = "force-static";

export default function NotFound() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Page not found</h1>
      <p>The page you’re looking for doesn’t exist (or it was moved).</p>

      <p style={{ marginTop: 16 }}>
        <a href="/">Go home</a>
      </p>
    </main>
  );
}
