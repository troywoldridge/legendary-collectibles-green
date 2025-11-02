"use client";
import { useEffect } from "react";

type RouteError = { digest?: string; message?: string; stack?: string };

export default function Error({
  error,
  reset,
}: {
  error: RouteError;
  reset: () => void;
}) {
  useEffect(() => {
    // surfaces on server logs too
    console.error("Route error:", error?.message, "digest:", error?.digest);
  }, [error]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Something went wrong.</h2>
      <p className="opacity-70">Digest: {error?.digest ?? "n/a"}</p>
      <button className="mt-4 px-3 py-1 border rounded" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
