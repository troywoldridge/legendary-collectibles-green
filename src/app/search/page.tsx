// src/app/search/page.tsx
export const dynamic = "force-static";
export default function SearchPage({ searchParams }: { searchParams?: { q?: string } }) {
  const q = (searchParams?.q ?? "").trim();
  return (
    <section className="mx-auto max-w-3xl p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Search</h1>
      <form className="flex gap-2 mb-6">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search…"
          className="flex-1 rounded border border-white/20 bg-white/10 px-3.5 py-2.5"
        />
        <button className="rounded border border-white/20 bg-white/10 px-4 py-2.5">Go</button>
      </form>
      {q ? <p>Showing results for: <strong>{q}</strong></p> : <p>Type a query and press Go.</p>}
    </section>
  );
}
