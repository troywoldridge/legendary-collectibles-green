"use client";

type GlobalErrorType = { digest?: string; message?: string; stack?: string };

export default function GlobalError({
  error,
  reset,
}: {
  error: GlobalErrorType;
  reset: () => void;
}) {
  console.error("Global error:", error?.message, "digest:", error?.digest);

  return (
    <html>
      <body>
        <div className="p-6">
          <h2 className="text-xl font-semibold">Global crash.</h2>
          <p className="opacity-70">Digest: {error?.digest ?? "n/a"}</p>
          <button className="mt-4 px-3 py-1 border rounded" onClick={() => reset()}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
