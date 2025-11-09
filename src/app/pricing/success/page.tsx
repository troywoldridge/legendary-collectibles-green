// src/app/pricing/success/page.tsx
export default function Success() {
  return (
    <section className="mx-auto max-w-md rounded-2xl border border-white/15 bg-white/5 p-6 text-white">
      <h1 className="text-xl font-semibold">Thanks! 🎉</h1>
      <p className="mt-2 text-white/80">Your subscription was successful.</p>
      <a href="/post-auth" className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2">Continue</a>
    </section>
  );
}
